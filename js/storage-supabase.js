// js/storage-supabase.js - طبقة Supabase
// تأكد من أن window.supabase موجود
function getSupabase() {
    if (typeof window.supabase === 'undefined') {
        alert('❌ خطأ فادح: كائن Supabase غير موجود! تأكد من تحميل supabase-config.js أولاً.');
        throw new Error('Supabase not initialized');
    }
    return window.supabase;
}

const Storage = {
    // المنتجات
    async getProducts() {
        const sb = getSupabase();
        console.log('🔄 جاري جلب المنتجات...');
        try {
            const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
            if (error) {
                alert('❌ فشل جلب المنتجات: ' + error.message);
                console.error(error);
                return [];
            }
            console.log('✅ تم جلب', data?.length, 'منتج');
            return data || [];
        } catch (e) {
            alert('❌ خطأ غير متوقع في getProducts: ' + e.message);
            console.error(e);
            return [];
        }
    },

    async saveProduct(product) {
        const sb = getSupabase();
        if (typeof product.units === 'string') product.units = JSON.parse(product.units);
        if (!product.units) product.units = [];

        const productData = {
            name: product.name,
            category: product.category,
            description: product.description || '',
            units: product.units
        };

        if (product.id) {
            const { data, error } = await sb.from('products').update(productData).eq('id', product.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await sb.from('products').insert(productData).select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteProduct(id) {
        const sb = getSupabase();
        const { error } = await sb.from('products').delete().eq('id', id);
        if (error) throw error;
    },

    // العملاء
    async getCustomers() {
        const sb = getSupabase();
        const { data, error } = await sb.from('parties').select('*').eq('type', 'customer');
        if (error) { console.error(error); return []; }
        return data || [];
    },

    async saveCustomer(customer) {
        const sb = getSupabase();
        customer.type = 'customer';
        customer.balance = parseFloat(customer.balance) || 0;
        if (customer.id) {
            const { data, error } = await sb.from('parties').update(customer).eq('id', customer.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await sb.from('parties').insert(customer).select();
            if (error) throw error;
            return data[0];
        }
    },

    // الموردين
    async getSuppliers() {
        const sb = getSupabase();
        const { data, error } = await sb.from('parties').select('*').eq('type', 'supplier');
        if (error) { console.error(error); return []; }
        return data || [];
    },

    async saveSupplier(supplier) {
        const sb = getSupabase();
        supplier.type = 'supplier';
        supplier.balance = parseFloat(supplier.balance) || 0;
        if (supplier.id) {
            const { data, error } = await sb.from('parties').update(supplier).eq('id', supplier.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await sb.from('parties').insert(supplier).select();
            if (error) throw error;
            return data[0];
        }
    },

    // المندوبين
    async getReps() {
        const sb = getSupabase();
        const { data, error } = await sb.from('reps').select('*');
        if (error) { console.error(error); return []; }
        return data || [];
    },

    async saveRep(rep) {
        const sb = getSupabase();
        rep.target = parseFloat(rep.target) || 15000;
        rep.commission = parseFloat(rep.commission) || 5;
        rep.sales = parseFloat(rep.sales) || 0;
        rep.collections = parseFloat(rep.collections) || 0;
        if (rep.id) {
            const { data, error } = await sb.from('reps').update(rep).eq('id', rep.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await sb.from('reps').insert(rep).select();
            if (error) throw error;
            return data[0];
        }
    },

    // الفواتير
    async getInvoices() {
        const sb = getSupabase();
        const { data, error } = await sb.from('invoices').select('*').order('date', { ascending: false });
        if (error) { console.error(error); return []; }
        return data || [];
    },

    async saveInvoice(invoice) {
        const sb = getSupabase();
        const invoiceData = {
            id: invoice.id,
            type: invoice.type || 'sale',
            customer: invoice.customer,
            customerId: invoice.customerId || null,
            date: invoice.date || new Date().toISOString().split('T')[0],
            total: parseFloat(invoice.total) || 0,
            paid: parseFloat(invoice.paid) || 0,
            remaining: parseFloat(invoice.remaining) || 0,
            discount: parseFloat(invoice.discount) || 0,
            status: invoice.status || 'unpaid',
            paymentMethod: invoice.paymentMethod,
            items: invoice.items || [],
            repId: invoice.repId || null,
            note: invoice.note
        };
        if (invoice.id) {
            const { data, error } = await sb.from('invoices').update(invoiceData).eq('id', invoice.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await sb.from('invoices').insert(invoiceData).select();
            if (error) throw error;
            return data[0];
        }
    },

    // المشتريات
    async getPurchases() {
        const sb = getSupabase();
        const { data, error } = await sb.from('purchases').select('*').order('date', { ascending: false });
        if (error) { console.error(error); return []; }
        return data || [];
    },

    async savePurchase(purchase) {
        const sb = getSupabase();
        const data = {
            id: purchase.id,
            supplier: purchase.supplier,
            supplierId: purchase.supplierId || null,
            date: purchase.date || new Date().toISOString().split('T')[0],
            total: parseFloat(purchase.total) || 0,
            paid: parseFloat(purchase.paid) || 0,
            remaining: parseFloat(purchase.remaining) || 0,
            status: purchase.status || 'unpaid',
            paymentMethod: purchase.paymentMethod,
            items: purchase.items || []
        };
        if (purchase.id) {
            const res = await sb.from('purchases').update(data).eq('id', purchase.id).select();
            if (res.error) throw res.error;
            return res.data[0];
        } else {
            const res = await sb.from('purchases').insert(data).select();
            if (res.error) throw res.error;
            return res.data[0];
        }
    },

    // حركات الصندوق
    async getTransactions() {
        const sb = getSupabase();
        const { data, error } = await sb.from('transactions').select('*').order('date', { ascending: false });
        if (error) { console.error(error); return []; }
        return data || [];
    },

    async saveTransaction(transaction) {
        const sb = getSupabase();
        const data = {
            type: transaction.type,
            amount: parseFloat(transaction.amount) || 0,
            description: transaction.description,
            paymentMethod: transaction.paymentMethod || 'cash',
            date: transaction.date || new Date().toISOString().split('T')[0],
            reference: transaction.reference,
            notes: transaction.notes
        };
        if (transaction.id) {
            const res = await sb.from('transactions').update(data).eq('id', transaction.id).select();
            if (res.error) throw res.error;
            return res.data[0];
        } else {
            const res = await sb.from('transactions').insert(data).select();
            if (res.error) throw res.error;
            return res.data[0];
        }
    },

    // الإعدادات
    async getSettings() {
        const sb = getSupabase();
        const { data, error } = await sb.from('settings').select('*').eq('id', 'main').single();
        if (error && error.code !== 'PGRST116') console.warn(error);
        return data || {};
    },

    async saveSettings(settings) {
        const sb = getSupabase();
        const data = { id: 'main', ...settings };
        const res = await sb.from('settings').upsert(data, { onConflict: 'id' }).select();
        if (res.error) throw res.error;
        return res.data[0];
    },

    // المستخدمين
    async getUsers() {
        const sb = getSupabase();
        const { data, error } = await sb.from('users').select('*');
        if (error) { console.error(error); return []; }
        return data || [];
    },

    async saveUser(user) {
        const sb = getSupabase();
        const data = {
            username: user.username,
            password: user.password,
            fullName: user.fullName,
            role: user.role,
            repId: user.repId || null,
            status: user.status || 'active'
        };
        if (user.id) {
            const res = await sb.from('users').update(data).eq('id', user.id).select();
            if (res.error) throw res.error;
            return res.data[0];
        } else {
            const res = await sb.from('users').insert(data).select();
            if (res.error) throw res.error;
            return res.data[0];
        }
    }
};

window.Storage = Storage;
