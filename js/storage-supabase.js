// js/storage-supabase.js
// طبقة التخزين الكاملة والمضبوطة لـ Supabase
// متوافقة مع هيكل الجداول الذي تم إنشاؤه

const Storage = {
    // ========== المنتجات ==========
    async getProducts() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('getProducts error:', error); return []; }
        return data || [];
    },

    async saveProduct(product) {
        // التأكد من أن units مصفوفة
        if (!product.units) product.units = [];
        if (typeof product.units === 'string') product.units = JSON.parse(product.units);

        if (product.id) {
            const { data, error } = await supabase
                .from('products')
                .update({
                    name: product.name,
                    category: product.category,
                    description: product.description,
                    units: product.units
                })
                .eq('id', product.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('products')
                .insert({
                    name: product.name,
                    category: product.category,
                    description: product.description,
                    units: product.units
                })
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteProduct(id) {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
    },

    async saveProducts(products) {
        for (const p of products) {
            await this.saveProduct(p);
        }
    },

    // ========== العملاء ==========
    async getCustomers() {
        const { data, error } = await supabase
            .from('parties')
            .select('*')
            .eq('type', 'customer')
            .order('created_at', { ascending: false });
        if (error) { console.error('getCustomers error:', error); return []; }
        return data || [];
    },

    async saveCustomer(customer) {
        customer.type = 'customer';
        // تحويل balance إلى رقم
        customer.balance = parseFloat(customer.balance) || 0;

        if (customer.id) {
            const { data, error } = await supabase
                .from('parties')
                .update({
                    type: customer.type,
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address,
                    email: customer.email,
                    balance: customer.balance,
                    lastTransaction: customer.lastTransaction
                })
                .eq('id', customer.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('parties')
                .insert({
                    type: customer.type,
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address,
                    email: customer.email,
                    balance: customer.balance,
                    lastTransaction: customer.lastTransaction
                })
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteCustomer(id) {
        const { error } = await supabase.from('parties').delete().eq('id', id);
        if (error) throw error;
    },

    async saveCustomers(customers) {
        for (const c of customers) {
            await this.saveCustomer(c);
        }
    },

    // ========== الموردين ==========
    async getSuppliers() {
        const { data, error } = await supabase
            .from('parties')
            .select('*')
            .eq('type', 'supplier')
            .order('created_at', { ascending: false });
        if (error) { console.error('getSuppliers error:', error); return []; }
        return data || [];
    },

    async saveSupplier(supplier) {
        supplier.type = 'supplier';
        supplier.balance = parseFloat(supplier.balance) || 0;

        if (supplier.id) {
            const { data, error } = await supabase
                .from('parties')
                .update({
                    type: supplier.type,
                    name: supplier.name,
                    phone: supplier.phone,
                    address: supplier.address,
                    email: supplier.email,
                    balance: supplier.balance,
                    lastTransaction: supplier.lastTransaction
                })
                .eq('id', supplier.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('parties')
                .insert({
                    type: supplier.type,
                    name: supplier.name,
                    phone: supplier.phone,
                    address: supplier.address,
                    email: supplier.email,
                    balance: supplier.balance,
                    lastTransaction: supplier.lastTransaction
                })
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteSupplier(id) {
        const { error } = await supabase.from('parties').delete().eq('id', id);
        if (error) throw error;
    },

    async saveSuppliers(suppliers) {
        for (const s of suppliers) {
            await this.saveSupplier(s);
        }
    },

    // جميع الأطراف
    async getAllParties() {
        const { data, error } = await supabase
            .from('parties')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('getAllParties error:', error); return []; }
        return data || [];
    },

    // ========== المندوبين ==========
    async getReps() {
        const { data, error } = await supabase
            .from('reps')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('getReps error:', error); return []; }
        return data || [];
    },

    async saveRep(rep) {
        rep.target = parseFloat(rep.target) || 15000;
        rep.commission = parseFloat(rep.commission) || 5;
        rep.sales = parseFloat(rep.sales) || 0;
        rep.collections = parseFloat(rep.collections) || 0;

        if (rep.id) {
            const { data, error } = await supabase
                .from('reps')
                .update({
                    name: rep.name,
                    phone: rep.phone,
                    region: rep.region,
                    target: rep.target,
                    commission: rep.commission,
                    sales: rep.sales,
                    collections: rep.collections
                })
                .eq('id', rep.id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const { data, error } = await supabase
                .from('reps')
                .insert({
                    name: rep.name,
                    phone: rep.phone,
                    region: rep.region,
                    target: rep.target,
                    commission: rep.commission,
                    sales: rep.sales,
                    collections: rep.collections
                })
                .select();
            if (error) throw error;
            return data[0];
        }
    },

    async deleteRep(id) {
        const { error } = await supabase.from('reps').delete().eq('id', id);
        if (error) throw error;
    },

    async saveReps(reps) {
        for (const r of reps) {
            await this.saveRep(r);
        }
    },

    // ========== الفواتير (المبيعات) ==========
    async getInvoices() {
        const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('getInvoices error:', error); return []; }
        return data || [];
    },

    async saveInvoice(invoice) {
        // تجهيز البيانات
        const invoiceData = {
            id: invoice.id,
            type: invoice.type || 'sale',
            customer: invoice.customer,
            customerId: invoice.customerId || null,
            supplier: invoice.supplier,
            supplierId: invoice.supplierId || null,
            date: invoice.date || Utils.getToday(),
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

    async saveInvoices(invoices) {
        for (const i of invoices) {
            await this.saveInvoice(i);
        }
    },

    // ========== المشتريات ==========
    async getPurchases() {
        const { data, error } = await supabase
            .from('purchases')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('getPurchases error:', error); return []; }
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
            paymentMethod: purchase.paymentMethod,
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

    async savePurchases(purchases) {
        for (const p of purchases) {
            await this.savePurchase(p);
        }
    },

    // ========== حركات الصندوق ==========
    async getTransactions() {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('getTransactions error:', error); return []; }
        return data || [];
    },

    async saveTransaction(transaction) {
        const transData = {
            type: transaction.type,
            amount: parseFloat(transaction.amount) || 0,
            description: transaction.description,
            paymentMethod: transaction.paymentMethod || 'cash',
            date: transaction.date || Utils.getToday(),
            reference: transaction.reference,
            notes: transaction.notes
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

    async saveTransactions(transactions) {
        for (const t of transactions) {
            await this.saveTransaction(t);
        }
    },

    // ========== الإعدادات ==========
    async getSettings() {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('id', 'main')
            .single();
        if (error && error.code !== 'PGRST116') {
            console.warn('Settings not found, using defaults', error);
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

    // ========== المستخدمين (إدارة) ==========
    async getUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('getUsers error:', error); return []; }
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
    },

    async saveUsers(users) {
        for (const u of users) {
            await this.saveUser(u);
        }
    }
};

window.Storage = Storage;
