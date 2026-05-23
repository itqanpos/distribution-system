/* =============================================
   sync.js - Offline Sync Engine
   ============================================= */
(function() {
    'use strict';
    const SyncEngine = {
        _processing: false,
        _retryDelay: 5000,
        _maxRetries: 3,

        async processQueue() {
            if (this._processing) return;
            const local = window.localDB;
            if (!local?.ready) return;
            if (!navigator.onLine) {
                // جدولة إعادة المحاولة
                setTimeout(() => this.processQueue(), 30000);
                return;
            }

            this._processing = true;
            try {
                const queue = await local.getSyncQueue();
                if (!queue.length) return;

                console.log(`🔄 معالجة ${queue.length} عنصراً من طابور المزامنة`);
                const CONCURRENT = 5;
                for (let i = 0; i < queue.length; i += CONCURRENT) {
                    const batch = queue.slice(i, i + CONCURRENT);
                    await Promise.allSettled(batch.map(op => this._syncOperation(op, local)));
                }
                console.log('✅ تمت المزامنة بنجاح');
            } catch (e) {
                console.error('فشلت المزامنة:', e);
            } finally {
                this._processing = false;
            }
        },

        async _syncOperation(op, local) {
            try {
                const db = window.DB;
                const map = {
                    products: db.saveProduct,
                    parties: db.saveParty,
                    reps: db.saveRep,
                    invoices: db.saveInvoice,
                    purchases: db.savePurchase,
                    transactions: db.saveTransaction,
                    returns: db.saveReturn,
                    journal_entries: db.saveJournalEntry
                };
                const handler = map[op.table];
                if (handler) {
                    await handler.call(db, op.data);
                    await local.removeFromSyncQueue(op.id);
                } else {
                    console.warn(`لا يوجد معالج للجدول ${op.table}`);
                    // إزالة العملية غير المعروفة
                    await local.removeFromSyncQueue(op.id);
                }
            } catch (e) {
                console.warn(`فشلت مزامنة العملية ${op.id}:`, e);
                // زيادة عدد المحاولات
                op.retries = (op.retries || 0) + 1;
                if (op.retries > this._maxRetries) {
                    console.error(`تجاوزت الحد الأقصى للمحاولات للعملية ${op.id}`);
                    await local.removeFromSyncQueue(op.id);
                } else {
                    // تحديث العملية بعدد المحاولات
                    await local.put('sync_queue', op);
                }
            }
        }
    };

    window.SyncEngine = SyncEngine;

    // مراقبة الاتصال
    window.addEventListener('online', () => {
        console.log('🌐 استعادة الاتصال - بدء المزامنة');
        SyncEngine.processQueue();
    });
    window.addEventListener('offline', () => console.log('⚠️ وضع عدم الاتصال'));

    // محاولة أولية
    if (navigator.onLine) SyncEngine.processQueue();
})();
