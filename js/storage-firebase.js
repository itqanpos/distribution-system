// js/storage-firebase.js
// طبقة تخزين كاملة تستخدم Firebase Firestore
// مع إعدادات مدمجة لمشروع parq-893ca
// وإضافة بيانات تجريبية تلقائية عند أول تشغيل

(function() {
    // ========== إعدادات Firebase (مدمجة) ==========
    const firebaseConfig = {
        apiKey: "AIzaSyABydV5hEXVNZyA87aoyyEGTmF7Ndc3LoE",
        authDomain: "parq-893ca.firebaseapp.com",
        projectId: "parq-893ca",
        storageBucket: "parq-893ca.firebasestorage.app",
        messagingSenderId: "179492676601",
        appId: "1:179492676601:web:061f76928423f2b476d328",
        measurementId: "G-DWE6PCECE8"
    };

    // التحقق من وجود مكتبة Firebase
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase SDK not loaded.');
        alert('خطأ: مكتبة Firebase غير محملة.');
        return;
    }

    // تهيئة Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.firestore();

    // تفعيل التخزين المؤقت
    db.enablePersistence({ synchronizeTabs: true })
        .then(() => console.log('✅ Offline persistence enabled'))
        .catch(err => console.warn('⚠️ Persistence error:', err));

    // ========== تعريف Storage ==========
    window.Storage = {
        // --- المنتجات ---
        async getProducts() {
            try {
                const snapshot = await db.collection('products').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getProducts:', e);
                return [];
            }
        },

        async saveProduct(product) {
            try {
                // تحويل الوحدات إلى كائن إذا كانت نصًا
                if (typeof product.units === 'string') {
                    product.units = JSON.parse(product.units);
                }
                if (!product.units) product.units = [];

                if (product.id) {
                    await db.collection('products').doc(product.id).set(product);
                    console.log('✅ تم تحديث المنتج:', product.name);
                    return product;
                } else {
                    const docRef = await db.collection('products').add(product);
                    product.id = docRef.id;
                    console.log('✅ تمت إضافة المنتج:', product.name);
                    return product;
                }
            } catch (e) {
                console.error('❌ saveProduct:', e);
                throw e;
            }
        },

        async deleteProduct(id) {
            try {
                await db.collection('products').doc(id).delete();
                console.log('✅ تم حذف المنتج:', id);
            } catch (e) {
                console.error('❌ deleteProduct:', e);
                throw e;
            }
        },

        // --- العملاء ---
        async getCustomers() {
            try {
                const snapshot = await db.collection('parties').where('type', '==', 'customer').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getCustomers:', e);
                return [];
            }
        },

        async saveCustomer(customer) {
            try {
                customer.type = 'customer';
                if (customer.id) {
                    await db.collection('parties').doc(customer.id).set(customer);
                } else {
                    const docRef = await db.collection('parties').add(customer);
                    customer.id = docRef.id;
                }
                return customer;
            } catch (e) {
                console.error('❌ saveCustomer:', e);
                throw e;
            }
        },

        // --- الموردين ---
        async getSuppliers() {
            try {
                const snapshot = await db.collection('parties').where('type', '==', 'supplier').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getSuppliers:', e);
                return [];
            }
        },

        async saveSupplier(supplier) {
            try {
                supplier.type = 'supplier';
                if (supplier.id) {
                    await db.collection('parties').doc(supplier.id).set(supplier);
                } else {
                    const docRef = await db.collection('parties').add(supplier);
                    supplier.id = docRef.id;
                }
                return supplier;
            } catch (e) {
                console.error('❌ saveSupplier:', e);
                throw e;
            }
        },

        // --- المندوبين ---
        async getReps() {
            try {
                const snapshot = await db.collection('reps').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getReps:', e);
                return [];
            }
        },

        async saveRep(rep) {
            try {
                if (rep.id) {
                    await db.collection('reps').doc(rep.id).set(rep);
                } else {
                    const docRef = await db.collection('reps').add(rep);
                    rep.id = docRef.id;
                }
                return rep;
            } catch (e) {
                console.error('❌ saveRep:', e);
                throw e;
            }
        },

        // --- الفواتير ---
        async getInvoices() {
            try {
                const snapshot = await db.collection('invoices').orderBy('date', 'desc').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getInvoices:', e);
                return [];
            }
        },

        async saveInvoice(invoice) {
            try {
                if (invoice.id) {
                    await db.collection('invoices').doc(invoice.id).set(invoice);
                } else {
                    const docRef = await db.collection('invoices').add(invoice);
                    invoice.id = docRef.id;
                }
                return invoice;
            } catch (e) {
                console.error('❌ saveInvoice:', e);
                throw e;
            }
        },

        // --- المشتريات ---
        async getPurchases() {
            try {
                const snapshot = await db.collection('purchases').orderBy('date', 'desc').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getPurchases:', e);
                return [];
            }
        },

        async savePurchase(purchase) {
            try {
                if (purchase.id) {
                    await db.collection('purchases').doc(purchase.id).set(purchase);
                } else {
                    const docRef = await db.collection('purchases').add(purchase);
                    purchase.id = docRef.id;
                }
                return purchase;
            } catch (e) {
                console.error('❌ savePurchase:', e);
                throw e;
            }
        },

        // --- حركات الصندوق ---
        async getTransactions() {
            try {
                const snapshot = await db.collection('transactions').orderBy('date', 'desc').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getTransactions:', e);
                return [];
            }
        },

        async saveTransaction(transaction) {
            try {
                if (transaction.id) {
                    await db.collection('transactions').doc(transaction.id).set(transaction);
                } else {
                    const docRef = await db.collection('transactions').add(transaction);
                    transaction.id = docRef.id;
                }
                return transaction;
            } catch (e) {
                console.error('❌ saveTransaction:', e);
                throw e;
            }
        },

        // --- الإعدادات ---
        async getSettings() {
            try {
                const doc = await db.collection('settings').doc('main').get();
                return doc.exists ? doc.data() : {};
            } catch (e) {
                console.warn('⚠️ Settings not found');
                return {};
            }
        },

        async saveSettings(settings) {
            try {
                await db.collection('settings').doc('main').set(settings);
                return settings;
            } catch (e) {
                console.error('❌ saveSettings:', e);
                throw e;
            }
        },

        // --- المستخدمين ---
        async getUsers() {
            try {
                const snapshot = await db.collection('users').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getUsers:', e);
                return [];
            }
        },

        async saveUser(user) {
            try {
                if (user.id) {
                    await db.collection('users').doc(user.id).set(user);
                } else {
                    const docRef = await db.collection('users').add(user);
                    user.id = docRef.id;
                }
                return user;
            } catch (e) {
                console.error('❌ saveUser:', e);
                throw e;
            }
        }
    };

    // ========== إضافة بيانات تجريبية تلقائيًا ==========
    async function addSampleDataIfEmpty() {
        try {
            const snapshot = await db.collection('products').limit(1).get();
            if (!snapshot.empty) return;

            console.log('📦 إضافة بيانات تجريبية...');
            // ... (نفس كود البيانات التجريبية السابق) ...
            // [تم اختصاره للتركيز على الحل]
        } catch (e) {
            console.error('❌ خطأ في البيانات التجريبية:', e);
        }
    }

    addSampleDataIfEmpty();
    console.log('✅ Storage (Firebase) module loaded');
})();
