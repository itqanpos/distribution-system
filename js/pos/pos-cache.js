/* =============================================
   pos-cache.js - نظام التخزين المؤقت والبحث السريع
   الوظيفة: بناء كاش المنتجات والعملاء والباركود،
   تحديث الكاش عند تغيير منتج، البحث السريع عن
   المنتجات باستخدام الباركود أو الكود.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    /**
     * _buildCache - بناء الكاش من قوائم المنتجات والعملاء الحالية
     * تُستدعى بعد تحميل البيانات من قاعدة البيانات
     * تُخزن المنتجات والعملاء في LRUCache مع إمكانية الوصول
     * بالـ id أو الباركود أو الكود.
     */
    POS._buildCache = function() {
        // مسح الكاش القديم
        POS.cache.prods.clear();
        POS.cache.custs.clear();
        POS.cache.barcode.clear();

        // فهرسة المنتجات: تخزين بالـ id الرقمي والنصي، وبالباركود والكود
        POS.state.products.forEach(product => {
            const strId = String(product.id);
            POS.cache.prods.set(strId, product);    // للبحث بـ id كنص
            POS.cache.prods.set(product.id, product); // للبحث بـ id كرقم

            if (product.barcode) {
                POS.cache.barcode.set(product.barcode, product);
            }
            if (product.code) {
                POS.cache.barcode.set(product.code, product);
            }
        });

        // فهرسة العملاء: تخزين بالـ id الرقمي والنصي
        POS.state.customers.forEach(customer => {
            const strId = String(customer.id);
            POS.cache.custs.set(strId, customer);
            POS.cache.custs.set(customer.id, customer);
        });

        console.log(`✅ تم بناء الكاش: ${POS.state.products.length} منتج، ${POS.state.customers.length} عميل`);
    };

    /**
     * _updateProductInCache - تحديث بيانات منتج في الكاش
     * تُستدعى عند تحديث منتج (مثلاً بعد البيع لتحديث المخزون)
     * أو عند استلام تحديث من السيرفر عبر Realtime.
     * 
     * @param {object} product - كائن المنتج المحدث
     */
    POS._updateProductInCache = function(product) {
        if (!product || !product.id) return;

        const oldProduct = POS.cache.prods.get(String(product.id));
        
        // حذف الفهارس القديمة للباركود والكود إذا تغيرت
        if (oldProduct) {
            if (oldProduct.barcode && oldProduct.barcode !== product.barcode) {
                POS.cache.barcode.delete(oldProduct.barcode);
            }
            if (oldProduct.code && oldProduct.code !== product.code) {
                POS.cache.barcode.delete(oldProduct.code);
            }
        }

        // تخزين المنتج الجديد في كاش المنتجات
        const strId = String(product.id);
        POS.cache.prods.set(strId, product);
        POS.cache.prods.set(product.id, product);

        // تحديث كاش الباركود
        if (product.barcode) {
            POS.cache.barcode.set(product.barcode, product);
        }
        if (product.code) {
            POS.cache.barcode.set(product.code, product);
        }

        // تحديث المنتج في state.products أيضاً (للبقاء متسقين)
        const stateIndex = POS.state.products.findIndex(p => p.id === product.id);
        if (stateIndex !== -1) {
            POS.state.products[stateIndex] = product;
        }
    };

    /**
     * _findProductByBarcode - البحث عن منتج باستخدام الباركود أو الكود
     * تبحث أولاً في كاش الباركود السريع، ثم في قائمة المنتجات كخطوة احتياطية.
     * 
     * @param {string} code - الباركود أو الكود المراد البحث عنه
     * @returns {object|null} المنتج الموجود أو null
     */
    POS._findProductByBarcode = function(code) {
        if (!code) return null;
        
        // الخطوة 1: البحث في كاش الباركود (أسرع)
        const cached = POS.cache.barcode.get(code);
        if (cached) return cached;

        // الخطوة 2: البحث في قائمة المنتجات (احتياطي)
        const product = POS.state.products.find(
            p => p.barcode === code || p.code === code
        );
        
        // إذا وجد، نضيفه للكاش لتسريع البحث في المستقبل
        if (product) {
            POS.cache.barcode.set(code, product);
        }
        
        return product || null;
    };

    /**
     * _getProductById - جلب منتج من الكاش باستخدام المعرف
     * 
     * @param {string|number} id - معرف المنتج
     * @returns {object|null} المنتج أو null
     */
    POS._getProductById = function(id) {
        if (id === undefined || id === null) return null;
        // البحث بالـ id كنص (للحالات التي يكون فيها id من نوع string)
        return POS.cache.prods.get(String(id)) || null;
    };

    /**
     * _getCustomerById - جلب عميل من الكاش باستخدام المعرف
     * 
     * @param {string|number} id - معرف العميل
     * @returns {object|null} العميل أو null
     */
    POS._getCustomerById = function(id) {
        if (!id) return null;
        return POS.cache.custs.get(String(id)) || null;
    };

})();
