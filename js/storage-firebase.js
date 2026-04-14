// js/storage-firebase.js
const Storage = {
    // --- المنتجات ---
    async getProducts() {
        const snapshot = await db.collection('products').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async saveProduct(product) {
        if (product.id) {
            await db.collection('products').doc(product.id).set(product);
        } else {
            const docRef = await db.collection('products').add(product);
            product.id = docRef.id;
        }
        return product;
    },
    async deleteProduct(id) {
        await db.collection('products').doc(id).delete();
    },

    // --- العملاء ---
    async getCustomers() {
        const snapshot = await db.collection('parties').where('type', '==', 'customer').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async saveCustomer(customer) {
        customer.type = 'customer';
        if (customer.id) {
            await db.collection('parties').doc(customer.id).set(customer);
        } else {
            const docRef = await db.collection('parties').add(customer);
            customer.id = docRef.id;
        }
        return customer;
    },

    // --- الموردين ---
    async getSuppliers() {
        const snapshot = await db.collection('parties').where('type', '==', 'supplier').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async saveSupplier(supplier) {
        supplier.type = 'supplier';
        if (supplier.id) {
            await db.collection('parties').doc(supplier.id).set(supplier);
        } else {
            const docRef = await db.collection('parties').add(supplier);
            supplier.id = docRef.id;
        }
        return supplier;
    },

    // --- الفواتير ---
    async getInvoices() {
        const snapshot = await db.collection('invoices').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async saveInvoice(invoice) {
        if (invoice.id) {
            await db.collection('invoices').doc(invoice.id).set(invoice);
        } else {
            const docRef = await db.collection('invoices').add(invoice);
            invoice.id = docRef.id;
        }
        return invoice;
    },

    // --- المشتريات ---
    async getPurchases() {
        const snapshot = await db.collection('purchases').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async savePurchase(purchase) {
        if (purchase.id) {
            await db.collection('purchases').doc(purchase.id).set(purchase);
        } else {
            const docRef = await db.collection('purchases').add(purchase);
            purchase.id = docRef.id;
        }
        return purchase;
    },

    // --- المندوبين ---
    async getReps() {
        const snapshot = await db.collection('reps').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async saveRep(rep) {
        if (rep.id) {
            await db.collection('reps').doc(rep.id).set(rep);
        } else {
            const docRef = await db.collection('reps').add(rep);
            rep.id = docRef.id;
        }
        return rep;
    },

    // --- حركات الصندوق ---
    async getTransactions() {
        const snapshot = await db.collection('transactions').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async saveTransaction(transaction) {
        if (transaction.id) {
            await db.collection('transactions').doc(transaction.id).set(transaction);
        } else {
            const docRef = await db.collection('transactions').add(transaction);
            transaction.id = docRef.id;
        }
        return transaction;
    },

    // --- الإعدادات ---
    async getSettings() {
        const doc = await db.collection('settings').doc('main').get();
        return doc.exists ? doc.data() : {};
    },
    async saveSettings(settings) {
        await db.collection('settings').doc('main').set(settings);
    }
};

window.Storage = Storage;
