// js/storage.js
// طبقة تخزين البيانات (محاكاة قاعدة بيانات باستخدام localStorage)

const Storage = {
    KEYS: {
        PRODUCTS: 'foodDist_products',
        CUSTOMERS: 'foodDist_customers',
        SUPPLIERS: 'foodDist_suppliers',
        REPS: 'foodDist_reps',
        INVOICES: 'foodDist_invoices',
        PURCHASES: 'foodDist_purchases',
        TRANSACTIONS: 'foodDist_transactions',
        SETTINGS: 'foodDist_settings',
        USERS: 'foodDist_users'
    },

    // البيانات الافتراضية الأولية
    defaults: {
        products: [
            { id: 1, name: 'خبز', category: 'مخبوزات', description: 'خبز طازج', units: [
                { unit: 'قطعة', price: 5, min: 4, max: 6, barcode: '111', stock: 150 },
                { unit: 'ربطة (10 قطع)', price: 45, min: 40, max: 50, barcode: '112', stock: 20 }
            ]},
            { id: 2, name: 'زيت ذرة', category: 'زيوت', description: 'زيت نباتي', units: [
                { unit: 'لتر', price: 40, min: 38, max: 45, barcode: '221', stock: 85 },
                { unit: 'كرتونة (12 لتر)', price: 450, min: 430, max: 480, barcode: '222', stock: 15 }
            ]},
            { id: 3, name: 'أرز', category: 'بقوليات', description: 'أرز بسمتي', units: [
                { unit: 'كيلو', price: 18, min: 16, max: 20, barcode: '331', stock: 200 }
            ]}
        ],
        customers: [
            { id: 1, type: 'customer', name: 'مطعم الشيف', phone: '0123456789', address: 'وسط البلد', email: 'chef@example.com', balance: -12500, lastTransaction: '2024-01-15' },
            { id: 2, type: 'customer', name: 'سوبرماركت النور', phone: '0123987654', address: 'شرق المدينة', email: 'nour@example.com', balance: 3400, lastTransaction: '2024-01-16' },
            { id: 5, type: 'customer', name: 'مخبز الفردوس', phone: '0111222333', address: 'غرب المدينة', email: 'fardous@example.com', balance: -8500, lastTransaction: '2024-01-14' }
        ],
        suppliers: [
            { id: 3, type: 'supplier', name: 'مورد المواد الغذائية', phone: '0111222333', address: 'المنطقة الصناعية', email: 'supplier@example.com', balance: 15000, lastTransaction: '2024-01-10' },
            { id: 4, type: 'supplier', name: 'مخبز الأمل', phone: '0100999888', address: 'وسط البلد', email: 'bakery@example.com', balance: -2500, lastTransaction: '2024-01-12' }
        ],
        reps: [
            { id: 1, name: 'أحمد محمود', phone: '0100123456', region: 'وسط البلد', target: 15000, commission: 5, sales: 12500, collections: 8500 },
            { id: 2, name: 'خالد عمرو', phone: '0100654321', region: 'شرق المدينة', target: 12000, commission: 5, sales: 10800, collections: 9200 },
            { id: 3, name: 'وليد حسن', phone: '0111222333', region: 'غرب المدينة', target: 10000, commission: 4, sales: 6800, collections: 4500 }
        ],
        invoices: [
            { id: 'INV-001', type: 'sale', customer: 'مطعم الشيف', date: '2024-01-15', total: 1250, paid: 1250, remaining: 0, status: 'paid', items: [] },
            { id: 'INV-002', type: 'sale', customer: 'سوبرماركت النور', date: '2024-01-16', total: 3400, paid: 2000, remaining: 1400, status: 'partial', items: [] }
        ],
        purchases: [
            { id: 'PUR-001', supplier: 'مورد المواد الغذائية', date: '2024-01-10', total: 12500, paid: 12500, remaining: 0, status: 'paid', items: [] },
            { id: 'PUR-002', supplier: 'مخبز الأمل', date: '2024-01-12', total: 3400, paid: 0, remaining: 3400, status: 'unpaid', items: [] }
        ],
        transactions: [
            { id: 1, date: '2024-01-15', type: 'income', amount: 2500, description: 'بيع نقدي', paymentMethod: 'cash', reference: 'INV-001', notes: '' },
            { id: 2, date: '2024-01-16', type: 'expense', amount: 450, description: 'مصروفات نقل', paymentMethod: 'cash', reference: '', notes: '' }
        ],
        settings: {
            company: { name: 'شركة التوزيع الغذائي', phone: '01234567890', email: 'info@fooddist.com', address: 'القاهرة، مصر' },
            printing: { printerType: 'a4', copies: 1, showLogo: true, footer: 'شكراً لتعاملكم معنا' },
            system: { lang: 'ar', currency: 'ج.م', timezone: 'Africa/Cairo', dateFormat: 'dd/mm/yyyy', lowStockAlert: 10 }
        },
        users: [
            { id: 1, username: 'admin', fullName: 'مدير النظام', role: 'admin', status: 'active', lastLogin: '2024-01-20 10:30' }
        ]
    },

    // تهيئة التخزين (تحميل البيانات الافتراضية إذا لم تكن موجودة)
    init() {
        for (let key in this.KEYS) {
            const storageKey = this.KEYS[key];
            if (!localStorage.getItem(storageKey)) {
                const defaultData = this.defaults[key.toLowerCase()];
                if (defaultData) {
                    localStorage.setItem(storageKey, JSON.stringify(defaultData));
                }
            }
        }
    },

    // دوال عامة للقراءة والكتابة
    getCollection(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    },

    setCollection(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    // دوال متخصصة
    getProducts() {
        return this.getCollection(this.KEYS.PRODUCTS);
    },

    saveProducts(products) {
        this.setCollection(this.KEYS.PRODUCTS, products);
    },

    getCustomers() {
        return this.getCollection(this.KEYS.CUSTOMERS);
    },

    saveCustomers(customers) {
        this.setCollection(this.KEYS.CUSTOMERS, customers);
    },

    getSuppliers() {
        return this.getCollection(this.KEYS.SUPPLIERS);
    },

    saveSuppliers(suppliers) {
        this.setCollection(this.KEYS.SUPPLIERS, suppliers);
    },

    // الحصول على جميع العملاء والموردين
    getAllParties() {
        return [...this.getCustomers(), ...this.getSuppliers()];
    },

    // حفظ طرف (عميل أو مورد) مع تحديث المجموعة الصحيحة
    saveParty(party) {
        if (party.type === 'customer') {
            const customers = this.getCustomers();
            const index = customers.findIndex(c => c.id === party.id);
            if (index >= 0) customers[index] = party;
            else {
                party.id = Date.now();
                customers.push(party);
            }
            this.saveCustomers(customers);
        } else {
            const suppliers = this.getSuppliers();
            const index = suppliers.findIndex(s => s.id === party.id);
            if (index >= 0) suppliers[index] = party;
            else {
                party.id = Date.now();
                suppliers.push(party);
            }
            this.saveSuppliers(suppliers);
        }
    },

    deleteParty(id, type) {
        if (type === 'customer') {
            const customers = this.getCustomers().filter(c => c.id !== id);
            this.saveCustomers(customers);
        } else {
            const suppliers = this.getSuppliers().filter(s => s.id !== id);
            this.saveSuppliers(suppliers);
        }
    },

    getReps() {
        return this.getCollection(this.KEYS.REPS);
    },

    saveReps(reps) {
        this.setCollection(this.KEYS.REPS, reps);
    },

    getInvoices() {
        return this.getCollection(this.KEYS.INVOICES);
    },

    saveInvoices(invoices) {
        this.setCollection(this.KEYS.INVOICES, invoices);
    },

    getPurchases() {
        return this.getCollection(this.KEYS.PURCHASES);
    },

    savePurchases(purchases) {
        this.setCollection(this.KEYS.PURCHASES, purchases);
    },

    getTransactions() {
        return this.getCollection(this.KEYS.TRANSACTIONS);
    },

    saveTransactions(transactions) {
        this.setCollection(this.KEYS.TRANSACTIONS, transactions);
    },

    getSettings() {
        const data = localStorage.getItem(this.KEYS.SETTINGS);
        return data ? JSON.parse(data) : this.defaults.settings;
    },

    saveSettings(settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    },

    getUsers() {
        return this.getCollection(this.KEYS.USERS);
    },

    saveUsers(users) {
        this.setCollection(this.KEYS.USERS, users);
    }
};

// تهيئة التخزين عند التحميل
Storage.init();

window.Storage = Storage;
