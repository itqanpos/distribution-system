/* =============================================
   supabase-offline.js - Offline + Sync Engine (محسّن)
   ============================================= */
(function() {
    'use strict';

    // ---------- UUID احتياطي ----------
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8)).toString(16);
        });
    }

    // ---------- الحصول على localDB بأمان ----------
    async function getLocalDB() {
        if (!window.localDB) return null;
        try {
            if (typeof window.localDB.initPromise !== 'undefined') {
                await window.localDB.initPromise;
            }
            return window.localDB.ready ? window.localDB : null;
        } catch (e) {
            console.warn('فشل تهيئة localDB', e);
            return null;
        }
    }

    function getSessionStore() {
        return window.SessionStore;
    }

    // ---------- طبقة OfflineLayer ----------
    const OfflineLayer = {
        _syncingStores: new Set(),

        async get(storeName, cloudFetcher, forceRefresh = false) {
            const local = await getLocalDB();
            const session = getSessionStore();
            const cacheKey = `offline_${storeName}`;

            if (forceRefresh && navigator.onLine && window.SyncEngine) {
                await window.SyncEngine.process().catch(() => {});
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
                    console.warn(`قراءة ${storeName} من IndexedDB فشلت`, e);
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
            if (!data.updated_at) {
                data.updated_at = new Date().toISOString();
            }
            data.version = (data.version || 0) + 1;

            if (local) {
                try {
                    await local.put(storeName, data);
                } catch (e) {
                    console.warn(`حفظ محلي فشل لـ ${storeName}`, e);
                }
            }

            const session = getSessionStore();
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
            if (typeof local.getSyncQueue !== 'function') return;
            try {
                const queue = await local.getSyncQueue().catch(() => []);
                const toRemove = queue.filter(
                    q => q.table === table && q.ref_id === refId
                );
                for (const item of toRemove) {
                    if (typeof local.removeFromSyncQueue === 'function') {
                        await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                    }
                }
            } catch (e) { /* تجاهل */ }
        },

        async _backgroundSync(storeName, cloudFetcher, local) {
            if (this._syncingStores.has(storeName)) return;
            this._syncingStores.add(storeName);
            try {
                if (window.SyncEngine) {
                    await window.SyncEngine.process().catch(() => {});
                }
                const cloudData = await cloudFetcher();
                if (cloudData && cloudData.length > 0) {
                    await this._deltaSync(local, storeName, cloudData);
                    const session = getSessionStore();
                    if (session) session.setCache(`offline_${storeName}`, cloudData);
                }
            } catch (e) {
                // فشل صامت
            } finally {
                this._syncingStores.delete(storeName);
            }
        },

        async _deltaSync(local, storeName, cloudData) {
            const localItems = await local.getAll(storeName).catch(() => []);
            const localMap = new Map(localItems.map(i => [i.id, i]));
            const toPut = [];
            const toDelete = new Set(localMap.keys());

            const syncQueue = await (typeof local.getSyncQueue === 'function' ? local.getSyncQueue().catch(() => []) : []);
            const pendingIds = new Set(
                syncQueue.filter(q => q.table === storeName).map(q => q.ref_id)
            );

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
                if (localItem && localItem._syncing) continue;
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
                const existing = await (typeof local.getSyncQueue === 'function' ? local.getSyncQueue().catch(() => []) : []);
                const duplicate = existing.find(
                    q => q.table === table && q.ref_id === data.id && !q.failed
                );
                if (duplicate) {
                    duplicate.data = { ...data };
                    duplicate.timestamp = Date.now();
                    duplicate.retries = 0;
                    if (typeof local.updateSyncQueueItem === 'function') {
                        await local.updateSyncQueueItem(duplicate);
                        return;
                    }
                    if (typeof local.removeFromSyncQueue === 'function') {
                        await local.removeFromSyncQueue(duplicate.queue_id).catch(() => {});
                    }
                }
            } catch (e) { /* تجاهل */ }

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

    // ========== محرك المزامنة ==========
    const SyncEngine = {
        _processing: false,

        async process() {
            if (this._processing) return;
            this._processing = true;

            const local = await getLocalDB();
            if (!local || !navigator.onLine || !window.supabaseClient) {
                this._processing = false;
                return;
            }

            try {
                if (typeof local.getSyncQueue !== 'function') {
                    this._processing = false;
                    return;
                }
                const allQueue = await local.getSyncQueue().catch(() => []);
                const queue = allQueue.filter(item =>
                    !item.failed && (!item.nextRetry || item.nextRetry <= Date.now())
                );

                if (!queue.length) {
                    this._processing = false;
                    return;
                }

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
            if (item.checksum && item.data) {
                const currentChecksum = OfflineLayer._simpleChecksum(JSON.stringify(item.data));
                if (currentChecksum !== item.checksum) {
                    console.error('⚠️ تلاعب في الطابور:', item);
                    if (typeof local.removeFromSyncQueue === 'function') {
                        await local.removeFromSyncQueue(item.queue_id).catch(() => {});
                    }
                    return;
                }
            }

            // دوال السحابة المجمعة
            const cloudHandlers = window.DB?._cloudHandlers || {};
            const handler = cloudHandlers[item.table] || cloudHandlers[item.type === 'DELETE' ? `delete_${item.table}` : item.table];

            if (!handler) {
                console.warn(`لا يوجد معالج للجدول ${item.table} (نوع ${item.type})`);
                return;
            }

            try {
                if (item.type === 'DELETE') {
                    await handler({ id: item.ref_id, deleted_at: new Date().toISOString() });
                } else {
                    await handler(item.data);
                }
                if (typeof local.removeFromSyncQueue === 'function') {
                    await local.removeFromSyncQueue(item.queue_id);
                }
            } catch (error) {
                console.warn(`فشل مزامنة ${item.table}`, error);
                item.retries = (item.retries || 0) + 1;
                if (item.retries >= 5) {
                    item.failed = true;
                } else {
                    item.nextRetry = Date.now() + Math.pow(2, item.retries) * 1000;
                }
                if (typeof local.updateSyncQueueItem === 'function') {
                    await local.updateSyncQueueItem(item).catch(() => {});
                }
            }
        }
    };

    // ربط الأحداث
    window.addEventListener('online', () => {
        setTimeout(() => SyncEngine.process(), 1000);
    });

    if (navigator.onLine) {
        setTimeout(() => SyncEngine.process(), 2000);
    }

    window.SyncEngine = SyncEngine;

    // بعد تحميل DB، نقوم بتعريف معالجات السحابة
    window.addEventListener('DBReady', () => {
        if (window.DB) {
            window.DB._cloudHandlers = {
                products: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('products').upsert(data, { onConflict: 'id' });
                },
                parties: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('parties').upsert(data, { onConflict: 'id' });
                },
                invoices: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('invoices').upsert(data, { onConflict: 'id' });
                },
                purchases: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('purchases').upsert(data, { onConflict: 'id' });
                },
                transactions: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('transactions').upsert(data, { onConflict: 'id' });
                },
                returns: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('returns').upsert(data, { onConflict: 'id' });
                },
                journal_entries: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('journal_entries').upsert(data, { onConflict: 'id' });
                },
                delete_products: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('products').update({ deleted_at: data.deleted_at }).eq('id', data.id);
                },
                delete_parties: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('parties').update({ deleted_at: data.deleted_at }).eq('id', data.id);
                },
                delete_invoices: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('invoices').update({ deleted_at: data.deleted_at }).eq('id', data.id);
                },
                delete_purchases: async (data) => {
                    const client = window.supabaseClient;
                    if (!client) throw new Error('غير متصل');
                    await client.from('purchases').update({ deleted_at: data.deleted_at }).eq('id', data.id);
                }
            };
        }
    });

    // إذا كانت DB جاهزة قبل هذا الحدث، نفعّلها فوراً
    if (window.DB) {
        window.dispatchEvent(new Event('DBReady'));
    }

})();
