-- =====================================================
-- Hesaby POS - Schema v5.2.1 (Full Consolidated)
-- Production-ready | Tenant Isolation | Atomic Operations
-- =====================================================
-- ⚠️ يحذف كل الجداول — استخدمه للتنصيب الجديد فقط
--
-- يجمع هذا الملف:
--   Schema v5.2.0 (الأساس)
--   + migration_v5.2.1_part1 (SCHEMA-3, 4, 5, 6)
--   + migration_v5.2.1_part2 (SCHEMA-2, 8)
--   + migration_v5.2.1_part3 (SCHEMA-7)
--
-- Changelog الكامل من v5.0.0:
--   [SCHEMA-1] create_my_tenant: يرفض إن لم يوجد profile
--   [SCHEMA-2] create_invoice_atomic: تسديد الدين ذرّيًا
--              + void_invoice_atomic: يرفض غير paid + يعكس تسديدات
--   [SCHEMA-3] create_invoice_atomic/add_payment_atomic:
--              tenant validation للـ customer/supplier/party
--   [SCHEMA-4] balance لا يُحدَّث للفواتير held/voided
--   [SCHEMA-5] used_balance validation مقابل الرصيد الفعلي
--   [SCHEMA-6] unique_violation handling في RPCs
--   [SCHEMA-7] product_units.stock محمي من UPDATE المباشر
--   [SCHEMA-8] transactions.voided_at/voided_by
--              + invoices.debt_payment_amount
--   + Deadlock prevention (ترتيب الأصناف حسب product_id)
--   + فهارس إضافية (created_by, voided_at)
-- =====================================================

-- DROP TRIGGER على auth.users أولًا
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS
    stock_movements, invoice_counters, sequences,
    system_logs, settings, transactions, invoices,
    parties, product_units, products, profiles, tenants
CASCADE;

-- =====================================================
-- 1. TENANTS
-- =====================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise','expired')),
    phone TEXT,
    email TEXT,
    address TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- 2. PROFILES
-- =====================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('super_admin','admin','rep')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_active ON profiles(tenant_id, role) WHERE deleted_at IS NULL AND is_active = TRUE;

-- =====================================================
-- 3. HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb
               -> 'app_metadata' ->> 'tenant_id', '')::uuid,
        (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND deleted_at IS NULL LIMIT 1)
    );
$$;

CREATE OR REPLACE FUNCTION is_my_admin()
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin','super_admin')
          AND is_active = TRUE
          AND deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION sync_tenant_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        'rep'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. PRODUCTS
-- =====================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    code TEXT,
    barcode TEXT,
    category TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- 5. PRODUCT_UNITS
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
    stock NUMERIC NOT NULL DEFAULT 0 CHECK (isfinite(stock)),
    min_price NUMERIC NOT NULL DEFAULT 0 CHECK (min_price >= 0),
    max_price NUMERIC NOT NULL DEFAULT 0 CHECK (max_price >= 0),
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_units_product_name UNIQUE (product_id, unit_name),
    CONSTRAINT ck_base_factor CHECK (is_base = FALSE OR factor = 1)
);

-- =====================================================
-- 6. PARTIES
-- اتفاقية الرصيد: positive = نحن مدينون، negative = الطرف مدين لنا
-- =====================================================
CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    type TEXT NOT NULL DEFAULT 'customer'
        CHECK (type IN ('customer','supplier','both')),
    phone TEXT,
    email TEXT,
    address TEXT,
    balance NUMERIC NOT NULL DEFAULT 0 CHECK (isfinite(balance)),
    credit_limit NUMERIC NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- 7. INVOICES — ✅ [SCHEMA-2, 7]
-- =====================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL CHECK (length(trim(invoice_number)) > 0),
    type TEXT NOT NULL DEFAULT 'sale'
        CHECK (type IN ('sale','purchase','return_sale','return_purchase','adjustment')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    customer_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    customer_name TEXT,
    supplier_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    supplier_name TEXT,

    items JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(items) = 'array'),

    subtotal NUMERIC NOT NULL DEFAULT 0 CHECK (isfinite(subtotal)),
    discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0 AND isfinite(discount)),
    total NUMERIC NOT NULL DEFAULT 0 CHECK (isfinite(total)),

    cash_paid NUMERIC NOT NULL DEFAULT 0 CHECK (cash_paid >= 0),
    transfer_paid NUMERIC NOT NULL DEFAULT 0 CHECK (transfer_paid >= 0),
    card_paid NUMERIC NOT NULL DEFAULT 0 CHECK (card_paid >= 0),
    used_balance NUMERIC NOT NULL DEFAULT 0 CHECK (used_balance >= 0),
    paid NUMERIC NOT NULL DEFAULT 0 CHECK (paid >= 0),
    remaining NUMERIC NOT NULL DEFAULT 0 CHECK (remaining >= 0),
    change_amount NUMERIC NOT NULL DEFAULT 0 CHECK (change_amount >= 0),

    -- ✅ [SCHEMA-2] مبلغ تسديد دين سابق (يُدرج transaction داخل نفس RPC)
    debt_payment_amount NUMERIC NOT NULL DEFAULT 0
        CHECK (debt_payment_amount >= 0 AND isfinite(debt_payment_amount)),

    payment_method TEXT NOT NULL DEFAULT 'cash'
        CHECK (payment_method IN ('cash','card','transfer','credit','mixed')),
    status TEXT NOT NULL DEFAULT 'paid'
        CHECK (status IN ('paid','partial','credit','held','voided')),

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    device_id TEXT,
    idempotency_key TEXT,
    synced_at TIMESTAMPTZ,

    -- ✅ [SCHEMA-7]
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    CONSTRAINT uq_invoice_number UNIQUE (tenant_id, invoice_number)
);

-- =====================================================
-- 8. TRANSACTIONS — ✅ [SCHEMA-8]
-- =====================================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('payment_in','payment_out','adjustment')),
    amount NUMERIC NOT NULL CHECK (amount > 0 AND isfinite(amount)),
    party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash'
        CHECK (payment_method IN ('cash','card','transfer','credit','mixed')),
    reference TEXT,
    notes TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    device_id TEXT,
    idempotency_key TEXT,

    -- ✅ [SCHEMA-8]
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- =====================================================
-- 9. STOCK_MOVEMENTS
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
        'sale','purchase','return_sale','return_purchase',
        'adjustment','transfer','inventory','correction'
    )),
    reference_type TEXT,
    reference_id UUID,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. COUNTERS / SEQUENCES / SETTINGS / LOGS
-- =====================================================
CREATE TABLE invoice_counters (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    year TEXT NOT NULL,
    device_id TEXT NOT NULL,
    last_number BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, year, device_id)
);

CREATE TABLE sequences (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    current_value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, name)
);

CREATE TABLE settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    level TEXT NOT NULL DEFAULT 'error'
        CHECK (level IN ('info','warn','error','fatal')),
    message TEXT,
    stack TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. INDEXES
-- =====================================================
CREATE INDEX idx_products_tenant        ON products(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category      ON products(tenant_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_units_tenant   ON product_units(tenant_id);
CREATE INDEX idx_product_units_product  ON product_units(product_id);

CREATE UNIQUE INDEX uq_product_units_one_base
    ON product_units(product_id) WHERE is_base = TRUE;

CREATE UNIQUE INDEX uq_products_barcode
    ON products(tenant_id, barcode)
    WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_product_units_barcode
    ON product_units(tenant_id, barcode)
    WHERE barcode IS NOT NULL;

CREATE INDEX idx_parties_tenant         ON parties(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parties_type           ON parties(tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX idx_parties_phone          ON parties(tenant_id, phone) WHERE phone IS NOT NULL;

CREATE INDEX idx_invoices_tenant        ON invoices(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_date          ON invoices(tenant_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_customer      ON invoices(tenant_id, customer_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_supplier      ON invoices(tenant_id, supplier_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status        ON invoices(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_number        ON invoices(tenant_id, invoice_number);
CREATE INDEX idx_invoices_created_by    ON invoices(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_invoices_voided        ON invoices(tenant_id, voided_at DESC) WHERE voided_at IS NOT NULL;

CREATE UNIQUE INDEX uq_invoices_idempotency
    ON invoices(tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_transactions_tenant    ON transactions(tenant_id, date DESC);
CREATE INDEX idx_transactions_party     ON transactions(tenant_id, party_id, date DESC);
CREATE INDEX idx_transactions_invoice   ON transactions(invoice_id);
CREATE INDEX idx_transactions_created_by ON transactions(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_transactions_voided
    ON transactions(tenant_id, voided_at)
    WHERE voided_at IS NOT NULL;

CREATE UNIQUE INDEX uq_transactions_idempotency
    ON transactions(tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_stock_movements_tenant ON stock_movements(tenant_id, created_at DESC);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_ref    ON stock_movements(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_stock_movements_user   ON stock_movements(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_system_logs_tenant     ON system_logs(tenant_id, created_at DESC);
CREATE INDEX idx_system_logs_user       ON system_logs(user_id) WHERE user_id IS NOT NULL;

-- =====================================================
-- 12. TRIGGERS
-- =====================================================
CREATE TRIGGER trg_profiles_sync_tenant
AFTER INSERT OR UPDATE OF tenant_id ON profiles
FOR EACH ROW EXECUTE FUNCTION sync_tenant_to_jwt();

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_tenants_updated       BEFORE UPDATE ON tenants       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated      BEFORE UPDATE ON profiles      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated      BEFORE UPDATE ON products      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_product_units_updated BEFORE UPDATE ON product_units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_parties_updated       BEFORE UPDATE ON parties       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated      BEFORE UPDATE ON invoices      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settings_updated      BEFORE UPDATE ON settings      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 13. SEQUENCE FUNCTIONS
-- =====================================================
CREATE OR REPLACE FUNCTION next_sequence(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_next BIGINT; v_year TEXT; v_tenant UUID;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant' USING errcode='P0001';
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

CREATE OR REPLACE FUNCTION next_invoice_number(p_device_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_next BIGINT; v_year TEXT; v_tenant UUID; v_dev TEXT;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant' USING errcode='P0001';
    END IF;
    v_year := TO_CHAR(NOW(), 'YY');
    v_dev  := UPPER(LEFT(COALESCE(NULLIF(p_device_id,''),'GEN'), 4));
    INSERT INTO invoice_counters (tenant_id, year, device_id, last_number)
    VALUES (v_tenant, v_year, v_dev, 1)
    ON CONFLICT (tenant_id, year, device_id)
    DO UPDATE SET last_number = invoice_counters.last_number + 1, updated_at = NOW()
    RETURNING last_number INTO v_next;
    RETURN v_year || '-' || v_dev || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- =====================================================
-- 14. CREATE_MY_TENANT
-- ✅ [SCHEMA-1]
-- =====================================================
CREATE OR REPLACE FUNCTION create_my_tenant(p_tenant_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_existing_tenant UUID;
    v_profile_exists BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING errcode='P0001';
    END IF;

    IF p_tenant_name IS NULL OR length(trim(p_tenant_name)) = 0 THEN
        RAISE EXCEPTION 'Tenant name required' USING errcode='P0004';
    END IF;

    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id)
      INTO v_profile_exists;

    IF NOT v_profile_exists THEN
        RAISE EXCEPTION 'User profile not found. Try again in a moment.'
            USING errcode='P0004';
    END IF;

    SELECT tenant_id INTO v_existing_tenant FROM profiles WHERE id = v_user_id;
    IF v_existing_tenant IS NOT NULL THEN
        RAISE EXCEPTION 'User already has a tenant' USING errcode='P0004';
    END IF;

    INSERT INTO tenants (name) VALUES (trim(p_tenant_name))
    RETURNING id INTO v_tenant_id;

    UPDATE profiles
       SET tenant_id = v_tenant_id,
           role = 'admin',
           updated_at = NOW()
     WHERE id = v_user_id;

    INSERT INTO settings (tenant_id, data) VALUES (v_tenant_id, '{}'::jsonb)
    ON CONFLICT (tenant_id) DO NOTHING;

    RETURN v_tenant_id;
END;
$$;

-- =====================================================
-- 15. APPLY_STOCK_DELTA — ✅ [SCHEMA-5 from v5.2.0]
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base RECORD;
    v_sold RECORD;
    v_factor NUMERIC;
    v_delta_base NUMERIC;
    v_before NUMERIC;
    v_after NUMERIC;
    v_tenant UUID;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant' USING errcode='P0001';
    END IF;

    IF p_reason IN ('correction','adjustment','inventory') AND NOT is_my_admin() THEN
        RAISE EXCEPTION 'Only admins can perform % operations', p_reason USING errcode='P0003';
    END IF;

    SELECT id, factor, unit_name, is_base INTO v_sold
      FROM product_units
     WHERE product_id = p_product_id
       AND unit_name = p_unit_name
       AND tenant_id = v_tenant;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unit not found: % / %', p_product_id, p_unit_name USING errcode='P0001';
    END IF;

    v_factor := CASE WHEN v_sold.is_base THEN 1 ELSE COALESCE(v_sold.factor, 1) END;
    v_delta_base := p_delta * v_factor;

    SELECT id, stock INTO v_base
      FROM product_units
     WHERE product_id = p_product_id AND is_base = TRUE AND tenant_id = v_tenant
     FOR UPDATE;

    IF NOT FOUND THEN
        SELECT id, stock INTO v_base
          FROM product_units
         WHERE product_id = p_product_id AND tenant_id = v_tenant
         ORDER BY created_at LIMIT 1
         FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No units for product %', p_product_id USING errcode='P0001';
    END IF;

    v_before := COALESCE(v_base.stock, 0);
    v_after  := v_before + v_delta_base;

    IF v_after < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for % (%): have %, need %',
            p_product_id, p_unit_name, v_before, ABS(v_delta_base)
            USING errcode='P0002';
    END IF;

    UPDATE product_units
       SET stock = v_after, updated_at = NOW()
     WHERE id = v_base.id;

    INSERT INTO stock_movements (
        tenant_id, product_id, unit_id, unit_name,
        delta, stock_before, stock_after,
        reason, reference_type, reference_id,
        user_id, device_id, notes
    ) VALUES (
        v_tenant, p_product_id,
        v_sold.id,
        p_unit_name,
        v_delta_base, v_before, v_after,
        p_reason, p_reference_type, p_reference_id,
        auth.uid(), p_device_id, p_notes
    );

    RETURN QUERY SELECT v_sold.id, v_before, v_after;
END;
$$;

-- =====================================================
-- 16. CREATE_INVOICE_ATOMIC — v5.2.1
-- ✅ [SCHEMA-2] تسديد الدين ذرّي
-- ✅ [SCHEMA-3] tenant validation
-- ✅ [SCHEMA-4] held/voided: لا أثر على الرصيد
-- ✅ [SCHEMA-5] used_balance validation
-- ✅ [SCHEMA-6] unique_violation handling
-- ✅ Deadlock prevention
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
    v_debt_payment NUMERIC;
    v_computed_subtotal NUMERIC := 0;
    v_subtotal NUMERIC;
    v_discount NUMERIC;
    v_total NUMERIC;
    v_invoice_number TEXT;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_methods_total NUMERIC;
    v_debt_tx_id UUID;
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

    -- Idempotency
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

    -- ✅ [SCHEMA-3] tenant validation
    IF v_customer_id IS NOT NULL THEN
        PERFORM 1 FROM parties
         WHERE id = v_customer_id AND tenant_id = v_tenant AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer % not found in tenant', v_customer_id
                USING errcode='P0001';
        END IF;
    END IF;
    IF v_supplier_id IS NOT NULL THEN
        PERFORM 1 FROM parties
         WHERE id = v_supplier_id AND tenant_id = v_tenant AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Supplier % not found in tenant', v_supplier_id
                USING errcode='P0001';
        END IF;
    END IF;

    -- Item validation + subtotal
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
    v_debt_payment := COALESCE((p_invoice->>'debt_payment_amount')::numeric, 0);

    IF v_debt_payment < 0 THEN
        RAISE EXCEPTION 'debt_payment_amount must be >= 0' USING errcode='P0004';
    END IF;
    IF v_debt_payment > 0 AND v_customer_id IS NULL THEN
        RAISE EXCEPTION 'debt_payment_amount requires customer_id' USING errcode='P0004';
    END IF;
    IF v_debt_payment > 0 AND v_type NOT IN ('sale','return_sale') THEN
        RAISE EXCEPTION 'debt_payment_amount only valid for sale/return_sale'
            USING errcode='P0004';
    END IF;

    IF v_remaining > 0 AND v_customer_id IS NULL THEN
        RAISE EXCEPTION 'remaining > 0 requires customer_id' USING errcode='P0006';
    END IF;

    -- فحوصات تعتمد على الحالة
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

        -- ✅ [SCHEMA-2] debt_payment validation
        IF v_debt_payment > 0 THEN
            IF v_used_bal = 0 THEN
                SELECT balance INTO v_old_bal FROM parties
                 WHERE id = v_customer_id AND tenant_id = v_tenant FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Customer % not found', v_customer_id USING errcode='P0001';
                END IF;
            END IF;
            IF v_old_bal >= 0 THEN
                RAISE EXCEPTION 'No outstanding debt to pay (balance=%)', v_old_bal
                    USING errcode='P0007';
            END IF;
            IF v_debt_payment > ABS(v_old_bal) + 0.001 THEN
                RAISE EXCEPTION 'debt_payment (%) exceeds outstanding debt (%)',
                    v_debt_payment, ABS(v_old_bal) USING errcode='P0007';
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

    v_invoice_number := NULLIF(trim(COALESCE(p_invoice->>'invoice_number', '')), '');
    IF v_invoice_number IS NULL THEN
        v_invoice_number := next_invoice_number(p_invoice->>'device_id');
    END IF;

    -- ✅ [SCHEMA-6] INSERT مع unique_violation handling
    BEGIN
        INSERT INTO invoices (
            id, tenant_id, invoice_number, type, date,
            customer_id, customer_name, supplier_id, supplier_name,
            items, subtotal, discount, total,
            cash_paid, transfer_paid, card_paid, used_balance,
            paid, remaining, change_amount, payment_method, status,
            notes, created_by, device_id, idempotency_key, synced_at,
            debt_payment_amount
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
            NOW(),
            v_debt_payment
        );
    EXCEPTION WHEN unique_violation THEN
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
        RAISE;
    END;

    -- المخزون (non-held)
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

    -- ✅ [SCHEMA-2] سجل transaction لتسديد الدين
    IF v_debt_payment > 0
       AND v_status NOT IN ('held','voided')
       AND v_type IN ('sale','return_sale')
       AND v_customer_id IS NOT NULL THEN
        v_debt_tx_id := gen_random_uuid();
        INSERT INTO transactions (
            id, tenant_id, type, amount, party_id, invoice_id,
            payment_method, reference, notes, date, created_by,
            device_id, idempotency_key
        ) VALUES (
            v_debt_tx_id, v_tenant, 'payment_in', v_debt_payment,
            v_customer_id, v_invoice_id,
            'cash', v_invoice_number,
            'تسديد دين سابق من فاتورة ' || v_invoice_number,
            COALESCE((p_invoice->>'date')::date, CURRENT_DATE),
            auth.uid(), p_invoice->>'device_id',
            CASE WHEN v_idempotency IS NOT NULL THEN v_idempotency || ':debt' ELSE NULL END
        );
    END IF;

    -- ✅ [SCHEMA-4] رصيد العميل (لا يُحدَّث لـ held/voided)
    IF v_status NOT IN ('held','voided')
       AND v_customer_id IS NOT NULL
       AND v_type IN ('sale','return_sale') THEN

        SELECT balance INTO v_old_bal FROM parties
         WHERE id = v_customer_id AND tenant_id = v_tenant FOR UPDATE;

        IF FOUND THEN
            IF v_type = 'sale' THEN
                v_new_bal := v_old_bal - v_remaining - v_used_bal + v_debt_payment;
            ELSE
                v_new_bal := v_old_bal + v_total;
            END IF;

            UPDATE parties
               SET balance = ROUND(v_new_bal, 3), updated_at = NOW()
             WHERE id = v_customer_id;
        END IF;
    END IF;

    -- ✅ [SCHEMA-4] رصيد المورد
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
-- 17. VOID_INVOICE_ATOMIC — v5.2.1
-- ✅ [SCHEMA-2] يرفض غير paid + يعكس تسديدات
-- =====================================================
CREATE OR REPLACE FUNCTION void_invoice_atomic(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant UUID;
    v_inv RECORD;
    v_item JSONB;
    v_sign INTEGER;
    v_old_bal NUMERIC;
    v_debt_payment NUMERIC;
BEGIN
    v_tenant := get_my_tenant_id();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No tenant' USING errcode='P0001';
    END IF;

    IF NOT is_my_admin() THEN
        RAISE EXCEPTION 'Only admins can void invoices' USING errcode='P0003';
    END IF;

    IF p_invoice_id IS NULL THEN
        RAISE EXCEPTION 'invoice id required' USING errcode='P0004';
    END IF;

    SELECT * INTO v_inv FROM invoices
     WHERE id = p_invoice_id
       AND tenant_id = v_tenant
       AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found' USING errcode='P0001';
    END IF;

    -- Idempotency
    IF v_inv.status = 'voided' THEN
        RETURN jsonb_build_object('success', true, 'id', p_invoice_id, 'deduplicated', true);
    END IF;

    -- held: إلغاء بسيط
    IF v_inv.status = 'held' THEN
        UPDATE invoices
           SET status = 'voided',
               voided_at = NOW(),
               voided_by = auth.uid(),
               updated_at = NOW()
         WHERE id = p_invoice_id;
        RETURN jsonb_build_object('success', true, 'id', p_invoice_id, 'wasHeld', true);
    END IF;

    -- ✅ [Q1=ب] نرفض إلغاء أي فاتورة ليست paid
    IF v_inv.status <> 'paid' THEN
        RAISE EXCEPTION
            'Only fully-paid invoices can be voided (current status: %)', v_inv.status
            USING errcode='P0006';
    END IF;

    v_debt_payment := COALESCE(v_inv.debt_payment_amount, 0);

    -- 1) عكس المخزون
    v_sign := CASE
        WHEN v_inv.type = 'sale'            THEN  1
        WHEN v_inv.type = 'purchase'        THEN -1
        WHEN v_inv.type = 'return_sale'     THEN -1
        WHEN v_inv.type = 'return_purchase' THEN  1
        ELSE 0
    END;

    IF v_sign <> 0 AND jsonb_typeof(v_inv.items) = 'array' THEN
        FOR v_item IN
            SELECT * FROM jsonb_array_elements(v_inv.items)
            ORDER BY COALESCE(value->>'productId', value->>'product_id')
        LOOP
            PERFORM apply_stock_delta(
                (COALESCE(v_item->>'productId', v_item->>'product_id'))::uuid,
                COALESCE(v_item->>'unitName', v_item->>'unit_name'),
                v_sign * (COALESCE((v_item->>'quantity')::numeric, 0)),
                'correction',
                p_invoice_id, 'invoice_void', 'فاتورة ملغاة',
                v_inv.device_id
            );
        END LOOP;
    END IF;

    -- 2) عكس رصيد العميل
    IF v_inv.customer_id IS NOT NULL AND v_inv.type IN ('sale','return_sale') THEN
        SELECT balance INTO v_old_bal FROM parties
         WHERE id = v_inv.customer_id AND tenant_id = v_tenant FOR UPDATE;

        IF FOUND THEN
            IF v_inv.type = 'sale' THEN
                UPDATE parties
                   SET balance = ROUND(
                           balance + v_inv.remaining + v_inv.used_balance - v_debt_payment,
                           3),
                       updated_at = NOW()
                 WHERE id = v_inv.customer_id;
            ELSE
                UPDATE parties
                   SET balance = ROUND(balance - v_inv.total, 3),
                       updated_at = NOW()
                 WHERE id = v_inv.customer_id;
            END IF;
        END IF;
    END IF;

    -- 3) عكس رصيد المورد
    IF v_inv.supplier_id IS NOT NULL AND v_inv.type IN ('purchase','return_purchase') THEN
        IF v_inv.type = 'purchase' THEN
            UPDATE parties
               SET balance = ROUND(balance - (v_inv.total - v_inv.paid), 3),
                   updated_at = NOW()
             WHERE id = v_inv.supplier_id AND tenant_id = v_tenant;
        ELSE
            UPDATE parties
               SET balance = ROUND(balance + v_inv.total, 3),
                   updated_at = NOW()
             WHERE id = v_inv.supplier_id AND tenant_id = v_tenant;
        END IF;
    END IF;

    -- 4) ✅ [SCHEMA-2] علّم التسديدات المرتبطة voided
    UPDATE transactions
       SET voided_at = NOW(),
           voided_by = auth.uid()
     WHERE invoice_id = p_invoice_id
       AND tenant_id = v_tenant
       AND voided_at IS NULL;

    -- 5) علّم الفاتورة voided
    UPDATE invoices
       SET status = 'voided',
           voided_at = NOW(),
           voided_by = auth.uid(),
           updated_at = NOW()
     WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'id', p_invoice_id);
END;
$$;

-- =====================================================
-- 18. ADD_PAYMENT_ATOMIC — v5.2.1
-- ✅ [SCHEMA-3] tenant validation
-- ✅ [SCHEMA-6] unique_violation handling
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

    -- ✅ [SCHEMA-3] tenant validation
    PERFORM 1 FROM parties
     WHERE id = v_party_id
       AND tenant_id = v_tenant
       AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Party % not found in tenant', v_party_id USING errcode='P0001';
    END IF;

    -- ✅ [SCHEMA-6] INSERT مع unique_violation handling
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
-- 19. RLS
-- =====================================================
ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units    ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs      ENABLE ROW LEVEL SECURITY;

-- TENANTS
CREATE POLICY "tenants_select" ON tenants
    FOR SELECT TO authenticated
    USING (id = get_my_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenants_update_admin" ON tenants
    FOR UPDATE TO authenticated
    USING (id = get_my_tenant_id() AND is_my_admin())
    WITH CHECK (id = get_my_tenant_id() AND is_my_admin());

-- PROFILES
CREATE POLICY "profiles_select_self" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY "profiles_select_same_tenant" ON profiles
    FOR SELECT TO authenticated
    USING (tenant_id = get_my_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "profiles_update_self" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_admin" ON profiles
    FOR UPDATE TO authenticated
    USING (tenant_id = get_my_tenant_id() AND is_my_admin())
    WITH CHECK (tenant_id = get_my_tenant_id() AND is_my_admin());

-- OTHER TABLES
CREATE POLICY "products_access"        ON products        FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "product_units_access"   ON product_units   FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "parties_access"         ON parties         FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "invoices_access"        ON invoices        FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "transactions_access"    ON transactions    FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "stock_movements_access" ON stock_movements FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "invoice_counters_access" ON invoice_counters FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "sequences_access"       ON sequences       FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "settings_access"        ON settings        FOR ALL TO authenticated
    USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- SYSTEM_LOGS
CREATE POLICY "system_logs_read" ON system_logs
    FOR SELECT TO authenticated
    USING (tenant_id = get_my_tenant_id() AND is_my_admin());

CREATE POLICY "system_logs_insert" ON system_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = get_my_tenant_id()
        AND (user_id IS NULL OR user_id = auth.uid())
    );

-- =====================================================
-- 20. GRANTS
-- =====================================================

-- PROFILES: أعمدة محددة فقط
REVOKE INSERT, UPDATE, DELETE ON profiles FROM authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON profiles TO authenticated;

-- PRODUCTS: كتابة كاملة (بدون عمود stock لأن stock على product_units)
GRANT SELECT, INSERT, UPDATE ON products TO authenticated;

-- ✅ [SCHEMA-7] PRODUCT_UNITS: INSERT كامل، UPDATE عمودي (بدون stock)
GRANT SELECT, INSERT ON product_units TO authenticated;
GRANT UPDATE (
    unit_name,
    barcode,
    price,
    cost,
    factor,
    min_price,
    max_price,
    is_base,
    updated_at
) ON product_units TO authenticated;

-- PARTIES
GRANT SELECT, INSERT, UPDATE ON parties TO authenticated;

-- SETTINGS
GRANT SELECT, INSERT, UPDATE ON settings TO authenticated;

-- TENANTS (قراءة فقط)
GRANT SELECT ON tenants TO authenticated;

-- SYSTEM_LOGS
GRANT SELECT ON system_logs TO authenticated;
GRANT INSERT ON system_logs TO authenticated;

-- جداول RPC-only
REVOKE INSERT, UPDATE, DELETE ON invoices, transactions, stock_movements,
       sequences, invoice_counters, tenants FROM authenticated;
GRANT SELECT ON invoices, transactions, stock_movements,
       sequences, invoice_counters TO authenticated;

-- RPC permissions
GRANT EXECUTE ON FUNCTION next_sequence(TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION next_invoice_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_my_tenant(TEXT)    TO authenticated;
GRANT EXECUTE ON FUNCTION create_invoice_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION void_invoice_atomic(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION add_payment_atomic(JSONB)    TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_tenant_id()        TO authenticated;
GRANT EXECUTE ON FUNCTION is_my_admin()             TO authenticated;

-- apply_stock_delta: داخلية فقط (SECURITY DEFINER)
REVOKE ALL ON FUNCTION apply_stock_delta(UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;

-- =====================================================
-- 21. VERIFICATION
-- =====================================================
DO $$
BEGIN
    -- الجداول
    IF (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('tenants','profiles','products','product_units',
                            'parties','invoices','transactions','stock_movements',
                            'invoice_counters','sequences','settings','system_logs')) <> 12 THEN
        RAISE EXCEPTION 'Some tables missing after setup';
    END IF;

    -- الأعمدة الجديدة
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'debt_payment_amount') THEN
        RAISE EXCEPTION 'invoices.debt_payment_amount missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'voided_at') THEN
        RAISE EXCEPTION 'invoices.voided_at missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'voided_at') THEN
        RAISE EXCEPTION 'transactions.voided_at missing';
    END IF;

    -- stock غير قابل للتحديث المباشر
    IF EXISTS (
        SELECT 1 FROM information_schema.column_privileges
        WHERE grantee = 'authenticated'
          AND table_name = 'product_units'
          AND column_name = 'stock'
          AND privilege_type = 'UPDATE'
    ) THEN
        RAISE EXCEPTION 'SCHEMA-7: authenticated can still UPDATE stock';
    END IF;

    -- RPCs موجودة
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_invoice_atomic') THEN
        RAISE EXCEPTION 'create_invoice_atomic missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'void_invoice_atomic') THEN
        RAISE EXCEPTION 'void_invoice_atomic missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'add_payment_atomic') THEN
        RAISE EXCEPTION 'add_payment_atomic missing';
    END IF;
END;
$$;

-- =====================================================
-- 22. MIGRATION HELPER (لمن لديهم مستخدمون قدامى)
-- =====================================================
-- INSERT INTO profiles (id, email, full_name)
-- SELECT id, email, raw_user_meta_data->>'full_name'
-- FROM auth.users
-- WHERE id NOT IN (SELECT id FROM profiles)
-- ON CONFLICT DO NOTHING;

-- =====================================================
-- ✅ DONE — Schema v5.2.1 (Full)
-- =====================================================
