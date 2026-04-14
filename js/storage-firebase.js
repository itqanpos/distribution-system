// js/storage-firebase.js - طبقة تخزين Firestore (بدون اعتماد على مستخدم)
const STORE_ID = 'main'; // معرف ثابت للبيانات المشتركة

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
    async saveProducts(products) {
        const batch = db.batch();
        products.forEach(p => {
            const ref = p.id ? db.collection('products').doc(p.id) : db.collection('products').doc();
            batch.set(ref, p);
        });
        await batch.commit();
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
    async saveCustomers(customers) {
        const batch = db.batch();
        customers.forEach(c => {
            c.type = 'customer';
            const ref = c.id ? db.collection('parties').doc(c.id) : db.collection('parties').doc();
            batch.set(ref, c);
        });
        await batch.commit();
    },
    async deleteCustomer(id) {
        await db.collection('parties').doc(id).delete();
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
    async saveSuppliers(suppliers) {
        const batch = db.batch();
        suppliers.forEach(s => {
            s.type = 'supplier';
            const ref = s.id ? db.collection('parties').doc(s.id) : db.collection('parties').doc();
            batch.set(ref, s);
        });
        await batch.commit();
    },
    async deleteSupplier(id) {
        await db.collection('parties').doc(id).delete();
    },

    // --- جميع الأطراف ---
    async getAllParties() {
        const snapshot = await db.collection('parties').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    async saveReps(reps) {
        const batch = db.batch();
        reps.forEach(r => {
            const ref = r.id ? db.collection('reps').doc(r.id) : db.collection('reps').doc();
            batch.set(ref, r);
        });
        await batch.commit();
    },
    async deleteRep(id) {
        await db.collection('reps').doc(id).delete();
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
    async saveInvoices(invoices) {
        const batch = db.batch();
        invoices.forEach(i => {
            const ref = i.id ? db.collection('invoices').doc(i.id) : db.collection('invoices').doc();
            batch.set(ref, i);
        });
        await batch.commit();
    },
    async deleteInvoice(id) {
        await db.collection('invoices').doc(id).delete();
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
    async savePurchases(purchases) {
        const batch = db.batch();
        purchases.forEach(p => {
            const ref = p.id ? db.collection('purchases').doc(p.id) : db.collection('purchases').doc();
            batch.set(ref, p);
        });
        await batch.commit();
    },
    async deletePurchase(id) {
        await db.collection('purchases').doc(id).delete();
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
    async saveTransactions(transactions) {
        const batch = db.batch();
        transactions.forEach(t => {
            const ref = t.id ? db.collection('transactions').doc(t.id) : db.collection('transactions').doc();
            batch.set(ref, t);
        });
        await batch.commit();
    },
    async deleteTransaction(id) {
        await db.collection('transactions').doc(id).delete();
    },

    // --- الإعدادات ---
    async getSettings() {
        const doc = await db.collection('settings').doc('main').get();
        return doc.exists ? doc.data() : {};
    },
    async saveSettings(settings) {
        await db.collection('settings').doc('main').set(settings);
    },

    // --- التهيئة الأولية (اختياري) ---
    async init() {
        // لا حاجة لشيء هنا
    }
};

window.Storage = Storage;
