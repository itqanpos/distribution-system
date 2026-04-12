// js/database.js
// طبقة قاعدة بيانات IndexedDB باستخدام Dexie.js
// (اختياري - يمكن استخدام Storage.js بدلاً منه)

// تضمين مكتبة Dexie يجب أن يكون قبل هذا الملف في HTML:
// <script src="https://cdn.jsdelivr.net/npm/dexie@3.2.3/dist/dexie.min.js"></script>

const db = new Dexie('FoodDistDB');

db.version(1).stores({
    products: '++id, name, category',
    customers: '++id, name, phone, balance, type',
    suppliers: '++id, name, phone, balance, type',
    reps: '++id, name, phone, region, sales, collections, target',
    invoices: 'id, type, customer, supplier, date, total, status',
    purchases: 'id, supplier, date, total, status',
    transactions: '++id, date, type, amount, description',
    settings: 'key',
    users: '++id, username, role, status'
});

const Database = {
    async getProducts() { return await db.products.toArray(); },
    async saveProduct(product) {
        if (product.id) await db.products.update(product.id, product);
        else product.id = await db.products.add(product);
        return product;
    },
    async deleteProduct(id) { await db.products.delete(id); },
    async saveProducts(products) { await db.products.clear(); await db.products.bulkAdd(products); },

    async getCustomers() { return await db.customers.where('type').equals('customer').toArray(); },
    async saveCustomer(customer) {
        customer.type = 'customer';
        if (customer.id) await db.customers.update(customer.id, customer);
        else customer.id = await db.customers.add(customer);
        return customer;
    },
    async deleteCustomer(id) { await db.customers.delete(id); },
    async saveCustomers(customers) {
        const existing = await db.customers.where('type').equals('customer').toArray();
        for (let c of existing) await db.customers.delete(c.id);
        for (let c of customers) { c.type = 'customer'; await db.customers.add(c); }
    },

    async getSuppliers() { return await db.customers.where('type').equals('supplier').toArray(); },
    async saveSupplier(supplier) {
        supplier.type = 'supplier';
        if (supplier.id) await db.customers.update(supplier.id, supplier);
        else supplier.id = await db.customers.add(supplier);
        return supplier;
    },
    async deleteSupplier(id) { await db.customers.delete(id); },
    async saveSuppliers(suppliers) {
        const existing = await db.customers.where('type').equals('supplier').toArray();
        for (let s of existing) await db.customers.delete(s.id);
        for (let s of suppliers) { s.type = 'supplier'; await db.customers.add(s); }
    },

    async getAllParties() { return await db.customers.toArray(); },

    async getReps() { return await db.reps.toArray(); },
    async saveRep(rep) {
        if (rep.id) await db.reps.update(rep.id, rep);
        else rep.id = await db.reps.add(rep);
        return rep;
    },
    async deleteRep(id) { await db.reps.delete(id); },
    async saveReps(reps) { await db.reps.clear(); await db.reps.bulkAdd(reps); },

    async getInvoices() { return await db.invoices.toArray(); },
    async saveInvoice(invoice) { await db.invoices.put(invoice); return invoice; },
    async deleteInvoice(id) { await db.invoices.delete(id); },
    async saveInvoices(invoices) { await db.invoices.clear(); await db.invoices.bulkAdd(invoices); },

    async getPurchases() { return await db.purchases.toArray(); },
    async savePurchase(purchase) { await db.purchases.put(purchase); return purchase; },
    async deletePurchase(id) { await db.purchases.delete(id); },
    async savePurchases(purchases) { await db.purchases.clear(); await db.purchases.bulkAdd(purchases); },

    async getTransactions() { return await db.transactions.toArray(); },
    async saveTransaction(transaction) {
        if (transaction.id) await db.transactions.update(transaction.id, transaction);
        else transaction.id = await db.transactions.add(transaction);
        return transaction;
    },
    async deleteTransaction(id) { await db.transactions.delete(id); },
    async saveTransactions(transactions) { await db.transactions.clear(); await db.transactions.bulkAdd(transactions); },

    async getSettings() {
        const settings = await db.settings.get('main');
        return settings?.value || {};
    },
    async saveSettings(value) { await db.settings.put({ key: 'main', value }); },

    async getUsers() { return await db.users.toArray(); },
    async saveUser(user) {
        if (user.id) await db.users.update(user.id, user);
        else user.id = await db.users.add(user);
        return user;
    },
    async deleteUser(id) { await db.users.delete(id); },
    async saveUsers(users) { await db.users.clear(); await db.users.bulkAdd(users); },

    async initDefaultData() {
        const count = await db.products.count();
        if (count === 0) {
            await db.products.bulkAdd([
                { id: 1, name: 'خبز', category: 'مخبوزات', description: 'خبز طازج', units: [
                    { unit: 'قطعة', price: 5, min: 4, max: 6, barcode: '111', stock: 150 },
                    { unit: 'ربطة (10 قطع)', price: 45, min: 40, max: 50, barcode: '112', stock: 20 }
                ]},
                { id: 2, name: 'زيت ذرة', category: 'زيوت', description: 'زيت نباتي', units: [
                    { unit: 'لتر', price: 40, min: 38, max: 45, barcode: '221', stock: 85 },
                    { unit: 'كرتونة (12 لتر)', price: 450, min: 430, max: 480, barcode: '222', stock: 15 }
                ]}
            ]);
        }
        if (await db.customers.count() === 0) {
            await db.customers.bulkAdd([
                { id: 1, type: 'customer', name: 'مطعم الشيف', phone: '0123456789', address: 'وسط البلد', balance: -12500, lastTransaction: '2024-01-15' },
                { id: 2, type: 'customer', name: 'سوبرماركت النور', phone: '0123987654', address: 'شرق المدينة', balance: 3400, lastTransaction: '2024-01-16' },
                { id: 3, type: 'supplier', name: 'مورد المواد الغذائية', phone: '0111222333', address: 'المنطقة الصناعية', balance: 15000, lastTransaction: '2024-01-10' }
            ]);
        }
        if (await db.reps.count() === 0) {
            await db.reps.bulkAdd([
                { id: 1, name: 'أحمد محمود', phone: '0100123456', region: 'وسط البلد', target: 15000, commission: 5, sales: 12500, collections: 8500 },
                { id: 2, name: 'خالد عمرو', phone: '0100654321', region: 'شرق المدينة', target: 12000, commission: 5, sales: 10800, collections: 9200 }
            ]);
        }
        if (await db.users.count() === 0) {
            await db.users.add({ id: 1, username: 'admin', fullName: 'مدير النظام', password: '123456', role: 'admin', status: 'active' });
        }
        const settings = await db.settings.get('main');
        if (!settings) {
            await db.settings.put({ key: 'main', value: {
                company: { name: 'شركة التوزيع الغذائي', phone: '01234567890', email: 'info@fooddist.com', address: 'القاهرة، مصر' },
                printing: { printerType: 'thermal', copies: 1, showLogo: true, footer: 'شكراً لتعاملكم معنا' },
                system: { lang: 'ar', currency: 'ج.م', lowStockAlert: 10 }
            }});
        }
    }
};

window.Database = Database;
