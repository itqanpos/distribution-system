// js/storage-supabase.js - طبقة تخزين تستخدم REST API مباشرة (بدون مكتبة Supabase)
(function() {
    // الإعدادات
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    // دالة عامة لاستدعاء REST API
    async function supabaseRequest(endpoint, options = {}) {
        const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
        const headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                method: options.method || 'GET',
                headers: headers,
                body: options.body ? JSON.stringify(options.body) : undefined
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } catch (error) {
            console.error('❌ Supabase request failed:', error);
            throw error;
        }
    }

    // ========== تعريف Storage ==========
    window.Storage = {
        // --- المنتجات ---
        async getProducts() {
            try {
                const data = await supabaseRequest('products?select=*&order=created_at.desc');
                console.log(`✅ تم جلب ${data?.length || 0} منتج`);
                return data || [];
            } catch (error) {
                console.error('❌ getProducts failed:', error);
                alert('فشل جلب المنتجات: ' + error.message);
                return [];
            }
        },

        async saveProduct(product) {
            try {
                // تجهيز البيانات
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

                let result;
                if (product.id) {
                    result = await supabaseRequest(`products?id=eq.${product.id}`, {
                        method: 'PATCH',
                        body: productData
                    });
                } else {
                    result = await supabaseRequest('products', {
                        method: 'POST',
                        body: productData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                
                const savedProduct = Array.isArray(result) ? result[0] : result;
                console.log('✅ تم حفظ المنتج:', savedProduct?.name);
                return savedProduct;
            } catch (error) {
                console.error('❌ saveProduct failed:', error);
                alert('فشل حفظ المنتج: ' + error.message);
                throw error;
            }
        },

        async deleteProduct(id) {
            try {
                await supabaseRequest(`products?id=eq.${id}`, { method: 'DELETE' });
                console.log('✅ تم حذف المنتج:', id);
            } catch (error) {
                console.error('❌ deleteProduct failed:', error);
                alert('فشل حذف المنتج: ' + error.message);
                throw error;
            }
        },

        // --- العملاء ---
        async getCustomers() {
            try {
                const data = await supabaseRequest("parties?select=*&type=eq.customer&order=created_at.desc");
                return data || [];
            } catch (error) {
                console.error('❌ getCustomers failed:', error);
                return [];
            }
        },

        async saveCustomer(customer) {
            try {
                const customerData = {
                    type: 'customer',
                    name: customer.name,
                    phone: customer.phone || '',
                    address: customer.address || '',
                    email: customer.email || '',
                    balance: parseFloat(customer.balance) || 0,
                    lastTransaction: customer.lastTransaction || null
                };

                let result;
                if (customer.id) {
                    result = await supabaseRequest(`parties?id=eq.${customer.id}`, {
                        method: 'PATCH',
                        body: customerData
                    });
                } else {
                    result = await supabaseRequest('parties', {
                        method: 'POST',
                        body: customerData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ saveCustomer failed:', error);
                throw error;
            }
        },

        async deleteCustomer(id) {
            try {
                await supabaseRequest(`parties?id=eq.${id}`, { method: 'DELETE' });
            } catch (error) {
                console.error('❌ deleteCustomer failed:', error);
                throw error;
            }
        },

        // --- الموردين ---
        async getSuppliers() {
            try {
                const data = await supabaseRequest("parties?select=*&type=eq.supplier&order=created_at.desc");
                return data || [];
            } catch (error) {
                console.error('❌ getSuppliers failed:', error);
                return [];
            }
        },

        async saveSupplier(supplier) {
            try {
                const supplierData = {
                    type: 'supplier',
                    name: supplier.name,
                    phone: supplier.phone || '',
                    address: supplier.address || '',
                    email: supplier.email || '',
                    balance: parseFloat(supplier.balance) || 0,
                    lastTransaction: supplier.lastTransaction || null
                };

                let result;
                if (supplier.id) {
                    result = await supabaseRequest(`parties?id=eq.${supplier.id}`, {
                        method: 'PATCH',
                        body: supplierData
                    });
                } else {
                    result = await supabaseRequest('parties', {
                        method: 'POST',
                        body: supplierData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ saveSupplier failed:', error);
                throw error;
            }
        },

        async deleteSupplier(id) {
            try {
                await supabaseRequest(`parties?id=eq.${id}`, { method: 'DELETE' });
            } catch (error) {
                console.error('❌ deleteSupplier failed:', error);
                throw error;
            }
        },

        // --- المندوبين ---
        async getReps() {
            try {
                const data = await supabaseRequest("reps?select=*&order=created_at.desc");
                return data || [];
            } catch (error) {
                console.error('❌ getReps failed:', error);
                return [];
            }
        },

        async saveRep(rep) {
            try {
                const repData = {
                    name: rep.name,
                    phone: rep.phone || '',
                    region: rep.region || '',
                    target: parseFloat(rep.target) || 15000,
                    commission: parseFloat(rep.commission) || 5,
                    sales: parseFloat(rep.sales) || 0,
                    collections: parseFloat(rep.collections) || 0
                };

                let result;
                if (rep.id) {
                    result = await supabaseRequest(`reps?id=eq.${rep.id}`, {
                        method: 'PATCH',
                        body: repData
                    });
                } else {
                    result = await supabaseRequest('reps', {
                        method: 'POST',
                        body: repData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ saveRep failed:', error);
                throw error;
            }
        },

        async deleteRep(id) {
            try {
                await supabaseRequest(`reps?id=eq.${id}`, { method: 'DELETE' });
            } catch (error) {
                console.error('❌ deleteRep failed:', error);
                throw error;
            }
        },

        // --- الفواتير ---
        async getInvoices() {
            try {
                const data = await supabaseRequest("invoices?select=*&order=date.desc");
                return data || [];
            } catch (error) {
                console.error('❌ getInvoices failed:', error);
                return [];
            }
        },

        async saveInvoice(invoice) {
            try {
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

                let result;
                if (invoice.id) {
                    result = await supabaseRequest(`invoices?id=eq.${invoice.id}`, {
                        method: 'PATCH',
                        body: invoiceData
                    });
                } else {
                    result = await supabaseRequest('invoices', {
                        method: 'POST',
                        body: invoiceData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ saveInvoice failed:', error);
                throw error;
            }
        },

        // --- المشتريات ---
        async getPurchases() {
            try {
                const data = await supabaseRequest("purchases?select=*&order=date.desc");
                return data || [];
            } catch (error) {
                console.error('❌ getPurchases failed:', error);
                return [];
            }
        },

        async savePurchase(purchase) {
            try {
                const purchaseData = {
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

                let result;
                if (purchase.id) {
                    result = await supabaseRequest(`purchases?id=eq.${purchase.id}`, {
                        method: 'PATCH',
                        body: purchaseData
                    });
                } else {
                    result = await supabaseRequest('purchases', {
                        method: 'POST',
                        body: purchaseData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ savePurchase failed:', error);
                throw error;
            }
        },

        // --- حركات الصندوق ---
        async getTransactions() {
            try {
                const data = await supabaseRequest("transactions?select=*&order=date.desc");
                return data || [];
            } catch (error) {
                console.error('❌ getTransactions failed:', error);
                return [];
            }
        },

        async saveTransaction(transaction) {
            try {
                const transData = {
                    type: transaction.type,
                    amount: parseFloat(transaction.amount) || 0,
                    description: transaction.description,
                    paymentMethod: transaction.paymentMethod || 'cash',
                    date: transaction.date || new Date().toISOString().split('T')[0],
                    reference: transaction.reference,
                    notes: transaction.notes
                };

                let result;
                if (transaction.id) {
                    result = await supabaseRequest(`transactions?id=eq.${transaction.id}`, {
                        method: 'PATCH',
                        body: transData
                    });
                } else {
                    result = await supabaseRequest('transactions', {
                        method: 'POST',
                        body: transData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ saveTransaction failed:', error);
                throw error;
            }
        },

        // --- الإعدادات ---
        async getSettings() {
            try {
                const data = await supabaseRequest("settings?id=eq.main");
                return (data && data[0]) || {};
            } catch (error) {
                console.warn('⚠️ Settings not found, using defaults');
                return {};
            }
        },

        async saveSettings(settings) {
            try {
                const settingsData = {
                    id: 'main',
                    company: settings.company || {},
                    printing: settings.printing || {},
                    system: settings.system || {},
                    advanced: settings.advanced || {}
                };

                const result = await supabaseRequest('settings', {
                    method: 'POST',
                    body: settingsData,
                    headers: { 'Prefer': 'resolution=merge-duplicates' }
                });
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ saveSettings failed:', error);
                throw error;
            }
        },

        // --- المستخدمين ---
        async getUsers() {
            try {
                const data = await supabaseRequest("users?select=*&order=created_at.desc");
                return data || [];
            } catch (error) {
                console.error('❌ getUsers failed:', error);
                return [];
            }
        },

        async saveUser(user) {
            try {
                const userData = {
                    username: user.username,
                    password: user.password,
                    fullName: user.fullName,
                    role: user.role,
                    repId: user.repId || null,
                    status: user.status || 'active'
                };

                let result;
                if (user.id) {
                    result = await supabaseRequest(`users?id=eq.${user.id}`, {
                        method: 'PATCH',
                        body: userData
                    });
                } else {
                    result = await supabaseRequest('users', {
                        method: 'POST',
                        body: userData,
                        headers: { 'Prefer': 'return=representation' }
                    });
                }
                return Array.isArray(result) ? result[0] : result;
            } catch (error) {
                console.error('❌ saveUser failed:', error);
                throw error;
            }
        }
    };

    console.log('✅ Storage module loaded (REST API direct)');
})();
