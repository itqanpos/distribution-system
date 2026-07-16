/* =============================================
   sync.js - Offline Sync Engine (منقّح)
   يعتمد على OfflineLayer و localDB
   ============================================= */
(function() {
    'use strict';

    const SyncEngine = {
        _processing: false,
        _maxRetries: 5,
        _baseDelay: 1000, // ms

        /**
         * معالجة طابور المزامنة بالكامل
         */
        async processQueue() {
            if (this._processing) return;
            if (!navigator.onLine) {
                // جدولة لاحقة
                this._scheduleRetry(30000);
                return;
            }
            const local = window.localDB;
            if (!local?.ready) {
                this._scheduleRetry(5000);
                return;
            }

            // تأكد من أن DB جاهز
            if (!window.DB) {
                console.warn('SyncEngine: DB غير جاهز');
                this._scheduleRetry(5000);
                return;
            }

            this._processing = true;
            try {
                const allItems = await local.getSyncQueue().catch(() => []);
                const queue = allItems.filter(item => {
                    if (item.failed) return false; // تخطي الفاشلة نهائياً
                    if (item.nextRetry && item.nextRetry > Date.now()) return false;
                    return true;
                });

                if (!queue.length) return;

                console.log(`🔄 معالجة ${queue.length} عنصر من طابور المزامنة`);

                // معالجة على دفعات (5 عناصر لكل دفعة)
                const CONCURRENT = 5;
                for (let i = 0; i < queue.length; i += CONCURRENT) {
                    const batch = queue.slice(i, i + CONCURRENT);
                    await Promise.allSettled(batch.map(item => this._processItem(item, local)));
                }

                console.log('✅ اكتملت معالجة الطابور');
            } catch (e) {
                console.error('فشل معالجة الطابور:', e);
            } finally {
                this._processing = false;
            }
        },

        /**
         * معالجة عنصر واحد من الطابور
         */
        async _processItem(item, local) {
            try {
                // التحقق من وجود DB
                const db = window.DB;
                if (!db) throw new Error('DB غير متوفر');

                // 1. التحقق من عدم التلاعب (اختياري لكن مُوصى به)
                if (item.checksum && item.data) {
                    const currentChecksum = this._simpleChecksum(JSON.stringify(item.data));
                    if (currentChecksum !== item.checksum) {
                        console.error('⚠️ تلاعب مُكتشف في الطابور:', item);
                        await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                        return;
                    }
                }

                // 2. تنفيذ العملية حسب النوع
                if (item.type === 'DELETE') {
                    await this._handleDelete(item, local);
                } else {
                    await this._handleUpsert(item, local);
                }

                // نجحت العملية -> إزالة من الطابور
                await local.removeFromSyncQueue(item.queue_id).catch(() => {});

            } catch (error) {
                console.warn(`فشلت مزامنة العملية (${item.table}/${item.ref_id}):`, error);
                // زيادة عدد المحاولات مع تأخير أسي
                item.retries = (item.retries || 0) + 1;
                if (item.retries >= this._maxRetries) {
                    console.error(`العملية فشلت بعد ${item.retries} محاولات، سيتم وضع علامة فشل`);
                    item.failed = true;
                } else {
                    item.nextRetry = Date.now() + this._baseDelay * Math.pow(2, item.retries);
                }
                // تحديث العنصر في الطابور
                if (local.updateSyncQueueItem) {
                    await local.updateSyncQueueItem(item).catch(() => {});
                } else {
                    // fallback: إعادة إدراج بعد الحذف (أقل كفاءة)
                    await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                    await local.addToSyncQueue(item).catch(() => {});
                }
            }
        },

        /**
         * معالجة عملية الحذف
         */
        async _handleDelete(item, local) {
            const deletePayload = {
                id: item.ref_id,
                deleted_at: new Date().toISOString()
            };
            const deleteHandlers = {
                products: window.DB._cloudDeleteProduct,
                parties: window.DB._cloudDeleteParty
            };
            const handler = deleteHandlers[item.table];
            if (handler) {
                await handler(deletePayload);
            } else {
                console.warn(`لا يوجد معالج DELETE للجدول ${item.table} – إزالة العملية`);
            }
        },

        /**
         * معالجة عمليات الإدراج/التحديث
         */
        async _handleUpsert(item, local) {
            const upsertHandlers = {
                products: window.DB._cloudSaveProduct,
                parties: window.DB._cloudSaveParty,
                invoices: window.DB._cloudSaveInvoice,
                purchases: window.DB._cloudSavePurchase,
                transactions: window.DB._cloudSaveTransaction,
                returns: window.DB._cloudSaveReturn,
                journal_entries: window.DB._cloudSaveJournalEntry
            };
            const handler = upsertHandlers[item.table];
            if (handler) {
                await handler(item.data);
            } else {
                console.warn(`لا يوجد معالج UPSERT للجدول ${item.table} – إزالة العملية`);
            }
        },

        /**
         * دالة checksum بسيطة للتحقق من التلاعب
         */
        _simpleChecksum(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        },

        _scheduleRetry(delay) {
            clearTimeout(this._retryTimer);
            this._retryTimer = setTimeout(() => this.processQueue(), delay);
        }
    };

    // تعريض للمحرك العام
    window.SyncEngine = SyncEngine;

    // ========== ربط الأحداث ==========
    window.addEventListener('online', () => {
        console.log('🌐 تم استعادة الاتصال – بدء المزامنة');
        SyncEngine.processQueue();
    });

    window.addEventListener('offline', () => {
        console.log('⚠️ وضع عدم الاتصال');
    });

    // محاولة أولى عند التحميل
    if (navigator.onLine) {
        setTimeout(() => SyncEngine.processQueue(), 1500);
    }
})();
