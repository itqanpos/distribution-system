/* =============================================
   db-local.js - قاعدة البيانات المحلية IndexedDB
   الإصدار 3.0 - متوافق مع OfflineLayer الجديد
   ============================================= */
(function() {
    const DB_NAME = 'hesaby_db';
    const DB_VERSION = 8;

    const storeConfig = {
        products: { keyPath: 'id' },
        parties: { keyPath: 'id' },
        reps: { keyPath: 'id' },
        invoices: { keyPath: 'id' },
        purchases: { keyPath: 'id' },
        transactions: { keyPath: 'id' },
        returns: { keyPath: 'id' },
        settings: { keyPath: 'id' },
        sync_queue: { keyPath: 'queue_id' },
        journal_entries: { keyPath: 'id' },
        accounts: { keyPath: 'id' }
    };

    class LocalDB {
        constructor() {
            this.db = null;
            this.ready = false;
            this.initPromise = this.init();
        }

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    Object.entries(storeConfig).forEach(([name, config]) => {
                        if (!db.objectStoreNames.contains(name)) {
                            const store = db.createObjectStore(name, { keyPath: config.keyPath });
                            if (name === 'sync_queue') {
                                store.createIndex('ref_id', 'ref_id', { unique: false });
                                store.createIndex('table', 'table', { unique: false });
                            }
                            if (name === 'invoices' || name === 'purchases' || name === 'transactions') {
                                store.createIndex('tenant_id', 'tenant_id', { unique: false });
                            }
                        }
                    });
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.ready = true;
                    console.log('✅ IndexedDB جاهز');
                    resolve(this);
                };
                request.onerror = (event) => reject(event.target.error);
            });
        }

        async _ensureReady() { if (!this.ready) await this.initPromise; }

        // العمليات الأساسية
        async getById(storeName, id) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async getAll(storeName) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async put(storeName, data) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.put(data);
                request.onsuccess = () => resolve(data);
                request.onerror = (event) => reject(event.target.error);
            });
        }

        async delete(storeName, id) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
            });
        }

        async clear(storeName) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
            });
        }

        // دوال خاصة بطابور المزامنة
        async addToSyncQueue(entry) {
            await this._ensureReady();
            return this.put('sync_queue', entry);
        }

        async removeFromSyncQueue(id) {
            await this._ensureReady();
            return this.delete('sync_queue', id);
        }

        async getSyncQueue() {
            await this._ensureReady();
            return this.getAll('sync_queue');
        }

        async updateSyncQueueItem(item) {
            await this._ensureReady();
            return this.put('sync_queue', item);
        }

        async findQueueByRef(refId, table) {
            await this._ensureReady();
            return new Promise((resolve) => {
                const tx = this.db.transaction('sync_queue', 'readonly');
                const store = tx.objectStore('sync_queue');
                const index = store.index('ref_id');
                const request = index.openCursor(refId);
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.table === table) {
                            resolve(cursor.value);
                            return;
                        }
                        cursor.continue();
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            });
        }
    }

    window.localDB = new LocalDB();
})();
