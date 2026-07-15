/* =============================================
   src/services/ProductService.js
   منطق أعمال المنتجات – إصدار مُنقّح
   ============================================= */
import { productRepository } from '../repositories/ProductRepository.js';

class ProductService {
    constructor() {
        this.products = [];
        this.cache = {
            byId: new Map(),
            byBarcode: new Map()
        };
    }

    /**
     * تحميل المنتجات من المستودع وبناء الكاش.
     * @param {boolean} forceRefresh - تجاهل الكاش واجلب من السحابة
     * @returns {Promise<Array>} قائمة المنتجات
     */
    async loadProducts(forceRefresh = false) {
        try {
            const freshProducts = await productRepository.getAll(forceRefresh);
            this.products = freshProducts;
            this._buildCache();
            return this.products;
        } catch (e) {
            console.error('ProductService: فشل تحميل المنتجات', e);
            // لا تمسح البيانات القديمة، أعد بناء الكاش من الموجود
            this._buildCache();
            throw e;
        }
    }

    /**
     * بناء خرائط البحث السريع (id, barcode).
     */
    _buildCache() {
        this.cache.byId.clear();
        this.cache.byBarcode.clear();
        for (const p of this.products) {
            // تخزين بالنوع الأصلي و string
            this.cache.byId.set(p.id, p);
            this.cache.byId.set(String(p.id), p);
            if (p.barcode) this.cache.byBarcode.set(p.barcode, p);
            if (p.code) this.cache.byBarcode.set(p.code, p);
        }
    }

    /**
     * الحصول على منتج بواسطة المعرف.
     * @param {string|number} id
     * @returns {Object|undefined}
     */
    getById(id) {
        // جرب البحث مباشرة (قد يكون string أو number)
        return this.cache.byId.get(id) ?? this.cache.byId.get(String(id));
    }

    /**
     * الحصول على منتج بواسطة الباركود أو الكود.
     * @param {string} barcode
     * @returns {Object|undefined}
     */
    getByBarcode(barcode) {
        return this.cache.byBarcode.get(barcode);
    }

    /**
     * فلترة المنتجات بناءً على مصطلح البحث.
     * @param {string} term
     * @returns {Array}
     */
    filter(term) {
        if (!term) return this.products;
        const lower = term.toLowerCase();
        return this.products.filter(p =>
            p.name?.toLowerCase().includes(lower) ||
            p.barcode === term ||
            p.code === term
        );
    }

    /**
     * حفظ منتج (جديد أو محدث).
     * @param {Object} product
     * @param {boolean} isNew
     * @returns {Promise<Object>}
     */
    async save(product, isNew) {
        if (!productRepository) {
            throw new Error('ProductRepository غير متوفر');
        }
        const saved = await productRepository.save(product, isNew);
        // إزالة النسخة القديمة إذا تغير المعرف (مثلاً عند تحويل id مؤقت)
        const oldIndex = this.products.findIndex(p => p.id === product.id || p.id === saved.id);
        if (oldIndex !== -1) {
            this.products[oldIndex] = saved;
        } else {
            this.products.push(saved);
        }
        this._buildCache();
        return saved;
    }

    /**
     * حذف منطقي لمنتج.
     * @param {string} id
     */
    async softDelete(id) {
        if (!productRepository) {
            throw new Error('ProductRepository غير متوفر');
        }
        await productRepository.softDelete(id);
        const index = this.products.findIndex(p => p.id === id || String(p.id) === String(id));
        if (index !== -1) {
            this.products.splice(index, 1);
            this._buildCache();
        }
    }

    /**
     * خصم المخزون محليًا بعد البيع (للتحديث الفوري في الذاكرة).
     * @param {Array} cart - عناصر السلة
     * @param {string} [baseUnitField='factor'] - معيار الوحدة الأساسية (افتراضيًا التي factor=1)
     */
    applyStockReduction(cart, baseUnitField = 'factor') {
        for (const item of cart) {
            const product = this.getById(item.productId);
            if (!product?.units?.length) continue;

            // البحث عن الوحدة المختارة والوحدة الأساسية (ذات factor 1 إن وُجدت)
            const selectedUnit = product.units.find(u => u.name === item.unitName);
            if (!selectedUnit) continue;

            const factor = selectedUnit.factor || 1;
            // تحديد الوحدة الأساسية (أول وحدة بعامل 1 أو الوحدة الأولى)
            const baseUnit = product.units.find(u => u.factor === 1) || product.units[0];

            // احسب الكمية بالوحدة الأساسية
            const reduction = (item.unitName === baseUnit.name)
                ? item.quantity
                : item.quantity * factor;

            // تأكد أن baseUnit.stock موجود
            if (baseUnit.stock !== undefined) {
                baseUnit.stock = Math.max(0, baseUnit.stock - reduction);
            }
        }
    }
}

// نسخة وحيدة للاستخدام في كامل التطبيق
export const productService = new ProductService();
