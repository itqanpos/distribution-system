/* =============================================
   db-local.js - IndexedDB Wrapper (UX/Touch Enhanced)
   ============================================= */
const DB_NAME = 'hesaby_offline_db';
const DB_VERSION = 1;

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
                const stores = ['products', 'parties', 'invoices', 'purchases', 'transactions', 'settings', 'returns', 'sync_queue'];
                stores.forEach(store => {
                    if (!db.objectStoreNames.contains(store)) {
                        db.createObjectStore(store, { keyPath: 'id' });
                    }
                });
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.ready = true;
                resolve(this.db);
            };
            
            request.onerror = (event) => {
                console.error('فشل فتح IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async ensureReady() {
        if (!this.ready) await this.initPromise;
    }

    async getAll(storeName) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains(storeName)) {
                return resolve([]);
            }
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getById(storeName, id) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains(storeName)) {
                return resolve(null);
            }
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, item) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains(storeName)) {
                return resolve(null);
            }
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const cleaned = { ...item };
            delete cleaned.updated_at;
            const request = store.put(cleaned);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains(storeName)) {
                return resolve();
            }
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async addToSyncQueue(action) {
        await this.ensureReady();
        const item = { ...action, id: Date.now().toString() + Math.random().toString(36).substr(2, 5), timestamp: new Date().toISOString() };
        return this.put('sync_queue', item);
    }

    async getSyncQueue() {
        return this.getAll('sync_queue');
    }

    async clearSyncQueue() {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('sync_queue')) return resolve();
            const transaction = this.db.transaction('sync_queue', 'readwrite');
            const store = transaction.objectStore('sync_queue');
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

window.localDB = new LocalDB();
