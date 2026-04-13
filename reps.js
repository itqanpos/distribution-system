<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <base href="/distribution-system/">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>المندوبين - نظام التوزيع الغذائي</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="manifest" href="./manifest.json">
    <style>
        :root {
            --primary: #2c3e50;
            --secondary: #3498db;
            --success: #2ecc71;
            --danger: #e74c3c;
            --warning: #f39c12;
            --info: #1abc9c;
            --light: #ecf0f1;
            --dark: #34495e;
            --sidebar-width: 260px;
            --sidebar-collapsed-width: 70px;
            --header-height: 65px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, sans-serif; }
        body { background: #f5f7fa; color: #2c3e50; overflow-x: hidden; }

        /* ========== شريط التنقل ========== */
        .navbar {
            position: fixed; top: 0; right: 0; left: 0; height: var(--header-height);
            background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            padding: 0 20px; display: flex; align-items: center; justify-content: space-between;
            z-index: 1030; border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .navbar-left { display: flex; align-items: center; gap: 15px; }
        .menu-toggle {
            background: none; border: none; font-size: 24px; color: var(--primary);
            cursor: pointer; width: 40px; height: 40px; border-radius: 10px;
        }
        .logo { display: flex; align-items: center; gap: 12px; }
        .logo-icon {
            background: linear-gradient(135deg, var(--secondary), var(--info)); color: white;
            width: 38px; height: 38px; border-radius: 12px; display: flex;
            align-items: center; justify-content: center; font-size: 20px;
        }
        .logo-text h2 { font-size: 20px; font-weight: 700; color: var(--primary); }
        .navbar-right { display: flex; align-items: center; gap: 15px; }
        .user-profile {
            display: flex; align-items: center; gap: 12px; cursor: pointer;
            padding: 5px 10px; border-radius: 40px; transition: background 0.2s;
        }
        .user-avatar {
            width: 42px; height: 42px; background: linear-gradient(135deg, var(--success), var(--info));
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            color: white; font-weight: bold; font-size: 18px;
        }
        .user-info { text-align: right; }
        .user-info h4 { font-size: 15px; font-weight: 600; color: var(--primary); }
        .user-info p { font-size: 12px; color: #7f8c8d; }
        .logout-btn {
            background: none; border: none; color: var(--danger); font-size: 20px;
            cursor: pointer; padding: 8px; border-radius: 10px; transition: all 0.2s;
        }

        /* ========== الشريط الجانبي ========== */
        .sidebar {
            position: fixed; top: var(--header-height); right: 0; bottom: 0;
            width: var(--sidebar-width); background: white; box-shadow: -4px 0 15px rgba(0,0,0,0.02);
            border-left: 1px solid rgba(0,0,0,0.05); transition: width 0.25s ease; z-index: 1020;
            overflow-y: auto; overflow-x: hidden; padding: 20px 0;
        }
        .sidebar.collapsed { width: var(--sidebar-collapsed-width); }
        .sidebar .menu-section {
            padding: 20px 20px 8px; color: #95a5a6; font-size: 11px; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;
            opacity: 1; transition: opacity 0.15s;
        }
        .sidebar.collapsed .menu-section { opacity: 0; pointer-events: none; padding: 20px 0 8px; text-align: center; }
        .menu { list-style: none; padding: 0 12px; }
        .menu-item {
            display: flex; align-items: center; gap: 14px; padding: 12px 16px; margin: 4px 0;
            color: var(--dark); text-decoration: none; border-radius: 12px; transition: all 0.2s;
            white-space: nowrap; font-weight: 500; font-size: 15px;
        }
        .menu-item i { width: 24px; font-size: 1.2rem; text-align: center; flex-shrink: 0; }
        .menu-text { transition: opacity 0.2s; }
        .sidebar.collapsed .menu-text { opacity: 0; pointer-events: none; }
        .menu-item:hover { background: var(--light); color: var(--secondary); }
        .menu-item.active {
            background: linear-gradient(to left, rgba(52,152,219,0.1), transparent);
            color: var(--secondary); font-weight: 600; border-right: 4px solid var(--secondary);
        }

        /* ========== المحتوى الرئيسي ========== */
        .main-content {
            margin-right: var(--sidebar-width); margin-top: var(--header-height);
            padding: 25px; transition: margin-right 0.25s ease;
            min-height: calc(100vh - var(--header-height));
        }
        .sidebar.collapsed ~ .main-content { margin-right: var(--sidebar-collapsed-width); }

        /* ========== البطاقات ========== */
        .page-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 30px; flex-wrap: wrap; gap: 15px;
        }
        .page-title { display: flex; align-items: center; gap: 12px; }
        .page-title h1 { font-size: 26px; font-weight: 700; color: var(--primary); }
        .btn {
            padding: 10px 18px; border: none; border-radius: 12px; font-weight: 600;
            display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
            transition: all 0.2s; font-size: 14px;
        }
        .btn-primary { background: var(--secondary); color: white; box-shadow: 0 4px 10px rgba(52,152,219,0.2); }
        .btn-outline { background: white; border: 1px solid #ddd; color: var(--primary); }
        .btn-success { background: var(--success); color: white; }

        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 20px; margin-bottom: 30px;
        }
        .stat-card {
            background: white; border-radius: 20px; padding: 20px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.03);
            text-align: center;
        }
        .stat-card .icon { font-size: 28px; margin-bottom: 10px; }
        .stat-card .value { font-size: 24px; font-weight: 700; color: var(--primary); }
        .stat-card .label { color: #7f8c8d; font-size: 14px; }
        .stat-card.count .icon { color: var(--secondary); }
        .stat-card.sales .icon { color: var(--success); }
        .stat-card.collections .icon { color: var(--warning); }
        .stat-card.target .icon { color: var(--primary); }

        /* ========== جدول ========== */
        .table-container {
            background: white; border-radius: 20px; padding: 20px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.03);
        }
        .table-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 20px;
        }
        .search-wrapper {
            display: flex; align-items: center; background: #f8fafc;
            border-radius: 40px; padding: 5px 15px; min-width: 250px;
        }
        .search-wrapper i { color: #95a5a6; margin-left: 10px; }
        .search-wrapper input {
            border: none; background: transparent; padding: 10px 0; width: 100%;
            font-size: 14px; outline: none;
        }
        table { width: 100%; border-collapse: collapse; }
        th {
            text-align: right; padding: 15px 10px; color: #7f8c8d; font-weight: 600;
            font-size: 13px; border-bottom: 1px solid #eee;
        }
        td { padding: 14px 10px; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
        tr:hover { background: #fafbfc; }
        .progress-container {
            width: 80px; height: 6px; background: #e0e0e0; border-radius: 10px;
            overflow: hidden; display: inline-block; margin-right: 8px;
        }
        .progress-fill { height: 100%; background: var(--success); border-radius: 10px; }
        .performance-high { color: var(--success); }
        .performance-mid { color: var(--warning); }
        .performance-low { color: var(--danger); }

        .action-buttons { display: flex; gap: 5px; }
        .action-icon {
            color: var(--secondary); margin: 0 5px; cursor: pointer;
            transition: transform 0.2s;
        }
        .action-icon:hover { transform: scale(1.2); }

        /* ========== مودال ========== */
        .modal {
            display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 2000;
        }
        .modal-content {
            background: white; border-radius: 24px; padding: 25px; width: 90%; max-width: 500px;
            max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.15);
        }
        .modal-header {
            display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
        }
        .modal-header h2 { font-size: 22px; color: var(--primary); }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; }
        .form-group input, .form-group select {
            width: 100%; padding: 14px; border: 2px solid #eef2f6; border-radius: 14px;
            font-size: 16px;
        }

        /* استجابة */
        @media (max-width: 992px) {
            .sidebar { transform: translateX(100%); box-shadow: -10px 0 30px rgba(0,0,0,0.1); }
            .sidebar.mobile-open { transform: translateX(0); }
            .sidebar.collapsed { width: var(--sidebar-width); transform: translateX(100%); }
            .sidebar.collapsed.mobile-open { transform: translateX(0); }
            .main-content { margin-right: 0 !important; }
            .menu-toggle { display: flex; }
            .logo-text p { display: none; }
            .user-info { display: none; }
        }
        @media (min-width: 993px) { .menu-toggle { display: none; } }
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="navbar-left">
            <button class="menu-toggle" id="menuToggle"><i class="fas fa-bars"></i></button>
            <div class="logo"><div class="logo-icon"><i class="fas fa-truck"></i></div><div class="logo-text"><h2>نظام التوزيع</h2></div></div>
        </div>
        <div class="navbar-right">
            <div class="user-profile">
                <div class="user-avatar" id="userAvatar">م</div>
                <div class="user-info"><h4 id="userName">مدير النظام</h4><p id="loginTime">اليوم</p></div>
            </div>
            <button class="logout-btn" onclick="UI.logout()"><i class="fas fa-sign-out-alt"></i></button>
        </div>
    </nav>

    <aside class="sidebar" id="sidebar">
        <ul class="menu">
            <div class="menu-section">الرئيسية</div>
            <li><a class="menu-item" href="./dashboard.html"><i class="fas fa-tachometer-alt"></i><span class="menu-text">لوحة التحكم</span></a></li>
            <li><a class="menu-item" href="./sales.html"><i class="fas fa-chart-line"></i><span class="menu-text">المبيعات</span></a></li>
            <li><a class="menu-item" href="./pos.html"><i class="fas fa-cash-register"></i><span class="menu-text">نقطة البيع</span></a></li>
            <li><a class="menu-item" href="./invoices.html"><i class="fas fa-file-invoice"></i><span class="menu-text">الفواتير</span></a></li>
            <li><a class="menu-item" href="./purchases.html"><i class="fas fa-shopping-cart"></i><span class="menu-text">المشتريات</span></a></li>
            <li><a class="menu-item" href="./cashbox.html"><i class="fas fa-cash-register"></i><span class="menu-text">الصندوق</span></a></li>
            <li><a class="menu-item" href="./reports.html"><i class="fas fa-chart-bar"></i><span class="menu-text">التقارير</span></a></li>
            <li><a class="menu-item" href="./accounting.html"><i class="fas fa-calculator"></i><span class="menu-text">المحاسبة</span></a></li>
            <div class="menu-section">الإدارة</div>
            <li><a class="menu-item" href="./customers.html"><i class="fas fa-user-tie"></i><span class="menu-text">العملاء والموردين</span></a></li>
            <li><a class="menu-item active" href="./reps.html"><i class="fas fa-users"></i><span class="menu-text">المندوبين</span></a></li>
            <li><a class="menu-item" href="./products.html"><i class="fas fa-boxes"></i><span class="menu-text">المنتجات</span></a></li>
            <li><a class="menu-item" href="./settings.html"><i class="fas fa-cog"></i><span class="menu-text">الإعدادات</span></a></li>
        </ul>
    </aside>

    <main class="main-content">
        <div class="page-header">
            <div class="page-title"><i class="fas fa-users" style="font-size:28px; color:var(--secondary);"></i><h1>المندوبين</h1></div>
            <div>
                <button class="btn btn-outline" onclick="UI.manualRefresh()"><i class="fas fa-sync-alt"></i> تحديث</button>
                <button class="btn btn-primary" onclick="openRepModal()"><i class="fas fa-plus"></i> مندوب جديد</button>
                <button class="btn btn-success" onclick="printRepsReport()"><i class="fas fa-print"></i> تقرير الأداء</button>
            </div>
        </div>

        <!-- بطاقات ملخص -->
        <div class="stats-grid">
            <div class="stat-card count"><div class="icon"><i class="fas fa-user-tie"></i></div><div class="value" id="totalReps">0</div><div class="label">عدد المندوبين</div></div>
            <div class="stat-card sales"><div class="icon"><i class="fas fa-chart-line"></i></div><div class="value" id="totalSales">0 ج</div><div class="label">إجمالي المبيعات</div></div>
            <div class="stat-card collections"><div class="icon"><i class="fas fa-hand-holding-usd"></i></div><div class="value" id="totalCollections">0 ج</div><div class="label">إجمالي التحصيلات</div></div>
            <div class="stat-card target"><div class="icon"><i class="fas fa-bullseye"></i></div><div class="value" id="avgPerformance">0%</div><div class="label">متوسط تحقيق الهدف</div></div>
        </div>

        <!-- جدول المندوبين -->
        <div class="table-container">
            <div class="table-header">
                <h3><i class="fas fa-list-ul"></i> قائمة المندوبين</h3>
                <div class="search-wrapper"><i class="fas fa-search"></i><input type="text" id="searchInput" placeholder="بحث..."></div>
            </div>
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>المندوب</th><th>المنطقة</th><th>المبيعات</th><th>التحصيلات</th><th>الهدف</th>
                            <th>نسبة الإنجاز</th><th>المستحقات</th><th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="repsTableBody"></tbody>
                </table>
            </div>
        </div>
    </main>

    <!-- مودال إضافة/تعديل مندوب -->
    <div class="modal" id="repModal">
        <div class="modal-content">
            <div class="modal-header"><h2 id="modalTitle">مندوب جديد</h2><button class="close-btn" onclick="closeRepModal()">&times;</button></div>
            <form id="repForm" onsubmit="saveRep(event)">
                <input type="hidden" id="repId">
                <div class="form-group"><label>اسم المندوب</label><input type="text" id="repName" required></div>
                <div class="form-group"><label>الهاتف</label><input type="tel" id="repPhone"></div>
                <div class="form-group"><label>المنطقة</label><input type="text" id="repRegion"></div>
                <div class="form-group"><label>الهدف الشهري (ج)</label><input type="number" id="repTarget" min="0" value="15000"></div>
                <div class="form-group"><label>نسبة العمولة (%)</label><input type="number" id="repCommission" min="0" max="100" step="0.5" value="5"></div>
                <div class="form-group"><label>اسم المستخدم للدخول</label><input type="text" id="repUsername" placeholder="للدخول إلى التطبيق"></div>
                <div class="form-group"><label>كلمة المرور</label><input type="password" id="repPassword" placeholder="اترك فارغاً للإبقاء"></div>
                <div class="modal-footer"><button type="button" class="btn" onclick="closeRepModal()">إلغاء</button><button type="submit" class="btn btn-primary">حفظ</button></div>
            </form>
        </div>
    </div>

    <!-- مودال حركة (مبيعات/تحصيل) -->
    <div class="modal" id="transactionModal">
        <div class="modal-content">
            <div class="modal-header"><h2 id="transModalTitle">تسجيل حركة</h2><button class="close-btn" onclick="closeTransactionModal()">&times;</button></div>
            <form id="transactionForm" onsubmit="saveRepTransaction(event)">
                <input type="hidden" id="transRepId">
                <div class="form-group"><label>نوع الحركة</label><select id="transType" required><option value="sale">مبيعات</option><option value="collection">تحصيل</option></select></div>
                <div class="form-group"><label>المبلغ (ج)</label><input type="number" id="transAmount" min="0.01" step="0.01" required></div>
                <div class="form-group"><label>التاريخ</label><input type="date" id="transDate" required></div>
                <div class="form-group"><label>ملاحظات</label><input type="text" id="transNotes"></div>
                <div class="modal-footer"><button type="button" class="btn" onclick="closeTransactionModal()">إلغاء</button><button type="submit" class="btn btn-primary">حفظ</button></div>
            </form>
        </div>
    </div>

    <script src="./js/auth.js"></script>
    <script src="./js/storage.js"></script>
    <script src="./js/utils.js"></script>
    <script src="./js/ui.js"></script>
    <script>
        // الشريط الجانبي
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menuToggle');
        function toggleSidebar() {
            if (window.innerWidth <= 992) sidebar.classList.toggle('mobile-open');
            else sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        }
        menuToggle.addEventListener('click', toggleSidebar);
        if (window.innerWidth > 992 && localStorage.getItem('sidebarCollapsed') === 'true') sidebar.classList.add('collapsed');
        document.querySelectorAll('.menu-item').forEach(link => link.addEventListener('click', () => { if (window.innerWidth <= 992) sidebar.classList.remove('mobile-open'); }));

        let reps = [];

        document.addEventListener('DOMContentLoaded', async () => {
            if (!Auth.requireAuth()) return;
            if (!Auth.requireRole(['admin'])) return;
            await UI.initPage('المندوبين', { enablePullToRefresh: true, refreshCallback: loadReps, autoSync: true, syncCallback: loadReps });

            const user = Auth.getUser();
            document.getElementById('userName').textContent = user.name;
            document.getElementById('loginTime').textContent = user.loginTime || 'اليوم';
            document.getElementById('userAvatar').textContent = user.avatar;
            document.getElementById('transDate').value = Utils.getToday();

            await loadReps();
            document.getElementById('searchInput').addEventListener('input', filterReps);
        });

        async function loadReps() {
            reps = await Storage.getReps();
            renderTable(reps);
            updateSummary();
        }

        function renderTable(data) {
            const tbody = document.getElementById('repsTableBody');
            if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;">لا يوجد مندوبين</td></tr>'; return; }
            tbody.innerHTML = data.map(rep => {
                const perf = rep.target ? (rep.sales/rep.target)*100 : 0;
                let perfClass = perf >= 90 ? 'performance-high' : (perf >= 70 ? 'performance-mid' : 'performance-low');
                const comm = rep.sales * rep.commission / 100;
                const due = comm - (rep.collections||0);
                return `<tr>
                    <td>${rep.name}</td><td>${rep.region||'-'}</td>
                    <td>${Utils.formatMoney(rep.sales)}</td><td>${Utils.formatMoney(rep.collections)}</td><td>${Utils.formatMoney(rep.target)}</td>
                    <td><div style="display:flex;align-items:center;"><span class="${perfClass}">${Math.round(perf)}%</span><div class="progress-container"><div class="progress-fill" style="width:${Math.min(perf,100)}%"></div></div></div></td>
                    <td style="color:${due>0?'var(--danger)':'var(--success)'}">${Utils.formatMoney(due)}</td>
                    <td class="action-buttons">
                        <i class="fas fa-eye action-icon" onclick="viewRep(${rep.id})" title="تفاصيل"></i>
                        <i class="fas fa-edit action-icon" onclick="editRep(${rep.id})" title="تعديل"></i>
                        <i class="fas fa-cart-plus action-icon" style="color:var(--success);" onclick="openTransactionModal(${rep.id},'sale')" title="مبيعات"></i>
                        <i class="fas fa-money-bill action-icon" style="color:var(--warning);" onclick="openTransactionModal(${rep.id},'collection')" title="تحصيل"></i>
                    </td>
                </tr>`;
            }).join('');
        }

        function filterReps() {
            const term = document.getElementById('searchInput').value.toLowerCase();
            const filtered = reps.filter(r => r.name.toLowerCase().includes(term) || (r.region||'').includes(term));
            renderTable(filtered);
        }

        function updateSummary() {
            const cnt = reps.length;
            const sales = reps.reduce((s,r)=>s+r.sales,0);
            const coll = reps.reduce((s,r)=>s+r.collections,0);
            const avg = reps.length ? reps.reduce((s,r)=>s+(r.target?r.sales/r.target:0),0)/reps.length*100 : 0;
            document.getElementById('totalReps').textContent = cnt;
            document.getElementById('totalSales').textContent = Utils.formatMoney(sales);
            document.getElementById('totalCollections').textContent = Utils.formatMoney(coll);
            document.getElementById('avgPerformance').textContent = Math.round(avg)+'%';
        }

        function openRepModal() {
            document.getElementById('modalTitle').textContent = 'مندوب جديد';
            document.getElementById('repForm').reset();
            document.getElementById('repId').value = '';
            document.getElementById('repModal').style.display = 'flex';
        }

        function editRep(id) {
            const rep = reps.find(r=>r.id===id); if(!rep)return;
            document.getElementById('modalTitle').textContent = 'تعديل مندوب';
            document.getElementById('repId').value = rep.id;
            document.getElementById('repName').value = rep.name;
            document.getElementById('repPhone').value = rep.phone||'';
            document.getElementById('repRegion').value = rep.region||'';
            document.getElementById('repTarget').value = rep.target;
            document.getElementById('repCommission').value = rep.commission;
            document.getElementById('repModal').style.display = 'flex';
        }

        function closeRepModal() { document.getElementById('repModal').style.display = 'none'; }

        async function saveRep(event) {
            event.preventDefault();
            const id = document.getElementById('repId').value;
            const name = document.getElementById('repName').value;
            const phone = document.getElementById('repPhone').value;
            const region = document.getElementById('repRegion').value;
            const target = parseFloat(document.getElementById('repTarget').value)||15000;
            const commission = parseFloat(document.getElementById('repCommission').value)||5;
            const username = document.getElementById('repUsername').value;
            const password = document.getElementById('repPassword').value;

            if (id) {
                const idx = reps.findIndex(r=>r.id==id);
                if(idx>=0) reps[idx] = {...reps[idx], name, phone, region, target, commission};
            } else {
                const newId = Date.now();
                reps.push({ id: newId, name, phone, region, target, commission, sales:0, collections:0 });
                if (username) {
                    const users = await Storage.getUsers();
                    users.push({ id: Date.now()+1, username, password, fullName: name, role: 'rep', repId: newId, status: 'active' });
                    await Storage.saveUsers(users);
                }
            }
            await Storage.saveReps(reps);
            renderTable(reps); updateSummary();
            closeRepModal();
        }

        function viewRep(id) {
            const r = reps.find(x=>x.id===id);
            alert(`المندوب: ${r.name}\nالمبيعات: ${Utils.formatMoney(r.sales)}\nالتحصيلات: ${Utils.formatMoney(r.collections)}\nالهدف: ${Utils.formatMoney(r.target)}\nالعمولة: ${r.commission}%`);
        }

        function openTransactionModal(id, type) {
            const rep = reps.find(r=>r.id===id); if(!rep)return;
            document.getElementById('transRepId').value = id;
            document.getElementById('transType').value = type;
            document.getElementById('transAmount').value = '';
            document.getElementById('transNotes').value = '';
            document.getElementById('transModalTitle').textContent = `${type==='sale'?'مبيعات':'تحصيل'} - ${rep.name}`;
            document.getElementById('transactionModal').style.display = 'flex';
        }

        function closeTransactionModal() { document.getElementById('transactionModal').style.display = 'none'; }

        async function saveRepTransaction(event) {
            event.preventDefault();
            const id = parseInt(document.getElementById('transRepId').value);
            const type = document.getElementById('transType').value;
            const amount = parseFloat(document.getElementById('transAmount').value);
            const date = document.getElementById('transDate').value;
            const notes = document.getElementById('transNotes').value;
            const rep = reps.find(r=>r.id===id); if(!rep)return;

            if (type === 'sale') rep.sales += amount;
            else {
                rep.collections += amount;
                const trans = await Storage.getTransactions();
                trans.push({ id: Date.now(), date, type:'income', amount, description:`تحصيل من مندوب ${rep.name} - ${notes}`, paymentMethod:'cash' });
                await Storage.saveTransactions(trans);
            }
            await Storage.saveReps(reps);
            renderTable(reps); updateSummary();
            closeTransactionModal();
            alert(`تم تسجيل ${type==='sale'?'مبيعات':'تحصيل'} بقيمة ${Utils.formatMoney(amount)}`);
        }

        function printRepsReport() {
            const win = window.open('', '_blank');
            win.document.write(`
                <html dir="rtl"><head><title>تقرير أداء المندوبين</title><style>body{font-family:'Segoe UI';padding:20px;}</style></head><body>
                <h2>تقرير أداء المندوبين - ${Utils.getToday()}</h2>
                <table border="1" cellpadding="8" style="border-collapse:collapse; width:100%;"><thead><tr><th>المندوب</th><th>المنطقة</th><th>المبيعات</th><th>التحصيلات</th><th>الهدف</th><th>نسبة الإنجاز</th></tr></thead><tbody>
                ${reps.map(r => `<tr><td>${r.name}</td><td>${r.region||'-'}</td><td>${Utils.formatMoney(r.sales)}</td><td>${Utils.formatMoney(r.collections)}</td><td>${Utils.formatMoney(r.target)}</td><td>${Math.round((r.target?r.sales/r.target*100:0))}%</td></tr>`).join('')}
                </tbody></table>
                </body></html>
            `);
            win.document.close(); win.print();
        }
    </script>
</body>
</html>
