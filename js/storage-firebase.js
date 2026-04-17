// js/storage-firebase.js
(function() {
    if (!window.db) {
        console.error('❌ Firestore not initialized. Make sure firebase-init.js is loaded.');
        return;
    }
    const db = window.db;

    // دالة تنظيف الكائن: تزيل أي حقل قيمته undefined أو null أو empty string (اختياري)
    function sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const clean = {};
        Object.entries(obj).forEach(([key, value]) => {
            // لا نضيف الحقل إذا كان undefined
            if (value !== undefined) {
                // إذا كان القيمة null نضيفها (Firestore يقبل null)
                // إذا كان القيمة كائن ننظفه بشكل متكرر
                if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                    clean[key] = sanitizeObject(value);
                } else {
                    clean[key] = value;
                }
            }
        });
        return clean;
    }

    // دالة مساعدة للتحقق من صحة بيانات المنتج
    function validateProduct(product) {
        if (!product.name) throw new Error('Product name is required');
        if (!product.units || !Array.isArray(product.units) || product.units.length === 0) {
            product.units = [{ name: 'Piece', price: 0, stock: 0, factor: 1 }];
        }
        return product;
    }

    window.Storage = {
        // --- المنتجات ---
        async getProducts() {
            const snap = await db.collection('products').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveProduct(product) {
            // تحويل units إذا كانت نصاً
            if (typeof product.units === 'string') {
                try { product.units = JSON.parse(product.units); } catch { product.units = []; }
            }
            validateProduct(product);
            const clean = sanitizeObject(product);
            console.log('💾 Saving product:', clean);
            
            if (clean.id) {
                await db.collection('products').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('products').add(clean);
                clean.id = ref.id;
                return clean;
            }
        },
        async deleteProduct(id) {
            await db.collection('products').doc(id).delete();
        },

        // --- العملاء ---
        async getCustomers() {
            const snap = await db.collection('parties').where('type', '==', 'customer').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveCustomer(customer) {
            customer.type = 'customer';
            if (customer.balance === undefined) customer.balance = 0;
            const clean = sanitizeObject(customer);
            console.log('💾 Saving customer:', clean);
            
            if (clean.id) {
                await db.collection('parties').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('parties').add(clean);
                clean.id = ref.id;
                return clean;
            }
        },

        // --- الموردين ---
        async getSuppliers() {
            const snap = await db.collection('parties').where('type', '==', 'supplier').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveSupplier(supplier) {
            supplier.type = 'supplier';
            if (supplier.balance === undefined) supplier.balance = 0;
            const clean = sanitizeObject(supplier);
            console.log('💾 Saving supplier:', clean);
            
            if (clean.id) {
                await db.collection('parties').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('parties').add(clean);
                clean.id = ref.id;
                return clean;
            }
        },

        // --- المندوبين ---
        async getReps() {
            const snap = await db.collection('reps').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveRep(rep) {
            if (rep.collections === undefined) rep.collections = 0;
            if (rep.commission === undefined) rep.commission = 0;
            const clean = sanitizeObject(rep);
            console.log('💾 Saving rep:', clean);
            
            if (clean.id) {
                await db.collection('reps').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('reps').add(clean);
                clean.id = ref.id;
                return clean;
            }
        },

        // --- الفواتير (مبيعات) ---
        async getInvoices() {
            const snap = await db.collection('invoices').orderBy('date', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveInvoice(invoice) {
            invoice.type = 'sale';
            if (invoice.paid === undefined) invoice.paid = invoice.total || 0;
            if (invoice.remaining === undefined) invoice.remaining = (invoice.total || 0) - (invoice.paid || 0);
            if (!invoice.items) invoice.items = [];
            
            const clean = sanitizeObject(invoice);
            console.log('💾 Saving invoice:', clean);
            
            if (clean.id) {
                await db.collection('invoices').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('invoices').add(clean);
                clean.id = ref.id;
                return clean;
            }
        },

        // --- المشتريات ---
        async getPurchases() {
            const snap = await db.collection('purchases').orderBy('date', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async savePurchase(purchase) {
            if (purchase.paid === undefined) purchase.paid = 0;
            if (purchase.remaining === undefined) purchase.remaining = purchase.total - purchase.paid;
            if (!purchase.items) purchase.items = [];
            
            const clean = sanitizeObject(purchase);
            console.log('💾 Saving purchase:', clean);
            
            if (clean.id) {
                await db.collection('purchases').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('purchases').add(clean);
                clean.id = ref.id;
                return clean;
            }
        },

        // --- حركات الصندوق ---
        async getTransactions() {
            const snap = await db.collection('transactions').orderBy('timestamp', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveTransaction(transaction) {
            if (!transaction.timestamp) transaction.timestamp = new Date().toISOString();
            if (!transaction.paymentMethod) transaction.paymentMethod = 'cash';
            
            const clean = sanitizeObject(transaction);
            console.log('💾 Saving transaction:', clean);
            
            if (clean.id) {
                await db.collection('transactions').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('transactions').add(clean);
                clean.id = ref.id;
                return clean;
            }
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

        // --- الإعدادات ---
        async getSettings() {
            const doc = await db.collection('settings').doc('main').get();
            return doc.exists ? doc.data() : {};
        },
        async saveSettings(settings) {
            const clean = sanitizeObject(settings);
            await db.collection('settings').doc('main').set(clean, { merge: true });
            return clean;
        },

        // --- المستخدمين ---
        async getUsers() {
            const snap = await db.collection('users').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async saveUser(user) {
            const clean = sanitizeObject(user);
            if (clean.id) {
                await db.collection('users').doc(clean.id).set(clean, { merge: true });
                return clean;
            } else {
                const ref = await db.collection('users').add(clean);
                clean.id = ref.id;
                return clean;
            }
        }
    };

    console.log('✅ Storage module loaded with automatic sanitization');
})();
