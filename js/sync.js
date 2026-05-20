/* =============================================
   sync.js - مزامنة آمنة متوافقة مع RLS و RPC
   الإصدار 2.0 - إصلاحات شاملة، تعامل آمن مع tenant_id
   ============================================= */
(function() {
    const SYNC_INTERVAL = 30000;        // 30 ثانية
    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 2000;         // تأخير بدء التشغيل

    class SyncManager {
        constructor() {
            this.syncing = false;
            this.retryCount = {};
            this.failedEntries = new Set(); // لتتبع العمليات الفاشلة نهائياً
        }

        init() {
            // مستمع واحد للاتصال بالإنترنت
            window.addEventListener('online', () => {
                console.log('🌐 اتصال إنترنت – بدء المزامنة...');
                this.syncAll();
            });

            // مزامنة دورية
            this.intervalId = setInterval(() => {
                if (navigator.onLine && !this.syncing) {
                    this.syncAll();
                }
            }, SYNC_INTERVAL);

            // مزامنة أولية بعد التحميل
            if (navigator.onLine) {
                setTimeout(() => this.syncAll(), INITIAL_DELAY);
            }
        }

        async syncAll() {
            // تجنب التشغيل المتوازي
            if (this.syncing) return;
            if (!window.localDB?.ready) return;
            if (!navigator.onLine) return;

            this.syncing = true;

            try {
                const queue = await window.localDB.getAll('sync_queue');
                if (!queue || queue.length === 0) {
                    return;
                }

                // إزالة العمليات الفاشلة نهائياً من القائمة (لن نكررها بعد 3 محاولات)
                const actionableQueue = queue.filter(entry => !this.failedEntries.has(entry.id));

                if (actionableQueue.length === 0) {
                    console.log('✅ جميع العمليات المعلقة فشلت سابقاً. يرجى مراجعة السجلات.');
                    return;
                }

                console.log(`🔄 جاري مزامنة ${actionableQueue.length} عنصر...`);

                // فرز حسب الطابع الزمني (timestamp) إن وُجد، وإلا فـ INSERT أولاً
                const sorted = [...actionableQueue].sort((a, b) => {
                    if (a.timestamp && b.timestamp) {
                        return a.timestamp - b.timestamp;
                    }
                    // fallback: INSERT أولاً
                    if (a.type === 'INSERT' && b.type !== 'INSERT') return -1;
                    if (a.type !== 'INSERT' && b.type === 'INSERT') return 1;
                    return 0;
                });

                for (const entry of sorted) {
                    if (this.failedEntries.has(entry.id)) continue;

                    try {
                        await this.processEntry(entry);
                        // نجحت المزامنة → إزالة من الطابور
                        await window.localDB.delete('sync_queue', entry.id).catch(e =>
                            console.warn('فشل حذف عنصر من طابور المزامنة:', e)
                        );
                        delete this.retryCount[entry.id];
                        console.log(`✅ تمت مزامنة: ${entry.table} [${entry.type}]`);
                    } catch (error) {
                        console.error(`❌ فشلت مزامنة ${entry.table} [${entry.type}]:`, error);
                        this.retryCount[entry.id] = (this.retryCount[entry.id] || 0) + 1;

                        if (this.retryCount[entry.id] >= MAX_RETRIES) {
                            // وصلنا للحد الأقصى → نُبقي العملية لكن نمنعها من المحاولات المستقبلية
                            this.failedEntries.add(entry.id);
                            console.warn(`🚫 عملية ${entry.id} فشلت بعد ${MAX_RETRIES} محاولات. يُرجى التحقق يدوياً.`);
                            // هنا يمكن إرسال إشعار للمستخدم أو تسجيل في localStorage
                        }
                    }
                }
            } catch (e) {
                console.error('❌ خطأ عام في المزامنة:', e);
            } finally {
                this.syncing = false;
            }
        }

        async processEntry(entry) {
            // 1. التحقق من المستخدم (يمنع إرسال بيانات منتهية الصلاحية)
            if (!window.App || !window.App.getCurrentUser) {
                throw new Error('تطبيق غير مهيأ');
            }
            const user = await window.App.getCurrentUser();
            if (!user) throw new Error('لم يتم المصادقة. الرجاء تسجيل الدخول.');

            // 2. بناء البيانات النظيفة مع تعيين tenant_id من الجلسة (مصدر موثوق)
            const cleanData = { ...entry.data };
            // نحذف tenant_id القديم المحتمل (من localStorage) ونعتمد على جلسة Supabase الحالية
            if (cleanData.tenant_id && cleanData.tenant_id !== user.tenant_id) {
                console.warn('⚠️ اختلاف tenant_id، استخدام معرف الجلسة الحالية');
            }
            cleanData.tenant_id = user.tenant_id; // الضمان أن RLS يقبلها

            // 3. معالجة حسب نوع الجدول
            switch (entry.table) {
                // فواتير المبيعات – تستدعي RPC خاصة لضمان سلامة المخزون
                case 'invoices':
                    if (entry.type === 'INSERT' || entry.type === 'UPDATE') {
                        const invResult = await window.DB.createSaleInvoice(cleanData);
                        return invResult;
                    }
                    break;

                // فواتير المشتريات – تستدعي RPC خاصة
                case 'purchases':
                    if (entry.type === 'INSERT' || entry.type === 'UPDATE') {
                        const purResult = await window.DB.createPurchaseInvoice(cleanData);
                        return purResult;
                    }
                    break;

                // جداول أخرى – نعتمد على RLS و API العادي
                default:
                    // تأكد من وجود supabase كـ window.supabase
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

        // دالة مساعدة: إعادة تعيين العمليات الفاشلة (يمكن استدعاؤها من واجهة المستخدم)
        resetFailedEntries() {
            this.failedEntries.clear();
            this.retryCount = {};
            console.log('🔄 تمت إعادة تعيين العمليات الفاشلة.');
        }

        // دالة مساعدة: عدد العمليات المعلقة
        async getQueueStats() {
            if (!window.localDB?.ready) return { pending: 0, failed: 0 };
            try {
                const queue = await window.localDB.getAll('sync_queue');
                const pending = queue ? queue.filter(e => !this.failedEntries.has(e.id)).length : 0;
                return {
                    pending,
                    failed: this.failedEntries.size
                };
            } catch (e) {
                return { pending: 0, failed: 0 };
            }
        }
    }

    // إنشاء النسخة الوحيدة وإتاحتها عالمياً
    window.syncManager = new SyncManager();
    window.syncManager.init();
})();
