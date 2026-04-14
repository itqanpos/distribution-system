// js/storage-supabase.js
const Storage = {
    // --- المنتجات ---
    async getProducts() {
        const { data, error } = await supabase.from('products').select('*');
        if (error) throw error;
        return data;
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
        const { data } = await supabase.from('parties').select('*').eq('type', 'customer');
        return data || [];
    },
    async saveCustomer(customer) {
        customer.type = 'customer';
        if (customer.id) {
            const { data } = await supabase.from('parties').update(customer).eq('id', customer.id).select();
            return data?.[0] || customer;
        } else {
            const { data } = await supabase.from('parties').insert(customer).select();
            return data?.[0] || customer;
        }
    },
    async deleteCustomer(id) {
        await supabase.from('parties').delete().eq('id', id);
    },

    // --- الموردين ---
    async getSuppliers() {
        const { data } = await supabase.from('parties').select('*').eq('type', 'supplier');
        return data || [];
    },
    async saveSupplier(supplier) {
        supplier.type = 'supplier';
        if (supplier.id) {
            const { data } = await supabase.from('parties').update(supplier).eq('id', supplier.id).select();
            return data?.[0] || supplier;
        } else {
            const { data } = await supabase.from('parties').insert(supplier).select();
            return data?.[0] || supplier;
        }
    },
    async deleteSupplier(id) {
        await supabase.from('parties').delete().eq('id', id);
    },

    // --- المندوبين ---
    async getReps() {
        const { data } = await supabase.from('reps').select('*');
        return data || [];
    },
    async saveRep(rep) {
        if (rep.id) {
            const { data } = await supabase.from('reps').update(rep).eq('id', rep.id).select();
            return data?.[0] || rep;
        } else {
            const { data } = await supabase.from('reps').insert(rep).select();
            return data?.[0] || rep;
        }
    },
    async deleteRep(id) {
        await supabase.from('reps').delete().eq('id', id);
    },

    // --- الفواتير ---
    async getInvoices() {
        const { data } = await supabase.from('invoices').select('*').order('date', { ascending: false });
        return data || [];
    },
    async saveInvoice(invoice) {
        if (invoice.id) {
            const { data } = await supabase.from('invoices').update(invoice).eq('id', invoice.id).select();
            return data?.[0] || invoice;
        } else {
            const { data } = await supabase.from('invoices').insert(invoice).select();
            return data?.[0] || invoice;
        }
    },
    async deleteInvoice(id) {
        await supabase.from('invoices').delete().eq('id', id);
    },

    // --- المشتريات ---
    async getPurchases() {
        const { data } = await supabase.from('purchases').select('*').order('date', { ascending: false });
        return data || [];
    },
    async savePurchase(purchase) {
        if (purchase.id) {
            const { data } = await supabase.from('purchases').update(purchase).eq('id', purchase.id).select();
            return data?.[0] || purchase;
        } else {
            const { data } = await supabase.from('purchases').insert(purchase).select();
            return data?.[0] || purchase;
        }
    },
    async deletePurchase(id) {
        await supabase.from('purchases').delete().eq('id', id);
    },

    // --- حركات الصندوق ---
    async getTransactions() {
        const { data } = await supabase.from('transactions').select('*').order('date', { ascending: false });
        return data || [];
    },
    async saveTransaction(transaction) {
        if (transaction.id) {
            const { data } = await supabase.from('transactions').update(transaction).eq('id', transaction.id).select();
            return data?.[0] || transaction;
        } else {
            const { data } = await supabase.from('transactions').insert(transaction).select();
            return data?.[0] || transaction;
        }
    },
    async deleteTransaction(id) {
        await supabase.from('transactions').delete().eq('id', id);
    },

    // --- الإعدادات ---
    async getSettings() {
        const { data } = await supabase.from('settings').select('*').eq('id', 'main').single();
        return data || {};
    },
    async saveSettings(settings) {
        settings.id = 'main';
        const { data } = await supabase.from('settings').upsert(settings).select();
        return data?.[0] || settings;
    },

    // --- المستخدمين ---
    async getUsers() {
        const { data } = await supabase.from('users').select('*');
        return data || [];
    },
    async saveUser(user) {
        if (user.id) {
            const { data } = await supabase.from('users').update(user).eq('id', user.id).select();
            return data?.[0] || user;
        } else {
            const { data } = await supabase.from('users').insert(user).select();
            return data?.[0] || user;
        }
    },
    async deleteUser(id) {
        await supabase.from('users').delete().eq('id', id);
    }
};

window.Storage = Storage;
