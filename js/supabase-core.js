/* =============================================
   supabase-core.js - العميل وتهيئة الجلسة (محسّن)
   ============================================= */
(function() {
    'use strict';

    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    window.supabaseClient = null;

    // ========== UUID Generator ==========
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const buf = new Uint8Array(16);
            crypto.getRandomValues(buf);
            buf[6] = (buf[6] & 0x0f) | 0x40;
            buf[8] = (buf[8] & 0x3f) | 0x80;
            const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
            return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
        }
        // Fallback رياضي
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
    window.generateUUID = generateUUID;

    // ========== Session Store ==========
    const SessionStore = {
        _user: null,
        _tenantId: null,
        _settings: null,
        _cache: new Map(),
        _cacheTimes: new Map(),
        _maxCacheSize: 50,

        // استعادة الجلسة من localStorage عند البدء (إذا لم تكن مستعادة بعد)
        restoreSession() {
            if (this._user) return true; // تم الاستعادة مسبقاً
            try {
                const raw = localStorage.getItem('app_session');
                if (raw) {
                    const session = JSON.parse(raw);
                    // التحقق من أن الجلسة ليست قديمة جداً (اختياري: 30 يوم)
                    // هنا نستعيد ببساطة
                    this._user = session;
                    this._tenantId = session.tenant_id || null;
                    console.log('✅ تم استعادة الجلسة من localStorage');
                    return true;
                }
            } catch (e) {
                console.warn('فشل استعادة الجلسة من localStorage', e);
            }
            return false;
        },

        set user(val) {
            this._user = val;
            this._tenantId = val ? (val.tenant_id || null) : null;
            if (val) {
                // تخزين بيانات آمنة فقط (بدون token حساس إن وجد)
                const session = {
                    id: val.id,
                    email: val.email,
                    fullName: val.fullName,
                    tenant_id: val.tenant_id,
                    loginTime: new Date().toLocaleString('ar-EG')
                };
                try {
                    localStorage.setItem('app_session', JSON.stringify(session));
                } catch (e) {
                    console.warn('تعذر حفظ الجلسة في localStorage', e);
                }
            } else {
                try {
                    localStorage.removeItem('app_session');
                } catch (e) { /* تجاهل */ }
                this._cache.clear();
                this._cacheTimes.clear();
                this._settings = null;
            }
        },
        get user() {
            return this._user;
        },
        get tenantId() {
            return this._tenantId;
        },

        setCache(key, data, ttl = 300000) {
            if (this._cache.size >= this._maxCacheSize) {
                const firstKey = this._cache.keys().next().value;
                this._cache.delete(firstKey);
                this._cacheTimes.delete(firstKey);
            }
            this._cache.set(key, data);
            this._cacheTimes.set(key, Date.now() + ttl);
        },
        getCache(key) {
            const expiry = this._cacheTimes.get(key);
            if (expiry && Date.now() > expiry) {
                this._cache.delete(key);
                this._cacheTimes.delete(key);
                return undefined;
            }
            return this._cache.get(key);
        },
        invalidate(key) {
            if (key) {
                this._cache.delete(key);
                this._cacheTimes.delete(key);
            } else {
                this._cache.clear();
                this._cacheTimes.clear();
            }
        }
    };
    window.SessionStore = SessionStore;

    // تنظيف الكاش منتهي الصلاحية كل دقيقة
    setInterval(() => {
        const now = Date.now();
        for (const [key, expiry] of SessionStore._cacheTimes) {
            if (now > expiry) {
                SessionStore._cache.delete(key);
                SessionStore._cacheTimes.delete(key);
            }
        }
    }, 60000);

    // ========== تهيئة Supabase ==========
    function initSupabase() {
        if (typeof supabase === 'undefined') {
            console.warn('مكتبة Supabase غير محملة');
            return false;
        }
        try {
            window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: localStorage,
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                },
                realtime: {
                    params: { eventsPerSecond: 10 }
                },
                global: {
                    headers: { 'X-Client-Info': 'hesaby/4.0' }
                }
            });
            // توفير اختصار
            window.supabase = window.supabaseClient;
            console.log('✅ تم تهيئة Supabase client');
            return true;
        } catch (e) {
            console.error('❌ فشل تهيئة Supabase', e);
            return false;
        }
    }

    // محاولة التهيئة الأولية
    if (!initSupabase()) {
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = setInterval(() => {
            if (window.supabaseClient || retryCount >= maxRetries) {
                clearInterval(retryInterval);
                if (!window.supabaseClient) {
                    console.error('⚠️ تعذر تهيئة Supabase بعد عدة محاولات');
                }
                return;
            }
            if (typeof supabase !== 'undefined' && initSupabase()) {
                clearInterval(retryInterval);
                console.log('✅ استعادة الاتصال بـ Supabase');
            }
            retryCount++;
        }, 1500);
    }

    // استعادة الجلسة السابقة (قد تكون بدون اتصال)
    // ننتظر قليلاً للتأكد من تحميل باقي المكتبات
    window.addEventListener('load', () => {
        setTimeout(() => {
            SessionStore.restoreSession();
        }, 100);
    });

    // دالة مساعدة للحصول على localDB بشكل آمن (async)
    // تستخدم في الملفات الأخرى التي تحتاج localDB
    async function getLocalDBAsync() {
        if (!window.localDB) return null;
        try {
            await window.localDB.initPromise;
            return window.localDB.ready ? window.localDB : null;
        } catch (e) {
            console.warn('localDB غير جاهز', e);
            return null;
        }
    }
    window.getLocalDBAsync = getLocalDBAsync; // دالة غير متزامنة للاستخدام الآمن

})();
