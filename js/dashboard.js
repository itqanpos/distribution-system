/* =============================================
   dashboard.css - تنسيقات لوحة التحكم
   بنفس هوية نقطة البيع
   ============================================= */

:root {
    --primary: #2563eb;
    --primary-light: #eff6ff;
    --primary-dark: #1d4ed8;
    --success: #10b981;
    --success-light: #dcfce7;
    --danger: #ef4444;
    --danger-light: #fee2e2;
    --warning: #f59e0b;
    --warning-light: #fef3c7;
    --bg-body: #f8fafc;
    --bg-surface: #ffffff;
    --bg-card: #ffffff;
    --bg-input: #f8fafc;
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-muted: #94a3b8;
    --border-light: #e2e8f0;
    --border-medium: #cbd5e1;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.06);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.08);
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --transition: 0.2s ease;
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
}

[data-theme="dark"] {
    --primary: #6366f1;
    --primary-light: rgba(99,102,241,0.2);
    --primary-dark: #4f46e5;
    --success: #10b981;
    --success-light: rgba(16,185,129,0.2);
    --danger: #ef4444;
    --danger-light: rgba(239,68,68,0.2);
    --warning: #f59e0b;
    --warning-light: rgba(245,158,11,0.2);
    --bg-body: #0f172a;
    --bg-surface: #1e293b;
    --bg-card: #1e293b;
    --bg-input: #334155;
    --text-primary: #f1f5f9;
    --text-secondary: #cbd5e1;
    --text-muted: #94a3b8;
    --border-light: #334155;
    --border-medium: #475569;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Cairo', sans-serif;
    background: var(--bg-body);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* شريط التحميل */
#loading-bar {
    position: fixed; top: 0; left: 0; height: 3px;
    background: var(--primary); width: 0%; z-index: 9999;
    transition: width 0.3s ease;
}

/* بالونة عدم الاتصال */
#offline-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: var(--danger);
    color: white;
    text-align: center;
    padding: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    z-index: 9998;
    transform: translateY(-100%);
    transition: transform 0.3s ease;
}
body.offline #offline-banner { transform: translateY(0); }

/* ========== الشريط العلوي ========== */
.navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-surface);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-light);
    padding: 0 16px;
    height: calc(56px + var(--safe-top));
    padding-top: var(--safe-top);
    position: sticky;
    top: 0;
    z-index: 110;
    flex-shrink: 0;
}
.navbar-left, .navbar-right { display: flex; align-items: center; gap: 10px; }
.menu-toggle {
    background: none; border: none;
    color: var(--text-primary);
    font-size: 1.4rem;
    cursor: pointer;
}
.logo { display: flex; align-items: center; gap: 8px; }
.logo-text h2 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
.navbar-icon-btn {
    width: 40px; height: 40px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: none; border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1.2rem;
    transition: all var(--transition);
}
.navbar-icon-btn:hover {
    background: var(--bg-input);
    color: var(--primary);
    transform: rotate(90deg);
}

/* ========== القائمة الجانبية ========== */
.sidebar-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.35);
    z-index: 149;
    opacity: 0; visibility: hidden;
    transition: 0.3s;
}
.sidebar-overlay.show { opacity: 1; visibility: visible; }
.sidebar {
    position: fixed;
    top: 0;
    right: -320px;
    width: 280px;
    max-width: 85vw;
    height: 100%;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-light);
    padding: calc(20px + var(--safe-top)) 12px 20px 12px;
    z-index: 150;
    transition: right 0.3s cubic-bezier(0.4,0,0.2,1);
    overflow-y: auto;
    box-shadow: var(--shadow-lg);
}
.sidebar.open { right: 0; }
.sidebar-user { text-align: center; margin-bottom: 20px; }
.sidebar-avatar {
    width: 64px; height: 64px;
    background: var(--primary);
    color: white;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 10px;
    font-weight: 700;
    font-size: 1.5rem;
}
.sidebar-user h4 { color: var(--text-primary); }
.menu { list-style: none; }
.menu-section {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    padding: 12px 8px;
}
.menu-item {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    transition: all var(--transition);
}
.menu-item i { width: 22px; margin-left: 10px; }
.menu-item:hover { background: var(--bg-input); color: var(--text-primary); }
.menu-item.active { background: var(--primary-light); color: var(--primary); }

/* ========== المحتوى الرئيسي ========== */
.main-content {
    flex: 1;
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 24px;
}
.page-header h1 { font-size: 1.8rem; font-weight: 800; }
.page-header p { color: var(--text-muted); font-size: 0.9rem; }

/* ========== كروت الإحصائيات ========== */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 30px;
}
.stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: all var(--transition);
    cursor: default;
}
.stat-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
    border-color: var(--primary);
}
.stat-icon {
    width: 50px;
    height: 50px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    flex-shrink: 0;
}
.stat-icon.green { background: var(--success-light); color: var(--success); }
.stat-icon.blue { background: var(--primary-light); color: var(--primary); }
.stat-icon.orange { background: var(--warning-light); color: var(--warning); }
.stat-icon.purple { background: #ede9fe; color: #8b5cf6; }
.stat-icon.teal { background: #ccfbf1; color: #14b8a6; }
.stat-icon.rose { background: #ffe4e6; color: #f43f5e; }

.stat-info h3 {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
}
.stat-info p {
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--text-primary);
}

/* ========== البطاقات السفلية ========== */
.charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}
.chart-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: 20px;
}
.chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}
.chart-header h3 {
    font-size: 1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
}
.btn-sm {
    background: var(--primary-light);
    color: var(--primary);
    border: none;
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all var(--transition);
}
.btn-sm:hover { background: var(--primary); color: white; }
.chart-body { min-height: 150px; }

.summary-row-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--border-light);
}
.summary-row-item:last-child { border-bottom: none; }
.summary-row-item .label { color: var(--text-secondary); font-size: 0.9rem; }
.summary-row-item .value { font-weight: 700; font-size: 0.95rem; }

.invoice-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--border-light);
    font-size: 0.85rem;
}
.invoice-item:last-child { border-bottom: none; }
.invoice-number { font-weight: 700; color: var(--primary); }
.invoice-customer { color: var(--text-secondary); }
.invoice-total { font-weight: 700; }

.skeleton-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: 20px;
    animation: pulse 1.5s infinite;
}
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
}
.empty-state i {
    font-size: 3rem;
    margin-bottom: 16px;
    color: var(--border-medium);
}

/* ========== التجاوب ========== */
@media (max-width: 768px) {
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .charts-grid { grid-template-columns: 1fr; }
    .main-content { padding: 12px; }
    .page-header h1 { font-size: 1.4rem; }
    .stat-card { padding: 14px; gap: 12px; }
    .stat-icon { width: 40px; height: 40px; font-size: 1.2rem; }
    .stat-info p { font-size: 1.1rem; }
}
@media (max-width: 480px) {
    .stats-grid { grid-template-columns: 1fr; }
    .navbar { padding: 0 10px; }
    .main-content { padding: 10px; }
}
