/* =============================================
   sync.js - مزامنة البيانات مع السحابة
   ============================================= */
(function() {
    const SYNC_INTERVAL = 30000; // كل 30 ثانية

    class SyncManager {
        constructor() {
            this.syncing = false;
            this.init();
        }

        init() {
            // بدء المزامنة الدورية عند الاتصال بالإنترنت
            window.addEventListener('online', () => {
                console.log('🔄 اتصال إنترنت – بدء المزامنة...');
                this.syncAll();
            });

            // فحص دوري
            setInterval(() => {
                if (navigator.onLine && !this.syncing) {
                    this.syncAll();
                }
            }, SYNC_INTERVAL);

            // أول مزامنة عند التحميل
            if (navigator.onLine) {
                setTimeout(() => this.syncAll(), 2000);
            }
        }

        async syncAll() {
            if (this.syncing || !window.localDB || !window.localDB.ready) return;
            this.syncing = true;

            try {
                const queue = await window.localDB.getAll('sync_queue');
                if (!queue || !queue.length) {
                    console.log('✅ لا يوجد عناصر للمزامنة');
                    this.syncing = false;
                    return;
                }

                console.log(`🔄 جاري مزامنة ${queue.length} عنصر...`);
                
                for (const entry of queue) {
                    try {
                        await this.processEntry(entry);
                        await window.localDB.delete('sync_queue', entry.id);
                        console.log(`✅ تمت مزامنة: ${entry.table} - ${entry.type}`);
                    } catch (e) {
                        console.warn(`⚠️ فشلت مزامنة عنصر:`, e);
                    }
                }
                
                console.log('✅ اكتملت المزامنة');
            } catch (e) {
                console.error('❌ خطأ في المزامنة:', e);
            } finally {
                this.syncing = false;
            }
        }

        async processEntry(entry) {
            if (!window.DB || !window.supabase) {
                throw new Error('Supabase غير متصل');
            }

            const table = supabase.from(entry.table);
            
            switch (entry.type) {
                case 'INSERT':
                case 'UPDATE':
                    await table.upsert(entry.data, { onConflict: 'id' });
                    break;
                case 'DELETE':
                    await table.delete().eq('id', entry.data.id);
                    break;
            }
        }
    }

    window.syncManager = new SyncManager();
})();
