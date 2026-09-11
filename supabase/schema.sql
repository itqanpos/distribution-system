-- =====================================================
-- Hesaby POS - Complete Schema v3.0
-- Clean install - no legacy issues
-- =====================================================

-- Clean up old tables
DROP TABLE IF EXISTS 
    system_logs, sequences, settings, journal_entries, accounts,
    returns, transactions, purchases, invoices, parties, 
    product_units, products, profiles, tenants
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
-- 2. PROFILES
-- =====================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
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

-- =====================================================
-- 3. PRODUCTS
-- =====================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
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
-- 4. PRODUCT_UNITS
-- =====================================================
CREATE TABLE product_units (
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. PARTIES (Customers + Suppliers)
-- =====================================================
CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'customer' CHECK (type IN ('customer', 'supplier', 'both')),
    phone TEXT,
    email TEXT,
    address TEXT,
    balance NUMERIC DEFAULT 0,
    credit_limit NUMERIC DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =====================================================
-- 6. INVOICES
-- =====================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale', 'purchase', 'return_sale', 'return_purchase')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    customer_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    customer_name TEXT,
    supplier_id UUID REFERENCES parties(id) ON DELETE SET NULL,
    supplier_name TEXT,
    
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    
    cash_paid NUMERIC DEFAULT 0,
    transfer_paid NUMERIC DEFAULT 0,
    card_paid NUMERIC DEFAULT 0,
    used_balance NUMERIC DEFAULT 0,
    paid NUMERIC DEFAULT 0,
    remaining NUMERIC DEFAULT 0,
    change_amount NUMERIC DEFAULT 0,
    
    payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit', 'mixed')),
    status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'partial', 'credit', 'held', 'voided')),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID
);

-- =====================================================
-- 7. SEQUENCES
-- =====================================================
CREATE TABLE sequences (
    name TEXT PRIMARY KEY,
    current_value BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. SETTINGS
-- =====================================================
CREATE TABLE settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. SYSTEM_LOGS
-- =====================================================
CREATE TABLE system_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID,
    user_id UUID,
    level TEXT DEFAULT 'error',
    message TEXT,
    stack TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_products_tenant ON products(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_barcode ON products(barcode) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_units_product ON product_units(product_id);
CREATE INDEX idx_parties_tenant ON parties(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parties_type ON parties(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_date ON invoices(date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_customer ON invoices(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_supplier ON invoices(supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status ON invoices(status) WHERE deleted_at IS NULL;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate invoice number
CREATE OR REPLACE FUNCTION next_sequence(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_next BIGINT;
    v_year TEXT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YY');
    INSERT INTO sequences (name, current_value, updated_at)
    VALUES (p_name, 1, NOW())
    ON CONFLICT (name)
    DO UPDATE SET current_value = sequences.current_value + 1, updated_at = NOW()
    RETURNING current_value INTO v_next;
    RETURN v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- Create tenant for logged-in user
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
    
    INSERT INTO tenants (name) VALUES (p_tenant_name) RETURNING id INTO v_tenant_id;
    
    UPDATE profiles SET tenant_id = v_tenant_id WHERE id = v_user_id;
    
    INSERT INTO settings (tenant_id, data) VALUES (v_tenant_id, '{}'::jsonb);
    
    RETURN v_tenant_id;
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

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_parties_updated BEFORE UPDATE ON parties FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;

-- Helper
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Permissive policies (for authenticated users)
CREATE POLICY "tenants_access" ON tenants FOR ALL TO authenticated USING (id = get_my_tenant_id()) WITH CHECK (id = get_my_tenant_id());
CREATE POLICY "tenants_insert" ON tenants FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "profiles_access" ON profiles FOR ALL TO authenticated 
    USING (id = auth.uid() OR tenant_id = get_my_tenant_id())
    WITH CHECK (id = auth.uid() OR tenant_id = get_my_tenant_id());

CREATE POLICY "products_access" ON products FOR ALL TO authenticated 
    USING (tenant_id = get_my_tenant_id()) 
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "product_units_access" ON product_units FOR ALL TO authenticated 
    USING (product_id IN (SELECT id FROM products WHERE tenant_id = get_my_tenant_id()))
    WITH CHECK (product_id IN (SELECT id FROM products WHERE tenant_id = get_my_tenant_id()));

CREATE POLICY "parties_access" ON parties FOR ALL TO authenticated 
    USING (tenant_id = get_my_tenant_id()) 
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "invoices_access" ON invoices FOR ALL TO authenticated 
    USING (tenant_id = get_my_tenant_id()) 
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "settings_access" ON settings FOR ALL TO authenticated 
    USING (tenant_id = get_my_tenant_id()) 
    WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "sequences_access" ON sequences FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Grant execute
GRANT EXECUTE ON FUNCTION next_sequence(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_my_tenant(TEXT) TO authenticated;

-- =====================================================
-- ✅ DONE
-- =====================================================
