// js/storage-supabase.js - نسخة تشخيصية
const Storage = {
    async getProducts() {
        console.log('جاري جلب المنتجات...');
        try {
            const { data, error } = await supabase.from('products').select('*');
            
            if (error) {
                // هذا سيظهر رسالة على الهاتف
                alert('❌ فشل جلب المنتجات من Supabase: ' + error.message);
                console.error('Supabase error:', error);
                return [];
            }
            
            console.log('✅ تم جلب', data?.length, 'منتج');
            // إذا كانت البيانات فارغة، أخبرنا
            if (!data || data.length === 0) {
                alert('⚠️ Supabase تقول: لا توجد منتجات في الجدول.');
            }
            return data || [];
        } catch (e) {
            alert('❌ خطأ غير متوقع في الكود: ' + e.message);
            console.error('Unexpected error:', e);
            return [];
        }
    },

    // باقي الدوال (saveProduct, getCustomers...) يمكنك تركها كما هي
    // لكن الأفضل نسخ باقي الدوال من الملف الكامل السابق
};

window.Storage = Storage;
