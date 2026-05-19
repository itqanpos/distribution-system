/* =============================================
   sync.js - مزامنة آمنة متوافقة مع RLS و RPC
   ============================================= */
(function() {
    const SYNC_INTERVAL = 30000;
    const MAX_RETRIES = 3;

    class SyncManager {
        constructor() {
            this.syncing = false;
            this.retryCount = {};
            this.init();
        }

        init() {
            window.addEventListener('online', () => {
                console.log('🔄 اتصال إنترنت – بدء المزامنة...');
                this.syncAll();
            });

            setInterval(() => {
                if (navigator.onLine && !this.syncing) {
                    this.syncAll();
                }
            }, SYNC_INTERVAL);

            if (navigator.onLine) {
                setTimeout(() => this.syncAll(), 2000);
            }
        }

        async syncAll() {
            if (this.syncing || !window.localDB?.ready) return;
            this.syncing = true;

            try {
                const queue = await window.localDB.getAll('sync_queue');
                if (!queue?.length) {
                    console.log('✅ لا يوجد عناصر للمزامنة');
                    return;
                }

                console.log(`🔄 جاري مزامنة ${queue.length} عنصر...`);
                
                // ترتيب العمليات: INSERT أولاً لتجنب مشاكل المفاتيح الخارجية
                const sorted = [...queue].sort((a, b) => {
                    if (a.type === 'INSERT' && b.type !== 'INSERT') return -1;
                    if (a.type !== 'INSERT' && b.type === 'INSERT') return 1;
                    return 0;
                });

                for (const entry of sorted) {
                    try {
                        await this.processEntry(entry);
                        await window.localDB.delete('sync_queue', entry.id);
                        delete this.retryCount[entry.id];
                        console.log(`✅ تمت مزامنة: ${entry.table}`);
                    } catch (e) {
                        this.retryCount[entry.id] = (this.retryCount[entry.id] || 0) + 1;
                        if (this.retryCount[entry.id] >= MAX_RETRIES) {
                            console.error(`❌ فشل نهائي:`, entry, e);
                            await window.localDB.delete('sync_queue', entry.id);
                            delete this.retryCount[entry.id];
                        } else {
                            console.warn(`⚠️ محاولة ${this.retryCount[entry.id]} فشلت`);
                        }
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
            const user = await window.App?.getCurrentUser();
            if (!user) throw new Error('لم يتم المصادقة');

            // البيانات الحساسة: لا نثق بـ tenant_id المخزن محلياً
            // بل نعتمد على RLS في Supabase و RPC للعمليات الخاصة
            const cleanData = { ...entry.data };
            delete cleanData.tenant_id; // RLS سيتولى إضافته

            switch (entry.table) {
                // عمليات تتطلب RPC (فواتير، مشتريات)
                case 'invoices':
                    if (entry.type === 'INSERT' || entry.type === 'UPDATE') {
                        // استخدم RPC الآمنة
                        const result = await window.DB.createSaleInvoice(cleanData);
                        return result;
                    }
                    break;
                case 'purchases':
                    if (entry.type === 'INSERT' || entry.type === 'UPDATE') {
                        const result = await window.DB.createPurchaseInvoice(cleanData);
                        return result;
                    }
                    break;
                // عمليات مالية حساسة
                case 'transactions':
                case 'returns':
                    // يمكن أيضاً توجيهها لـ RPC حسب الحاجة
                    break;
            }

            // العمليات العادية: نعتمد على RLS فقط
            const table = supabase.from(entry.table);
            switch (entry.type) {
                case 'INSERT':
                    // استخدم insert بدلاً من upsert للبيانات الجديدة
                    const { error: insertError } = await table.insert(cleanData);
                    if (insertError) throw insertError;
                    break;
                case 'UPDATE':
                    if (!cleanData.id) throw new Error('لا يوجد id للتحديث');
                    const { error: updateError } = await table.update(cleanData).eq('id', cleanData.id);
                    if (updateError) throw updateError;
                    break;
                case 'DELETE':
                    if (!cleanData.id) throw new Error('لا يوجد id للحذف');
                    const { error: deleteError } = await table.delete().eq('id', cleanData.id);
                    if (deleteError) throw deleteError;
                    break;
                default:
                    throw new Error(`نوع غير معروف: ${entry.type}`);
            }
        }
    }

    window.syncManager = new SyncManager();
})();
