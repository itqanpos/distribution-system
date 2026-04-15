// js/storage-supabase.js
// طبقة التخزين - تستخدم supabase بعد التهيئة

// نتأكد من وجود supabase
function getSupabase() {
    if (!window.supabase) {
        throw new Error('Supabase غير مهيأ. تأكد من تحميل supabase-config.js أولاً.');
    }
    return window.supabase;
}

const Storage = {
    async getProducts() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('products').select('*');
        if (error) { console.error(error); return []; }
        return data || [];
    },
    async saveProduct(product) {
        const supabase = getSupabase();
        if (typeof product.units === 'string') product.units = JSON.parse(product.units);
        const productData = {
            name: product.name,
            category: product.category,
            description: product.description || '',
            units: product.units
        };
        if (product.id) {
            const { data, error } = await supabase.from('products').update(productData).eq('id', product.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('products').insert(productData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async deleteProduct(id) {
        const supabase = getSupabase();
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
    },
    async getCustomers() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('parties').select('*').eq('type', 'customer');
        if (error) return [];
        return data || [];
    },
    async saveCustomer(customer) {
        const supabase = getSupabase();
        customer.type = 'customer';
        const partyData = { ...customer };
        if (customer.id) {
            const { data, error } = await supabase.from('parties').update(partyData).eq('id', customer.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('parties').insert(partyData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async getSuppliers() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('parties').select('*').eq('type', 'supplier');
        if (error) return [];
        return data || [];
    },
    async saveSupplier(supplier) {
        const supabase = getSupabase();
        supplier.type = 'supplier';
        const partyData = { ...supplier };
        if (supplier.id) {
            const { data, error } = await supabase.from('parties').update(partyData).eq('id', supplier.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('parties').insert(partyData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async getAllParties() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('parties').select('*');
        if (error) return [];
        return data || [];
    },
    async getReps() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('reps').select('*');
        if (error) return [];
        return data || [];
    },
    async saveRep(rep) {
        const supabase = getSupabase();
        const repData = { ...rep };
        if (rep.id) {
            const { data, error } = await supabase.from('reps').update(repData).eq('id', rep.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('reps').insert(repData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async deleteRep(id) {
        const supabase = getSupabase();
        await supabase.from('reps').delete().eq('id', id);
    },
    async getInvoices() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('invoices').select('*').order('date', { ascending: false });
        if (error) return [];
        return data || [];
    },
    async saveInvoice(invoice) {
        const supabase = getSupabase();
        const invoiceData = {
            id: invoice.id,
            type: invoice.type || 'sale',
            customer: invoice.customer,
            customerId: invoice.customerId,
            supplier: invoice.supplier,
            date: invoice.date,
            total: invoice.total,
            paid: invoice.paid,
            remaining: invoice.remaining,
            discount: invoice.discount,
            status: invoice.status,
            paymentMethod: invoice.paymentMethod,
            items: invoice.items,
            repId: invoice.repId,
            note: invoice.note
        };
        if (invoice.id) {
            const { data, error } = await supabase.from('invoices').update(invoiceData).eq('id', invoice.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('invoices').insert(invoiceData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async deleteInvoice(id) {
        const supabase = getSupabase();
        await supabase.from('invoices').delete().eq('id', id);
    },
    async getPurchases() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('purchases').select('*').order('date', { ascending: false });
        if (error) return [];
        return data || [];
    },
    async savePurchase(purchase) {
        const supabase = getSupabase();
        const purchaseData = { ...purchase };
        if (purchase.id) {
            const { data, error } = await supabase.from('purchases').update(purchaseData).eq('id', purchase.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('purchases').insert(purchaseData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async deletePurchase(id) {
        const supabase = getSupabase();
        await supabase.from('purchases').delete().eq('id', id);
    },
    async getTransactions() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false });
        if (error) return [];
        return data || [];
    },
    async saveTransaction(transaction) {
        const supabase = getSupabase();
        const transData = { ...transaction };
        if (transaction.id) {
            const { data, error } = await supabase.from('transactions').update(transData).eq('id', transaction.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('transactions').insert(transData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async deleteTransaction(id) {
        const supabase = getSupabase();
        await supabase.from('transactions').delete().eq('id', id);
    },
    async getSettings() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('settings').select('*').eq('id', 'main').single();
        if (error && error.code !== 'PGRST116') console.warn(error);
        return data || {};
    },
    async saveSettings(settings) {
        const supabase = getSupabase();
        const settingsData = { id: 'main', ...settings };
        const { data, error } = await supabase.from('settings').upsert(settingsData).select();
        if (error) throw error;
        return data[0];
    },
    async getUsers() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('users').select('*');
        if (error) return [];
        return data || [];
    },
    async saveUser(user) {
        const supabase = getSupabase();
        const userData = { ...user };
        if (user.id) {
            const { data, error } = await supabase.from('users').update(userData).eq('id', user.id).select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase.from('users').insert(userData).select();
            if (error) throw error;
            return data[0];
        }
    },
    async deleteUser(id) {
        const supabase = getSupabase();
        await supabase.from('users').delete().eq('id', id);
    }
};

window.Storage = Storage;
