'use strict';

export const CASH_CUSTOMER_LABEL = 'نقدي (بدون عميل)';
export const CASH_CUSTOMER_STORED = 'نقدي';

// ---------- LRU Cache ----------
export class LRUCache {
    constructor(max = 500) {
        this.max = max;
        this.map = new Map();
    }
    get(key) {
        if (!this.map.has(key)) return undefined;
        const val = this.map.get(key);
        this.map.delete(key);
        this.map.set(key, val);
        return val;
    }
    set(key, val) {
        if (this.map.has(key)) this.map.delete(key);
        else if (this.map.size >= this.max) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
        this.map.set(key, val);
    }
    delete(key) { this.map.delete(key); }
    clear() { this.map.clear(); }
}

export const U = {
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    fmtDate: (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } },
    today: () => new Date().toISOString().split('T')[0],
    escape: (s) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; },
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    uuid: () => (crypto?.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
    dbReady: () => !!(window.DB && window.supabaseClient),
    localReady: () => !!(window.localDB?.ready),
    cssVar: (name, fallback = '') => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; },
    playBeep: (type = 'add') => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            gain.gain.value = 0.1;
            osc.type = 'sine';
            osc.frequency.value = type === 'add' ? 880 : type === 'remove' ? 440 : 660;
            osc.start(); osc.stop(ctx.currentTime + 0.08);
        } catch (e) { /* silent */ }
    }
};

// تفضيلات المستخدم المخزنة
export const UserPrefs = {
    get(key, def) { try { return JSON.parse(localStorage.getItem('pos_prefs'))?.[key] ?? def; } catch { return def; } },
    set(key, val) {
        const prefs = JSON.parse(localStorage.getItem('pos_prefs') || '{}');
        prefs[key] = val;
        localStorage.setItem('pos_prefs', JSON.stringify(prefs));
    },
    getAll() { try { return JSON.parse(localStorage.getItem('pos_prefs') || '{}'); } catch { return {}; } }
};
