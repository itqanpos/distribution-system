/* =============================================
   supabase-offline.js - Offline + Sync Engine
   ============================================= */
(function() {
    'use strict';

    function getLocalDB() {
        return (window.localDB && window.localDB.ready) ? window.localDB : null;
    }

    const OfflineLayer = {
        async get(storeName, cloudFetcher, forceRefresh = false) {
            const local = getLocalDB();
            const cacheKey = `offline_${storeName}`;

            if (!forceRefresh) {
                const cached = window.SessionStore.getCache(cacheKey);
                if (cached) return cached;
            }

            if (local && !forceRefresh) {
                try {
                    const localData = await local.getAll(storeName);
                    if (localData && localData.length > 0) {
                        window.SessionStore.setCache(cacheKey, localData);
                        if (navigator.onLine && window.supabaseClient && cloudFetcher) {
                            this._backgroundSync(storeName, cloudFetcher, local).catch(() => {});
                        }
                        return localData;
                    }
                } catch (e) { console.warn(`قراءة ${storeName} فشلت`, e); }
            }

            if (navigator.onLine && window.supabaseClient && cloudFetcher) {
                try {
                    const data = await cloudFetcher();
                    if (data && Array.isArray(data)) {
                        window.SessionStore.setCache(cacheKey, data);
                        if (local) await this._deltaSync(local, storeName, data);
                    }
                    return data;
                } catch (error) {
                    console.warn(`جلب ${storeName} فشل`, error);
                    return local ? await local.getAll(storeName) : [];
                }
            }
            return local ? await local.getAll(storeName) : [];
        },

        async save(storeName, data, cloudSaver, isNew) {
            const local = getLocalDB();
            data.updated_at = new Date().toISOString();
            data.version = (data.version || 0) + 1;

            if (local) await local.put(storeName, data).catch(e => console.warn(e));
            window.SessionStore.invalidate(`offline_${storeName}`);
            data._operation = data._operation || (isNew === true ? 'INSERT' : (isNew === false ? 'UPDATE' : (data.id ? 'UPDATE' : 'INSERT')));

            if (navigator.onLine && window.supabaseClient && cloudSaver) {
                try {
                    const result = await cloudSaver(data);
                    if (local?.removeFromSyncQueue) await local.removeFromSyncQueue(data.id).catch(() => {});
                    return result;
                } catch (error) {
                    console.warn(`حفظ ${storeName} فشل`, error);
                    await this._queueForSync(storeName, data);
                    return data;
                }
            } else {
                await this._queueForSync(storeName, data);
                return data;
            }
        },

        async _backgroundSync(storeName, cloudFetcher, local) {
            try {
                const cloudData = await cloudFetcher();
                if (cloudData?.length > 0) {
                    await this._deltaSync(local, storeName, cloudData);
                    window.SessionStore.setCache(`offline_${storeName}`, cloudData);
                }
            } catch {}
        },

        async _deltaSync(local, storeName, cloudData) {
            const localItems = await local.getAll(storeName).catch(() => []);
            const localMap = new Map(localItems.map(i => [i.id, i]));
            const toPut = [], toDelete = new Set(localMap.keys());
            const syncQueue = await local.getSyncQueue().catch(() => []);
            const pendingIds = new Set(syncQueue.map(q => q.ref_id));

            for (const cloudItem of cloudData) {
                toDelete.delete(cloudItem.id);
                const localItem = localMap.get(cloudItem.id);
                const cloudTs = cloudItem.updated_at ? new Date(cloudItem.updated_at).getTime() : 0;
                const localTs = localItem?.updated_at ? new Date(localItem.updated_at).getTime() : 0;
                if (!localItem || cloudTs >= localTs) toPut.push(cloudItem);
            }

            for (const id of toDelete) {
                if (pendingIds.has(id)) continue;
                const localItem = localMap.get(id);
                if (localItem && localItem._operation === 'INSERT') continue;
                await local.delete(storeName, id).catch(() => {});
            }

            for (let i = 0; i < toPut.length; i += 30) {
                await Promise.all(toPut.slice(i, i + 30).map(item => local.put(storeName, item).catch(() => {})));
            }
        },

        async _queueForSync(table, data) {
            const local = getLocalDB();
            if (!local?.addToSyncQueue) return;
            const entry = {
                queue_id: window.generateUUID(),
                ref_id: data.id,
                type: data._operation || 'UPDATE',
                table,
                data: { ...data },
                checksum: this._simpleChecksum(JSON.stringify(data)),
                retries: 0,
                timestamp: Date.now()
            };
            await local.addToSyncQueue(entry).catch(e => console.warn('إضافة للطابور فشلت', e));
        },

        _simpleChecksum(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
            return hash.toString(16);
        }
    };

    window.OfflineLayer = OfflineLayer;

    // محرك المزامنة
    const SyncEngine = {
        _processing: false,
        async process() {
            if (this._processing) return;
            this._processing = true;
            const local = getLocalDB();
            if (!local?.getSyncQueue || !navigator.onLine) { this._processing = false; return; }
            try {
                const allQueue = await local.getSyncQueue().catch(() => []);
                const queue = allQueue.filter(item => !item.failed && (!item.nextRetry || item.nextRetry <= Date.now()));
                if (!queue.length) { this._processing = false; return; }
                console.log(`🔄 معالجة ${queue.length} عملية`);
                for (let i = 0; i < queue.length; i += 3) {
                    await Promise.allSettled(queue.slice(i, i + 3).map(item => this._processItem(item, local)));
                }
            } finally { this._processing = false; }
        },

        async _processItem(item, local) {
            try {
                if (item.checksum && item.data) {
                    if (OfflineLayer._simpleChecksum(JSON.stringify(item.data)) !== item.checksum) {
                        console.error('⚠️ تلاعب:', item);
                        await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                        return;
                    }
                }

                if (item.type === 'DELETE') {
                    const deleter = {
                        products: window.DB._cloudDeleteProduct,
                        parties: window.DB._cloudDeleteParty
                    }[item.table];
                    if (deleter) { await deleter(item.ref_id); await local.removeFromSyncQueue(item.queue_id); }
                    else { console.warn('DELETE غير معروف'); await local.removeFromSyncQueue(item.queue_id); }
                    return;
                }

                const handler = {
                    products: window.DB._cloudSaveProduct,
                    parties: window.DB._cloudSaveParty,
                    invoices: window.DB._cloudSaveInvoice,
                    purchases: window.DB._cloudSavePurchase,
                    transactions: window.DB._cloudSaveTransaction,
                    returns: window.DB._cloudSaveReturn,
                    journal_entries: window.DB._cloudSaveJournalEntry
                }[item.table];
                if (handler) { await handler(item.data); await local.removeFromSyncQueue(item.queue_id); }
                else { console.warn('عملية غير معروفة'); await local.removeFromSyncQueue(item.queue_id); }
            } catch (e) {
                console.warn('فشل مزامنة', e);
                item.retries = (item.retries || 0) + 1;
                if (item.retries >= 5) {
                    item.failed = true;
                    if (local.updateSyncQueueItem) await local.updateSyncQueueItem(item);
                } else {
                    item.nextRetry = Date.now() + Math.pow(2, item.retries) * 1000;
                    if (local.updateSyncQueueItem) await local.updateSyncQueueItem(item);
                }
            }
        }
    };

    window.addEventListener('online', () => SyncEngine.process());
    if (navigator.onLine) setTimeout(() => SyncEngine.process(), 2000);
})();
