-- =====================================================
-- Hesaby POS - Migration v5.2.1 (part 1 of 3)
-- Fixes: SCHEMA-3, SCHEMA-4, SCHEMA-5, SCHEMA-6
-- Base:  Schema v5.2.0
-- Safe:  لا يفقد بيانات — يستبدل دوال فقط
-- =====================================================
--
-- ⚠️ شغّله مرة واحدة.
-- CREATE OR REPLACE FUNCTION → آمن لإعادة التشغيل (idempotent).
--
-- هذا الجزء يشمل:
--   SCHEMA-3: التحقق من tenant_id لـ customer_id / supplier_id
--   SCHEMA-4: عدم تحديث الرصيد للفواتير held/voided
--   SCHEMA-5: التحقق من used_balance مقابل الرصيد الدائن
--   SCHEMA-6: معالجة unique_violation في INSERT (race condition)
--
-- لا يشمل (سيأتي في parts قادمة):
--   SCHEMA-2: void_invoice مع transactions مرتبطة
--   SCHEMA-7: حماية product_units.stock من الكتابة المباشرة
--   SCHEMA-8: transactions.invoice_id
-- =====================================================

BEGIN;

-- =====================================================
-- 1. create_invoice_atomic (v5.2.1)
--    ✅ SCHEMA-3: tenant validation للعميل والمورد
--    ✅ SCHEMA-4: لا تحديث رصيد للـ held/voided
--    ✅ SCHEMA-5: used_balance validation
--    ✅ SCHEMA-6: unique_violation handling
-- =====================================================
CREATE OR REPLACE FUNCTION create_invoice_atomic(p_invoice JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant UUID;
    v_invoice_id UUID;
    v_idempotency TEXT;
    v_existing UUID;
    v_type TEXT;
    v_status TEXT;
    v_customer_id UUID;
    v_supplier_id UUID;
    v_item JSONB;
    v_items JSONB;
    v_sign INTEGER;
    v_old_bal NUMERIC;
    v_new_bal NUMERIC;
    v_remaining NUMERIC;
    v_used_bal NUMERIC;
    v_paid NUMERIC;
    v_change NUMERIC;
    v_cash NUMERIC;
    v_transfer NUMERIC;
    v_card NUMERIC;
    v_computed_subtotal NUMERIC := 0;
    v_subtotal NUMERIC;
    v_discount NUMERIC;
    v_total NUMERIC;
    v_invoice_number TEXT;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_methods_total NUMERIC;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant' USING errcode='P0001';
    END IF;

    v_invoice_id  := COALESCE((p_invoice->>'id')::uuid, gen_random_uuid());
    v_idempotency := NULLIF(p_invoice->>'idempotency_key', '');
    v_type        := COALESCE(p_invoice->>'type', 'sale');
    v_status      := COALESCE(p_invoice->>'status', 'paid');
    v_customer_id := NULLIF(p_invoice->>'customer_id', '')::uuid;
    v_supplier_id := NULLIF(p_invoice->>'supplier_id', '')::uuid;
    v_items       := COALESCE(p_invoice->'items', '[]'::jsonb);

    IF jsonb_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION 'items must be array' USING errcode='P0004';
    END IF;

    -- =====================================================
    -- Idempotency pre-check
    -- =====================================================
    IF v_idempotency IS NOT NULL THEN
        SELECT id INTO v_existing FROM invoices
         WHERE tenant_id = v_tenant AND idempotency_key = v_idempotency LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'id', v_existing, 'deduplicated', true);
        END IF;
    END IF;

    SELECT id INTO v_existing FROM invoices WHERE id = v_invoice_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing, 'deduplicated', true);
    END IF;

    -- =====================================================
    -- ✅ [SCHEMA-3] تحقق من المستأجر للعميل والمورد
    -- =====================================================
    IF v_customer_id IS NOT NULL THEN
        PERFORM 1 FROM parties
         WHERE id = v_customer_id
           AND tenant_id = v_tenant
           AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer % not found in tenant', v_customer_id
                USING errcode='P0001';
        END IF;
    END IF;

    IF v_supplier_id IS NOT NULL THEN
        PERFORM 1 FROM parties
         WHERE id = v_supplier_id
           AND tenant_id = v_tenant
           AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Supplier % not found in tenant', v_supplier_id
                USING errcode='P0001';
        END IF;
    END IF;

    -- =====================================================
    -- التحقق من items وحساب subtotal
    -- =====================================================
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        IF COALESCE(v_item->>'productId', v_item->>'product_id') IS NULL THEN
            RAISE EXCEPTION 'item missing productId' USING errcode='P0005';
        END IF;
        v_qty   := COALESCE((v_item->>'quantity')::numeric, 0);
        v_price := COALESCE((v_item->>'price')::numeric, 0);
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'quantity must be > 0' USING errcode='P0005';
        END IF;
        IF v_price < 0 THEN
            RAISE EXCEPTION 'price must be >= 0' USING errcode='P0005';
        END IF;
        v_computed_subtotal := v_computed_subtotal + (v_qty * v_price);
    END LOOP;
    v_computed_subtotal := ROUND(v_computed_subtotal, 2);

    v_subtotal := COALESCE((p_invoice->>'subtotal')::numeric, 0);
    v_discount := COALESCE((p_invoice->>'discount')::numeric, 0);
    v_total    := COALESCE((p_invoice->>'total')::numeric, 0);

    IF ABS(v_subtotal - v_computed_subtotal) > 0.01 THEN
        RAISE EXCEPTION 'subtotal mismatch: computed %, provided %',
            v_computed_subtotal, v_subtotal USING errcode='P0006';
    END IF;
    IF v_discount < 0 OR v_discount > v_computed_subtotal THEN
        RAISE EXCEPTION 'invalid discount' USING errcode='P0006';
    END IF;
    IF ABS(v_total - (v_computed_subtotal - v_discount)) > 0.01 THEN
        RAISE EXCEPTION 'total mismatch: expected %, provided %',
            (v_computed_subtotal - v_discount), v_total USING errcode='P0006';
    END IF;

    v_cash      := COALESCE((p_invoice->>'cash_paid')::numeric, 0);
    v_transfer  := COALESCE((p_invoice->>'transfer_paid')::numeric, 0);
    v_card      := COALESCE((p_invoice->>'card_paid')::numeric, 0);
    v_used_bal  := COALESCE((p_invoice->>'used_balance')::numeric, 0);
    v_paid      := COALESCE((p_invoice->>'paid')::numeric, 0);
    v_remaining := COALESCE((p_invoice->>'remaining')::numeric, 0);
    v_change    := COALESCE((p_invoice->>'change_amount')::numeric, 0);

    IF v_remaining > 0 AND v_customer_id IS NULL THEN
        RAISE EXCEPTION 'remaining > 0 requires customer_id' USING errcode='P0006';
    END IF;

    -- =====================================================
    -- فحوصات تعتمد على الحالة (تُتجاهل لـ held/voided)
    -- ✅ [SCHEMA-5] used_balance
    -- =====================================================
    IF v_status NOT IN ('held','voided') THEN

        -- ✅ [SCHEMA-5] used_balance validation
        IF v_used_bal > 0 THEN
            IF v_customer_id IS NULL THEN
                RAISE EXCEPTION 'used_balance requires customer_id' USING errcode='P0006';
            END IF;
            SELECT balance INTO v_old_bal FROM parties
             WHERE id = v_customer_id AND tenant_id = v_tenant FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Customer % not found', v_customer_id USING errcode='P0001';
            END IF;
            IF v_old_bal < 0 OR v_used_bal > v_old_bal + 0.001 THEN
                RAISE EXCEPTION 'used_balance (%) exceeds available credit (%)',
                    v_used_bal, GREATEST(v_old_bal, 0) USING errcode='P0006';
            END IF;
        END IF;

        -- paid + remaining = total
        IF ABS((v_paid + v_remaining) - v_total) > 0.01 THEN
            RAISE EXCEPTION 'paid+remaining mismatch: paid=%, remaining=%, total=%',
                v_paid, v_remaining, v_total USING errcode='P0006';
        END IF;

        -- methods = paid + change
        v_methods_total := v_cash + v_transfer + v_card + v_used_bal;
        IF ABS(v_methods_total - (v_paid + v_change)) > 0.01 THEN
            RAISE EXCEPTION 'payment methods mismatch: methods=%, paid=%, change=%',
                v_methods_total, v_paid, v_change USING errcode='P0006';
        END IF;
    END IF;

    -- رقم الفاتورة
    v_invoice_number := NULLIF(trim(COALESCE(p_invoice->>'invoice_number', '')), '');
    IF v_invoice_number IS NULL THEN
        v_invoice_number := next_invoice_number(p_invoice->>'device_id');
    END IF;

    -- =====================================================
    -- ✅ [SCHEMA-6] INSERT مع معالجة unique_violation
    -- =====================================================
    BEGIN
        INSERT INTO invoices (
            id, tenant_id, invoice_number, type, date,
            customer_id, customer_name, supplier_id, supplier_name,
            items, subtotal, discount, total,
            cash_paid, transfer_paid, card_paid, used_balance,
            paid, remaining, change_amount, payment_method, status,
            notes, created_by, device_id, idempotency_key, synced_at
        ) VALUES (
            v_invoice_id, v_tenant, v_invoice_number, v_type,
            COALESCE((p_invoice->>'date')::date, CURRENT_DATE),
            v_customer_id, p_invoice->>'customer_name',
            v_supplier_id, p_invoice->>'supplier_name',
            v_items, v_computed_subtotal, v_discount, v_total,
            v_cash, v_transfer, v_card, v_used_bal,
            v_paid, v_remaining, v_change,
            COALESCE(p_invoice->>'payment_method', 'cash'),
            v_status,
            p_invoice->>'notes',
            auth.uid(),
            p_invoice->>'device_id',
            v_idempotency,
            NOW()
        );
    EXCEPTION WHEN unique_violation THEN
        -- race condition: طلب آخر سبقنا بنفس الـ id أو idempotency_key
        IF v_idempotency IS NOT NULL THEN
            SELECT id INTO v_existing FROM invoices
             WHERE tenant_id = v_tenant AND idempotency_key = v_idempotency LIMIT 1;
            IF FOUND THEN
                RETURN jsonb_build_object('success', true, 'id', v_existing, 'deduplicated', true);
            END IF;
        END IF;
        SELECT id INTO v_existing FROM invoices WHERE id = v_invoice_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'id', v_existing, 'deduplicated', true);
        END IF;
        RAISE; -- خطأ غير متوقع: أعد الرفع
    END;

    -- =====================================================
    -- المخزون (لا يُطبَّق على held)
    -- =====================================================
    IF v_status <> 'held' THEN
        v_sign := CASE
            WHEN v_type = 'sale'            THEN -1
            WHEN v_type = 'purchase'        THEN  1
            WHEN v_type = 'return_sale'     THEN  1
            WHEN v_type = 'return_purchase' THEN -1
            ELSE 0
        END;

        IF v_sign <> 0 THEN
            FOR v_item IN
                SELECT * FROM jsonb_array_elements(v_items)
                ORDER BY COALESCE(value->>'productId', value->>'product_id')
            LOOP
                PERFORM apply_stock_delta(
                    (COALESCE(v_item->>'productId', v_item->>'product_id'))::uuid,
                    COALESCE(v_item->>'unitName', v_item->>'unit_name'),
                    v_sign * (COALESCE((v_item->>'quantity')::numeric, 0)),
                    v_type,
                    v_invoice_id, 'invoice', NULL,
                    p_invoice->>'device_id'
                );
            END LOOP;
        END IF;
    END IF;

    -- =====================================================
    -- ✅ [SCHEMA-4] رصيد العميل — لا يُحدَّث للـ held/voided
    -- =====================================================
    IF v_status NOT IN ('held','voided')
       AND v_customer_id IS NOT NULL
       AND v_type IN ('sale','return_sale') THEN

        SELECT balance INTO v_old_bal FROM parties
         WHERE id = v_customer_id AND tenant_id = v_tenant FOR UPDATE;

        IF FOUND THEN
            IF v_type = 'sale' THEN
                v_new_bal := v_old_bal - v_remaining - v_used_bal;
            ELSE
                v_new_bal := v_old_bal + v_total;
            END IF;

            UPDATE parties
               SET balance = ROUND(v_new_bal, 3), updated_at = NOW()
             WHERE id = v_customer_id;
        END IF;
    END IF;

    -- =====================================================
    -- ✅ [SCHEMA-4] رصيد المورد — لا يُحدَّث للـ held/voided
    -- =====================================================
    IF v_status NOT IN ('held','voided')
       AND v_supplier_id IS NOT NULL
       AND v_type IN ('purchase','return_purchase') THEN

        SELECT balance INTO v_old_bal FROM parties
         WHERE id = v_supplier_id AND tenant_id = v_tenant FOR UPDATE;

        IF FOUND THEN
            IF v_type = 'purchase' THEN
                v_new_bal := v_old_bal + (v_total - v_paid);
            ELSE
                v_new_bal := v_old_bal - v_total;
            END IF;

            UPDATE parties
               SET balance = ROUND(v_new_bal, 3), updated_at = NOW()
             WHERE id = v_supplier_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_invoice_id,
        'invoice_number', v_invoice_number
    );
END;
$$;

-- =====================================================
-- 2. add_payment_atomic (v5.2.1)
--    ✅ SCHEMA-3: tenant validation
--    ✅ SCHEMA-6: unique_violation handling
-- =====================================================
CREATE OR REPLACE FUNCTION add_payment_atomic(p_payment JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant UUID;
    v_id UUID;
    v_idem TEXT;
    v_existing UUID;
    v_party_id UUID;
    v_amount NUMERIC;
    v_type TEXT;
    v_old_bal NUMERIC;
    v_new_bal NUMERIC;
    v_delta NUMERIC;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant' USING errcode='P0001';
    END IF;

    v_id       := COALESCE((p_payment->>'id')::uuid, gen_random_uuid());
    v_idem     := NULLIF(p_payment->>'idempotency_key', '');
    v_party_id := NULLIF(p_payment->>'party_id', '')::uuid;
    v_amount   := ABS(COALESCE((p_payment->>'amount')::numeric, 0));
    v_type     := p_payment->>'type';

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be > 0' USING errcode='P0006';
    END IF;
    IF v_type NOT IN ('payment_in','payment_out') THEN
        RAISE EXCEPTION 'invalid payment type' USING errcode='P0004';
    END IF;
    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'party_id required' USING errcode='P0004';
    END IF;

    -- Idempotency pre-check
    IF v_idem IS NOT NULL THEN
        SELECT id INTO v_existing FROM transactions
         WHERE tenant_id = v_tenant AND idempotency_key = v_idem LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'id', v_existing, 'deduplicated', true);
        END IF;
    END IF;
    SELECT id INTO v_existing FROM transactions WHERE id = v_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_id, 'deduplicated', true);
    END IF;

    -- =====================================================
    -- ✅ [SCHEMA-3] التحقق من أن party من نفس المستأجر
    -- =====================================================
    PERFORM 1 FROM parties
     WHERE id = v_party_id
       AND tenant_id = v_tenant
       AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Party % not found in tenant', v_party_id USING errcode='P0001';
    END IF;

    -- =====================================================
    -- ✅ [SCHEMA-6] INSERT مع معالجة unique_violation
    -- =====================================================
    BEGIN
        INSERT INTO transactions (
            id, tenant_id, type, amount, party_id, payment_method,
            reference, notes, date, created_by,
            device_id, idempotency_key
        ) VALUES (
            v_id, v_tenant, v_type, v_amount, v_party_id,
            COALESCE(p_payment->>'payment_method', 'cash'),
            p_payment->>'reference',
            p_payment->>'notes',
            COALESCE((p_payment->>'date')::date, CURRENT_DATE),
            auth.uid(),
            p_payment->>'device_id',
            v_idem
        );
    EXCEPTION WHEN unique_violation THEN
        IF v_idem IS NOT NULL THEN
            SELECT id INTO v_existing FROM transactions
             WHERE tenant_id = v_tenant AND idempotency_key = v_idem LIMIT 1;
            IF FOUND THEN
                RETURN jsonb_build_object('success', true, 'id', v_existing, 'deduplicated', true);
            END IF;
        END IF;
        SELECT id INTO v_existing FROM transactions WHERE id = v_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'id', v_id, 'deduplicated', true);
        END IF;
        RAISE;
    END;

    -- قفل رصيد الطرف وتحديثه
    SELECT balance INTO v_old_bal FROM parties
     WHERE id = v_party_id AND tenant_id = v_tenant FOR UPDATE;

    IF FOUND THEN
        v_delta := CASE WHEN v_type = 'payment_in' THEN v_amount ELSE -v_amount END;
        v_new_bal := COALESCE(v_old_bal, 0) + v_delta;
        UPDATE parties
           SET balance = ROUND(v_new_bal, 3), updated_at = NOW()
         WHERE id = v_party_id;
    ELSE
        RAISE EXCEPTION 'Party not found: %', v_party_id USING errcode='P0001';
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- =====================================================
-- 3. تحقق من التوقيعات بعد التطبيق
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'create_invoice_atomic'
          AND pronargs = 1
    ) THEN
        RAISE EXCEPTION 'create_invoice_atomic migration failed';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'add_payment_atomic'
          AND pronargs = 1
    ) THEN
        RAISE EXCEPTION 'add_payment_atomic migration failed';
    END IF;
END;
$$;

COMMIT;

-- =====================================================
-- ✅ DONE — Migration v5.2.1 (part 1/3)
-- =====================================================
