-- =====================================================
-- Hesaby POS - Complete Schema v4.0
-- Atomic Operations + Stock Movements + Tenant Isolation
-- =====================================================

-- تحذير: هذا الملف يقوم بحذف كل الجداول!
-- استخدمه فقط لتنصيب جديد.

DROP TABLE IF EXISTS
    stock_movements, invoice_counters, sync_log, system_logs, sequences,
    settings, transactions, invoices, parties, product_units, products,
    profiles, tenants
CASCADE;

-- =====================================================
-- 1. TENANTS
-- =====================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise', 'expired')),
    phone TEXT,
    email TEXT,
    address TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- 2. PROFILES (مرتبط بـ auth.users)
-- =====================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'rep' CHECK (role IN ('super_admin', 'admin', 'rep')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id) WHERE deleted_at IS NULL;

-- =====================================================
-- 3. HELPER: get_my_tenant_id (يقرأ من JWT أولًا)
-- =====================================================
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        -- المسار السريع: من JWT
        NULLIF(current_setting('request.jwt.claims', true)::jsonb
               -> 'app_metadata' ->> 'tenant_id', '')::uuid,
        -- المسار البطيء: من profiles
        (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    );
$$;

-- =====================================================
-- 4. SYNC tenant_id إلى app_metadata (للتسريع)
-- =====================================================
CREATE OR REPLACE FUNCTION sync_tenant_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        UPDATE auth.users
           SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                                 || jsonb_build_object('tenant_id', NEW.tenant_id::text)
         WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_sync_tenant
AFTER INSERT OR UPDATE OF tenant_id ON profiles
FOR EACH ROW EXECUTE FUNCTION sync_tenant_to_jwt();

-- =====================================================
-- 5. PRODUCTS
-- =====================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    barcode TEXT,
    category TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- 6. PRODUCT_UNITS (مع tenant_id للـ RLS السريع)
-- =====================================================
CREATE TABLE product_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_name TEXT NOT NULL,
    barcode TEXT,
    price NUMERIC NOT NULL DEFAULT 0 CHECK (price >= 0),
    cost NUMERIC NOT NULL DEFAULT 0 CHECK (cost >= 0),
    factor NUMERIC NOT NULL DEFAULT 1 CHECK (factor > 0),
    stock NUMERIC NOT NULL DEFAULT 0,
    min_price NUMERIC DEFAULT 0 CHECK (min_price >= 0),
    max_price NUMERIC DEFAULT 0 CHECK (max_price >= 0),
    is_base BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (product_id, unit_name)
);

-- ضمان وجود وحدة أساسية واحدة فقط لكل منتج
CREATE UNIQUE INDEX idx_product_units_one_base
    ON product_units(product_id) WHERE is_base = TRUE;

-- =====================================================
-- 7. PARTIES
-- =====================================================
CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'customer' CHECK (type IN ('customer', 'supplier', 'both')),
    phone TEXT,
    email TEXT,
    address TEXT,
    balance NUMERIC DEFAULT 0 CHECK (balance = balance), -- منع NaN
    credit_limit NUMERIC DEFAULT 0 CHECK (credit_limit >= 0),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- 8. INVOICES (مع device_id + idempotency)
-- =====================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'sale'
        CHECK (type IN ('sale', 'purchase', 'return_sale', 'return_purchase', 'adjustment')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    customer_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    customer_name TEXT,
    supplier_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    supplier_name TEXT,

    items JSONB NOT NULL DEFAULT '[]'::jsonb,

    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC NOT NULL DEFAULT 0,

    cash_paid NUMERIC DEFAULT 0 CHECK (cash_paid >= 0),
    transfer_paid NUMERIC DEFAULT 0 CHECK (transfer_paid >= 0),
    card_paid NUMERIC DEFAULT 0 CHECK (card_paid >= 0),
    used_balance NUMERIC DEFAULT 0 CHECK (used_balance >= 0),
    paid NUMERIC DEFAULT 0 CHECK (paid >= 0),
    remaining NUMERIC DEFAULT 0,
    change_amount NUMERIC DEFAULT 0 CHECK (change_amount >= 0),

    payment_method TEXT DEFAULT 'cash'
        CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit', 'mixed')),
    status TEXT DEFAULT 'paid'
        CHECK (status IN ('paid', 'partial', 'credit', 'held', 'voided')),

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- ← إضافات جديدة
    device_id TEXT,
    idempotency_key TEXT,
    synced_at TIMESTAMPTZ,

    -- منع تكرار رقم الفاتورة داخل نفس المستأجر
    CONSTRAINT uq_invoice_number UNIQUE (tenant_id, invoice_number)
);

-- منع تكرار نفس الفاتورة عند إعادة الإرسال
CREATE UNIQUE INDEX uq_invoices_idempotency
    ON invoices(tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- 9. TRANSACTIONS (الجدول المفقود — ضروري)
-- =====================================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('payment_in', 'payment_out', 'adjustment')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    payment_method TEXT DEFAULT 'cash'
        CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit', 'mixed')),
    reference TEXT,
    notes TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    device_id TEXT,
    idempotency_key TEXT
);

CREATE UNIQUE INDEX uq_transactions_idempotency
    ON transactions(tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- 10. STOCK_MOVEMENTS (تدقيق المخزون)
-- =====================================================
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL,
    unit_name TEXT,
    delta NUMERIC NOT NULL,
    stock_before NUMERIC NOT NULL DEFAULT 0,
    stock_after NUMERIC NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN (
        'sale', 'purchase', 'return_sale', 'return_purchase',
        'adjustment', 'transfer', 'inventory', 'correction'
    )),
    reference_type TEXT,
    reference_id UUID,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. INVOICE_COUNTERS (أرقام الفواتير لكل جهاز — اختياري)
-- =====================================================
CREATE TABLE invoice_counters (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    year TEXT NOT NULL,
    device_id TEXT NOT NULL,
    last_number BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, year, device_id)
);

-- =====================================================
-- 12. SEQUENCES (per-tenant الآن)
-- =====================================================
CREATE TABLE sequences (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    current_value BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, name)
);

-- =====================================================
-- 13. SETTINGS
-- =====================================================
CREATE TABLE settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 14. SYSTEM_LOGS
-- =====================================================
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    level TEXT DEFAULT 'error' CHECK (level IN ('info', 'warn', 'error', 'fatal')),
    message TEXT,
    stack TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_logs_tenant_time ON system_logs(tenant_id, created_at DESC);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_products_tenant ON products(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_barcode ON products(tenant_id, barcode) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_units_tenant ON product_units(tenant_id);
CREATE INDEX idx_product_units_product ON product_units(product_id);
CREATE INDEX idx_product_units_barcode ON product_units(tenant_id, barcode) WHERE barcode IS NOT NULL;

CREATE INDEX idx_parties_tenant ON parties(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parties_type ON parties(tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX idx_parties_phone ON parties(tenant_id, phone) WHERE phone IS NOT NULL;

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_date ON invoices(tenant_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_customer ON invoices(tenant_id, customer_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_supplier ON invoices(tenant_id, supplier_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status ON invoices(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_number ON invoices(tenant_id, invoice_number);

CREATE INDEX idx_transactions_tenant ON transactions(tenant_id, date DESC);
CREATE INDEX idx_transactions_party ON transactions(tenant_id, party_id, date DESC);
CREATE INDEX idx_transactions_invoice ON transactions(invoice_id);

CREATE INDEX idx_stock_movements_tenant ON stock_movements(tenant_id, created_at DESC);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_ref ON stock_movements(reference_id) WHERE reference_id IS NOT NULL;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- أرقام الفواتير — per-tenant
CREATE OR REPLACE FUNCTION next_sequence(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_next BIGINT;
    v_year TEXT;
    v_tenant UUID;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant for current user' USING errcode = 'P0001';
    END IF;

    v_year := TO_CHAR(NOW(), 'YY');

    INSERT INTO sequences (tenant_id, name, current_value, updated_at)
    VALUES (v_tenant, p_name, 1, NOW())
    ON CONFLICT (tenant_id, name)
    DO UPDATE SET current_value = sequences.current_value + 1, updated_at = NOW()
    RETURNING current_value INTO v_next;

    RETURN v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- رقم فاتورة مع device_id (لمنع تصادم الأوفلاين)
CREATE OR REPLACE FUNCTION next_invoice_number(p_device_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_next BIGINT;
    v_year TEXT;
    v_tenant UUID;
    v_device_short TEXT;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant for current user';
    END IF;

    v_year := TO_CHAR(NOW(), 'YY');
    v_device_short := UPPER(LEFT(COALESCE(NULLIF(p_device_id, ''), 'GEN'), 4));

    INSERT INTO invoice_counters (tenant_id, year, device_id, last_number)
    VALUES (v_tenant, v_year, v_device_short, 1)
    ON CONFLICT (tenant_id, year, device_id)
    DO UPDATE SET last_number = invoice_counters.last_number + 1,
                  updated_at = NOW()
    RETURNING last_number INTO v_next;

    RETURN v_year || '-' || v_device_short || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- إنشاء tenant
CREATE OR REPLACE FUNCTION create_my_tenant(p_tenant_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- منع إنشاء tenant ثانٍ لنفس المستخدم
    IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND tenant_id IS NOT NULL) THEN
        RAISE EXCEPTION 'User already has a tenant';
    END IF;

    INSERT INTO tenants (name) VALUES (p_tenant_name) RETURNING id INTO v_tenant_id;

    UPDATE profiles SET tenant_id = v_tenant_id WHERE id = v_user_id;

    INSERT INTO settings (tenant_id, data) VALUES (v_tenant_id, '{}'::jsonb);

    RETURN v_tenant_id;
END;
$$;

-- =====================================================
-- STOCK MANAGEMENT (ذرّي + مُدقَّق)
-- =====================================================
CREATE OR REPLACE FUNCTION apply_stock_delta(
    p_product_id UUID,
    p_unit_name TEXT,
    p_delta NUMERIC,
    p_reason TEXT,
    p_reference_id UUID DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL
)
RETURNS TABLE (unit_id UUID, stock_before NUMERIC, stock_after NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit RECORD;
    v_before NUMERIC;
    v_after NUMERIC;
    v_tenant UUID;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant'; END IF;

    -- قفل الصف لمنع السباق
    SELECT id, stock, tenant_id
      INTO v_unit
      FROM product_units
     WHERE product_id = p_product_id
       AND unit_name = p_unit_name
       AND tenant_id = v_tenant
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unit not found: % / %', p_product_id, p_unit_name
            USING errcode = 'P0001';
    END IF;

    v_before := COALESCE(v_unit.stock, 0);
    v_after := v_before + p_delta;

    IF v_after < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for % (%): have %, need %',
            p_product_id, p_unit_name, v_before, ABS(p_delta)
            USING errcode = 'P0002';
    END IF;

    UPDATE product_units
       SET stock = v_after, updated_at = NOW()
     WHERE id = v_unit.id;

    INSERT INTO stock_movements (
        tenant_id, product_id, unit_id, unit_name,
        delta, stock_before, stock_after,
        reason, reference_type, reference_id,
        user_id, device_id, notes
    ) VALUES (
        v_tenant, p_product_id, v_unit.id, p_unit_name,
        p_delta, v_before, v_after,
        p_reason, p_reference_type, p_reference_id,
        auth.uid(), p_device_id, p_notes
    );

    RETURN QUERY SELECT v_unit.id, v_before, v_after;
END;
$$;

-- =====================================================
-- ATOMIC INVOICE CREATION
-- =====================================================
CREATE OR REPLACE FUNCTION create_invoice_atomic(p_invoice JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant UUID;
    v_invoice_id UUID;
    v_type TEXT;
    v_status TEXT;
    v_customer_id UUID;
    v_supplier_id UUID;
    v_item JSONB;
    v_sign INTEGER;
    v_old_bal NUMERIC;
    v_new_bal NUMERIC;
    v_remaining NUMERIC;
    v_change NUMERIC;
    v_used_bal NUMERIC;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant'; END IF;

    v_invoice_id := COALESCE((p_invoice->>'id')::uuid, gen_random_uuid());
    v_type := COALESCE(p_invoice->>'type', 'sale');
    v_status := COALESCE(p_invoice->>'status', 'paid');
    v_customer_id := NULLIF(p_invoice->>'customer_id', '')::uuid;
    v_supplier_id := NULLIF(p_invoice->>'supplier_id', '')::uuid;

    -- 1) إدراج الفاتورة
    INSERT INTO invoices (
        id, tenant_id, invoice_number, type, date,
        customer_id, customer_name, supplier_id, supplier_name,
        items, subtotal, discount, total,
        cash_paid, transfer_paid, card_paid, used_balance,
        paid, remaining, change_amount, payment_method, status,
        notes, created_by, device_id, idempotency_key, synced_at
    ) VALUES (
        v_invoice_id, v_tenant,
        p_invoice->>'invoice_number',
        v_type,
        COALESCE((p_invoice->>'date')::date, CURRENT_DATE),
        v_customer_id,
        p_invoice->>'customer_name',
        v_supplier_id,
        p_invoice->>'supplier_name',
        COALESCE(p_invoice->'items', '[]'::jsonb),
        COALESCE((p_invoice->>'subtotal')::numeric, 0),
        COALESCE((p_invoice->>'discount')::numeric, 0),
        COALESCE((p_invoice->>'total')::numeric, 0),
        COALESCE((p_invoice->>'cash_paid')::numeric, 0),
        COALESCE((p_invoice->>'transfer_paid')::numeric, 0),
        COALESCE((p_invoice->>'card_paid')::numeric, 0),
        COALESCE((p_invoice->>'used_balance')::numeric, 0),
        COALESCE((p_invoice->>'paid')::numeric, 0),
        COALESCE((p_invoice->>'remaining')::numeric, 0),
        COALESCE((p_invoice->>'change_amount')::numeric, 0),
        COALESCE(p_invoice->>'payment_method', 'cash'),
        v_status,
        p_invoice->>'notes',
        auth.uid(),
        p_invoice->>'device_id',
        p_invoice->>'idempotency_key',
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    -- 2) المخزون (فقط إذا ليست معلقة)
    IF v_status <> 'held' THEN
        v_sign := CASE
            WHEN v_type = 'sale'            THEN -1
            WHEN v_type = 'purchase'        THEN  1
            WHEN v_type = 'return_sale'     THEN  1
            WHEN v_type = 'return_purchase' THEN -1
            ELSE 0
        END;

        IF v_sign <> 0 THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_invoice->'items', '[]'::jsonb))
            LOOP
                PERFORM apply_stock_delta(
                    (v_item->>'productId')::uuid,
                    COALESCE(v_item->>'unitName', v_item->>'unit_name'),
                    v_sign * (COALESCE((v_item->>'quantity')::numeric, 0)
                              * COALESCE((v_item->>'factor')::numeric, 1)),
                    v_type,
                    v_invoice_id,
                    'invoice',
                    NULL,
                    p_invoice->>'device_id'
                );
            END LOOP;
        END IF;
    END IF;

    -- 3) رصيد العميل
    IF v_customer_id IS NOT NULL AND v_type IN ('sale','return_sale') THEN
        SELECT balance INTO v_old_bal FROM parties
         WHERE id = v_customer_id AND tenant_id = v_tenant FOR UPDATE;

        IF FOUND THEN
            v_remaining := COALESCE((p_invoice->>'remaining')::numeric, 0);
            v_change := COALESCE((p_invoice->>'change_amount')::numeric, 0);
            v_used_bal := COALESCE((p_invoice->>'used_balance')::numeric, 0);

            IF v_type = 'sale' THEN
                v_new_bal := v_old_bal + (v_change - v_remaining - v_used_bal);
            ELSE
                v_new_bal := v_old_bal + COALESCE((p_invoice->>'total')::numeric, 0);
            END IF;

            UPDATE parties
               SET balance = ROUND(v_new_bal, 3), updated_at = NOW()
             WHERE id = v_customer_id;
        END IF;
    END IF;

    -- 4) رصيد المورد
    IF v_supplier_id IS NOT NULL AND v_type IN ('purchase','return_purchase') THEN
        SELECT balance INTO v_old_bal FROM parties
         WHERE id = v_supplier_id AND tenant_id = v_tenant FOR UPDATE;

        IF FOUND THEN
            v_remaining := COALESCE((p_invoice->>'total')::numeric, 0)
                         - COALESCE((p_invoice->>'paid')::numeric, 0);

            IF v_type = 'purchase' THEN
                v_new_bal := v_old_bal + v_remaining;
            ELSE
                v_new_bal := v_old_bal - COALESCE((p_invoice->>'total')::numeric, 0);
            END IF;

            UPDATE parties
               SET balance = ROUND(v_new_bal, 3), updated_at = NOW()
             WHERE id = v_supplier_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_invoice_id,
        'invoice_number', p_invoice->>'invoice_number'
    );
END;
$$;

-- =====================================================
-- TRIGGERS for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_product_units_updated BEFORE UPDATE ON product_units
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_parties_updated BEFORE UPDATE ON parties
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units   ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs     ENABLE ROW LEVEL SECURITY;

-- Tenants: يمكن للمستخدم رؤية tenant الخاص به فقط
CREATE POLICY "tenants_select" ON tenants
    FOR SELECT TO authenticated
    USING (id = get_my_tenant_id());

-- لا UPDATE/DELETE مباشر — فقط عبر RPC

-- Profiles
CREATE POLICY "profiles_select_self" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());
CREATE POLICY "profiles_select_same_tenant" ON profiles
    FOR SELECT TO authenticated
    USING (tenant_id = get_my_tenant_id());
CREATE POLICY "profiles_update_self" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- بقية الجداول: scoped بـ tenant_id
CREATE POLICY "products_access" ON products
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "product_units_access" ON product_units
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "parties_access" ON parties
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "invoices_access" ON invoices
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "transactions_access" ON transactions
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "stock_movements_access" ON stock_movements
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "invoice_counters_access" ON invoice_counters
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

-- Sequences: scoped بـ tenant (كان مفتوح تمامًا!)
CREATE POLICY "sequences_access" ON sequences
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "settings_access" ON settings
    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

-- Logs: قراءة فقط لمستخدمي نفس المستأجر
CREATE POLICY "system_logs_read" ON system_logs
    FOR SELECT TO authenticated
    USING (tenant_id = get_my_tenant_id());
CREATE POLICY "system_logs_insert" ON system_logs
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = get_my_tenant_id());

-- =====================================================
-- GRANTS
-- =====================================================
-- ملاحظة: anon لم يعد بإمكانه استدعاء next_sequence
GRANT EXECUTE ON FUNCTION next_sequence(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION next_invoice_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_my_tenant(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_stock_delta(UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_invoice_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_tenant_id() TO authenticated;

-- =====================================================
-- ✅ DONE — v4.0
-- =====================================================
