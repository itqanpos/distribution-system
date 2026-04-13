// js/storage.js
// طبقة تخزين البيانات (محاكاة قاعدة بيانات باستخدام localStorage)
// جميع الدوال async جاهزة للاستبدال بـ API حقيقي

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
            { id: 1, username: 'admin', password: '123456', fullName: 'مدير النظام', role: 'admin', status: 'active' },
            { id: 2, username: 'مندوب1', password: '123456', fullName: 'أحمد محمود', role: 'rep', repId: 1, status: 'active' },
            { id: 3, username: 'مندوب2', password: '123456', fullName: 'خالد عمرو', role: 'rep', repId: 2, status: 'active' }
        ]
    },

    // تهيئة التخزين (تحميل البيانات الافتراضية إذا لم تكن موجودة)
   // داخل storage.js، أضف في بداية init():
async init() {
    // فحص توفر localStorage
    try {
        localStorage.setItem('__test__', '1');
        localStorage.removeItem('__test__');
    } catch (e) {
        console.error('localStorage not available:', e);
        alert('التخزين المحلي غير متوفر. التطبيق لن يعمل بشكل صحيح.');
        return;
    }
    // ... باقي الكود
}
    async init() {
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
    async getCollection(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    },

    async setCollection(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    // المنتجات
    async getProducts() {
        return this.getCollection(this.KEYS.PRODUCTS);
    },
    async saveProducts(products) {
        await this.setCollection(this.KEYS.PRODUCTS, products);
    },
    async saveProduct(product) {
        const products = await this.getProducts();
        const index = products.findIndex(p => p.id === product.id);
        if (index >= 0) products[index] = product;
        else {
            product.id = Date.now();
            products.push(product);
        }
        await this.saveProducts(products);
        return product;
    },
    async deleteProduct(id) {
        const products = await this.getProducts();
        const filtered = products.filter(p => p.id !== id);
        await this.saveProducts(filtered);
    },

    // العملاء
    async getCustomers() {
        return this.getCollection(this.KEYS.CUSTOMERS);
    },
    async saveCustomers(customers) {
        await this.setCollection(this.KEYS.CUSTOMERS, customers);
    },
    async saveCustomer(customer) {
        const customers = await this.getCustomers();
        const index = customers.findIndex(c => c.id === customer.id);
        if (index >= 0) customers[index] = customer;
        else {
            customer.id = Date.now();
            customer.type = 'customer';
            customers.push(customer);
        }
        await this.saveCustomers(customers);
        return customer;
    },
    async deleteCustomer(id) {
        const customers = await this.getCustomers();
        const filtered = customers.filter(c => c.id !== id);
        await this.saveCustomers(filtered);
    },

    // الموردين
    async getSuppliers() {
        return this.getCollection(this.KEYS.SUPPLIERS);
    },
    async saveSuppliers(suppliers) {
        await this.setCollection(this.KEYS.SUPPLIERS, suppliers);
    },
    async saveSupplier(supplier) {
        const suppliers = await this.getSuppliers();
        const index = suppliers.findIndex(s => s.id === supplier.id);
        if (index >= 0) suppliers[index] = supplier;
        else {
            supplier.id = Date.now();
            supplier.type = 'supplier';
            suppliers.push(supplier);
        }
        await this.saveSuppliers(suppliers);
        return supplier;
    },
    async deleteSupplier(id) {
        const suppliers = await this.getSuppliers();
        const filtered = suppliers.filter(s => s.id !== id);
        await this.saveSuppliers(filtered);
    },

    // جميع الأطراف
    async getAllParties() {
        const customers = await this.getCustomers();
        const suppliers = await this.getSuppliers();
        return [...customers, ...suppliers];
    },
    async saveParty(party) {
        if (party.type === 'customer') return this.saveCustomer(party);
        else return this.saveSupplier(party);
    },
    async deleteParty(id, type) {
        if (type === 'customer') return this.deleteCustomer(id);
        else return this.deleteSupplier(id);
    },

    // المندوبين
    async getReps() {
        return this.getCollection(this.KEYS.REPS);
    },
    async saveReps(reps) {
        await this.setCollection(this.KEYS.REPS, reps);
    },
    async saveRep(rep) {
        const reps = await this.getReps();
        const index = reps.findIndex(r => r.id === rep.id);
        if (index >= 0) reps[index] = rep;
        else {
            rep.id = Date.now();
            reps.push(rep);
        }
        await this.saveReps(reps);
        return rep;
    },
    async deleteRep(id) {
        const reps = await this.getReps();
        const filtered = reps.filter(r => r.id !== id);
        await this.saveReps(filtered);
    },

    // الفواتير
    async getInvoices() {
        return this.getCollection(this.KEYS.INVOICES);
    },
    async saveInvoices(invoices) {
        await this.setCollection(this.KEYS.INVOICES, invoices);
    },
    async saveInvoice(invoice) {
        const invoices = await this.getInvoices();
        const index = invoices.findIndex(i => i.id === invoice.id);
        if (index >= 0) invoices[index] = invoice;
        else invoices.push(invoice);
        await this.saveInvoices(invoices);
        return invoice;
    },

    // المشتريات
    async getPurchases() {
        return this.getCollection(this.KEYS.PURCHASES);
    },
    async savePurchases(purchases) {
        await this.setCollection(this.KEYS.PURCHASES, purchases);
    },
    async savePurchase(purchase) {
        const purchases = await this.getPurchases();
        const index = purchases.findIndex(p => p.id === purchase.id);
        if (index >= 0) purchases[index] = purchase;
        else purchases.push(purchase);
        await this.savePurchases(purchases);
        return purchase;
    },

    // حركات الصندوق
    async getTransactions() {
        return this.getCollection(this.KEYS.TRANSACTIONS);
    },
    async saveTransactions(transactions) {
        await this.setCollection(this.KEYS.TRANSACTIONS, transactions);
    },
    async saveTransaction(transaction) {
        const transactions = await this.getTransactions();
        const index = transactions.findIndex(t => t.id === transaction.id);
        if (index >= 0) transactions[index] = transaction;
        else {
            transaction.id = Date.now();
            transactions.push(transaction);
        }
        await this.saveTransactions(transactions);
        return transaction;
    },

    // الإعدادات
    async getSettings() {
        const data = localStorage.getItem(this.KEYS.SETTINGS);
        return data ? JSON.parse(data) : this.defaults.settings;
    },
    async saveSettings(settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    },

    // المستخدمين
    async getUsers() {
        return this.getCollection(this.KEYS.USERS);
    },
    async saveUsers(users) {
        await this.setCollection(this.KEYS.USERS, users);
    },
    async saveUser(user) {
        const users = await this.getUsers();
        const index = users.findIndex(u => u.id === user.id);
        if (index >= 0) users[index] = user;
        else {
            user.id = Date.now();
            users.push(user);
        }
        await this.saveUsers(users);
        return user;
    },
    async deleteUser(id) {
        const users = await this.getUsers();
        const filtered = users.filter(u => u.id !== id);
        await this.saveUsers(filtered);
    }
};

window.Storage = Storage;
