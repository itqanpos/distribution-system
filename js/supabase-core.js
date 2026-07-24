/* =============================================
   supabase-core.js - العميل وتهيئة الجلسة (مُحسَّن)
   ============================================= */
(function() {
    'use strict';

    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    window.supabaseClient = null;

    const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const logger = {
        log: (...args) => IS_DEV && console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
    };

    // ---------- UUID Generator ----------
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const buf = new Uint8Array(16);
            crypto.getRandomValues(buf);
            buf[6] = (buf[6] & 0x0f) | 0x40;
            buf[8] = (buf[8] & 0x3f) | 0x80;
            const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
            return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
        }
        let d = Date.now() + performance.now();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
    window.generateUUID = generateUUID;

    // ---------- Session Store ----------
    const SessionStore = {
        _user: null,
        _tenantId: null,
        _cache: new Map(),
        _cacheTimes: new Map(),
        _maxCacheSize: 50,

        restoreSession() {
            if (this._user) return true;
            try {
                const raw = localStorage.getItem('app_session');
                if (raw) {
                    const session = JSON.parse(raw);
                    this.user = {
                        id: session.id,
                        email: session.email,
                        fullName: session.fullName,
                        tenant_id: session.tenant_id
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
                try {
                    localStorage.setItem('app_session', JSON.stringify({
                        id: val.id,
                        email: val.email,
                        fullName: val.fullName,
                        tenant_id: val.tenant_id,
                        loginTime: new Date().toLocaleString('ar-EG')
                    }));
                } catch (e) { /* تجاهل */ }
            } else {
                try { localStorage.removeItem('app_session'); } catch (e) { /* تجاهل */ }
                this._cache.clear();
                this._cacheTimes.clear();
            }
        },
        get user() { return this._user; },
        get tenantId() { return this._tenantId; },

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

    // تنظيف دوري للكاش
    setInterval(() => {
        const now = Date.now();
        for (const [key, expiry] of SessionStore._cacheTimes) {
            if (now > expiry) {
                SessionStore._cache.delete(key);
                SessionStore._cacheTimes.delete(key);
            }
        }
    }, 60000);

    // ---------- تهيئة Supabase ----------
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
                realtime: { params: { eventsPerSecond: 10 } },
                global: { headers: { 'X-Client-Info': 'hesaby/4.0' } }
            });
            window.supabaseClient = client;
            logger.log('✅ تم تهيئة Supabase client');
            return true;
        } catch (e) {
            logger.error('❌ فشل تهيئة Supabase', e);
            return false;
        }
    }

    if (!initSupabase()) {
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = setInterval(() => {
            if (window.supabaseClient || retryCount >= maxRetries) {
                clearInterval(retryInterval);
                return;
            }
            if (typeof supabase !== 'undefined' && initSupabase()) {
                clearInterval(retryInterval);
            }
            retryCount++;
        }, 1500);
    }

    window.addEventListener('load', () => {
        setTimeout(() => SessionStore.restoreSession(), 100);
    });

    // دالة مساعدة للحصول على العميل
    window.getSupabaseClient = () => {
        return new Promise(resolve => {
            if (window.supabaseClient) return resolve(window.supabaseClient);
            const check = setInterval(() => {
                if (window.supabaseClient) { clearInterval(check); resolve(window.supabaseClient); }
            }, 100);
        });
    };

})();
