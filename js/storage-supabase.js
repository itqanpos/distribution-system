// js/storage-supabase.js
const Storage = {
    // --- المنتجات ---
    async getProducts() {
        const { data, error } = await supabase.from('products').select('*');
        if (error) { console.error('getProducts error:', error); return []; }
        return data || [];
    },
    async saveProduct(product) {
        if (product.id) {
            const { data, error } = await supabase.from('products').update(product).eq('id', product.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('products').insert(product).select();
            if (error) throw error;
            return data[0];
        }
    },
    async deleteProduct(id) {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
    },

    // --- العملاء ---
    async getCustomers() {
        const { data, error } = await supabase.from('parties').select('*').eq('type', 'customer');
        if (error) { console.error('getCustomers error:', error); return []; }
        return data || [];
    },
    async saveCustomer(customer) {
        customer.type = 'customer';
        if (customer.id) {
            const { data, error } = await supabase.from('parties').update(customer).eq('id', customer.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('parties').insert(customer).select();
            if (error) throw error;
            return data[0];
        }
    },

    // --- الموردين ---
    async getSuppliers() {
        const { data, error } = await supabase.from('parties').select('*').eq('type', 'supplier');
        if (error) { console.error('getSuppliers error:', error); return []; }
        return data || [];
    },
    async saveSupplier(supplier) {
        supplier.type = 'supplier';
        if (supplier.id) {
            const { data, error } = await supabase.from('parties').update(supplier).eq('id', supplier.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('parties').insert(supplier).select();
            if (error) throw error;
            return data[0];
        }
    },

    // --- المندوبين ---
    async getReps() {
        const { data, error } = await supabase.from('reps').select('*');
        if (error) { console.error('getReps error:', error); return []; }
        return data || [];
    },
    async saveRep(rep) {
        if (rep.id) {
            const { data, error } = await supabase.from('reps').update(rep).eq('id', rep.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('reps').insert(rep).select();
            if (error) throw error;
            return data[0];
        }
    },

    // --- الفواتير (المبيعات) ---
    async getInvoices() {
        const { data, error } = await supabase.from('invoices').select('*').order('date', { ascending: false });
        if (error) { console.error('getInvoices error:', error); return []; }
        return data || [];
    },
    async saveInvoice(invoice) {
        if (invoice.id) {
            const { data, error } = await supabase.from('invoices').update(invoice).eq('id', invoice.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('invoices').insert(invoice).select();
            if (error) throw error;
            return data[0];
        }
    },

    // --- المشتريات ---
    async getPurchases() {
        const { data, error } = await supabase.from('purchases').select('*').order('date', { ascending: false });
        if (error) { console.error('getPurchases error:', error); return []; }
        return data || [];
    },
    async savePurchase(purchase) {
        if (purchase.id) {
            const { data, error } = await supabase.from('purchases').update(purchase).eq('id', purchase.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('purchases').insert(purchase).select();
            if (error) throw error;
            return data[0];
        }
    },

    // --- حركات الصندوق ---
    async getTransactions() {
        const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false });
        if (error) { console.error('getTransactions error:', error); return []; }
        return data || [];
    },
    async saveTransaction(transaction) {
        if (transaction.id) {
            const { data, error } = await supabase.from('transactions').update(transaction).eq('id', transaction.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('transactions').insert(transaction).select();
            if (error) throw error;
            return data[0];
        }
    },

    // --- الإعدادات ---
    async getSettings() {
        const { data, error } = await supabase.from('settings').select('*').eq('id', 'main').single();
        if (error) { console.warn('Settings not found, using defaults'); return {}; }
        return data || {};
    },
    async saveSettings(settings) {
        settings.id = 'main';
        const { data, error } = await supabase.from('settings').upsert(settings).select();
        if (error) throw error;
        return data[0];
    },

    // --- المستخدمين (إدارة) ---
    async getUsers() {
        const { data, error } = await supabase.from('users').select('*');
        if (error) { console.error('getUsers error:', error); return []; }
        return data || [];
    },
    async saveUser(user) {
        if (user.id) {
            const { data, error } = await supabase.from('users').update(user).eq('id', user.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('users').insert(user).select();
            if (error) throw error;
            return data[0];
        }
    }
};

window.Storage = Storage;
