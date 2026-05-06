/* =============================================
   sync.js - نظام المزامنة (UX/Touch Enhanced)
   ============================================= */
const SyncManager = {
    isSyncing: false,
    lastSync: null,
    
    init() {
        this.listenToNetworkChanges();
        this.createSyncIndicator();
        console.log('✅ نظام المزامنة جاهز');
    },
    
    listenToNetworkChanges() {
        window.addEventListener('online', () => {
            this.showSyncIndicator('تم استعادة الاتصال - جاري المزامنة...', 'info');
            this.syncAll();
        });
        
        window.addEventListener('offline', () => {
            this.showSyncIndicator('غير متصل - البيانات محفوظة محلياً', 'offline');
        });
    },
    
    createSyncIndicator() {
        // إنشاء شريط حالة المزامنة
        const indicator = document.createElement('div');
        indicator.id = 'syncIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            padding: 8px 16px;
            text-align: center;
            font-weight: 600;
            font-size: 13px;
            z-index: 9999;
            transform: translateY(-100%);
            transition: transform 0.3s ease;
            pointer-events: none;
            font-family: 'Segoe UI', Tahoma, sans-serif;
        `;
        document.body.appendChild(indicator);
    },
    
    showSyncIndicator(message, type = 'info') {
        const indicator = document.getElementById('syncIndicator');
        if (!indicator) return;
        
        const colors = {
            info: { bg: '#3b82f6', color: 'white' },
            success: { bg: '#10b981', color: 'white' },
            offline: { bg: '#ef4444', color: 'white' },
            error: { bg: '#f59e0b', color: 'white' }
        };
        
        const c = colors[type] || colors.info;
        indicator.style.background = c.bg;
        indicator.style.color = c.color;
        indicator.textContent = message;
        indicator.style.transform = 'translateY(0)';
        
        // إخفاء بعد 3 ثوانٍ (لرسائل النجاح فقط)
        if (type === 'success') {
            setTimeout(() => {
                indicator.style.transform = 'translateY(-100%)';
            }, 3000);
        }
    },
    
    hideSyncIndicator() {
        const indicator = document.getElementById('syncIndicator');
        if (indicator) {
            indicator.style.transform = 'translateY(-100%)';
        }
    },
    
    isOnline() {
        return navigator.onLine;
    },
    
    async syncAll() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        
        try {
            if (!window.localDB || !window.localDB.ready) {
                await window.localDB?.initPromise;
            }
            
            const queue = await window.localDB.getSyncQueue();
            if (!queue || !queue.length) {
                this.showSyncIndicator('جميع البيانات متزامنة ✓', 'success');
                this.isSyncing = false;
                return;
            }
            
            this.showSyncIndicator(`جاري مزامنة ${queue.length} عمليات...`, 'info');
            
            let successCount = 0;
            let failCount = 0;
            
            for (const action of queue) {
                try {
                    await this.processAction(action);
                    successCount++;
                } catch (error) {
                    console.error(`فشلت معالجة العملية:`, action, error);
                    failCount++;
                    // ترك العملية الفاشلة في الطابور
                }
            }
            
            // حذف العمليات الناجحة فقط
            if (successCount > 0) {
                const remaining = queue.filter((_, index) => index >= successCount);
                await window.localDB.clearSyncQueue();
                for (const item of remaining) {
                    await window.localDB.addToSyncQueue(item);
                }
            }
            
            this.lastSync = new Date();
            
            if (failCount === 0) {
                this.showSyncIndicator('✅ تمت المزامنة بنجاح', 'success');
                // إشعار الصفحات
                window.dispatchEvent(new CustomEvent('sync-complete', { detail: { success: successCount, failed: failCount } }));
            } else {
                this.showSyncIndicator(`تمت مزامنة ${successCount}، فشلت ${failCount}`, 'error');
            }
            
        } catch (error) {
            console.error('فشل المزامنة:', error);
            this.showSyncIndicator('فشل المزامنة - إعادة المحاولة لاحقاً', 'error');
        } finally {
            this.isSyncing = false;
        }
    },
    
    async processAction(action) {
        if (!window.DB) throw new Error('DB غير متوفر');
        
        const { type, table, data } = action;
        
        switch (type) {
            case 'INSERT':
                if (table === 'products') return await DB.saveProduct(data);
                if (table === 'parties') return await DB.saveParty(data);
                if (table === 'invoices') return await DB.saveInvoice(data);
                if (table === 'purchases') return await DB.savePurchase(data);
                if (table === 'transactions') return await DB.saveTransaction(data);
                break;
            case 'UPDATE':
                if (table === 'products') return await DB.saveProduct(data);
                if (table === 'parties') return await DB.saveParty(data);
                if (table === 'invoices') return await DB.saveInvoice(data);
                if (table === 'purchases') return await DB.savePurchase(data);
                if (table === 'transactions') return await DB.saveTransaction(data);
                if (table === 'settings') return await DB.saveSettings(data);
                break;
            case 'DELETE':
                if (table === 'products') return await DB.deleteProduct(data.id);
                if (table === 'parties') return await DB.deleteParty(data.id);
                break;
        }
        throw new Error(`عملية غير معروفة: ${type} على ${table}`);
    }
};

// بدء التشغيل
window.addEventListener('DOMContentLoaded', () => {
    SyncManager.init();
});

window.syncManager = SyncManager;
