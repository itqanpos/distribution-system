/* =============================================
   db-local.js - قاعدة البيانات المحلية IndexedDB
   الإصدار 2.0 - متوافق مع العزل الأمني وطابور المزامنة
   ============================================= */
(function() {
    const DB_NAME = 'hesaby_db';
    const DB_VERSION = 5; // زدنا الإصدار لإعادة إنشاء المتاجر

    // تعريف المتاجر مع مفاتيحها الأساسية
    const storeConfig = {
        products: { keyPath: 'id' },
        parties: { keyPath: 'id' },
        reps: { keyPath: 'id' },
        invoices: { keyPath: 'id' },
        purchases: { keyPath: 'id' },
        transactions: { keyPath: 'id' },
        returns: { keyPath: 'id' },
        settings: { keyPath: 'id' }, // سنستخدم id='main' محلياً ونتجاهل tenant_id هنا
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
                    const oldVersion = event.oldVersion;

                    // حذف المتاجر القديمة إن وُجدت (ترقية نظيفة)
                    Array.from(db.objectStoreNames).forEach(name => {
                        if (!storeConfig[name]) {
                            db.deleteObjectStore(name);
                        }
                    });

                    // إنشاء المتاجر حسب التكوين الجديد
                    Object.entries(storeConfig).forEach(([name, config]) => {
                        if (!db.objectStoreNames.contains(name)) {
                            const store = db.createObjectStore(name, { keyPath: config.keyPath });
                            // إضافة فهارس مساعدة
                            if (name === 'sync_queue') {
                                store.createIndex('created_at', 'created_at', { unique: false });
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
                    console.error('❌ فشل فتح IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async _ensureReady() {
            if (!this.ready) await this.initPromise;
        }

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
            // تأكد من وجود id، وتوليده إن لزم (باستثناء settings التي نستخدم id='main')
            if (!data.id) {
                if (storeName === 'settings') {
                    data.id = 'main'; // مفتاح ثابت للإعدادات المحلية
                } else {
                    data.id = crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now();
                }
            }
            // إزالة tenant_id من البيانات المخزنة في sync_queue (للأمان)
            const cleanData = storeName === 'sync_queue' ? { ...data, data: { ...data.data } } : data;
            if (storeName === 'sync_queue' && cleanData.data?.tenant_id) {
                delete cleanData.data.tenant_id;
            }

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.put(cleanData);
                request.onsuccess = () => resolve(cleanData);
                request.onerror = () => reject(request.error);
            });
        }

        async delete(storeName, id) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async clear(storeName) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        // إضافة عنصر لطابور المزامنة
        async addToSyncQueue(entry) {
            await this._ensureReady();
            const queueEntry = {
                id: crypto.randomUUID ? crypto.randomUUID() : 'q-' + Date.now(),
                type: entry.type,
                table: entry.table,
                data: { ...entry.data }, // نسخة لتجنب التعديلات غير المقصودة
                created_at: new Date().toISOString(),
                retries: 0
            };
            // إزالة tenant_id من البيانات المخزنة (مبدأ أمان)
            if (queueEntry.data.tenant_id) {
                delete queueEntry.data.tenant_id;
            }
            return this.put('sync_queue', queueEntry);
        }

        // حذف عنصر من طابور المزامنة (يُستدعى بعد المزامنة الناجحة)
        async removeFromSyncQueue(id) {
            return this.delete('sync_queue', id);
        }

        // جلب كل عناصر الطابور (اختياري، لتشخيص المشاكل)
        async getSyncQueue() {
            return this.getAll('sync_queue');
        }
    }

    window.localDB = new LocalDB();
})();
