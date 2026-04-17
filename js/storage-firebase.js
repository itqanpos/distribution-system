// js/storage-firebase.js
(function() {
    // التأكد من وجود Firebase و db (يجب تحميل firebase-init.js أولاً)
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase SDK not loaded.');
        alert('خطأ: مكتبة Firebase غير محملة.');
        return;
    }

    // إذا لم يتم التهيئة بعد (احتياط)
    if (!window.db) {
        console.warn('⚠️ firebase-init.js لم يتم تحميله، جار التهيئة الاحتياطية...');
        const firebaseConfig = {
            apiKey: "AIzaSyABydV5hEXVNZyA87aoyyEGTmF7Ndc3LoE",
            authDomain: "parq-893ca.firebaseapp.com",
            projectId: "parq-893ca",
            storageBucket: "parq-893ca.firebasestorage.app",
            messagingSenderId: "179492676601",
            appId: "1:179492676601:web:061f76928423f2b476d328",
            measurementId: "G-DWE6PCECE8"
        };
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();
    }

    const db = window.db;

    // دالة تنظيف الكائن من undefined
    function sanitizeObject(obj) {
        return Object.fromEntries(
            Object.entries(obj).filter(([_, v]) => v !== undefined)
        );
    }

    // باقي الدوال كما هي مع استخدام sanitizeObject ...
    window.Storage = {
        async getProducts() {
            const snapshot = await db.collection('products').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async saveProduct(product) {
            if (typeof product.units === 'string') {
                try { product.units = JSON.parse(product.units); } catch(e) { product.units = []; }
            }
            if (!product.units) product.units = [];
            const cleanProduct = sanitizeObject(product);
            if (cleanProduct.id) {
                await db.collection('products').doc(cleanProduct.id).set(cleanProduct);
                return cleanProduct;
            } else {
                const docRef = await db.collection('products').add(cleanProduct);
                cleanProduct.id = docRef.id;
                return cleanProduct;
            }
        },
        async deleteProduct(id) { await db.collection('products').doc(id).delete(); },

        async getCustomers() {
            const snapshot = await db.collection('parties').where('type', '==', 'customer').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async getCustomersCount() {
            const snapshot = await db.collection('parties').where('type', '==', 'customer').get();
            return snapshot.size;
        },
        async saveCustomer(customer) {
            customer.type = 'customer';
            const cleanCustomer = sanitizeObject(customer);
            if (cleanCustomer.id) {
                await db.collection('parties').doc(cleanCustomer.id).set(cleanCustomer);
            } else {
                const docRef = await db.collection('parties').add(cleanCustomer);
                cleanCustomer.id = docRef.id;
            }
            return cleanCustomer;
        },

        async getSuppliers() {
            const snapshot = await db.collection('parties').where('type', '==', 'supplier').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async saveSupplier(supplier) {
            supplier.type = 'supplier';
            const cleanSupplier = sanitizeObject(supplier);
            if (cleanSupplier.id) {
                await db.collection('parties').doc(cleanSupplier.id).set(cleanSupplier);
            } else {
                const docRef = await db.collection('parties').add(cleanSupplier);
                cleanSupplier.id = docRef.id;
            }
            return cleanSupplier;
        },

        async getReps() {
            const snapshot = await db.collection('reps').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async saveRep(rep) {
            const cleanRep = sanitizeObject(rep);
            if (cleanRep.id) {
                await db.collection('reps').doc(cleanRep.id).set(cleanRep);
            } else {
                const docRef = await db.collection('reps').add(cleanRep);
                cleanRep.id = docRef.id;
            }
            return cleanRep;
        },

        async getInvoices() {
            const snapshot = await db.collection('invoices').orderBy('date', 'desc').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async getTodayInvoices() {
            const today = new Date().toISOString().split('T')[0];
            const snapshot = await db.collection('invoices').where('date', '==', today).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async saveInvoice(invoice) {
            const cleanInvoice = sanitizeObject(invoice);
            if (cleanInvoice.id) {
                await db.collection('invoices').doc(cleanInvoice.id).set(cleanInvoice);
            } else {
                const docRef = await db.collection('invoices').add(cleanInvoice);
                cleanInvoice.id = docRef.id;
            }
            return cleanInvoice;
        },

        async getPurchases() {
            const snapshot = await db.collection('purchases').orderBy('date', 'desc').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async getTodayPurchases() {
            const today = new Date().toISOString().split('T')[0];
            const snapshot = await db.collection('purchases').where('date', '==', today).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async savePurchase(purchase) {
            const cleanPurchase = sanitizeObject(purchase);
            if (cleanPurchase.id) {
                await db.collection('purchases').doc(cleanPurchase.id).set(cleanPurchase);
            } else {
                const docRef = await db.collection('purchases').add(cleanPurchase);
                cleanPurchase.id = docRef.id;
            }
            return cleanPurchase;
        },

        async getTransactions() {
            const snapshot = await db.collection('transactions').orderBy('date', 'desc').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async getRecentTransactions(limit = 10) {
            const snapshot = await db.collection('transactions')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async saveTransaction(transaction) {
            const cleanTransaction = sanitizeObject(transaction);
            if (cleanTransaction.id) {
                await db.collection('transactions').doc(cleanTransaction.id).set(cleanTransaction);
            } else {
                const docRef = await db.collection('transactions').add(cleanTransaction);
                cleanTransaction.id = docRef.id;
            }
            return cleanTransaction;
        },
        async getCurrentCashBalance() {
            const snapshot = await db.collection('transactions').get();
            let balance = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.type === 'income') balance += data.amount || 0;
                else if (data.type === 'expense') balance -= data.amount || 0;
            });
            return balance;
        },

        async getSettings() {
            const doc = await db.collection('settings').doc('main').get();
            return doc.exists ? doc.data() : {};
        },
        async saveSettings(settings) {
            const cleanSettings = sanitizeObject(settings);
            await db.collection('settings').doc('main').set(cleanSettings);
            return cleanSettings;
        },

        async getUsers() {
            const snapshot = await db.collection('users').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async saveUser(user) {
            const cleanUser = sanitizeObject(user);
            if (cleanUser.id) {
                await db.collection('users').doc(cleanUser.id).set(cleanUser);
            } else {
                const docRef = await db.collection('users').add(cleanUser);
                cleanUser.id = docRef.id;
            }
            return cleanUser;
        }
    };

    console.log('✅ Storage (Firebase) module loaded');
})();
