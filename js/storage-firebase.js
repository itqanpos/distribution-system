// js/storage-firebase.js
// طبقة تخزين كاملة تستخدم Firebase Firestore
// مع إعدادات مدمجة لمشروع itqan-pos

(function() {
    // ========== إعدادات Firebase (مدمجة) ==========
    const firebaseConfig = {
        apiKey: "AIzaSyDX2wxXGLkuXCXI3ow2UxaZ88etbNjm4vY",
        authDomain: "itqan-pos.firebaseapp.com",
        projectId: "itqan-pos",
        storageBucket: "itqan-pos.firebasestorage.app",
        messagingSenderId: "697089164410",
        appId: "1:697089164410:web:c40cc455f018ee26b4e7c3",
        measurementId: "G-JZX3TS8HXE"
    };

    // التحقق من وجود مكتبة Firebase
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase SDK not loaded. Make sure to include Firebase scripts before this file.');
        alert('خطأ: مكتبة Firebase غير محملة. تأكد من اتصال الإنترنت.');
        return;
    }

    // تهيئة Firebase (إذا لم تكن مهيأة مسبقًا)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.firestore();

    // تفعيل التخزين المؤقت للعمل دون اتصال
    db.enablePersistence({ synchronizeTabs: true })
        .then(() => console.log('✅ Offline persistence enabled'))
        .catch(err => console.warn('⚠️ Persistence error:', err));

    // ========== تعريف Storage ==========
    window.Storage = {
        // --- المنتجات ---
        async getProducts() {
            try {
                const snapshot = await db.collection('products').get();
                const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`✅ تم جلب ${products.length} منتج من Firestore`);
                return products;
            } catch (e) {
                console.error('❌ getProducts:', e);
                alert('فشل جلب المنتجات: ' + e.message);
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
                alert('فشل حفظ المنتج: ' + e.message);
                throw e;
            }
        },

        async deleteProduct(id) {
            try {
                await db.collection('products').doc(id).delete();
                console.log('✅ تم حذف المنتج:', id);
            } catch (e) {
                console.error('❌ deleteProduct:', e);
                alert('فشل حذف المنتج: ' + e.message);
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

        // --- جميع الأطراف ---
        async getAllParties() {
            try {
                const snapshot = await db.collection('parties').get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('❌ getAllParties:', e);
                return [];
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
                console.warn('⚠️ Settings not found, using defaults');
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

        // --- المستخدمين (للمصادقة المحلية) ---
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

    // ========== إضافة بيانات تجريبية تلقائيًا (إذا كانت المجموعة فارغة) ==========
    (async function addSampleDataIfEmpty() {
        try {
            const snapshot = await db.collection('products').limit(1).get();
            if (snapshot.empty) {
                console.log('📦 إضافة منتجات تجريبية...');
                await db.collection('products').add({
                    name: 'خبز',
                    category: 'مخبوزات',
                    description: 'خبز طازج',
                    units: [
                        { unit: 'قطعة', price: 5, min: 4, max: 6, barcode: '111', stock: 150, baseUnits: 1 },
                        { unit: 'ربطة (10 قطع)', price: 45, min: 40, max: 50, barcode: '112', stock: 20, baseUnits: 10 }
                    ]
                });
                await db.collection('products').add({
                    name: 'زيت ذرة',
                    category: 'زيوت',
                    description: 'زيت نباتي',
                    units: [
                        { unit: 'لتر', price: 40, min: 38, max: 45, barcode: '221', stock: 85, baseUnits: 1 },
                        { unit: 'كرتونة (12 لتر)', price: 450, min: 430, max: 480, barcode: '222', stock: 15, baseUnits: 12 }
                    ]
                });
                await db.collection('products').add({
                    name: 'أرز',
                    category: 'بقوليات',
                    description: 'أرز بسمتي',
                    units: [
                        { unit: 'كيلو', price: 18, min: 16, max: 20, barcode: '331', stock: 200, baseUnits: 1 }
                    ]
                });
                console.log('✅ تمت إضافة منتجات تجريبية.');
            }
        } catch(e) {
            console.warn('⚠️ تعذر إضافة البيانات التجريبية:', e);
        }
    })();

    console.log('✅ Storage (Firebase) module loaded');
})();
