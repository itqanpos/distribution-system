/* =============================================
   db-local.js - IndexedDB Wrapper (نهائي 100%)
   ============================================= */
const DB_NAME = 'hesaby_offline_db';
const DB_VERSION = 1;

class LocalDB {
    constructor() {
        this.db = null;
        this.ready = false;
        this.initPromise = this._init();
    }

    async _init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const stores = [
                    'products', 'parties', 'invoices', 'purchases',
                    'transactions', 'settings', 'returns', 'sync_queue'
                ];
                stores.forEach(name => {
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name, { keyPath: 'id' });
                    }
                });
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.ready = true;
                console.log('✅ IndexedDB جاهز');
                resolve(this.db);
            };
            
            request.onerror = (event) => {
                console.error('❌ فشل فتح IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async _ensureReady() {
        if (!this.ready) await this.initPromise;
        if (!this.db) throw new Error('IndexedDB غير متوفر');
    }

    async getAll(storeName) {
        try {
            await this._ensureReady();
            return new Promise((resolve) => {
                if (!this.db.objectStoreNames.contains(storeName)) {
                    return resolve([]);
                }
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch (e) {
            console.warn(`فشل getAll من ${storeName}:`, e);
            return [];
        }
    }

    async getById(storeName, id) {
        try {
            await this._ensureReady();
            return new Promise((resolve) => {
                if (!this.db.objectStoreNames.contains(storeName)) {
                    return resolve(null);
                }
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            console.warn(`فشل getById من ${storeName}:`, e);
            return null;
        }
    }

    async put(storeName, item) {
        try {
            await this._ensureReady();
            return new Promise((resolve) => {
                if (!this.db.objectStoreNames.contains(storeName)) {
                    return resolve(null);
                }
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const clean = { ...item };
                delete clean.updated_at; // إزالة الحقل الذي قد لا يكون موجودًا
                const req = store.put(clean);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            console.warn(`فشل put في ${storeName}:`, e);
            return null;
        }
    }

    async delete(storeName, id) {
        try {
            await this._ensureReady();
            return new Promise((resolve) => {
                if (!this.db.objectStoreNames.contains(storeName)) {
                    return resolve();
                }
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
            });
        } catch (e) {
            console.warn(`فشل delete من ${storeName}:`, e);
        }
    }

    async addToSyncQueue(action) {
        const item = {
            ...action,
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString()
        };
        return this.put('sync_queue', item);
    }

    async getSyncQueue() {
        return this.getAll('sync_queue');
    }

    async clearSyncQueue() {
        try {
            await this._ensureReady();
            return new Promise((resolve) => {
                if (!this.db.objectStoreNames.contains('sync_queue')) {
                    return resolve();
                }
                const tx = this.db.transaction('sync_queue', 'readwrite');
                const store = tx.objectStore('sync_queue');
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
            });
        } catch (e) {
            console.warn('فشل مسح طابور المزامنة:', e);
        }
    }
}

window.localDB = new LocalDB();
