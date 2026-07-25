/* =============================================
   pos-network.js - إدارة الاتصال والمزامنة
   الوظيفة: التحقق من حالة الاتصال، مزامنة Realtime
   مع Supabase، مزامنة المبيعات غير المتصلة، تحديث
   إحصائيات اليوم، فحص الاتصال الدوري، مراقبة
   الأخطاء وإرسالها للسيرفر.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    // ==================== حالة الاتصال ====================

    /**
     * _connStatus - تحديث واجهة المستخدم حسب حالة الاتصال
     * تُضيف كلاس offline للـ body و navbar عند انقطاع الاتصال.
     */
    POS._connStatus = function() {
        const navbar = document.getElementById('mainNavbar');
        const isOffline = !navigator.onLine;

        if (navbar) navbar.classList.toggle('offline', isOffline);
        document.body.classList.toggle('offline', isOffline);

        // محاولة مزامنة المبيعات غير المتصلة عند عودة الاتصال
        if (!isOffline && POS.state._offlineSales.length > 0) {
            POS._syncOfflineSales();
        }
    };

    // ==================== مزامنة Realtime ====================

    /**
     * _setupRealtimeSync - إعداد مزامنة فورية مع Supabase
     * تستمع لتغييرات جدول المنتجات وتُحدّث الواجهة تلقائياً.
     * عند حذف منتج: يُحذف من state والكاش.
     * عند إضافة/تحديث: يُضاف أو يُحدّث في state والكاش.
     */
    POS._setupRealtimeSync = function() {
        if (!window.supabaseClient) {
            console.warn('⚠️ Supabase client غير متوفر - تم تعطيل المزامنة الفورية');
            return;
        }

        const channel = window.supabaseClient
            .channel('products-realtime')
            .on('postgres_changes',
                {
                    event: '*',           // الاستماع لجميع الأحداث (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'products'
                },
                (payload) => {
                    console.log('📡 تحديث فوري:', payload.eventType, payload);

                    if (payload.eventType === 'DELETE') {
                        // حذف منتج
                        const deletedId = payload.old?.id;
                        if (deletedId) {
                            // إزالة من state.products
                            POS.state.products = POS.state.products.filter(
                                p => p.id !== deletedId
                            );
                            // إزالة من الكاش
                            POS.cache.prods.delete(String(deletedId));
                            POS.cache.prods.delete(deletedId);
                            // إزالة من كاش الباركود
                            const oldProduct = payload.old;
                            if (oldProduct?.barcode) {
                                POS.cache.barcode.delete(oldProduct.barcode);
                            }
                            if (oldProduct?.code) {
                                POS.cache.barcode.delete(oldProduct.code);
                            }
                            // تحديث شبكة المنتجات
                            POS._debouncedRenderGrid();
                        }
                        return;
                    }

                    // إضافة أو تحديث منتج
                    const updatedProduct = payload.new;
                    if (updatedProduct) {
                        // معالجة الوحدات إذا كانت مخزنة بشكل منفصل
                        if (updatedProduct.product_units) {
                            updatedProduct.units = updatedProduct.product_units.map(u => ({
                                id: u.id,
                                name: u.unit_name || u.name,
                                price: u.price,
                                cost: u.cost,
                                factor: u.factor,
                                stock: u.stock,
                                minPrice: u.min_price,
                                maxPrice: u.max_price,
                                barcode: u.barcode
                            }));
                            delete updatedProduct.product_units;
                        }

                        // تحديث أو إضافة في state.products
                        const existingIndex = POS.state.products.findIndex(
                            p => p.id === updatedProduct.id
                        );
                        if (existingIndex !== -1) {
                            POS.state.products[existingIndex] = updatedProduct;
                        } else {
                            POS.state.products.push(updatedProduct);
                        }

                        // تحديث الكاش
                        POS._updateProductInCache(updatedProduct);

                        // تحديث شبكة المنتجات
                        POS._debouncedRenderGrid();
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ تم الاشتراك في تحديثات المنتجات الفورية');
                } else if (status === 'CHANNEL_ERROR') {
                    console.warn('⚠️ خطأ في قناة المزامنة الفورية');
                }
            });

        // تخزين القناة للتنظيف لاحقاً إذا لزم الأمر
        POS._realtimeChannel = channel;
    };

    /**
     * _debouncedRenderGrid - تحديث شبكة المنتجات مع تأخير (debounce)
     * لتجنب تحديث الواجهة بشكل متكرر عند استلام تحديثات متعددة.
     */
    POS._debouncedRenderGrid = U.debounce(function() {
        POS._renderProductGrid();
    }, 200);

    // ==================== إحصائيات اليوم ====================

    /**
     * _startTodayStatsUpdater - بدء تحديث دوري لإحصائيات اليوم
     * تُحدّث إجمالي المبيعات وعدد الفواتير كل دقيقة.
     */
    POS._startTodayStatsUpdater = function() {
        const updateStats = async () => {
            if (!POS.state.db) return;

            try {
                const invoices = await DB.getInvoicesLight().catch(() => []);
                const today = U.today();

                const todayInvoices = invoices.filter(
                    inv => inv.date === today && inv.type === 'sale' && inv.status !== 'voided'
                );

                const totalSales = todayInvoices.reduce(
                    (sum, inv) => sum + (parseFloat(inv.total) || 0), 0
                );

                if (POS.el.todaySales) {
                    POS.el.todaySales.textContent = U.fmtMoney(totalSales);
                }
                if (POS.el.todayCount) {
                    POS.el.todayCount.textContent = todayInvoices.length;
                }
            } catch (e) {
                // تجاهل أخطاء التحديث الدوري
            }
        };

        // تحديث فوري ثم كل 60 ثانية
        updateStats();
        setInterval(updateStats, 60000);
    };

    // ==================== فحص الاتصال الدوري ====================

    /**
     * _setupConnectionCheck - فحص دوري لجودة الاتصال
     * تُرسل طلباً خفيفاً لـ Supabase كل 30 ثانية للتأكد
     * من أن الاتصال مستقر. تُضيف كلاس slow-connection عند البطء.
     */
    POS._setupConnectionCheck = function() {
        POS.state._connectionCheckTimer = setInterval(async () => {
            if (!navigator.onLine) return;

            if (window.supabaseClient) {
                try {
                    // طلب خفيف للتحقق من الاتصال
                    const start = Date.now();
                    await window.supabaseClient.from('tenants').select('id').limit(1);
                    const latency = Date.now() - start;

                    if (latency > 3000) {
                        document.body.classList.add('slow-connection');
                    } else {
                        document.body.classList.remove('slow-connection');
                    }
                } catch (e) {
                    document.body.classList.add('slow-connection');
                }
            }
        }, 30000);
    };

    // ==================== مزامنة المبيعات غير المتصلة ====================

    /**
     * _syncOfflineSales - مزامنة المبيعات التي تمت في وضع عدم الاتصال
     * تُستدعى عند عودة الاتصال. تُرسل جميع الفواتير المحفوظة محلياً
     * إلى السحابة وتحذفها من المخزن المحلي بعد النجاح.
     */
    POS._syncOfflineSales = async function() {
        if (!navigator.onLine || !POS.state.db) return;

        const local = window.localDB;
        if (!local?.ready) return;

        try {
            const offlineSales = await local.getAll('offline_sales').catch(() => []);
            if (!offlineSales.length) return;

            console.log(`🔄 جاري مزامنة ${offlineSales.length} فاتورة غير متصلة...`);
            U.showToast(`جاري مزامنة ${offlineSales.length} فاتورة...`);

            let syncedCount = 0;
            let failedCount = 0;

            for (const sale of offlineSales) {
                try {
                    // إزالة علامة الأوفلاين وإرسال الفاتورة للسحابة
                    const saleData = { ...sale };
                    delete saleData._offline;
                    await DB.createSaleInvoice(saleData);

                    // حذف الفاتورة من المخزن المحلي بعد المزامنة الناجحة
                    await local.delete('offline_sales', sale.id);
                    syncedCount++;

                    // إزالة من القائمة المحلية
                    POS.state._offlineSales = POS.state._offlineSales.filter(
                        s => s.id !== sale.id
                    );
                } catch (e) {
                    console.warn(`⚠️ فشلت مزامنة الفاتورة ${sale.invoice_number}:`, e.message);
                    failedCount++;
                }
            }

            if (syncedCount > 0) {
                U.showToast(`✅ تمت مزامنة ${syncedCount} فاتورة بنجاح`, 'success');
                console.log(`✅ تمت مزامنة ${syncedCount} فاتورة`);
            }
            if (failedCount > 0) {
                U.showToast(`⚠️ فشلت مزامنة ${failedCount} فاتورة`, 'warning');
                console.warn(`⚠️ فشلت مزامنة ${failedCount} فاتورة`);
            }
        } catch (e) {
            console.error('❌ خطأ في مزامنة المبيعات غير المتصلة:', e);
        }
    };

    // ==================== مراقبة الأخطاء ====================

    /**
     * _setupErrorMonitoring - إعداد مراقبة الأخطاء العامة
     * تلتقط الأخطاء غير المعالجة وترسلها للسيرفر لتسجيلها.
     */
    POS._setupErrorMonitoring = function() {
        window.addEventListener('error', (event) => {
            const error = event.error || event;
            console.error('❌ خطأ عام:', error.message || error);
            POS._logErrorToServer({
                message: error.message || 'خطأ غير معروف',
                stack: error.stack || '',
                source: 'window.onerror'
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            console.error('❌ رفض وعد غير معالج:', reason?.message || reason);
            POS._logErrorToServer({
                message: reason?.message || 'رفض وعد غير معالج',
                stack: reason?.stack || '',
                source: 'unhandledrejection'
            });
        });
    };

    /**
     * _logErrorToServer - إرسال خطأ للسيرفر لتسجيله
     * @param {object} errorInfo - معلومات الخطأ
     */
    POS._logErrorToServer = async function(errorInfo) {
        try {
            if (window.supabaseClient && POS.state.currentUser?.tenant_id) {
                await window.supabaseClient.from('system_logs').insert({
                    message: errorInfo.message || 'خطأ غير معروف',
                    stack: errorInfo.stack || '',
                    source: errorInfo.source || 'unknown',
                    timestamp: new Date().toISOString(),
                    tenant_id: POS.state.currentUser.tenant_id,
                    user_id: POS.state.currentUser.id || null
                });
            }
        } catch (e) {
            // لا يمكن تسجيل الخطأ إذا كان السيرفر غير متاح
        }
    };

})();
