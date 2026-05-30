/* =============================================
   supabase-core.js - العميل وتهيئة الجلسة
   ============================================= */
(function() {
    'use strict';

    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    window.supabaseClient = null;

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
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
    window.generateUUID = generateUUID;

    const SessionStore = {
        _user: null, _tenantId: null, _settings: null,
        _cache: new Map(), _cacheTimes: new Map(), _maxCacheSize: 50,

        set user(val) {
            this._user = val;
            this._tenantId = val?.tenant_id || null;
            if (val) {
                const session = {
                    id: val.id, email: val.email, fullName: val.fullName,
                    tenant_id: val.tenant_id, loginTime: new Date().toLocaleString('ar-EG')
                };
                localStorage.setItem('app_session', JSON.stringify(session));
            } else {
                localStorage.removeItem('app_session');
                this._cache.clear(); this._cacheTimes.clear(); this._settings = null;
            }
        },
        get user() { return this._user; },
        get tenantId() { return this._tenantId; },

        setCache(key, data, ttl = 300000) {
            if (this._cache.size >= this._maxCacheSize) {
                const firstKey = this._cache.keys().next().value;
                this._cache.delete(firstKey); this._cacheTimes.delete(firstKey);
            }
            this._cache.set(key, data);
            this._cacheTimes.set(key, Date.now() + ttl);
        },
        getCache(key) {
            const expiry = this._cacheTimes.get(key);
            if (expiry && Date.now() > expiry) { this._cache.delete(key); this._cacheTimes.delete(key); return undefined; }
            return this._cache.get(key);
        },
        invalidate(key) {
            if (key) { this._cache.delete(key); this._cacheTimes.delete(key); }
            else { this._cache.clear(); this._cacheTimes.clear(); }
        }
    };
    window.SessionStore = SessionStore;

    setInterval(() => {
        const now = Date.now();
        for (const [key, expiry] of SessionStore._cacheTimes) {
            if (now > expiry) { SessionStore._cache.delete(key); SessionStore._cacheTimes.delete(key); }
        }
    }, 60000);

    function initSupabase() {
        if (typeof supabase === 'undefined') {
            console.warn('Supabase library not loaded');
            return false;
        }
        try {
            window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: { storage: localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
                realtime: { params: { eventsPerSecond: 10 } },
                global: { headers: { 'X-Client-Info': 'hesaby/4.0' } }
            });
            window.supabase = window.supabaseClient;
            console.log('✅ Supabase client initialized');
            return true;
        } catch (e) {
            console.error('❌ Failed to initialize Supabase', e);
            return false;
        }
    }

    // محاولة التهيئة فوراً مع إعادة المحاولة عند الحاجة
    if (!initSupabase()) {
        let retryCount = 0;
        const retryInterval = setInterval(() => {
            if (window.supabaseClient || retryCount >= 10) {
                clearInterval(retryInterval);
                return;
            }
            if (typeof supabase !== 'undefined' && initSupabase()) {
                clearInterval(retryInterval);
                console.log('✅ استعادة الاتصال بالنواة');
            }
            retryCount++;
        }, 1500);
    }

    function getLocalDB() {
        return (window.localDB && window.localDB.ready) ? window.localDB : null;
    }
    window.getLocalDB = getLocalDB;
})();
