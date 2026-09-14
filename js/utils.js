/* =============================================
   utils.js - Shared Utilities
   Version: 2.0.0 (Fixed)
   
   Fixes:
   - [1] U.today() → تاريخ محلي بدل UTC
   - [2] U.round() → تقريب صحيح للفاصلة العشرية
   - [3] U.escape() → بدون DOM (أداء أفضل)
   - [4] U.download() → BOM لـ Excel العربي
   - [5] U.uuid() → fallback آمن بـ getRandomValues
   - [6] U.ls.get() → تشخيص أوضح للبيانات التالفة
   - [7] U.on() → يحمي من selector غير صالح
   - [8] U.debounce/throttle → cancel()
   - [9] U.copy() → fallback للمتصفحات القديمة
   ============================================= */
(function() {
    'use strict';

    const getCfg = () => window.APP_CONFIG || {};

    /* ============================================
       LocalStorage (يُستخدم داخليًا قبل تعريف U)
       ============================================ */
    const ls = {
        get(key, fallback = null) {
            try {
                const v = localStorage.getItem('hesaby_' + key);
                if (v === null) return fallback;
                const parsed = JSON.parse(v);
                return parsed === undefined ? fallback : parsed;
            } catch (e) {
                console.warn(`LS corrupted for key "${key}", using fallback`);
                return fallback;
            }
        },
        set(key, value) {
            try { localStorage.setItem('hesaby_' + key, JSON.stringify(value)); }
            catch (e) { console.warn('LS set error', e); }
        },
        remove(key) {
            try { localStorage.removeItem('hesaby_' + key); }
            catch { /* ignore */ }
        }
    };

    window.U = {
        /* ============================================
           Money
           ============================================ */
        money(v) {
            const n = Number(v);
            if (!isFinite(n)) return '0.00 ' + (getCfg().CURRENCY || 'ج.م');
            return n.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + ' ' + (getCfg().CURRENCY || 'ج.م');
        },

        moneyRaw(v) {
            const n = Number(v);
            if (!isFinite(n)) return '0.00';
            return n.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },

        /* ============================================
           Dates — ✅ [FIX #1] محلية بالكامل
           ============================================ */
        date(d) {
            if (!d) return '';
            try {
                return new Date(d).toLocaleDateString('ar-EG', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
            } catch { return String(d); }
        },

        dateTime(d) {
            if (!d) return '';
            try {
                return new Date(d).toLocaleString('ar-EG', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch { return String(d); }
        },

        time(d) {
            if (!d) return '';
            try {
                return new Date(d).toLocaleTimeString('ar-EG', {
                    hour: '2-digit', minute: '2-digit'
                });
            } catch { return ''; }
        },

        // ✅ [FIX #1] تاريخ محلي (Y-M-D) — متوافق مع db.localDateStr
        today() {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        },

        /* ============================================
           Round — ✅ [FIX #2] يعمل بشكل صحيح لأي d
           ============================================ */
        round(v, d = 2) {
            const n = Number(v);
            if (!isFinite(n)) return 0;
            const factor = Math.pow(10, d);
            const scaled = n * factor;
            // تعويض طفيف للأخطاء العشرية (أصغر من أي وحدة نقدية واقعية)
            const eps = scaled >= 0 ? 1e-9 : -1e-9;
            return Math.round(scaled + eps) / factor;
        },

        /* ============================================
           UUID — ✅ [FIX #5] fallback آمن
           ============================================ */
        uuid() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                const bytes = crypto.getRandomValues(new Uint8Array(16));
                bytes[6] = (bytes[6] & 0x0f) | 0x40;
                bytes[8] = (bytes[8] & 0x3f) | 0x80;
                const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
                return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
            }
            // ملاذ أخير (غير آمن — للتطوير فقط)
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        },

        /* ============================================
           Escape — ✅ [FIX #3] بدون DOM
           ============================================ */
        escape(s) {
            return String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        /* ============================================
           Timing — ✅ [FIX #8] cancel()
           ============================================ */
        debounce(fn, ms = 300) {
            let t = null;
            const wrapped = (...args) => {
                if (t) clearTimeout(t);
                t = setTimeout(() => { t = null; fn(...args); }, ms);
            };
            wrapped.cancel = () => { if (t) { clearTimeout(t); t = null; } };
            return wrapped;
        },

        throttle(fn, ms = 300) {
            let last = 0;
            let pending = null;
            const wrapped = (...args) => {
                const now = Date.now();
                if (now - last >= ms) {
                    last = now;
                    fn(...args);
                } else if (!pending) {
                    pending = setTimeout(() => {
                        last = Date.now();
                        pending = null;
                        fn(...args);
                    }, ms - (now - last));
                }
            };
            wrapped.cancel = () => {
                if (pending) { clearTimeout(pending); pending = null; }
            };
            return wrapped;
        },

        /* ============================================
           LocalStorage API
           ============================================ */
        ls,

        /* ============================================
           Theme
           ============================================ */
        setTheme(theme) {
            document.documentElement.dataset.theme = theme;
            ls.set('theme', theme);
        },
        getTheme() {
            return ls.get('theme', getCfg().DEFAULT_THEME || 'light');
        },

        /* ============================================
           DOM Helpers
           ============================================ */
        $(s, root = document) { return root.querySelector(s); },
        $$(s, root = document) { return [...root.querySelectorAll(s)]; },

        // ✅ [FIX #7] حماية من selector غير صالح
        on(root, selector, event, handler) {
            if (!root || !selector) return;
            root.addEventListener(event, (e) => {
                try {
                    const target = e.target?.closest?.(selector);
                    if (target && root.contains(target)) handler(e, target);
                } catch (err) {
                    console.warn('U.on invalid selector:', selector, err);
                }
            });
        },

        /* ============================================
           Copy — ✅ [FIX #9] fallback
           ============================================ */
        async copy(text) {
            const str = String(text ?? '');
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(str);
                    return true;
                }
            } catch { /* fall through */ }
            try {
                const ta = document.createElement('textarea');
                ta.value = str;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return ok;
            } catch { return false; }
        },

        /* ============================================
           Download — ✅ [FIX #4] BOM للنصوص
           ============================================ */
        download(filename, content, type = 'text/plain') {
            const needsBOM = type.includes('text/') || type.includes('csv');
            const body = needsBOM ? ['\uFEFF', content] : [content];
            const blob = new Blob(body, { type: `${type};charset=utf-8` });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        },

        /* ============================================
           CSV
           ============================================ */
        toCSV(rows) {
            if (!Array.isArray(rows)) return '';
            return rows.map(row => {
                if (!Array.isArray(row)) return '';
                return row.map(cell => {
                    const s = String(cell ?? '');
                    return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
                        ? '"' + s.replace(/"/g, '""') + '"'
                        : s;
                }).join(',');
            }).join('\r\n');
        }
    };

    // ✅ [FIX] تفعيل الثيم عند التحميل
    document.documentElement.dataset.theme = U.getTheme();
})();
