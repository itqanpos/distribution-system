// js/storage.js - طبقة تخزين محلية (LocalStorage) مع بيانات تجريبية
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

    // بيانات افتراضية تجريبية
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
            { id: 1, type: 'customer', name: 'مطعم الشيف', phone: '0123456789', address: 'وسط البلد', balance: -12500, lastTransaction: '2024-01-15' },
            { id: 2, type: 'customer', name: 'سوبرماركت النور', phone: '0123987654', address: 'شرق المدينة', balance: 3400, lastTransaction: '2024-01-16' }
        ],
        suppliers: [
            { id: 3, type: 'supplier', name: 'مورد المواد الغذائية', phone: '0111222333', address: 'المنطقة الصناعية', balance: 15000, lastTransaction: '2024-01-10' }
        ],
        reps: [
            { id: 1, name: 'أحمد محمود', phone: '0100123456', region: 'وسط البلد', target: 15000, commission: 5, sales: 12500, collections: 8500 },
            { id: 2, name: 'خالد عمرو', phone: '0100654321', region: 'شرق المدينة', target: 12000, commission: 5, sales: 10800, collections: 9200 }
        ],
        invoices: [
            { id: 'INV-001', type: 'sale', customer: 'مطعم الشيف', date: '2024-01-15', total: 1250, paid: 1250, remaining: 0, status: 'paid', items: [] },
            { id: 'INV-002', type: 'sale', customer: 'سوبرماركت النور', date: '2024-01-16', total: 3400, paid: 2000, remaining: 1400, status: 'partial', items: [] }
        ],
        purchases: [
            { id: 'PUR-001', supplier: 'مورد المواد الغذائية', date: '2024-01-10', total: 12500, paid: 12500, remaining: 0, status: 'paid', items: [] }
        ],
        transactions: [
            { id: 1, date: '2024-01-15', type: 'income', amount: 2500, description: 'بيع نقدي', paymentMethod: 'cash' },
            { id: 2, date: '2024-01-16', type: 'expense', amount: 450, description: 'مصروفات نقل', paymentMethod: 'cash' }
        ],
        settings: {
            company: { name: 'شركة التوزيع الغذائي', phone: '01234567890', email: 'info@fooddist.com', address: 'القاهرة، مصر' },
            printing: { printerType: 'thermal', copies: 1, showLogo: true, footer: 'شكراً لتعاملكم معنا' },
            system: { lang: 'ar', currency: 'ج.م', lowStockAlert: 10, taxEnabled: true, taxRate: 14 }
        },
        users: [
            { id: 1, username: 'admin', password: '123456', fullName: 'مدير النظام', role: 'admin', status: 'active' },
            { id: 2, username: 'مندوب1', password: '123456', fullName: 'أحمد محمود', role: 'rep', repId: 1, status: 'active' }
        ]
    },

    // تهيئة البيانات
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

    // دوال القراءة والكتابة
    async getCollection(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    },

    async setCollection(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    async getProducts() { return this.getCollection(this.KEYS.PRODUCTS); },
    async saveProducts(products) { await this.setCollection(this.KEYS.PRODUCTS, products); },
    async saveProduct(product) {
        const products = await this.getProducts();
        const index = products.findIndex(p => p.id === product.id);
        if (index >= 0) products[index] = product;
        else { product.id = Date.now(); products.push(product); }
        await this.saveProducts(products);
        return product;
    },

    async getCustomers() { return this.getCollection(this.KEYS.CUSTOMERS); },
    async saveCustomers(customers) { await this.setCollection(this.KEYS.CUSTOMERS, customers); },
    async saveCustomer(customer) {
        const customers = await this.getCustomers();
        const index = customers.findIndex(c => c.id === customer.id);
        if (index >= 0) customers[index] = customer;
        else { customer.id = Date.now(); customer.type = 'customer'; customers.push(customer); }
        await this.saveCustomers(customers);
        return customer;
    },

    async getSuppliers() { return this.getCollection(this.KEYS.SUPPLIERS); },
    async saveSuppliers(suppliers) { await this.setCollection(this.KEYS.SUPPLIERS, suppliers); },
    async saveSupplier(supplier) {
        const suppliers = await this.getSuppliers();
        const index = suppliers.findIndex(s => s.id === supplier.id);
        if (index >= 0) suppliers[index] = supplier;
        else { supplier.id = Date.now(); supplier.type = 'supplier'; suppliers.push(supplier); }
        await this.saveSuppliers(suppliers);
        return supplier;
    },

    async getAllParties() {
        const customers = await this.getCustomers();
        const suppliers = await this.getSuppliers();
        return [...customers, ...suppliers];
    },

    async getReps() { return this.getCollection(this.KEYS.REPS); },
    async saveReps(reps) { await this.setCollection(this.KEYS.REPS, reps); },
    async saveRep(rep) {
        const reps = await this.getReps();
        const index = reps.findIndex(r => r.id === rep.id);
        if (index >= 0) reps[index] = rep;
        else { rep.id = Date.now(); reps.push(rep); }
        await this.saveReps(reps);
        return rep;
    },

    async getInvoices() { return this.getCollection(this.KEYS.INVOICES); },
    async saveInvoices(invoices) { await this.setCollection(this.KEYS.INVOICES, invoices); },
    async saveInvoice(invoice) {
        const invoices = await this.getInvoices();
        const index = invoices.findIndex(i => i.id === invoice.id);
        if (index >= 0) invoices[index] = invoice;
        else invoices.push(invoice);
        await this.saveInvoices(invoices);
        return invoice;
    },

    async getPurchases() { return this.getCollection(this.KEYS.PURCHASES); },
    async savePurchases(purchases) { await this.setCollection(this.KEYS.PURCHASES, purchases); },
    async savePurchase(purchase) {
        const purchases = await this.getPurchases();
        const index = purchases.findIndex(p => p.id === purchase.id);
        if (index >= 0) purchases[index] = purchase;
        else purchases.push(purchase);
        await this.savePurchases(purchases);
        return purchase;
    },

    async getTransactions() { return this.getCollection(this.KEYS.TRANSACTIONS); },
    async saveTransactions(transactions) { await this.setCollection(this.KEYS.TRANSACTIONS, transactions); },
    async saveTransaction(transaction) {
        const transactions = await this.getTransactions();
        const index = transactions.findIndex(t => t.id === transaction.id);
        if (index >= 0) transactions[index] = transaction;
        else { transaction.id = Date.now(); transactions.push(transaction); }
        await this.saveTransactions(transactions);
        return transaction;
    },

    async getSettings() {
        const data = localStorage.getItem(this.KEYS.SETTINGS);
        return data ? JSON.parse(data) : this.defaults.settings;
    },
    async saveSettings(settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    },

    async getUsers() { return this.getCollection(this.KEYS.USERS); },
    async saveUsers(users) { await this.setCollection(this.KEYS.USERS, users); },
    async saveUser(user) {
        const users = await this.getUsers();
        const index = users.findIndex(u => u.id === user.id);
        if (index >= 0) users[index] = user;
        else { user.id = Date.now(); users.push(user); }
        await this.saveUsers(users);
        return user;
    }
};

// تهيئة البيانات الافتراضية عند التحميل
Storage.init();

window.Storage = Storage;
