/* =============================================
   db-local.js - قاعدة البيانات المحلية IndexedDB
   الإصدار 4.0 - تحسينات شاملة (ترقية مرنة، كتابة متسلسلة، معالجة أخطاء)
   ============================================= */
(function () {
    const DB_NAME = 'hesaby_db';
    const DB_VERSION = 9; // زيادة الإصدار لتطبيق الترقية الجديدة

    // تكوين المخازن مع مؤشراتها
    const storeConfig = {
        products: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        parties: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        reps: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        invoices: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } },
                { name: 'status', keyPath: 'status', options: { unique: false } }
            ]
        },
        purchases: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        transactions: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        returns: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        settings: {
            keyPath: 'id'
        },
        sync_queue: {
            keyPath: 'queue_id',
            indexes: [
                { name: 'ref_id', keyPath: 'ref_id', options: { unique: false } },
                { name: 'table', keyPath: 'table', options: { unique: false } },
                // مؤشر مركب جديد لدعم بحث أسرع (اختياري)
                { name: 'ref_table', keyPath: ['ref_id', 'table'], options: { unique: false } }
            ]
        },
        journal_entries: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        accounts: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        },
        offline_sales: {
            keyPath: 'id',
            indexes: [
                { name: 'tenant_id', keyPath: 'tenant_id', options: { unique: false } }
            ]
        }
    };

    class LocalDB {
        constructor() {
            this.db = null;
            this.ready = false;
            this._writeQueue = Promise.resolve(); // لضمان تسلسل الكتابة
            this.initPromise = this._initWithRetry();
        }

        // تهيئة مع إعادة المحاولة التلقائية
        async _initWithRetry(maxRetries = 3, delayMs = 1000) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await this._openDB();
                    console.log('✅ IndexedDB جاهز');
                    this.ready = true;
                    return this;
                } catch (error) {
                    console.error(`فشل فتح IndexedDB (محاولة ${attempt}/${maxRetries}):`, error);
                    if (attempt === maxRetries) {
                        // إعلام المستخدم بالخطأ
                        if (window.Toast) {
                            window.Toast.error('فشل فتح قاعدة البيانات المحلية. يرجى التحقق من مساحة التخزين أو إعادة تحميل الصفحة.');
                        }
                        throw new Error('تعذر فتح قاعدة البيانات المحلية بعد عدة محاولات');
                    }
                    await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
                }
            }
        }

        _openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const oldVersion = event.oldVersion;
                    console.log(`ترقية IndexedDB من إصدار ${oldVersion} إلى ${DB_VERSION}`);

                    // إنشاء أو تحديث المخازن
                    Object.entries(storeConfig).forEach(([storeName, config]) => {
                        let store;
                        if (!db.objectStoreNames.contains(storeName)) {
                            // إنشاء مخزن جديد
                            store = db.createObjectStore(storeName, { keyPath: config.keyPath });
                            // إنشاء المؤشرات الأولية
                            (config.indexes || []).forEach(idx => {
                                store.createIndex(idx.name, idx.keyPath, idx.options);
                            });
                        } else {
                            // المخزن موجود، نضيف فقط المؤشرات الجديدة (غير الموجودة)
                            store = request.transaction.objectStore(storeName);
                            const existingIndexes = Array.from(store.indexNames);
                            (config.indexes || []).forEach(idx => {
                                if (!existingIndexes.includes(idx.name)) {
                                    store.createIndex(idx.name, idx.keyPath, idx.options);
                                }
                            });
                        }
                    });
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve();
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }

        async _ensureReady() {
            if (!this.ready) await this.initPromise;
        }

        // إضافة عملية كتابة إلى قائمة الانتظار المتسلسلة
        _enqueueWrite(operation) {
            this._writeQueue = this._writeQueue.then(operation).catch(err => {
                console.error('خطأ في عملية الكتابة المتسلسلة:', err);
                throw err;
            });
            return this._writeQueue;
        }

        // ========== العمليات الأساسية ==========

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

        // دالة pagination جديدة
        async getAllPaginated(storeName, offset = 0, limit = 50) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const results = [];
                let advanced = false;
                const request = store.openCursor();
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) {
                        resolve(results);
                        return;
                    }
                    if (!advanced && offset > 0) {
                        // تخطي العناصر الأولى
                        let skipped = 0;
                        const skip = () => {
                            if (skipped < offset && cursor) {
                                skipped++;
                                cursor.continue();
                            } else {
                                advanced = true;
                                if (cursor) handleRecord();
                            }
                        };
                        skip();
                        return;
                    }
                    handleRecord();
                    function handleRecord() {
                        if (results.length < limit) {
                            results.push(cursor.value);
                            cursor.continue();
                        } else {
                            resolve(results);
                        }
                    }
                };
                request.onerror = () => reject(request.error);
            });
        }

        async count(storeName) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async put(storeName, data) {
            await this._ensureReady();
            return this._enqueueWrite(() => {
                return new Promise((resolve, reject) => {
                    // التحقق من وجود keyPath
                    const config = storeConfig[storeName];
                    if (config && config.keyPath && !(config.keyPath in data)) {
                        reject(new Error(`البيانات المُدخلة لا تحتوي على المفتاح المطلوب '${config.keyPath}'`));
                        return;
                    }
                    const tx = this.db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const request = store.put(data);
                    request.onsuccess = () => resolve(data);
                    request.onerror = (event) => reject(event.target.error);
                });
            });
        }

        async delete(storeName, id) {
            await this._ensureReady();
            return this._enqueueWrite(() => {
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const request = store.delete(id);
                    request.onsuccess = () => resolve();
                    request.onerror = (event) => reject(event.target.error);
                });
            });
        }

        async clear(storeName) {
            await this._ensureReady();
            return this._enqueueWrite(() => {
                return new Promise((resolve, reject) => {
                    if (!this.db.objectStoreNames.contains(storeName)) {
                        reject(new Error(`المخزن '${storeName}' غير موجود`));
                        return;
                    }
                    const tx = this.db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = (event) => reject(event.target.error);
                });
            });
        }

        // ========== استعلام بواسطة مؤشر ==========

        async getByIndex(storeName, indexName, value) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                if (!store.indexNames.contains(indexName)) {
                    reject(new Error(`المؤشر '${indexName}' غير موجود في المخزن '${storeName}'`));
                    return;
                }
                const index = store.index(indexName);
                const request = index.getAll(value);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        // ========== دوال خاصة بطابور المزامنة ==========

        async addToSyncQueue(entry) {
            // توليد queue_id إذا لم يكن موجوداً
            if (!entry.queue_id) {
                entry.queue_id = this._generateId();
            }
            return this.put('sync_queue', entry);
        }

        async removeFromSyncQueue(id) {
            return this.delete('sync_queue', id);
        }

        async getSyncQueue() {
            return this.getAll('sync_queue');
        }

        async updateSyncQueueItem(item) {
            return this.put('sync_queue', item);
        }

        // البحث عن جميع السجلات المرتبطة بـ ref_id و table
        async findQueueByRef(refId, table) {
            await this._ensureReady();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('sync_queue', 'readonly');
                const store = tx.objectStore('sync_queue');
                // استخدام المؤشر المركب الجديد إن وُجد، وإلا الطريقة القديمة
                if (store.indexNames.contains('ref_table')) {
                    const index = store.index('ref_table');
                    const range = IDBKeyRange.only([refId, table]);
                    const request = index.getAll(range);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                } else {
                    // fallback: البحث باستخدام ref_id فقط ثم تصفية
                    const index = store.index('ref_id');
                    const request = index.getAll(refId);
                    request.onsuccess = () => {
                        const results = request.result.filter(item => item.table === table);
                        resolve(results);
                    };
                    request.onerror = () => reject(request.error);
                }
            });
        }

        _generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        }
    }

    window.localDB = new LocalDB();
})();
