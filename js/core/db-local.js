/* =============================================
   db-local.js - IndexedDB Engine
   ============================================= */
(function() {
    'use strict';
    const DB_NAME = 'hesaby_offline_db';
    const DB_VERSION = 8;
    const STORES = [
        'products', 'parties', 'reps', 'invoices', 'purchases',
        'transactions', 'returns', 'journal_entries', 'accounts',
        'sync_queue', 'settings'
    ];

    let db = null;
    let ready = false;
    const pending = [];

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                for (const store of STORES) {
                    if (!db.objectStoreNames.contains(store)) {
                        const objectStore = db.createObjectStore(store, { keyPath: 'id' });
                        if (store === 'sync_queue') {
                            objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                        }
                    }
                }
            };
            request.onsuccess = (event) => {
                db = event.target.result;
                ready = true;
                resolve(db);
                // معالجة العمليات المعلقة
                while (pending.length) {
                    const { method, args, resolve: res, reject: rej } = pending.shift();
                    execDBMethod(method, args).then(res).catch(rej);
                }
            };
            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    function execDBMethod(method, args) {
        if (!ready) {
            return new Promise((resolve, reject) => {
                pending.push({ method, args, resolve, reject });
            });
        }
        const [storeName, ...rest] = args;
        const tx = db.transaction(storeName, method.startsWith('get') ? 'readonly' : 'readwrite');
        const store = tx.objectStore(storeName);
        if (method === 'getAll') {
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        } else if (method === 'get') {
            const key = rest[0];
            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } else if (method === 'put') {
            const item = rest[0];
            return new Promise((resolve, reject) => {
                const request = store.put(item);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } else if (method === 'delete') {
            const key = rest[0];
            return new Promise((resolve, reject) => {
                const request = store.delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } else if (method === 'clear') {
            return new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    const localDB = {
        ready: false,
        async init() {
            await openDB();
            this.ready = true;
            console.log('✅ IndexedDB ready');
        },
        getAll(storeName) { return execDBMethod('getAll', [storeName]); },
        get(storeName, id) { return execDBMethod('get', [storeName, id]); },
        put(storeName, item) { return execDBMethod('put', [storeName, item]); },
        delete(storeName, id) { return execDBMethod('delete', [storeName, id]); },
        clear(storeName) { return execDBMethod('clear', [storeName]); },

        // طابور المزامنة
        async getSyncQueue() {
            const all = await this.getAll('sync_queue');
            return all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        },
        async addToSyncQueue(operation) {
            operation.id = operation.id || crypto.randomUUID();
            operation.timestamp = Date.now();
            return this.put('sync_queue', operation);
        },
        async removeFromSyncQueue(id) {
            return this.delete('sync_queue', id);
        },
        async clearSyncQueue() {
            return this.clear('sync_queue');
        }
    };

    window.localDB = localDB;
    // التهيئة الفورية
    localDB.init().catch(e => console.error('فشل تهيئة IndexedDB:', e));
})();
