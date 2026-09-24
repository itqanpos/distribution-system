/* Compatibility adapter for the legacy representative pages. */
(function () {
    'use strict';

    async function ready() {
        if (!window.DB) throw new Error('طبقة البيانات غير جاهزة');
        await window.DB.init();
        if (window.Auth?.user?.tenant_id) return;
        await window.Auth?.getCurrentUser?.();
    }

    function customerToParty(customer) {
        return {
            ...customer,
            id: customer.id || undefined,
            name: String(customer.name || '').trim(),
            type: customer.type || 'customer',
            phone: customer.phone || null,
            address: customer.address || null
        };
    }

    const Storage = {
        async getCustomers() {
            await ready();
            return window.DB.getParties('customer');
        },
        async saveCustomer(customer) {
            await ready();
            return window.DB.saveParty(customerToParty(customer));
        },
        async getInvoices() {
            await ready();
            return window.DB.getInvoices();
        },
        async getTransactions() {
            await ready();
            return window.DB.getTransactions();
        },
        async saveTransaction(transaction) {
            await ready();
            if (transaction.party_id && transaction.amount) {
                return window.DB.addPayment({
                    ...transaction,
                    type: transaction.type === 'income' ? 'payment_in' : transaction.type
                });
            }
            return window.DB.saveTransaction(transaction);
        },
        async getReps() {
            await ready();
            const user = window.Auth?.user;
            return user ? [{ id: user.id, name: user.fullName, email: user.email, sales: 0, collections: 0, target: 15000 }] : [];
        },
        async saveRep() {
            throw new Error('بيانات المندوبين تُدار من صفحة المستخدمين');
        }
    };

    window.Storage = Storage;
})();

