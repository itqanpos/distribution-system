/* =============================================
   supabase-offline.js - Offline + Sync Engine (مصحح)
   ============================================= */
(function() {
    'use strict';

    function generateUUID() {
        if (window.generateUUID) return window.generateUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    async function getLocalDB() {
        if (!window.localDB) return null;
        try {
            await window.localDB.initPromise;
            return window.localDB.ready ? window.localDB : null;
        } catch (e) {
            console.warn('localDB init failed', e);
            return null;
        }
    }

    const OfflineLayer = {
        _syncingStores: new Set(),

        async get(storeName, cloudFetcher, forceRefresh = false) {
            const local = await getLocalDB();
            const session = window.SessionStore;
            const cacheKey = `offline_${storeName}`;

            if (forceRefresh && navigator.onLine && window.SyncEngine) {
                await window.SyncEngine.processQueue().catch(() => {});
            }

            if (!forceRefresh && session) {
                const cached = session.getCache(cacheKey);
                if (cached) return cached;
            }

            if (local && !forceRefresh) {
                try {
                    const localData = await local.getAll(storeName);
                    if (localData && localData.length > 0) {
                        if (session) session.setCache(cacheKey, localData);
                        if (navigator.onLine && window.supabaseClient && cloudFetcher) {
                            this._backgroundSync(storeName, cloudFetcher, local).catch(() => {});
                        }
                        return localData;
                    }
                } catch (e) {
                    console.warn(`قراءة ${storeName} فشلت`, e);
                }
            }

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
                    if (local) {
                        try { return await local.getAll(storeName); } catch {}
                    }
                    return [];
                }
            }

            if (local) {
                try { return await local.getAll(storeName); } catch {}
            }
            return [];
        },

        async save(storeName, data, cloudSaver, isNew) {
            const local = await getLocalDB();
            if (!data.updated_at) data.updated_at = new Date().toISOString();
            data.version = (data.version || 0) + 1;

            if (local) {
                try { await local.put(storeName, data); } catch (e) {
                    console.warn(`حفظ محلي فشل لـ ${storeName}`, e);
                }
            }

            const session = window.SessionStore;
            if (session) session.invalidate(`offline_${storeName}`);

            data._operation = data._operation || (isNew === true ? 'INSERT' : (isNew === false ? 'UPDATE' : (data.id ? 'UPDATE' : 'INSERT')));

            if (navigator.onLine && window.supabaseClient && cloudSaver) {
                try {
                    const result = await cloudSaver(data);
                    if (local) {
                        await this._removePendingItems(local, data.id, storeName);
                    }
                    return result;
                } catch (error) {
                    console.warn(`حفظ ${storeName} سحابياً فشل`, error);
                    await this._queueForSync(storeName, data);
                    return data;
                }
            } else {
                await this._queueForSync(storeName, data);
                return data;
            }
        },

        async _removePendingItems(local, refId, table) {
            try {
                const queue = await local.getSyncQueue().catch(() => []);
                const toRemove = queue.filter(q => q.table === table && q.ref_id === refId);
                for (const item of toRemove) {
                    await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                }
            } catch (e) {}
        },

        async _backgroundSync(storeName, cloudFetcher, local) {
            if (this._syncingStores.has(storeName)) return;
            this._syncingStores.add(storeName);
            try {
                if (window.SyncEngine) {
                    await window.SyncEngine.processQueue().catch(() => {});
                }
                const cloudData = await cloudFetcher();
                if (cloudData && cloudData.length > 0) {
                    await this._deltaSync(local, storeName, cloudData);
                    const session = window.SessionStore;
                    if (session) session.setCache(`offline_${storeName}`, cloudData);
                }
            } catch (e) {
            } finally {
                this._syncingStores.delete(storeName);
            }
        },

        async _deltaSync(local, storeName, cloudData) {
            const localItems = await local.getAll(storeName).catch(() => []);
            const localMap = new Map(localItems.map(i => [i.id, i]));
            const toPut = [];
            const toDelete = new Set(localMap.keys());

            const syncQueue = await local.getSyncQueue().catch(() => []);
            const pendingIds = new Set(syncQueue.filter(q => q.table === storeName).map(q => q.ref_id));

            for (const cloudItem of cloudData) {
                toDelete.delete(cloudItem.id);
                const localItem = localMap.get(cloudItem.id);
                const cloudTs = cloudItem.updated_at ? new Date(cloudItem.updated_at).getTime() : 0;
                const localTs = localItem?.updated_at ? new Date(localItem.updated_at).getTime() : 0;
                if (!localItem || cloudTs >= localTs) {
                    toPut.push(cloudItem);
                }
            }

            for (const id of toDelete) {
                if (pendingIds.has(id)) continue;
                const localItem = localMap.get(id);
                if (localItem && localItem._operation === 'INSERT') continue;
                await local.delete(storeName, id).catch(() => {});
            }

            for (let i = 0; i < toPut.length; i += 30) {
                const batch = toPut.slice(i, i + 30);
                await Promise.all(batch.map(item => local.put(storeName, item).catch(() => {})));
            }
        },

        async _queueForSync(table, data) {
            const local = await getLocalDB();
            if (!local || typeof local.addToSyncQueue !== 'function') return;

            try {
                const existing = await local.getSyncQueue().catch(() => []);
                const duplicate = existing.find(q => q.table === table && q.ref_id === data.id && !q.failed);
                if (duplicate) {
                    duplicate.data = { ...data };
                    duplicate.timestamp = Date.now();
                    duplicate.retries = 0;
                    if (local.updateSyncQueueItem) {
                        await local.updateSyncQueueItem(duplicate);
                        return;
                    } else {
                        await local.removeFromSyncQueue(duplicate.queue_id).catch(() => {});
                    }
                }
            } catch (e) {}

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
            return entry.queue_id;
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

    const SyncEngine = {
        _processing: false,
        _maxRetries: 5,
        _baseDelay: 1000,

        async processQueue() {
            if (this._processing) return;
            if (!navigator.onLine) {
                this._scheduleRetry(30000);
                return;
            }
            const local = window.localDB;
            if (!local?.ready) {
                this._scheduleRetry(5000);
                return;
            }
            if (!window.DB) {
                this._scheduleRetry(5000);
                return;
            }

            this._processing = true;
            try {
                const allItems = await local.getSyncQueue().catch(() => []);
                const queue = allItems.filter(item => {
                    if (item.failed) return false;
                    if (item.nextRetry && item.nextRetry > Date.now()) return false;
                    return true;
                });

                if (!queue.length) return;

                const CONCURRENT = 5;
                for (let i = 0; i < queue.length; i += CONCURRENT) {
                    const batch = queue.slice(i, i + CONCURRENT);
                    await Promise.allSettled(batch.map(item => this._processItem(item, local)));
                }
            } catch (e) {
                console.error('فشل معالجة الطابور:', e);
            } finally {
                this._processing = false;
            }
        },

        async _processItem(item, local) {
            try {
                if (!window.DB) throw new Error('DB غير متوفر');

                if (item.checksum && item.data) {
                    const currentChecksum = OfflineLayer._simpleChecksum(JSON.stringify(item.data));
                    if (currentChecksum !== item.checksum) {
                        console.error('تلاعب في الطابور:', item);
                        await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                        return;
                    }
                }

                if (item.type === 'DELETE') {
                    await this._handleDelete(item, local);
                } else {
                    await this._handleUpsert(item, local);
                }

                await local.removeFromSyncQueue(item.queue_id).catch(() => {});
            } catch (error) {
                console.warn(`فشلت مزامنة العملية (${item.table}/${item.ref_id}):`, error);
                item.retries = (item.retries || 0) + 1;
                if (item.retries >= this._maxRetries) {
                    item.failed = true;
                } else {
                    item.nextRetry = Date.now() + this._baseDelay * Math.pow(2, item.retries);
                }
                if (local.updateSyncQueueItem) {
                    await local.updateSyncQueueItem(item).catch(() => {});
                }
            }
        },

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
            }
        },

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
            }
        },

        _scheduleRetry(delay) {
            clearTimeout(this._retryTimer);
            this._retryTimer = setTimeout(() => this.processQueue(), delay);
        }
    };

    window.SyncEngine = SyncEngine;

    window.addEventListener('online', () => {
        SyncEngine.processQueue();
    });

    if (navigator.onLine) {
        setTimeout(() => SyncEngine.processQueue(), 1500);
    }
})();
