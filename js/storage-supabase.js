// js/storage-supabase.js
// طبقة الربط الكاملة مع Supabase
// متوافقة مع هيكل الجداول: products, parties, reps, invoices, purchases, transactions, settings, users

const Storage = {
    // ========== المنتجات ==========
    async getProducts() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('❌ getProducts:', error); return []; }
        return data || [];
    },

    async saveProduct(product) {
        // التأكد من أن units مصفوفة وليست نصاً
        if (typeof product.units === 'string') {
            product.units = JSON.parse(product.units);
        }
        if (!product.units) product.units = [];

        const productData = {
            name: product.name,
            category: product.category,
            description: product.description || '',
            units: product.units
        };

        if (product.id) {
            const { data, error } = await supabase
                .from('products')
                .update(productData)
                .eq('id', product.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('products')
                .insert(productData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteProduct(id) {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== العملاء ==========
    async getCustomers() {
        const { data, error } = await supabase
            .from('parties')
            .select('*')
            .eq('type', 'customer')
            .order('created_at', { ascending: false });
        if (error) { console.error('❌ getCustomers:', error); return []; }
        return data || [];
    },

    async saveCustomer(customer) {
        const customerData = {
            type: 'customer',
            name: customer.name,
            phone: customer.phone || '',
            address: customer.address || '',
            email: customer.email || '',
            balance: parseFloat(customer.balance) || 0,
            lastTransaction: customer.lastTransaction || null
        };

        if (customer.id) {
            const { data, error } = await supabase
                .from('parties')
                .update(customerData)
                .eq('id', customer.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('parties')
                .insert(customerData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteCustomer(id) {
        const { error } = await supabase.from('parties').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== الموردين ==========
    async getSuppliers() {
        const { data, error } = await supabase
            .from('parties')
            .select('*')
            .eq('type', 'supplier')
            .order('created_at', { ascending: false });
        if (error) { console.error('❌ getSuppliers:', error); return []; }
        return data || [];
    },

    async saveSupplier(supplier) {
        const supplierData = {
            type: 'supplier',
            name: supplier.name,
            phone: supplier.phone || '',
            address: supplier.address || '',
            email: supplier.email || '',
            balance: parseFloat(supplier.balance) || 0,
            lastTransaction: supplier.lastTransaction || null
        };

        if (supplier.id) {
            const { data, error } = await supabase
                .from('parties')
                .update(supplierData)
                .eq('id', supplier.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('parties')
                .insert(supplierData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteSupplier(id) {
        const { error } = await supabase.from('parties').delete().eq('id', id);
        if (error) throw error;
    },

    // جميع الأطراف
    async getAllParties() {
        const { data, error } = await supabase
            .from('parties')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('❌ getAllParties:', error); return []; }
        return data || [];
    },

    // ========== المندوبين ==========
    async getReps() {
        const { data, error } = await supabase
            .from('reps')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('❌ getReps:', error); return []; }
        return data || [];
    },

    async saveRep(rep) {
        const repData = {
            name: rep.name,
            phone: rep.phone || '',
            region: rep.region || '',
            target: parseFloat(rep.target) || 15000,
            commission: parseFloat(rep.commission) || 5,
            sales: parseFloat(rep.sales) || 0,
            collections: parseFloat(rep.collections) || 0
        };

        if (rep.id) {
            const { data, error } = await supabase
                .from('reps')
                .update(repData)
                .eq('id', rep.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('reps')
                .insert(repData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteRep(id) {
        const { error } = await supabase.from('reps').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== الفواتير ==========
    async getInvoices() {
        const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('❌ getInvoices:', error); return []; }
        return data || [];
    },

    async saveInvoice(invoice) {
        // تجهيز كائن الفاتورة
        const invoiceData = {
            id: invoice.id,
            type: invoice.type || 'sale',
            customer: invoice.customer || null,
            customerId: invoice.customerId || null,
            supplier: invoice.supplier || null,
            supplierId: invoice.supplierId || null,
            date: invoice.date || Utils.getToday(),
            total: parseFloat(invoice.total) || 0,
            paid: parseFloat(invoice.paid) || 0,
            remaining: parseFloat(invoice.remaining) || 0,
            discount: parseFloat(invoice.discount) || 0,
            status: invoice.status || 'unpaid',
            paymentMethod: invoice.paymentMethod || null,
            items: invoice.items || [],
            repId: invoice.repId || null,
            note: invoice.note || null
        };

        if (invoice.id) {
            const { data, error } = await supabase
                .from('invoices')
                .update(invoiceData)
                .eq('id', invoice.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('invoices')
                .insert(invoiceData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteInvoice(id) {
        const { error } = await supabase.from('invoices').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== المشتريات ==========
    async getPurchases() {
        const { data, error } = await supabase
            .from('purchases')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('❌ getPurchases:', error); return []; }
        return data || [];
    },

    async savePurchase(purchase) {
        const purchaseData = {
            id: purchase.id,
            supplier: purchase.supplier,
            supplierId: purchase.supplierId || null,
            date: purchase.date || Utils.getToday(),
            total: parseFloat(purchase.total) || 0,
            paid: parseFloat(purchase.paid) || 0,
            remaining: parseFloat(purchase.remaining) || 0,
            status: purchase.status || 'unpaid',
            paymentMethod: purchase.paymentMethod || null,
            items: purchase.items || []
        };

        if (purchase.id) {
            const { data, error } = await supabase
                .from('purchases')
                .update(purchaseData)
                .eq('id', purchase.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('purchases')
                .insert(purchaseData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deletePurchase(id) {
        const { error } = await supabase.from('purchases').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== حركات الصندوق ==========
    async getTransactions() {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('❌ getTransactions:', error); return []; }
        return data || [];
    },

    async saveTransaction(transaction) {
        const transData = {
            type: transaction.type,
            amount: parseFloat(transaction.amount) || 0,
            description: transaction.description,
            paymentMethod: transaction.paymentMethod || 'cash',
            date: transaction.date || Utils.getToday(),
            reference: transaction.reference || null,
            notes: transaction.notes || null
        };

        if (transaction.id) {
            const { data, error } = await supabase
                .from('transactions')
                .update(transData)
                .eq('id', transaction.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('transactions')
                .insert(transData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteTransaction(id) {
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== الإعدادات ==========
    async getSettings() {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('id', 'main')
            .single();
        if (error && error.code !== 'PGRST116') {
            console.warn('⚠️ Settings not found, using defaults');
        }
        return data || {};
    },

    async saveSettings(settings) {
        const settingsData = {
            id: 'main',
            company: settings.company || {},
            printing: settings.printing || {},
            system: settings.system || {},
            advanced: settings.advanced || {}
        };

        const { data, error } = await supabase
            .from('settings')
            .upsert(settingsData, { onConflict: 'id' })
            .select();
        if (error) throw error;
        return data[0];
    },

    // ========== المستخدمين ==========
    async getUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('❌ getUsers:', error); return []; }
        return data || [];
    },

    async saveUser(user) {
        const userData = {
            username: user.username,
            password: user.password,
            fullName: user.fullName,
            role: user.role,
            repId: user.repId || null,
            status: user.status || 'active'
        };

        if (user.id) {
            const { data, error } = await supabase
                .from('users')
                .update(userData)
                .eq('id', user.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('users')
                .insert(userData)
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteUser(id) {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw error;
    }
};

window.Storage = Storage;
