/* =============================================
   utils.js - Shared Utilities
   ============================================= */
(function() {
    'use strict';
    
    const CFG = window.APP_CONFIG;
    
    window.U = {
        money(v) {
            const n = Number(v || 0);
            return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (CFG?.CURRENCY || 'ج.م');
        },
        moneyRaw(v) {
            return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        date(d) {
            if (!d) return '';
            try {
                return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
            } catch { return d; }
        },
        dateTime(d) {
            if (!d) return '';
            try {
                return new Date(d).toLocaleString('ar-EG', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch { return d; }
        },
        time(d) {
            if (!d) return '';
            try {
                return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            } catch { return ''; }
        },
        today() {
            return new Date().toISOString().split('T')[0];
        },
        round(v, d = 2) {
            return Math.round((Number(v) + Number.EPSILON) * 10 ** d) / 10 ** d;
        },
        uuid() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        },
        escape(s) {
            const div = document.createElement('div');
            div.textContent = s ?? '';
            return div.innerHTML;
        },
        debounce(fn, ms = 300) {
            let t;
            return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn(...args), ms);
            };
        },
        throttle(fn, ms = 300) {
            let last = 0;
            return (...args) => {
                const now = Date.now();
                if (now - last >= ms) {
                    last = now;
                    fn(...args);
                }
            };
        },
        ls: {
            get(key, fallback = null) {
                try {
                    const v = localStorage.getItem('hesaby_' + key);
                    return v ? JSON.parse(v) : fallback;
                } catch { return fallback; }
            },
            set(key, value) {
                try {
                    localStorage.setItem('hesaby_' + key, JSON.stringify(value));
                } catch (e) { console.warn('LS error', e); }
            },
            remove(key) {
                try {
                    localStorage.removeItem('hesaby_' + key);
                } catch {}
            }
        },
        setTheme(theme) {
            document.documentElement.dataset.theme = theme;
            U.ls.set('theme', theme);
        },
        getTheme() {
            return U.ls.get('theme', CFG?.DEFAULT_THEME || 'light');
        },
        $(s, root = document) {
            return root.querySelector(s);
        },
        $$(s, root = document) {
            return [...root.querySelectorAll(s)];
        },
        on(root, selector, event, handler) {
            if (!root) return;
            root.addEventListener(event, (e) => {
                const target = e.target.closest(selector);
                if (target && root.contains(target)) handler(e, target);
            });
        },
        async copy(text) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                return false;
            }
        },
        download(filename, content, type = 'text/plain') {
            const blob = new Blob([content], { type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
        toCSV(rows) {
            return rows.map(row => 
                row.map(cell => {
                    const s = String(cell ?? '');
                    return (s.includes(',') || s.includes('"') || s.includes('\n'))
                        ? '"' + s.replace(/"/g, '""') + '"'
                        : s;
                }).join(',')
            ).join('\n');
        }
    };
    
    document.documentElement.dataset.theme = U.getTheme();
    console.log('✅ utils.js loaded');
})();
