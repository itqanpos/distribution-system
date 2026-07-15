/* =============================================
   supabase-core.js - العميل وتهيئة الجلسة (محسّن)
   ============================================= */
(function() {
    'use strict';

    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    window.supabaseClient = null;

    // ---------- بيئة التطوير ----------
    const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const logger = {
        log: (...args) => IS_DEV && console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
    };

    // ========== UUID Generator ==========
    function generateUUID() {
        // استخدام API الحديث إن وُجد
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // استخدام getRandomValues (مُتاح في معظم المتصفحات الحديثة)
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const buf = new Uint8Array(16);
            crypto.getRandomValues(buf);
            buf[6] = (buf[6] & 0x0f) | 0x40;
            buf[8] = (buf[8] & 0x3f) | 0x80;
            const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
            return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
        }
        // احتياطي للمتصفحات القديمة جداً – يعتمد على Math.random لكن مع تحسين بسيط
        let d = Date.now() + performance.now();
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
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

        restoreSession() {
            if (this._user) return true; // مُستعادة مسبقاً
            try {
                const raw = localStorage.getItem('app_session');
                if (raw) {
                    const session = JSON.parse(raw);
                    // استخدام الـ setter لضمان الاتساق (يحفظ في localStorage، يُحدّث tenantId)
                    this.user = {
                        id: session.id,
                        email: session.email,
                        fullName: session.fullName,
                        tenant_id: session.tenant_id
                        // لا نُمرر loginTime لأن الـ setter سيُنشئ واحداً جديداً (وقت الاستعادة)
                    };
                    logger.log('✅ تم استعادة الجلسة من localStorage');
                    return true;
                }
            } catch (e) {
                logger.warn('فشل استعادة الجلسة، جارٍ حذف البيانات التالفة');
                localStorage.removeItem('app_session');
            }
            return false;
        },

        set user(val) {
            this._user = val;
            this._tenantId = val ? (val.tenant_id || null) : null;
            if (val) {
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
                    logger.warn('تعذر حفظ الجلسة في localStorage', e);
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
                // حذف أقدم مفتاح (سياسة FIFO بسيطة)
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

    // تنظيف دوري للكاش منتهي الصلاحية
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
            logger.warn('مكتبة Supabase غير محملة بعد');
            return false;
        }
        try {
            const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
            window.supabaseClient = client;
            // لا نُنشئ اختصاراً عاماً قد يتعارض
            // window.supabase = client;
            logger.log('✅ تم تهيئة Supabase client');
            return true;
        } catch (e) {
            logger.error('❌ فشل تهيئة Supabase', e);
            return false;
        }
    }

    // المحاولة الأولى للتهيئة
    if (!initSupabase()) {
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = setInterval(() => {
            if (window.supabaseClient || retryCount >= maxRetries) {
                clearInterval(retryInterval);
                if (!window.supabaseClient) {
                    logger.error('⚠️ تعذر تهيئة Supabase بعد عدة محاولات');
                }
                return;
            }
            if (typeof supabase !== 'undefined' && initSupabase()) {
                clearInterval(retryInterval);
                logger.log('✅ استعادة الاتصال بـ Supabase');
            }
            retryCount++;
        }, 1500);
    }

    // استعادة الجلسة السابقة بعد تحميل الصفحة
    window.addEventListener('load', () => {
        setTimeout(() => {
            SessionStore.restoreSession();
        }, 100);
    });

    // ========== دالة مساعدة للوصول الآمن لـ localDB ==========
    async function getLocalDBAsync() {
        if (!window.localDB) return null;
        try {
            await window.localDB.initPromise;
            return window.localDB.ready ? window.localDB : null;
        } catch (e) {
            logger.warn('localDB غير جاهز', e);
            return null;
        }
    }
    window.getLocalDBAsync = getLocalDBAsync;

})();
