
### 📎 مرفق: كود SQL لإنشاء الجداول (مختصر)

<details>
<summary>اضغط لعرض كود SQL</summary>

```sql
-- جدول المنتجات
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT, name TEXT NOT NULL, category TEXT,
  units JSONB NOT NULL DEFAULT '[{"name":"قطعة","price":0,"minPrice":0,"maxPrice":0,"stock":0,"factor":1}]',
  min_stock INT DEFAULT 5, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الأطراف (عملاء وموردين)
CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, type TEXT CHECK (type IN ('customer','supplier')),
  phone TEXT, address TEXT, email TEXT, balance NUMERIC DEFAULT 0,
  last_transaction DATE, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الفواتير
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT DEFAULT 'sale', date DATE NOT NULL,
  customer_id UUID REFERENCES parties(id), customer_name TEXT,
  items JSONB NOT NULL, total NUMERIC, paid NUMERIC, remaining NUMERIC,
  discount NUMERIC DEFAULT 0, status TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المشتريات
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, supplier_id UUID REFERENCES parties(id), supplier_name TEXT,
  items JSONB NOT NULL, total NUMERIC, paid NUMERIC, remaining NUMERIC,
  status TEXT, invoice_number TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول حركات الصندوق
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, type TEXT CHECK (type IN ('income','expense')),
  amount NUMERIC, description TEXT, payment_method TEXT DEFAULT 'cash',
  reference TEXT, notes TEXT, timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الإعدادات
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  data JSONB NOT NULL
);

-- (توجد جداول أخرى للمرتجعات، الموظفين، السلف، المصروفات، المندوبين... يمكن إضافتها حسب الحاجة)
