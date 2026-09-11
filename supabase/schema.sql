-- =====================================================
-- Hesaby Distribution System - Full Database Schema
-- Supabase / PostgreSQL
-- Version: 2.0
-- =====================================================

-- =====================================================
-- 1. TENANTS (المستأجرون - الشركات المشتركة)
-- =====================================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise', 'expired')),
    phone TEXT,
    email TEXT,
    address TEXT,
    logo_url TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at);

-- =====================================================
-- 2. PROFILES (المستخدمون)
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY, -- matches auth.users.id
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'rep' CHECK (role IN ('super_admin', 'admin', 'rep')),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at);

-- =====================================================
-- 3. PRODUCTS (المنتجات)
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    barcode TEXT,
    category TEXT,
    description TEXT,
    image_url TEXT,
    tax_rate NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at);

-- =====================================================
-- 4. PRODUCT_UNITS (وحدات القياس)
-- =====================================================
CREATE TABLE IF NOT EXISTS product_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    unit_name TEXT NOT NULL,
    barcode TEXT,
    price NUMERIC NOT NULL DEFAULT 0,
    cost NUMERIC NOT NULL DEFAULT 0,
    factor NUMERIC NOT NULL DEFAULT 1,
    stock NUMERIC NOT NULL DEFAULT 0,
    min_price NUMERIC DEFAULT 0,
    max_price NUMERIC DEFAULT 0,
    is_base BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id);
CREATE INDEX IF NOT EXISTS idx_product_units_barcode ON product_units(barcode);

-- =====================================================
-- 5. PARTIES (العملاء والموردين)
-- =====================================================
CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('customer', 'supplier', 'both')),
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_number TEXT,
    balance NUMERIC DEFAULT 0,
    credit_limit NUMERIC DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_parties_tenant_id ON parties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(type);
CREATE INDEX IF NOT EXISTS idx_parties_phone ON parties(phone);
CREATE INDEX IF NOT EXISTS idx_parties_deleted_at ON parties(deleted_at);

-- =====================================================
-- 6. INVOICES (الفواتير - مبيعات ومشتريات)
-- =====================================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale', 'purchase', 'return_sale', 'return_purchase')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- العميل أو المورد
    "customerId" UUID REFERENCES parties(id) ON DELETE SET NULL,
    customer_name TEXT,
    "supplierId" UUID REFERENCES parties(id) ON DELETE SET NULL,
    supplier_name TEXT,
    
    -- العناصر
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- المبالغ
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC NOT NULL DEFAULT 0,
    tax NUMERIC DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    
    -- الدفع
    cash_paid NUMERIC DEFAULT 0,
    transfer_paid NUMERIC DEFAULT 0,
    card_paid NUMERIC DEFAULT 0,
    used_customer_balance NUMERIC DEFAULT 0,
    paid NUMERIC DEFAULT 0,
    remaining NUMERIC DEFAULT 0,
    change_amount NUMERIC DEFAULT 0,
    customer_credit_added NUMERIC DEFAULT 0,
    
    payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit', 'mixed')),
    status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'partial', 'credit', 'held', 'resumed', 'voided')),
    
    notes TEXT,
    original_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoices_customerId ON invoices("customerId");
CREATE INDEX IF NOT EXISTS idx_invoices_supplierId ON invoices("supplierId");
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON invoices(deleted_at);

-- عمود فريد على رقم الفاتورة لكل مستأجر
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_number_per_tenant 
    ON invoices(tenant_id, invoice_number) WHERE deleted_at IS NULL;

-- =====================================================
-- 7. PURCHASES (سجل المشتريات التفصيلي - اختياري)
-- =====================================================
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    invoice_number TEXT,
    date DATE DEFAULT CURRENT_DATE,
    items JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    paid NUMERIC DEFAULT 0,
    remaining NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'paid',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_purchases_tenant_id ON purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_deleted_at ON purchases(deleted_at);

-- =====================================================
-- 8. TRANSACTIONS (المعاملات المالية)
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'payment_in', 'payment_out')),
    amount NUMERIC NOT NULL,
    party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    payment_method TEXT DEFAULT 'cash',
    reference TEXT,
    notes TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at);

-- =====================================================
-- 9. RETURNS (المرتجعات)
-- =====================================================
CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    original_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('sale', 'purchase')),
    date DATE DEFAULT CURRENT_DATE,
    party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    items JSONB DEFAULT '[]'::jsonb,
    total NUMERIC DEFAULT 0,
    reason TEXT,
    status TEXT DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_returns_tenant_id ON returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_returns_type ON returns(type);
CREATE INDEX IF NOT EXISTS idx_returns_deleted_at ON returns(deleted_at);

-- =====================================================
-- 10. ACCOUNTS (الحسابات المحاسبية)
-- =====================================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    parent_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    balance NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_deleted_at ON accounts(deleted_at);

-- =====================================================
-- 11. JOURNAL_ENTRIES (القيود المحاسبية)
-- =====================================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    entry_number TEXT,
    date DATE DEFAULT CURRENT_DATE,
    description TEXT,
    lines JSONB DEFAULT '[]'::jsonb,
    total_debit NUMERIC DEFAULT 0,
    total_credit NUMERIC DEFAULT 0,
    reference_type TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_id ON journal_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_deleted_at ON journal_entries(deleted_at);

-- =====================================================
-- 12. SETTINGS (الإعدادات لكل مستأجر)
-- =====================================================
CREATE TABLE IF NOT EXISTS settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 13. SEQUENCES (أرقام الفواتير التسلسلية)
-- =====================================================
CREATE TABLE IF NOT EXISTS sequences (
    name TEXT PRIMARY KEY,
    current_value BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 14. SYSTEM_LOGS (سجل الأخطاء والتشخيص)
-- =====================================================
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    level TEXT DEFAULT 'error' CHECK (level IN ('info', 'warning', 'error', 'critical')),
    message TEXT,
    stack TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_id ON system_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- دالة توليد رقم الفاتورة التالي
CREATE OR REPLACE FUNCTION next_sequence(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next BIGINT;
    v_year TEXT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YY');
    INSERT INTO sequences (name, current_value)
    VALUES (p_name, 1)
    ON CONFLICT (name)
    DO UPDATE SET current_value = sequences.current_value + 1, updated_at = NOW()
    RETURNING current_value INTO v_next;

    RETURN v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- دالة إنشاء متجر جديد للمستخدم
CREATE OR REPLACE FUNCTION create_my_tenant(p_tenant_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;

    INSERT INTO tenants (name) VALUES (p_tenant_name)
    RETURNING id INTO v_tenant_id;

    UPDATE profiles SET tenant_id = v_tenant_id WHERE id = v_user_id;

    -- إنشاء الإعدادات الافتراضية
    INSERT INTO settings (tenant_id, data) VALUES (v_tenant_id, '{}'::jsonb);

    RETURN v_tenant_id;
END;
$$;

-- دالة إنشاء فاتورة بيع
CREATE OR REPLACE FUNCTION create_sale_invoice(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_id UUID;
BEGIN
    v_invoice_id := COALESCE((p_data->>'id')::UUID, gen_random_uuid());

    INSERT INTO invoices (
        id, tenant_id, invoice_number, type, date,
        "customerId", customer_name, items,
        subtotal, discount, total,
        cash_paid, transfer_paid, card_paid, used_customer_balance,
        paid, remaining, change_amount, customer_credit_added,
        payment_method, status, notes,
        created_by
    ) VALUES (
        v_invoice_id,
        (p_data->>'tenant_id')::UUID,
        p_data->>'invoice_number',
        COALESCE(p_data->>'type', 'sale'),
        COALESCE((p_data->>'date')::DATE, CURRENT_DATE),
        NULLIF(p_data->>'customer_id', '')::UUID,
        p_data->>'customer_name',
        COALESCE(p_data->'items', '[]'::jsonb),
        COALESCE((p_data->>'subtotal')::NUMERIC, 0),
        COALESCE((p_data->>'discount')::NUMERIC, 0),
        COALESCE((p_data->>'total')::NUMERIC, 0),
        COALESCE((p_data->>'cash_paid')::NUMERIC, 0),
        COALESCE((p_data->>'transfer_paid')::NUMERIC, 0),
        COALESCE((p_data->>'card_paid')::NUMERIC, 0),
        COALESCE((p_data->>'used_customer_balance')::NUMERIC, 0),
        COALESCE((p_data->>'paid')::NUMERIC, 0),
        COALESCE((p_data->>'remaining')::NUMERIC, 0),
        COALESCE((p_data->>'change_amount')::NUMERIC, 0),
        COALESCE((p_data->>'customer_credit_added')::NUMERIC, 0),
        COALESCE(p_data->>'payment_method', 'cash'),
        COALESCE(p_data->>'status', 'paid'),
        p_data->>'notes',
        (p_data->>'created_by')::UUID
    );

    RETURN jsonb_build_object('success', true, 'id', v_invoice_id, 'invoice_number', p_data->>'invoice_number');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- دالة إنشاء فاتورة مشتريات (بدون supplier_name)
CREATE OR REPLACE FUNCTION create_purchase_invoice(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_id UUID;
BEGIN
    v_invoice_id := COALESCE((p_data->>'id')::UUID, gen_random_uuid());

    INSERT INTO invoices (
        id, tenant_id, invoice_number, type, date,
        "supplierId", items,
        subtotal, discount, total,
        cash_paid, transfer_paid, paid, remaining,
        status, notes, created_by
    ) VALUES (
        v_invoice_id,
        (p_data->>'tenant_id')::UUID,
        p_data->>'invoice_number',
        'purchase',
        COALESCE((p_data->>'date')::DATE, CURRENT_DATE),
        NULLIF(p_data->>'supplierId', '')::UUID,
        COALESCE(p_data->'items', '[]'::jsonb),
        COALESCE((p_data->>'subtotal')::NUMERIC, 0),
        COALESCE((p_data->>'discount')::NUMERIC, 0),
        COALESCE((p_data->>'total')::NUMERIC, 0),
        COALESCE((p_data->>'cash_paid')::NUMERIC, 0),
        COALESCE((p_data->>'transfer_paid')::NUMERIC, 0),
        COALESCE((p_data->>'paid')::NUMERIC, 0),
        COALESCE((p_data->>'remaining')::NUMERIC, 0),
        COALESCE(p_data->>'status', 'paid'),
        p_data->>'notes',
        (p_data->>'created_by')::UUID
    );

    RETURN jsonb_build_object('success', true, 'id', v_invoice_id, 'invoice_number', p_data->>'invoice_number');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- دالة مساعدة: الحصول على tenant_id للمستخدم الحالي
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- سياسات الفواتير
DROP POLICY IF EXISTS "invoices_tenant_isolation" ON invoices;
CREATE POLICY "invoices_tenant_isolation" ON invoices
    FOR ALL
    USING (tenant_id = get_my_tenant_id());

-- سياسات المنتجات
DROP POLICY IF EXISTS "products_tenant_isolation" ON products;
CREATE POLICY "products_tenant_isolation" ON products
    FOR ALL
    USING (tenant_id = get_my_tenant_id());

-- سياسات الأطراف
DROP POLICY IF EXISTS "parties_tenant_isolation" ON parties;
CREATE POLICY "parties_tenant_isolation" ON parties
    FOR ALL
    USING (tenant_id = get_my_tenant_id());

-- سياسات الملفات الشخصية
DROP POLICY IF EXISTS "profiles_own_data" ON profiles;
CREATE POLICY "profiles_own_data" ON profiles
    FOR ALL
    USING (id = auth.uid() OR tenant_id = get_my_tenant_id());

-- سياسات الإعدادات
DROP POLICY IF EXISTS "settings_tenant_isolation" ON settings;
CREATE POLICY "settings_tenant_isolation" ON settings
    FOR ALL
    USING (tenant_id = get_my_tenant_id());

-- سياسة المستأجرين
DROP POLICY IF EXISTS "tenants_own_data" ON tenants;
CREATE POLICY "tenants_own_data" ON tenants
    FOR ALL
    USING (id = get_my_tenant_id());

-- =====================================================
-- TRIGGERS (تحديث updated_at تلقائياً)
-- =====================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY['tenants','profiles','products','product_units','parties',
                            'invoices','purchases','transactions','returns',
                            'accounts','journal_entries'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', t);
        EXECUTE format('CREATE TRIGGER trg_set_updated_at 
                        BEFORE UPDATE ON %I 
                        FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    END LOOP;
END $$;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
