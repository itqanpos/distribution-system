/* =============================================
   db-local.js - قاعدة البيانات المحلية IndexedDB
   ============================================= */
(function() {
    const DB_NAME = 'hesaby_db';
    const DB_VERSION = 4;

    // قائمة المتاجر (Object Stores)
    const stores = [
        'products', 'parties', 'reps', 'invoices', 'purchases',
        'transactions', 'returns', 'settings', 'sync_queue',
        'journal_entries', 'accounts'
    ];

    class LocalDB {
        constructor() {
            this.db = null;
            this.ready = false;
            this.init();
        }

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    stores.forEach(storeName => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            db.createObjectStore(storeName, { keyPath: 'id' });
                        }
                    });
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.ready = true;
                    console.log('✅ IndexedDB جاهز');
                    resolve(this);
                };

                request.onerror = (event) => {
                    console.error('❌ فشل فتح IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async getById(storeName, id) {
            if (!this.ready) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async getAll(storeName) {
            if (!this.ready) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async put(storeName, data) {
            if (!this.ready) await this.init();
            if (!data.id) data.id = crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);
                request.onsuccess = () => resolve(data);
                request.onerror = () => reject(request.error);
            });
        }

        async delete(storeName, id) {
            if (!this.ready) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async clear(storeName) {
            if (!this.ready) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async addToSyncQueue(entry) {
            if (!this.ready) await this.init();
            const queueEntry = {
                id: crypto.randomUUID ? crypto.randomUUID() : 'q-' + Date.now(),
                ...entry,
                created_at: new Date().toISOString()
            };
            return this.put('sync_queue', queueEntry);
        }
    }

    // إنشاء كائن عام
    window.localDB = new LocalDB();
})();
