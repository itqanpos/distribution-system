/* =============================================
   db-local.js - قاعدة البيانات المحلية IndexedDB
   الإصدار 2.1 - إصلاحات أمنية، طابع زمني، ترقية آمنة
   ============================================= */
(function() {
    const DB_NAME = 'hesaby_db';
    const DB_VERSION = 6; // زدنا الإصدار للتحديث

    // تعريف المتاجر مع مفاتيحها الأساسية
    const storeConfig = {
        products: { keyPath: 'id' },
        parties: { keyPath: 'id' },
        reps: { keyPath: 'id' },
        invoices: { keyPath: 'id' },
        purchases: { keyPath: 'id' },
        transactions: { keyPath: 'id' },
        returns: { keyPath: 'id' },
        settings: { keyPath: 'id' },
        sync_queue: { keyPath: 'id' },
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
                    console.log(`🔄 تحديث IndexedDB من الإصدار ${event.oldVersion} إلى ${DB_VERSION}`);

                    // إنشاء المتاجر المفقودة فقط، لا تحذف القديمة
                    Object.entries(storeConfig).forEach(([name, config]) => {
                        if (!db.objectStoreNames.contains(name)) {
                            const store = db.createObjectStore(name, { keyPath: config.keyPath });
                            // فهارس مساعدة
                            if (name === 'sync_queue') {
                                store.createIndex('timestamp', 'timestamp', { unique: false });
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

                request.onerror = (event) => {
                    const error = event.target.error;
                    console.error('❌ فشل فتح IndexedDB:', error);
                    reject(error);
                };
            });
        }

        async _ensureReady() {
            if (!this.ready) await this.initPromise;
        }

        // --- عمليات أساسية ---
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
            // توليد id تلقائي لأي عنصر لا يحمله
            const dataToStore = { ...data };
            if (!dataToStore.id) {
                if (storeName === 'settings') {
                    dataToStore.id = 'main';
                } else {
                    dataToStore.id = this._generateId();
                }
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.put(dataToStore);
                request.onsuccess = () => resolve(dataToStore);
                request.onerror = (event) => {
                    console.error(`❌ فشل تخزين ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async delete(storeName, id) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = (event) => {
                    console.error(`❌ فشل حذف ${storeName}[${id}]:`, event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async clear(storeName) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = (event) => {
                    console.error(`❌ فشل مسح ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
            });
        }

        // --- طابور المزامنة ---
        async addToSyncQueue(entry) {
            await this._ensureReady();
            const queueEntry = {
                id: this._generateId(),
                type: entry.type,
                table: entry.table,
                data: { ...entry.data }, // نسخة كاملة (بدون حذف tenant_id)
                timestamp: Date.now(),    // طابع زمني للفرز في sync.js
                created_at: new Date().toISOString(),
                retries: 0
            };
            // لا نحذف tenant_id هنا؛ sync.js سيتعامل معه بالاعتماد على الجلسة
            return this.put('sync_queue', queueEntry);
        }

        async removeFromSyncQueue(id) {
            await this._ensureReady();
            try {
                await this.delete('sync_queue', id);
                console.log(`🗑️ أزيلت من الطابور: ${id}`);
            } catch (e) {
                console.warn(`فشل إزالة ${id} من طابور المزامنة:`, e);
            }
        }

        async getSyncQueue() {
            return this.getAll('sync_queue');
        }

        // --- مساعدة ---
        _generateId() {
            // استخدام crypto.randomUUID إن توفر، وإلا توليد بسيط
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        }
    }

    window.localDB = new LocalDB();
})();
