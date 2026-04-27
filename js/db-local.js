// js/db-local.js - تخزين محلي باستخدام IndexedDB
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
        
        // إنشاء مخازن للكائنات (Object Stores)
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('parties')) {
          db.createObjectStore('parties', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('invoices')) {
          db.createObjectStore('invoices', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('purchases')) {
          db.createObjectStore('purchases', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('transactions')) {
          db.createObjectStore('transactions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.ready = true;
        resolve(this.db);
      };
      
      request.onerror = (event) => {
        console.error('خطأ في فتح IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async ensureReady() {
    if (!this.ready) await this.initPromise;
  }

  // دوال عامة للقراءة والكتابة
  async getAll(storeName) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
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
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // طابور المزامنة
  async addToSyncQueue(action) {
    await this.ensureReady();
    return this.put('sync_queue', {
      ...action,
      timestamp: new Date().toISOString()
    });
  }

  async getSyncQueue() {
    return this.getAll('sync_queue');
  }

  async clearSyncQueue() {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// إنشاء نسخة عامة
window.localDB = new LocalDB();
