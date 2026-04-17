// js/storage-firebase.js
(function() {
    if (!window.db) {
        console.error('Firestore not initialized');
        return;
    }
    const db = window.db;

    function sanitizeObject(obj) {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
    }

    window.Storage = {
        // Products
        async getProducts() {
            const snap = await db.collection('products').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveProduct(product) {
            if (typeof product.units === 'string') {
                try { product.units = JSON.parse(product.units); } catch { product.units = []; }
            }
            if (!product.units) product.units = [];
            const clean = sanitizeObject(product);
            if (clean.id) {
                await db.collection('products').doc(clean.id).set(clean);
                return clean;
            } else {
                const ref = await db.collection('products').add(clean);
                clean.id = ref.id;
                return clean;
            }
        },
        async deleteProduct(id) { await db.collection('products').doc(id).delete(); },

        // Customers
        async getCustomers() {
            const snap = await db.collection('parties').where('type', '==', 'customer').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveCustomer(customer) {
            customer.type = 'customer';
            const clean = sanitizeObject(customer);
            if (clean.id) {
                await db.collection('parties').doc(clean.id).set(clean);
            } else {
                const ref = await db.collection('parties').add(clean);
                clean.id = ref.id;
            }
            return clean;
        },

        // Suppliers
        async getSuppliers() {
            const snap = await db.collection('parties').where('type', '==', 'supplier').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveSupplier(supplier) {
            supplier.type = 'supplier';
            const clean = sanitizeObject(supplier);
            if (clean.id) {
                await db.collection('parties').doc(clean.id).set(clean);
            } else {
                const ref = await db.collection('parties').add(clean);
                clean.id = ref.id;
            }
            return clean;
        },

        // Reps
        async getReps() {
            const snap = await db.collection('reps').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveRep(rep) {
            const clean = sanitizeObject(rep);
            if (clean.id) {
                await db.collection('reps').doc(clean.id).set(clean);
            } else {
                const ref = await db.collection('reps').add(clean);
                clean.id = ref.id;
            }
            return clean;
        },

        // Invoices (Sales)
        async getInvoices() {
            const snap = await db.collection('invoices').orderBy('date', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async getTodayInvoices() {
            const today = new Date().toISOString().split('T')[0];
            const snap = await db.collection('invoices').where('date', '==', today).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveInvoice(invoice) {
            const clean = sanitizeObject(invoice);
            if (clean.id) {
                await db.collection('invoices').doc(clean.id).set(clean);
            } else {
                const ref = await db.collection('invoices').add(clean);
                clean.id = ref.id;
            }
            return clean;
        },

        // Purchases
        async getPurchases() {
            const snap = await db.collection('purchases').orderBy('date', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async getTodayPurchases() {
            const today = new Date().toISOString().split('T')[0];
            const snap = await db.collection('purchases').where('date', '==', today).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async savePurchase(purchase) {
            const clean = sanitizeObject(purchase);
            if (clean.id) {
                await db.collection('purchases').doc(clean.id).set(clean);
            } else {
                const ref = await db.collection('purchases').add(clean);
                clean.id = ref.id;
            }
            return clean;
        },

        // Transactions
        async getTransactions() {
            const snap = await db.collection('transactions').orderBy('timestamp', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async getRecentTransactions(limit = 10) {
            const snap = await db.collection('transactions').orderBy('timestamp', 'desc').limit(limit).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveTransaction(transaction) {
            const clean = sanitizeObject(transaction);
            if (clean.id) {
                await db.collection('transactions').doc(clean.id).set(clean);
            } else {
                const ref = await db.collection('transactions').add(clean);
                clean.id = ref.id;
            }
            return clean;
        },
        async getCurrentCashBalance() {
            const snap = await db.collection('transactions').get();
            let balance = 0;
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.type === 'income') balance += data.amount || 0;
                else if (data.type === 'expense') balance -= data.amount || 0;
            });
            return balance;
        },

        // Settings
        async getSettings() {
            const doc = await db.collection('settings').doc('main').get();
            return doc.exists ? doc.data() : {};
        },
        async saveSettings(settings) {
            const clean = sanitizeObject(settings);
            await db.collection('settings').doc('main').set(clean, { merge: true });
            return clean;
        },

        // Users
        async getUsers() {
            const snap = await db.collection('users').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveUser(user) {
            const clean = sanitizeObject(user);
            if (clean.id) {
                await db.collection('users').doc(clean.id).set(clean);
            } else {
                const ref = await db.collection('users').add(clean);
                clean.id = ref.id;
            }
            return clean;
        }
    };
    console.log('✅ Storage module loaded');
})();
