// js/storage-firebase.js
// طبقة تخزين كاملة تستخدم Firebase Firestore
// مع إعدادات مدمجة لمشروع itqan-pos
// وإضافة بيانات تجريبية تلقائية عند أول تشغيل

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

    // ========== إضافة بيانات تجريبية تلقائيًا (إذا كانت قاعدة البيانات فارغة) ==========
    async function addSampleDataIfEmpty() {
        try {
            // تحقق من وجود أي منتج
            const productsSnapshot = await db.collection('products').limit(1).get();
            if (!productsSnapshot.empty) {
                console.log('📦 البيانات موجودة مسبقًا. تخطي إضافة البيانات التجريبية.');
                return;
            }

            console.log('📦 إضافة بيانات تجريبية شاملة...');

            // --- منتجات ---
            const sampleProducts = [
                { name: 'خبز', category: 'مخبوزات', description: 'خبز طازج يومي', units: [
                    { unit: 'قطعة', price: 5, min: 4, max: 6, barcode: '111', stock: 150, baseUnits: 1 },
                    { unit: 'ربطة (10 قطع)', price: 45, min: 40, max: 50, barcode: '112', stock: 20, baseUnits: 10 }
                ]},
                { name: 'زيت ذرة', category: 'زيوت', description: 'زيت نباتي نقي', units: [
                    { unit: 'لتر', price: 40, min: 38, max: 45, barcode: '221', stock: 85, baseUnits: 1 },
                    { unit: 'كرتونة (12 لتر)', price: 450, min: 430, max: 480, barcode: '222', stock: 15, baseUnits: 12 }
                ]},
                { name: 'أرز بسمتي', category: 'بقوليات', description: 'أرز بسمتي هندي', units: [
                    { unit: 'كيلو', price: 18, min: 16, max: 20, barcode: '331', stock: 200, baseUnits: 1 }
                ]},
                { name: 'سكر', category: 'بقوليات', description: 'سكر أبيض ناعم', units: [
                    { unit: 'كيلو', price: 12, min: 11, max: 14, barcode: '441', stock: 300, baseUnits: 1 }
                ]},
                { name: 'جبنة بيضاء', category: 'ألبان', description: 'جبنة بيضاء طازجة', units: [
                    { unit: 'كيلو', price: 90, min: 85, max: 100, barcode: '551', stock: 50, baseUnits: 1 }
                ]}
            ];
            for (const p of sampleProducts) {
                await db.collection('products').add(p);
            }
            console.log('✅ تمت إضافة 5 منتجات');

            // --- عملاء ---
            const sampleCustomers = [
                { type: 'customer', name: 'مطعم الشيف', phone: '0123456789', address: 'وسط البلد', balance: -12500, lastTransaction: '2024-01-15' },
                { type: 'customer', name: 'سوبرماركت النور', phone: '0123987654', address: 'شرق المدينة', balance: 3400, lastTransaction: '2024-01-16' },
                { type: 'customer', name: 'مخبز الفردوس', phone: '0111222333', address: 'غرب المدينة', balance: -8500, lastTransaction: '2024-01-14' }
            ];
            for (const c of sampleCustomers) {
                await db.collection('parties').add(c);
            }

            // --- موردين ---
            const sampleSuppliers = [
                { type: 'supplier', name: 'مورد المواد الغذائية', phone: '0111222333', address: 'المنطقة الصناعية', balance: 15000, lastTransaction: '2024-01-10' },
                { type: 'supplier', name: 'مخبز الأمل', phone: '0100999888', address: 'وسط البلد', balance: -2500, lastTransaction: '2024-01-12' }
            ];
            for (const s of sampleSuppliers) {
                await db.collection('parties').add(s);
            }
            console.log('✅ تمت إضافة 3 عملاء و2 موردين');

            // --- مندوبين ---
            const sampleReps = [
                { name: 'أحمد محمود', phone: '0100123456', region: 'وسط البلد', target: 15000, commission: 5, sales: 12500, collections: 8500 },
                { name: 'خالد عمرو', phone: '0100654321', region: 'شرق المدينة', target: 12000, commission: 5, sales: 10800, collections: 9200 }
            ];
            let rep1Id, rep2Id;
            for (const r of sampleReps) {
                const docRef = await db.collection('reps').add(r);
                if (r.name === 'أحمد محمود') rep1Id = docRef.id;
                if (r.name === 'خالد عمرو') rep2Id = docRef.id;
            }
            console.log('✅ تمت إضافة 2 مندوبين');

            // --- مستخدمين (للمصادقة المحلية) ---
            const sampleUsers = [
                { username: 'admin', password: '123456', fullName: 'مدير النظام', role: 'admin', status: 'active' },
                { username: 'مندوب1', password: '123456', fullName: 'أحمد محمود', role: 'rep', repId: rep1Id, status: 'active' },
                { username: 'مندوب2', password: '123456', fullName: 'خالد عمرو', role: 'rep', repId: rep2Id, status: 'active' }
            ];
            for (const u of sampleUsers) {
                await db.collection('users').add(u);
            }
            console.log('✅ تمت إضافة 3 مستخدمين');

            // --- فواتير بيع ---
            const sampleInvoices = [
                { id: 'INV-001', type: 'sale', customer: 'مطعم الشيف', date: '2024-01-15', total: 1250, paid: 1250, remaining: 0, status: 'paid', paymentMethod: 'cash', items: [] },
                { id: 'INV-002', type: 'sale', customer: 'سوبرماركت النور', date: '2024-01-16', total: 3400, paid: 2000, remaining: 1400, status: 'partial', paymentMethod: 'cash', items: [] },
                { id: 'INV-003', type: 'sale', customer: 'مخبز الفردوس', date: '2024-01-14', total: 850, paid: 0, remaining: 850, status: 'unpaid', paymentMethod: 'credit', items: [] }
            ];
            for (const inv of sampleInvoices) {
                await db.collection('invoices').doc(inv.id).set(inv);
            }
            console.log('✅ تمت إضافة 3 فواتير بيع');

            // --- فواتير شراء ---
            const samplePurchases = [
                { id: 'PUR-001', supplier: 'مورد المواد الغذائية', date: '2024-01-10', total: 12500, paid: 12500, remaining: 0, status: 'paid', paymentMethod: 'bank', items: [] },
                { id: 'PUR-002', supplier: 'مخبز الأمل', date: '2024-01-12', total: 3400, paid: 0, remaining: 3400, status: 'unpaid', paymentMethod: 'credit', items: [] }
            ];
            for (const pur of samplePurchases) {
                await db.collection('purchases').doc(pur.id).set(pur);
            }
            console.log('✅ تمت إضافة 2 فواتير شراء');

            // --- حركات صندوق ---
            const sampleTransactions = [
                { type: 'income', amount: 2500, description: 'بيع نقدي - فاتورة INV-001', paymentMethod: 'cash', date: '2024-01-15' },
                { type: 'expense', amount: 450, description: 'مصروفات نقل', paymentMethod: 'cash', date: '2024-01-16' },
                { type: 'income', amount: 2000, description: 'دفعة من فاتورة INV-002', paymentMethod: 'cash', date: '2024-01-17' },
                { type: 'expense', amount: 12500, description: 'شراء بضاعة - فاتورة PUR-001', paymentMethod: 'bank', date: '2024-01-10' }
            ];
            for (const t of sampleTransactions) {
                await db.collection('transactions').add(t);
            }
            console.log('✅ تمت إضافة 4 حركات صندوق');

            // --- إعدادات ---
            const settings = {
                company: { name: 'شركة التوزيع الغذائي', phone: '01234567890', email: 'info@fooddist.com', address: 'القاهرة، مصر' },
                printing: { printerType: 'thermal', copies: 1, showLogo: true, footer: 'شكراً لتعاملكم معنا' },
                system: { lang: 'ar', currency: 'ج.م', lowStockAlert: 10, taxEnabled: true, taxRate: 14 }
            };
            await db.collection('settings').doc('main').set(settings);
            console.log('✅ تمت إضافة الإعدادات');

            console.log('🎉 تمت إضافة جميع البيانات التجريبية بنجاح!');
            console.log('👤 سجّل الدخول: admin / 123456 أو مندوب1 / 123456');
        } catch (e) {
            console.error('❌ خطأ أثناء إضافة البيانات التجريبية:', e);
        }
    }

    // استدعاء دالة إضافة البيانات عند التحميل
    addSampleDataIfEmpty();

    console.log('✅ Storage (Firebase) module loaded');
})();
