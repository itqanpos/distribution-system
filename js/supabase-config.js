// js/supabase-config.js
// إعدادات الاتصال بـ Supabase

// ========== استبدل هذه القيم بقيم مشروعك ==========
const SUPABASE_URL =supabase link --project-ref emvqitmpdkkuyjzegyxf // رابط مشروعك من Supabase
const SUPABASE_ANON_KEY =sb_publishable_rVcVXt2iVM80-bU6ZsxqsA_DPJQm4lN // المفتاح العام (anon key)
// ==================================================

// التحقق من وجود مكتبة Supabase
if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase library not loaded. Make sure to include Supabase SDK before this script.');
    alert('خطأ: لم يتم تحميل مكتبة Supabase. يرجى التحقق من الاتصال بالإنترنت.');
} else {
    try {
        // إنشاء عميل Supabase
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // تعريض العميل للنطاق العام
        window.supabase = supabase;
        
        console.log('✅ Supabase initialized successfully');
        console.log('📡 URL:', SUPABASE_URL);
        console.log('🔑 Anon key present:', !!SUPABASE_ANON_KEY);
        
        // اختبار الاتصال (اختياري - يمكن تعطيله في الإنتاج)
        supabase.from('settings').select('count', { count: 'exact', head: true })
            .then(({ count, error }) => {
                if (error) {
                    console.warn('⚠️ Connection test failed:', error.message);
                    console.warn('Make sure your tables exist and RLS is disabled for testing.');
                } else {
                    console.log('✅ Connection test successful. Settings count:', count);
                }
            });
            
    } catch (error) {
        console.error('❌ Failed to initialize Supabase:', error);
        alert('خطأ في تهيئة Supabase. راجع الإعدادات.');
    }
}

// تعليمات الاستخدام:
// 1. اذهب إلى https://supabase.com وافتح مشروعك
// 2. اذهب إلى Settings > API
// 3. انسخ Project URL و anon/public key
// 4. استبدل القيم في هذا الملف
