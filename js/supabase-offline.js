/* =============================================
   supabase-offline.js - Offline + Sync Engine (محسّن)
   ============================================= */
(function() {
    'use strict';

    // دالة احتياطية لتوليد UUID
    function generateUUID() {
        if (window.generateUUID) return window.generateUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // الحصول على localDB مع انتظار الجاهزية
    async function getLocalDB() {
        if (!window.localDB) return null;
        try {
            await window.localDB.initPromise;  // انتظر التهيئة
            return window.localDB.ready ? window.localDB : null;
        } catch (e) {
            console.warn('فشل تهيئة localDB', e);
            return null;
        }
    }

    // التحقق من وجود SessionStore
    function getSessionStore() {
        return window.SessionStore;
    }

    const OfflineLayer = {
        async get(storeName, cloudFetcher, forceRefresh = false) {
            const local = await getLocalDB();
            const session = getSessionStore();
            const cacheKey = `offline_${storeName}`;

            // إذا لم يُطلب تحديث، جرب الكاش في الجلسة
            if (!forceRefresh && session) {
                const cached = session.getCache(cacheKey);
                if (cached) return cached;
            }

            // إذا لم يُطلب تحديث، جلب من IndexedDB
            if (local && !forceRefresh) {
                try {
                    const localData = await local.getAll(storeName);
                    if (localData && localData.length > 0) {
                        if (session) session.setCache(cacheKey, localData);
                        // مزامنة خلفية إذا كان متصلاً
                        if (navigator.onLine && window.supabaseClient && cloudFetcher) {
                            this._backgroundSync(storeName, cloudFetcher, local).catch(() => {});
                        }
                        return localData;
                    }
                } catch (e) {
                    console.warn(`قراءة ${storeName} من IndexedDB فشلت`, e);
                }
            }

            // جلب من السحابة
            if (navigator.onLine && window.supabaseClient && cloudFetcher) {
                try {
                    const data = await cloudFetcher();
                    if (data && Array.isArray(data)) {
                        if (session) session.setCache(cacheKey, data);
                        if (local) await this._deltaSync(local, storeName, data);
                    }
                    return data;
                } catch (error) {
                    console.warn(`جلب ${storeName} من السحابة فشل`, error);
                    // الرجوع إلى المحلي
                    if (local) {
                        try { return await local.getAll(storeName); } catch {}
                    }
                    return [];
                }
            }

            // آخر ملاذ: المحلي فقط
            if (local) {
                try { return await local.getAll(storeName); } catch {}
            }
            return [];
        },

        async save(storeName, data, cloudSaver, isNew) {
            const local = await getLocalDB();
            data.updated_at = new Date().toISOString();
            data.version = (data.version || 0) + 1;

            // حفظ محلي
            if (local) {
                try {
                    await local.put(storeName, data);
                } catch (e) {
                    console.warn(`حفظ محلي فشل لـ ${storeName}`, e);
                }
            }

            // إبطال الكاش
            const session = getSessionStore();
            if (session) session.invalidate(`offline_${storeName}`);

            // تحديد العملية
            data._operation = data._operation || (isNew === true ? 'INSERT' : (isNew === false ? 'UPDATE' : (data.id ? 'UPDATE' : 'INSERT')));

            if (navigator.onLine && window.supabaseClient && cloudSaver) {
                try {
                    const result = await cloudSaver(data);
                    // حذف من طابور المزامنة إذا كان موجوداً
                    if (local) {
                        const existingItems = await local.findQueueByRef(data.id, storeName);
                        for (const item of existingItems) {
                            await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                        }
                    }
                    return result;
                } catch (error) {
                    console.warn(`حفظ ${storeName} سحابياً فشل`, error);
                    await this._queueForSync(storeName, data);
                    return data; // اعتبره محفوظ محلياً
                }
            } else {
                // غير متصل: أضف للطابور
                await this._queueForSync(storeName, data);
                return data;
            }
        },

        async _backgroundSync(storeName, cloudFetcher, local) {
            try {
                const cloudData = await cloudFetcher();
                if (cloudData && cloudData.length > 0) {
                    await this._deltaSync(local, storeName, cloudData);
                    const session = getSessionStore();
                    if (session) session.setCache(`offline_${storeName}`, cloudData);
                }
            } catch (e) {
                // فشل صامت، لا يؤثر على التطبيق
            }
        },

        async _deltaSync(local, storeName, cloudData) {
            const localItems = await local.getAll(storeName).catch(() => []);
            const localMap = new Map(localItems.map(i => [i.id, i]));
            const toPut = [];
            const toDelete = new Set(localMap.keys());

            // جلب الطابور لتجنب حذف عناصر معلقة
            const syncQueue = await local.getSyncQueue().catch(() => []);
            const pendingIds = new Set(syncQueue
                .filter(q => q.table === storeName)
                .map(q => q.ref_id)
            );

            for (const cloudItem of cloudData) {
                toDelete.delete(cloudItem.id);
                const localItem = localMap.get(cloudItem.id);
                const cloudTs = cloudItem.updated_at ? new Date(cloudItem.updated_at).getTime() : 0;
                const localTs = localItem?.updated_at ? new Date(localItem.updated_at).getTime() : 0;

                // إذا لم يكن موجوداً محلياً أو النسخة السحابية أحدث، نستبدلها
                if (!localItem || cloudTs >= localTs) {
                    toPut.push(cloudItem);
                }
            }

            // حذف العناصر المحلية غير الموجودة في السحابة، ما لم تكن معلقة أو INSERT غير مرفوعة
            for (const id of toDelete) {
                if (pendingIds.has(id)) continue;
                const localItem = localMap.get(id);
                // لا تحذف عنصر INSERT محلي لم يتم رفعه بعد
                if (localItem && localItem._operation === 'INSERT') continue;
                await local.delete(storeName, id).catch(() => {});
            }

            // تحديث الدفعات
            for (let i = 0; i < toPut.length; i += 30) {
                const batch = toPut.slice(i, i + 30);
                await Promise.all(batch.map(item => local.put(storeName, item).catch(() => {})));
            }
        },

        async _queueForSync(table, data) {
            const local = await getLocalDB();
            if (!local || typeof local.addToSyncQueue !== 'function') return;

            const entry = {
                queue_id: generateUUID(),
                ref_id: data.id,
                type: data._operation || 'UPDATE',
                table: table,
                data: { ...data },
                checksum: this._simpleChecksum(JSON.stringify(data)),
                retries: 0,
                timestamp: Date.now()
            };

            try {
                await local.addToSyncQueue(entry);
            } catch (e) {
                console.warn('إضافة للطابور فشلت', e);
            }

            return entry.queue_id; // إرجاع المعرف للاستخدام لاحقاً
        },

        _simpleChecksum(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        }
    };

    window.OfflineLayer = OfflineLayer;

    // ========== محرك المزامنة ==========
    const SyncEngine = {
        _processing: false,

        async process() {
            if (this._processing) return;
            this._processing = true;

            const local = await getLocalDB();
            if (!local || !navigator.onLine) {
                this._processing = false;
                return;
            }

            try {
                const allQueue = await local.getSyncQueue().catch(() => []);
                const queue = allQueue.filter(item =>
                    !item.failed && (!item.nextRetry || item.nextRetry <= Date.now())
                );

                if (!queue.length) {
                    this._processing = false;
                    return;
                }

                console.log(`🔄 معالجة ${queue.length} عملية من الطابور`);

                // معالجة على دفعات 3 عناصر
                for (let i = 0; i < queue.length; i += 3) {
                    const batch = queue.slice(i, i + 3);
                    await Promise.allSettled(batch.map(item => this._processItem(item, local)));
                }
            } catch (e) {
                console.error('خطأ في معالجة الطابور', e);
            } finally {
                this._processing = false;
            }
        },

        async _processItem(item, local) {
            // التحقق من التلاعب
            if (item.checksum && item.data) {
                const currentChecksum = OfflineLayer._simpleChecksum(JSON.stringify(item.data));
                if (currentChecksum !== item.checksum) {
                    console.error('⚠️ تلاعب في الطابور:', item);
                    await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                    return;
                }
            }

            try {
                if (item.type === 'DELETE') {
                    // بناء كائن الحذف
                    const deletePayload = {
                        id: item.ref_id,
                        deleted_at: new Date().toISOString()
                    };
                    let handler;
                    if (item.table === 'products') handler = window.DB._cloudDeleteProduct;
                    else if (item.table === 'parties') handler = window.DB._cloudDeleteParty;
                    // باقي الأنواع لا تدعم الحذف حالياً

                    if (handler) {
                        await handler(deletePayload);
                        await local.removeFromSyncQueue(item.queue_id);
                    } else {
                        console.warn(`DELETE غير معروف للجدول ${item.table}`);
                        await local.removeFromSyncQueue(item.queue_id);
                    }
                } else {
                    // INSERT أو UPDATE
                    const handler = {
                        products: window.DB._cloudSaveProduct,
                        parties: window.DB._cloudSaveParty,
                        invoices: window.DB._cloudSaveInvoice,
                        purchases: window.DB._cloudSavePurchase,
                        transactions: window.DB._cloudSaveTransaction,
                        returns: window.DB._cloudSaveReturn,
                        journal_entries: window.DB._cloudSaveJournalEntry
                    }[item.table];

                    if (handler) {
                        await handler(item.data);
                        await local.removeFromSyncQueue(item.queue_id);
                    } else {
                        console.warn(`عملية غير معروفة للجدول ${item.table}`);
                        await local.removeFromSyncQueue(item.queue_id);
                    }
                }
            } catch (error) {
                console.warn(`فشل مزامنة ${item.table}`, error);
                item.retries = (item.retries || 0) + 1;
                if (item.retries >= 5) {
                    item.failed = true;
                } else {
                    item.nextRetry = Date.now() + Math.pow(2, item.retries) * 1000;
                }
                if (local.updateSyncQueueItem) {
                    await local.updateSyncQueueItem(item).catch(() => {});
                }
            }
        }
    };

    // تشغيل المزامنة عند الاتصال
    window.addEventListener('online', () => {
        setTimeout(() => SyncEngine.process(), 1000);
    });

    // محاولة مزامنة عند البدء إذا كان متصلاً
    if (navigator.onLine) {
        setTimeout(() => SyncEngine.process(), 2000);
    }

    // تعريض SyncEngine للاستخدام اليدوي
    window.SyncEngine = SyncEngine;
})();
