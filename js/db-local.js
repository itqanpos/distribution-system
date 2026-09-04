/* =============================================
   db-local.js - Local Database Layer (IndexedDB)
   ============================================= */
(function() {
    'use strict';

    const DB_NAME = 'hesaby_local';
    const DB_VERSION = 1;

    // Stores (Object Stores)
    const STORES = [
        'products',
        'parties',
        'invoices',
        'purchases',
        'transactions',
        'returns',
        'journal_entries',
        'accounts',
        'settings',
        'offline_sales',
        'sync_queue'
    ];

    let dbInstance = null;
    let dbReady = false;
    let initPromise = null;

    // ========== تهيئة قاعدة البيانات ==========
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // إنشاء Object Stores إذا لم تكن موجودة
                STORES.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
                        // إنشاء فهارس للبحث السريع
                        if (storeName === 'sync_queue') {
                            store.createIndex('queue_id', 'queue_id', { unique: true });
                            store.createIndex('table', 'table', { unique: false });
                            store.createIndex('ref_id', 'ref_id', { unique: false });
                        } else if (storeName === 'products' || storeName === 'parties') {
                            store.createIndex('tenant_id', 'tenant_id', { unique: false });
                            store.createIndex('barcode', 'barcode', { unique: false });
                        } else if (storeName === 'invoices' || storeName === 'purchases') {
                            store.createIndex('invoice_number', 'invoice_number', { unique: false });
                            store.createIndex('date', 'date', { unique: false });
                            store.createIndex('status', 'status', { unique: false });
                        }
                    }
                });
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                dbReady = true;
                resolve(dbInstance);
            };

            request.onerror = (event) => {
                console.error('IndexedDB open failed:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // ========== طبقة الوصول ==========
    const localDB = {
        ready: false,
        initPromise: null,

        async init() {
            if (dbReady) {
                this.ready = true;
                return true;
            }
            if (this.initPromise) return this.initPromise;
            this.initPromise = openDB().then(() => {
                this.ready = true;
                return true;
            }).catch(err => {
                console.error('localDB init failed:', err);
                this.ready = false;
                throw err;
            });
            return this.initPromise;
        },

        // ========== عمليات عامة ==========
        async put(storeName, data) {
            if (!dbReady) await this.init();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.put(data);
                request.onsuccess = () => resolve(data);
                request.onerror = () => reject(request.error);
            });
        },

        async get(storeName, id) {
            if (!dbReady) await this.init();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async getAll(storeName) {
            if (!dbReady) await this.init();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        async delete(storeName, id) {
            if (!dbReady) await this.init();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        },

        async clear(storeName) {
            if (!dbReady) await this.init();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        },

        // ========== طابور المزامنة ==========
        async addToSyncQueue(entry) {
            if (!dbReady) await this.init();
            return this.put('sync_queue', entry);
        },

        async getSyncQueue() {
            if (!dbReady) await this.init();
            return this.getAll('sync_queue');
        },

        async updateSyncQueueItem(item) {
            if (!dbReady) await this.init();
            return this.put('sync_queue', item);
        },

        async removeFromSyncQueue(queueId) {
            if (!dbReady) await this.init();
            return this.delete('sync_queue', queueId);
        },

        async findQueueByRef(refId, table) {
            if (!dbReady) await this.init();
            const queue = await this.getSyncQueue();
            return queue.filter(q => q.ref_id === refId && q.table === table);
        },

        // ========== دوال مساعدة ==========
        async clearAll() {
            if (!dbReady) await this.init();
            for (const storeName of STORES) {
                await this.clear(storeName);
            }
            return true;
        },

        async getById(storeName, id) {
            return this.get(storeName, id);
        },

        async count(storeName) {
            if (!dbReady) await this.init();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
    };

    // تهيئة أولية
    localDB.initPromise = localDB.init().catch(() => {});
    localDB.ready = dbReady;

    // تعريض للاستخدام العام
    window.localDB = localDB;

    // إعادة المحاولة إذا فشلت التهيئة الأولية
    if (!dbReady) {
        setTimeout(() => {
            if (!dbReady) {
                localDB.init().catch(() => {});
            }
        }, 2000);
    }
})();
