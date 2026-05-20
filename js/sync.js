/* =============================================
   sync.js - مزامنة آمنة متوافقة مع RLS و RPC
   الإصدار 2.1 - قائمة بيضاء، دعم DELETE، أداء متوازي
   ============================================= */
(function() {
    const SYNC_INTERVAL = 30000;
    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 2000;
    const CONCURRENT_LIMIT = 5;

    // ✅ قائمة بيضاء: الجداول المسموح بمزامنتها عبر الطابور
    const ALLOWED_TABLES = [
        'products',
        'parties',
        'transactions',
        'returns',
        'journal_entries',
        'accounts',
        'invoices',
        'purchases'
    ];

    class SyncManager {
        constructor() {
            this.syncing = false;
            this.retryCount = {};
            this.failedEntries = new Set();
        }

        init() {
            window.addEventListener('online', () => {
                console.log('🌐 اتصال إنترنت – بدء المزامنة...');
                this.syncAll();
            });

            this.intervalId = setInterval(() => {
                if (navigator.onLine && !this.syncing) {
                    this.syncAll();
                }
            }, SYNC_INTERVAL);

            if (navigator.onLine) {
                setTimeout(() => this.syncAll(), INITIAL_DELAY);
            }
        }

        async syncAll() {
            if (this.syncing) return;
            if (!window.localDB?.ready) return;
            if (!navigator.onLine) return;

            this.syncing = true;

            try {
                const queue = await window.localDB.getAll('sync_queue');
                if (!queue || queue.length === 0) {
                    this.syncing = false;
                    return;
                }

                const actionableQueue = queue.filter(entry => !this.failedEntries.has(entry.id));

                if (actionableQueue.length === 0) {
                    console.log('✅ جميع العمليات المعلقة فشلت سابقاً.');
                    this._notifyUserIfNeeded(queue.length);
                    this.syncing = false;
                    return;
                }

                console.log(`🔄 جاري مزامنة ${actionableQueue.length} عنصر...`);

                const sorted = [...actionableQueue].sort((a, b) => {
                    if (a.timestamp && b.timestamp) {
                        return a.timestamp - b.timestamp;
                    }
                    if (a.type === 'INSERT' && b.type !== 'INSERT') return -1;
                    if (a.type !== 'INSERT' && b.type === 'INSERT') return 1;
                    return 0;
                });

                // تنفيذ متوازٍ مع حد أقصى
                for (let i = 0; i < sorted.length; i += CONCURRENT_LIMIT) {
                    const batch = sorted.slice(i, i + CONCURRENT_LIMIT);
                    await Promise.all(batch.map(entry => this._handleEntry(entry)));
                }

                // إشعار إذا بقيت عناصر فاشلة
                const remainingQueue = await window.localDB.getAll('sync_queue');
                if (remainingQueue && remainingQueue.length > 0) {
                    this._notifyUserIfNeeded(remainingQueue.length);
                }
            } catch (e) {
                console.error('❌ خطأ عام في المزامنة:', e);
            } finally {
                this.syncing = false;
            }
        }

        async _handleEntry(entry) {
            if (this.failedEntries.has(entry.id)) return;

            try {
                await this.processEntry(entry);
                await window.localDB.delete('sync_queue', entry.id).catch(e =>
                    console.warn('فشل حذف عنصر من طابور المزامنة:', e)
                );
                delete this.retryCount[entry.id];
                console.log(`✅ تمت مزامنة: ${entry.table} [${entry.type}]`);
            } catch (error) {
                console.error(`❌ فشلت مزامنة ${entry.table} [${entry.type}]:`, error);
                this.retryCount[entry.id] = (this.retryCount[entry.id] || 0) + 1;

                if (this.retryCount[entry.id] >= MAX_RETRIES) {
                    this.failedEntries.add(entry.id);
                    console.warn(`🚫 عملية ${entry.id} فشلت بعد ${MAX_RETRIES} محاولات.`);
                }
            }
        }

        async processEntry(entry) {
            // 1. التحقق من القائمة البيضاء
            if (!ALLOWED_TABLES.includes(entry.table)) {
                throw new Error(`الجدول "${entry.table}" غير مسموح به في المزامنة`);
            }

            // 2. التحقق من المستخدم
            if (!window.App || !window.App.getCurrentUser) {
                throw new Error('تطبيق غير مهيأ');
            }
            const user = await window.App.getCurrentUser();
            if (!user) throw new Error('لم يتم المصادقة. الرجاء تسجيل الدخول.');

            // 3. بناء البيانات مع tenant_id من الجلسة
            const cleanData = { ...entry.data };
            if (cleanData.tenant_id && cleanData.tenant_id !== user.tenant_id) {
                console.warn('⚠️ اختلاف tenant_id، استخدام معرف الجلسة الحالية');
            }
            cleanData.tenant_id = user.tenant_id;

            // 4. معالجة حسب الجدول
            switch (entry.table) {
                case 'invoices':
                    if (entry.type === 'INSERT' || entry.type === 'UPDATE') {
                        await window.DB.createSaleInvoice(cleanData);
                    } else if (entry.type === 'DELETE') {
                        await this._voidInvoice(cleanData.id, user.tenant_id);
                    }
                    break;

                case 'purchases':
                    if (entry.type === 'INSERT' || entry.type === 'UPDATE') {
                        await window.DB.createPurchaseInvoice(cleanData);
                    } else if (entry.type === 'DELETE') {
                        await this._voidPurchase(cleanData.id, user.tenant_id);
                    }
                    break;

                default:
                    const sb = window.supabase;
                    if (!sb) throw new Error('Supabase غير مهيأ');

                    const table = sb.from(entry.table);
                    switch (entry.type) {
                        case 'INSERT':
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

        async _voidInvoice(id, tenantId) {
            // استخدام RPC مخصص للإبطال إن وجد، وإلا تحديث مباشر
            try {
                const { error } = await window.supabase.rpc('void_invoice', { p_invoice_id: id, p_tenant_id: tenantId });
                if (error) throw error;
            } catch (rpcError) {
                console.warn('RPC void_invoice غير موجود، استخدام التحديث المباشر');
                const { error } = await window.supabase
                    .from('invoices')
                    .update({ status: 'voided' })
                    .eq('id', id)
                    .eq('tenant_id', tenantId);
                if (error) throw error;
            }
        }

        async _voidPurchase(id, tenantId) {
            try {
                const { error } = await window.supabase.rpc('void_purchase', { p_purchase_id: id, p_tenant_id: tenantId });
                if (error) throw error;
            } catch (rpcError) {
                console.warn('RPC void_purchase غير موجود، استخدام التحديث المباشر');
                const { error } = await window.supabase
                    .from('purchases')
                    .update({ status: 'voided' })
                    .eq('id', id)
                    .eq('tenant_id', tenantId);
                if (error) throw error;
            }
        }

        _notifyUserIfNeeded(pendingCount) {
            if (typeof window.Toast !== 'undefined' && window.Toast.info) {
                window.Toast.info(`توجد ${pendingCount} عملية معلقة في انتظار المزامنة`);
            }
        }

        resetFailedEntries() {
            this.failedEntries.clear();
            this.retryCount = {};
            console.log('🔄 تمت إعادة تعيين العمليات الفاشلة.');
        }

        async getQueueStats() {
            if (!window.localDB?.ready) return { pending: 0, failed: 0 };
            try {
                const queue = await window.localDB.getAll('sync_queue');
                const pending = queue ? queue.filter(e => !this.failedEntries.has(e.id)).length : 0;
                return { pending, failed: this.failedEntries.size };
            } catch (e) {
                return { pending: 0, failed: 0 };
            }
        }
    }

    window.syncManager = new SyncManager();
    window.syncManager.init();
})();
