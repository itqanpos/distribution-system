/* =============================================
   pos-data.js - تحميل البيانات من قاعدة البيانات
   الوظيفة: جلب المنتجات والعملاء من السحابة أو
   المحلية، بناء الكاش، تحميل فاتورة للتعديل،
   استعادة السلة المحفوظة، وإدارة جاهزية البيانات.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    /**
     * _loadData - تحميل جميع البيانات المطلوبة لنقطة البيع
     * تُستدعى عند تهيئة التطبيق. تجلب المنتجات والعملاء،
     * تستعيد السلة المحفوظة، تحمّل فاتورة التعديل إن وجدت،
     * ثم تعرض شبكة المنتجات.
     */
    POS._loadData = async function() {
        // التحقق من جاهزية قاعدة البيانات
        POS.state.db = U.dbReady();

        // جلب المنتجات والعملاء
        await POS._fetchProdsAndCusts();

        // استعادة السلة المحفوظة (إن وجدت)
        POS._restoreCart();

        // تحميل فاتورة قيد التعديل (إن وجدت)
        POS._loadEditInvoice();

        // عرض شبكة المنتجات
        POS._renderProductGrid();

        // رسالة للمستخدم إذا لم تكن هناك منتجات
        if (!POS.state.products.length) {
            U.showToast('لا توجد منتجات متاحة. يرجى إضافة منتجات من صفحة المنتجات.', 'warning');
        }
    };

    /**
     * _fetchProdsAndCusts - جلب المنتجات والعملاء من المصدر المناسب
     * تحاول الجلب من Supabase أولاً، ثم من LocalDB إذا لم يتوفر الاتصال.
     * تعالج هيكل الوحدات في المنتجات وتضمن وجود وحدة افتراضية على الأقل.
     */
    POS._fetchProdsAndCusts = async function() {
        console.log('🔄 بدء جلب المنتجات والعملاء...');

        let products = [];
        let customers = [];
        let source = 'غير معروف';

        try {
            // ========== المحاولة من Supabase ==========
            if (POS.state.db) {
                try {
                    console.log('📡 جلب المنتجات من Supabase...');
                    products = await DB.getProducts() || [];
                    source = 'Supabase';
                    console.log(`✅ تم جلب ${products.length} منتج من Supabase`);
                } catch (err) {
                    console.warn('⚠️ فشل جلب المنتجات من Supabase:', err.message);
                    // استمرار - قد نتمكن من الجلب من LocalDB
                }

                try {
                    console.log('📡 جلب العملاء من Supabase...');
                    customers = await DB.getParties('customer') || [];
                    console.log(`✅ تم جلب ${customers.length} عميل من Supabase`);
                } catch (err) {
                    console.warn('⚠️ فشل جلب العملاء من Supabase:', err.message);
                }
            }

            // ========== المحاولة من LocalDB (إذا لم نجد بيانات من Supabase) ==========
            if (!products.length && U.localReady()) {
                try {
                    console.log('💾 جلب المنتجات من LocalDB...');
                    products = await localDB.getAll('products') || [];
                    source = 'LocalDB';
                    console.log(`✅ تم جلب ${products.length} منتج من LocalDB`);
                } catch (err) {
                    console.warn('⚠️ فشل جلب المنتجات من LocalDB:', err.message);
                }

                try {
                    console.log('💾 جلب العملاء من LocalDB...');
                    customers = await localDB.getAll('parties') || [];
                    console.log(`✅ تم جلب ${customers.length} عميل من LocalDB`);
                } catch (err) {
                    console.warn('⚠️ فشل جلب العملاء من LocalDB:', err.message);
                }
            }

            // ========== إذا لم نجد أي بيانات ==========
            if (!products.length) {
                if (!POS.state.db && !U.localReady()) {
                    U.showToast('لا يوجد اتصال بقاعدة البيانات. تحقق من اتصالك بالإنترنت.', 'error');
                } else {
                    console.warn('⚠️ لم يتم العثور على منتجات في قاعدة البيانات.');
                }
            }

        } catch (e) {
            console.error('❌ خطأ غير متوقع أثناء جلب البيانات:', e);
            U.showToast('حدث خطأ أثناء تحميل البيانات.', 'error');
        }

        // ========== معالجة المنتجات ==========
        // التأكد من أن كل منتج يحتوي على وحدات صالحة
        products = products.map(product => {
            // تحويل الوحدات من نص JSON إلى كائن إذا لزم الأمر
            if (typeof product.units === 'string') {
                try {
                    product.units = JSON.parse(product.units);
                } catch (e) {
                    product.units = [];
                }
            }

            // التأكد من أن الوحدات مصفوفة صالحة
            if (!Array.isArray(product.units) || product.units.length === 0) {
                // إنشاء وحدة افتراضية إذا لم تكن هناك وحدات
                product.units = [{
                    name: 'وحدة',
                    price: product.price || 0,
                    cost: product.cost || 0,
                    factor: 1,
                    stock: product.stock || 0,
                    minPrice: 0,
                    maxPrice: 0
                }];
            }

            // التأكد من أن كل وحدة تحتوي على جميع الخصائص المطلوبة
            product.units = product.units.map(unit => ({
                name: unit.name || 'وحدة',
                price: Number(unit.price) || 0,
                cost: Number(unit.cost) || 0,
                factor: Number(unit.factor) || 1,
                stock: Number(unit.stock) || 0,
                minPrice: Number(unit.minPrice) || 0,
                maxPrice: Number(unit.maxPrice) || 0,
                barcode: unit.barcode || null
            }));

            return product;
        });

        // ========== معالجة العملاء ==========
        customers = customers.filter(c => c.type === 'customer');

        // ========== تحديث الحالة ==========
        POS.state.products = products;
        POS.state.customers = customers;

        // بناء الكاش
        POS._buildCache();

        console.log(`📊 ملخص التحميل: ${products.length} منتج، ${customers.length} عميل (المصدر: ${source})`);
    };

    /**
     * _loadEditInvoice - تحميل فاتورة للتعديل (إذا كانت موجودة في localStorage)
     * تُستدعى عند تهيئة التطبيق. تبحث عن معرف فاتورة محفوظ
     * وتحمّل بياناتها لتعديلها.
     */
    POS._loadEditInvoice = function() {
        const invoiceId = localStorage.getItem('edit_invoice_id');
        if (!invoiceId) return;

        // حذف المعرف من localStorage لتجنب إعادة التحميل في المرات القادمة
        localStorage.removeItem('edit_invoice_id');

        // التحقق من توفر DB والدالة المطلوبة
        if (!POS.state.db || typeof DB.getInvoiceById !== 'function') {
            console.warn('⚠️ لا يمكن تحميل الفاتورة للتعديل: DB غير متوفر');
            return;
        }

        DB.getInvoiceById(invoiceId)
            .then(invoice => {
                if (!invoice) {
                    U.showToast('الفاتورة غير موجودة', 'error');
                    return;
                }

                // التحقق من أن الفاتورة صالحة للتعديل
                if (invoice.type !== 'sale') {
                    U.showToast('لا يمكن تعديل هذا النوع من الفواتير', 'warning');
                    return;
                }
                if (invoice.status === 'voided') {
                    U.showToast('لا يمكن تعديل فاتورة ملغاة', 'warning');
                    return;
                }

                // تحميل عناصر الفاتورة إلى السلة
                POS.state.cart = (invoice.items || []).map(item => ({ ...item }));
                POS.state.selectedCustomerId = invoice.customer_id || null;
                POS.state.editingInv = invoice.id;

                // عرض اسم العميل في حقل البحث
                if (invoice.customer_id) {
                    const customer = POS._getCustomerById(invoice.customer_id);
                    if (customer) {
                        POS.el.customerSearchInput.value = customer.name || '';
                        POS._updateCustDisplay();
                    }
                } else {
                    POS.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
                    POS._updateCustDisplay();
                }

                // تحديث عرض السلة
                POS._renderCart();
                U.showToast('تم تحميل الفاتورة للتعديل', 'info');
            })
            .catch(err => {
                console.error('❌ فشل تحميل الفاتورة للتعديل:', err);
                U.showToast('فشل تحميل الفاتورة للتعديل', 'error');
            });
    };

    /**
     * _checkStock - التحقق من توفر المخزون لجميع عناصر السلة
     * تُستدعى قبل إتمام الدفع. تتحقق من المخزون في السحابة
     * (إذا كان متصلاً) أو محلياً.
     * @returns {Promise<{ok: boolean, products?: Array, error?: string}>}
     */
    POS._checkStock = function() {
        // إذا كان متصلاً بالسحابة، نجلب أحدث بيانات المخزون
        if (navigator.onLine && POS.state.db && typeof DB.getProducts === 'function') {
            return DB.getProducts(true) // force refresh = true
                .then(freshProducts => {
                    if (freshProducts && freshProducts.length) {
                        return POS._validateStock(freshProducts);
                    }
                    return POS._validateStock(POS.state.products);
                })
                .catch(() => {
                    // فشل الجلب من السحابة - نستخدم البيانات المحلية
                    return POS._validateStock(POS.state.products);
                });
        }

        // استخدام البيانات المحلية مباشرة
        return Promise.resolve(POS._validateStock(POS.state.products));
    };

    /**
     * _validateStock - التحقق من كفاية المخزون لكل عنصر في السلة
     * @param {Array} products - قائمة المنتجات للتحقق منها
     * @returns {{ok: boolean, products?: Array, error?: string}}
     */
    POS._validateStock = function(products) {
        for (const cartItem of POS.state.cart) {
            const product = products.find(p => p.id === cartItem.productId);

            if (!product) {
                return {
                    ok: false,
                    error: `المنتج "${cartItem.productName}" غير متوفر حالياً.`
                };
            }

            if (!product.units || !product.units.length) {
                return {
                    ok: false,
                    error: `المنتج "${cartItem.productName}" لا يحتوي على وحدات.`
                };
            }

            const baseUnit = product.units[0];
            const selectedUnit = product.units.find(u => u.name === cartItem.unitName);
            const factor = selectedUnit?.factor || 1;
            const requiredStock = cartItem.quantity * factor;
            const availableStock = baseUnit.stock || 0;

            if (requiredStock > availableStock) {
                return {
                    ok: false,
                    error: `المخزون غير كافٍ للمنتج "${cartItem.productName}". المتاح: ${availableStock}، المطلوب: ${requiredStock}`
                };
            }
        }

        return { ok: true, products: products };
    };

    /**
     * _updateLocalStock - تحديث المخزون المحلي بعد إتمام البيع
     * تُخصم الكميات المباعة من المخزون في state.products والكاش
     * @param {Array} products - المنتجات المحدثة من السحابة (اختياري)
     */
    POS._updateLocalStock = function(products) {
        for (const cartItem of POS.state.cart) {
            // البحث عن المنتج في القائمة المحدثة أو في الكاش
            const product = products
                ? products.find(p => p.id === cartItem.productId)
                : POS._getProductById(cartItem.productId);

            if (!product || !product.units?.length) continue;

            const baseUnit = product.units[0];
            const selectedUnit = product.units.find(u => u.name === cartItem.unitName);
            const factor = selectedUnit?.factor || 1;

            // حساب الكمية المراد خصمها من المخزون الأساسي
            const deduction = cartItem.unitName === baseUnit.name
                ? cartItem.quantity
                : cartItem.quantity * factor;

            // تحديث المخزون الأساسي
            baseUnit.stock = Math.max(0, (baseUnit.stock || 0) - deduction);

            // تحديث المنتج في الكاش
            POS._updateProductInCache(product);
        }

        // مزامنة المخزون المحدث مع state.products
        if (products && products !== POS.state.products) {
            products.forEach(updatedProduct => {
                const existing = POS.state.products.find(p => p.id === updatedProduct.id);
                if (existing && updatedProduct.units?.length) {
                    existing.units[0].stock = updatedProduct.units[0].stock;
                }
            });
        }
    };

})();
