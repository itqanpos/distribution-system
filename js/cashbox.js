/* =============================================
   cashbox.js - Cashbox Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const State = {
        currentUser: null,
        transactions: [],
        filtered: [],
        invoices: [],
        currentType: 'all',
        filters: {
            search: '',
            date: 'today'
        },
        modalType: 'in'
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Cashbox init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase غير محمّل');
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadData();
        hideLoadingBar();
        console.log('✅ Cashbox ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadData() {
        showSkeleton();
        try {
            const [transactions, invoices] = await Promise.all([
                DB.getPayments().catch(() => []),
                DB.getInvoices(true).catch(() => [])
            ]);

            State.transactions = transactions || [];
            State.invoices = invoices || [];

            console.log('💰 Transactions:', State.transactions.length);
            console.log('📄 Invoices:', State.invoices.length);

            buildMovementList();
            updateBalance();
            renderSummary();
            applyFilters();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
            showEmpty(true);
        } finally {
            hideSkeleton();
        }
    }

    /* ============================================
       Build Movement List (merge payments + invoices)
       ============================================ */
    function buildMovementList() {
        const movements = [];

        // 1. Payments (from transactions table)
        State.transactions.forEach(t => {
            if (t.type === 'payment_in') {
                movements.push({
                    id: t.id,
                    type: 'in',
                    direction: 'in',
                    amount: Number(t.amount) || 0,
                    description: t.notes || t.reference || 'إيداع',
                    category: 'إيداع',
                    method: t.payment_method,
                    date: t.date,
                    created_at: t.created_at,
                    partyName: null
                });
            } else if (t.type === 'payment_out') {
                movements.push({
                    id: t.id,
                    type: 'out',
                    direction: 'out',
                    amount: Number(t.amount) || 0,
                    description: t.notes || t.reference || 'سداد',
                    category: 'سداد',
                    method: t.payment_method,
                    date: t.date,
                    created_at: t.created_at,
                    partyName: null
                });
            } else if (t.type === 'income') {
                movements.push({
                    id: t.id,
                    type: 'in',
                    direction: 'in',
                    amount: Number(t.amount) || 0,
                    description: t.notes || 'دخل',
                    category: 'دخل',
                    method: t.payment_method,
                    date: t.date,
                    created_at: t.created_at
                });
            } else if (t.type === 'expense') {
                movements.push({
                    id: t.id,
                    type: 'out',
                    direction: 'out',
                    amount: Number(t.amount) || 0,
                    description: t.notes || 'مصروف',
                    category: 'مصروف',
                    method: t.payment_method,
                    date: t.date,
                    created_at: t.created_at
                });
            }
        });

        // 2. Cash sales (invoices)
        State.invoices.forEach(inv => {
            if (inv.type === 'sale' && Number(inv.cash_paid) > 0) {
                movements.push({
                    id: inv.id + '_sale',
                    type: 'sale',
                    direction: 'in',
                    amount: Number(inv.cash_paid) || 0,
                    description: `فاتورة بيع ${inv.invoice_number || ''}`,
                    category: 'مبيعات',
                    method: 'cash',
                    date: inv.date,
                    created_at: inv.created_at,
                    partyName: inv.customer_name
                });
            }
            if (inv.type === 'purchase' && Number(inv.cash_paid) > 0) {
                movements.push({
                    id: inv.id + '_purchase',
                    type: 'purchase',
                    direction: 'out',
                    amount: Number(inv.cash_paid) || 0,
                    description: `فاتورة شراء ${inv.invoice_number || ''}`,
                    category: 'مشتريات',
                    method: 'cash',
                    date: inv.date,
                    created_at: inv.created_at,
                    partyName: inv.supplier_name
                });
            }
            // Return sales (refund)
            if (inv.type === 'return_sale' && Number(inv.total) > 0) {
                movements.push({
                    id: inv.id + '_return_sale',
                    type: 'out',
                    direction: 'out',
                    amount: Number(inv.total) || 0,
                    description: `مرتجع بيع ${inv.invoice_number || ''}`,
                    category: 'مرتجع مبيعات',
                    method: 'cash',
                    date: inv.date,
                    created_at: inv.created_at,
                    partyName: inv.customer_name
                });
            }
            // Return purchases (money back)
            if (inv.type === 'return_purchase' && Number(inv.total) > 0) {
                movements.push({
                    id: inv.id + '_return_purchase',
                    type: 'in',
                    direction: 'in',
                    amount: Number(inv.total) || 0,
                    description: `مرتجع شراء ${inv.invoice_number || ''}`,
                    category: 'مرتجع مشتريات',
                    method: 'cash',
                    date: inv.date,
                    created_at: inv.created_at,
                    partyName: inv.supplier_name
                });
            }
        });

        // Sort by date desc
        movements.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        State.movements = movements;
    }

    /* ============================================
       Update Balance
       ============================================ */
    function updateBalance() {
        // Calculate balance:
        // + payment_in (income)
        // + cash sales
        // + return_purchase (money back from supplier)
        // - payment_out (expense)
        // - cash purchases
        // - return_sale (refund)

        let balance = 0;

        State.movements.forEach(m => {
            if (m.direction === 'in') balance += m.amount;
            else if (m.direction === 'out') balance -= m.amount;
        });

        const balanceEl = $('#cashboxBalance');
        if (balanceEl) balanceEl.textContent = U.money(balance);

        const lastUpdateEl = $('#cashboxLastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = `آخر تحديث: ${U.time(Date.now())}`;
        }

        // Update hero color based on balance
        const hero = $('#balanceHero');
        if (hero) {
            if (balance < 0) {
                hero.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                hero.style.boxShadow = '0 15px 40px -10px rgba(239, 68, 68, 0.5)';
            } else if (balance === 0) {
                hero.style.background = 'linear-gradient(135deg, #64748b, #475569)';
                hero.style.boxShadow = '0 15px 40px -10px rgba(100, 116, 139, 0.5)';
            } else {
                hero.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
                hero.style.boxShadow = '0 15px 40px -10px rgba(79, 70, 229, 0.5)';
            }
        }

        return balance;
    }

    /* ============================================
       Summary (Today)
       ============================================ */
    function renderSummary() {
        const today = U.today();

        const todayMovements = State.movements.filter(m =>
            m.date === today || (m.created_at || '').startsWith(today)
        );

        const todayIn = todayMovements
            .filter(m => m.direction === 'in')
            .reduce((s, m) => s + m.amount, 0);

        const todayOut = todayMovements
            .filter(m => m.direction === 'out')
            .reduce((s, m) => s + m.amount, 0);

        const todayCashSales = todayMovements
            .filter(m => m.type === 'sale')
            .reduce((s, m) => s + m.amount, 0);

        const count = todayMovements.length;

        setText('todayIn', U.money(todayIn));
        setText('todayOut', U.money(todayOut));
        setText('todayCashSales', U.money(todayCashSales));
        setText('todayTransactions', count);

        const subtitle = $('#cashboxSubtitle');
        if (subtitle) {
            const bal = updateBalance();
            subtitle.textContent = `الرصيد الحالي: ${U.money(bal)} · ${count} عملية اليوم`;
        }
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    /* ============================================
       Tabs
       ============================================ */
    function switchTab(type) {
        State.currentType = type;
        $$('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        applyFilters();
    }

    /* ============================================
       Filters
       ============================================ */
    function applyFilters() {
        let list = [...State.movements];

        // Filter by type
        if (State.currentType === 'in') {
            list = list.filter(m => m.direction === 'in');
        } else if (State.currentType === 'out') {
            list = list.filter(m => m.direction === 'out');
        } else if (State.currentType === 'sale') {
            list = list.filter(m => m.type === 'sale');
        }

        // Filter by search
        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(m =>
                (m.description || '').toLowerCase().includes(term) ||
                String(m.amount).includes(term) ||
                (m.category || '').toLowerCase().includes(term)
            );
        }

        // Filter by date
        const now = new Date();
        if (State.filters.date === 'today') {
            const today = U.today();
            list = list.filter(m => m.date === today || (m.created_at || '').startsWith(today));
        } else if (State.filters.date === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            list = list.filter(m => (m.date || '') >= weekAgo);
        } else if (State.filters.date === 'month') {
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            list = list.filter(m => (m.date || '') >= monthAgo);
        }

        State.filtered = list;
        renderTransactions();
    }

    /* ============================================
       Render
       ============================================ */
    function renderTransactions() {
        const container = $('#cashboxListView');

        if (!State.filtered.length) {
            container.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        container.innerHTML = State.filtered.map(m => renderTransactionItem(m)).join('');
    }

    function renderTransactionItem(m) {
        const isIn = m.direction === 'in';
        const sign = isIn ? '+' : '-';
        const iconClass = m.type === 'sale' ? 'sale' : m.type === 'purchase' ? 'purchase' : (isIn ? 'in' : 'out');
        const icon = m.type === 'sale' ? 'fa-cash-register' 
            : m.type === 'purchase' ? 'fa-shopping-cart'
            : (isIn ? 'fa-arrow-down' : 'fa-arrow-up');

        return `
            <div class="transaction-item">
                <div class="transaction-item__icon ${iconClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="transaction-item__info">
                    <div class="transaction-item__title">${U.escape(m.description || 'حركة صندوق')}</div>
                    <div class="transaction-item__meta">
                        <span><i class="fas fa-clock"></i> ${U.date(m.date || m.created_at)}</span>
                        ${m.partyName ? `<span><i class="fas fa-user"></i> ${U.escape(m.partyName)}</span>` : ''}
                        ${m.category ? `<span class="transaction-item__category">${U.escape(m.category)}</span>` : ''}
                    </div>
                </div>
                <div class="transaction-item__amount ${iconClass}">
                    ${sign}${U.moneyRaw(m.amount)}
                </div>
            </div>
        `;
    }

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    /* ============================================
       Transaction Modal
       ============================================ */
    function openTransactionModal(type) {
        State.modalType = type;

        const title = $('#transactionModalTitle');
        if (title) title.textContent = type === 'in' ? 'إيداع في الصندوق' : 'مصروف من الصندوق';

        const typeEl = $('#transactionType');
        if (typeEl) typeEl.value = type;

        // Reset fields
        $('#transactionAmount').value = '';
        $('#transactionDescription').value = '';
        $('#transactionCategory').value = '';
        $('#transactionNotes').value = '';
        setTransactionMethod('cash');

        // Quick amounts
        renderQuickAmounts(type);

        openModal('transactionModal');
        setTimeout(() => $('#transactionAmount')?.focus(), 200);
    }

    function renderQuickAmounts(type) {
        const container = $('#quickAmounts');
        if (!container) return;

        const amounts = type === 'in' 
            ? [50, 100, 200, 500, 1000]
            : [20, 50, 100, 200, 500];

        container.innerHTML = amounts.map(a =>
            `<button type="button" data-amount="${a}">${a}</button>`
        ).join('');

        container.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                $('#transactionAmount').value = btn.dataset.amount;
            });
        });
    }

    function setTransactionMethod(method) {
        $$('#transactionModal .method-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });
        const el = $('#transactionMethod');
        if (el) el.value = method;
    }

    async function saveTransaction() {
        const type = State.modalType;
        const amount = +$('#transactionAmount')?.value || 0;
        const description = $('#transactionDescription')?.value.trim() || '';
        const category = $('#transactionCategory')?.value || '';
        const method = $('#transactionMethod')?.value || 'cash';
        const notes = $('#transactionNotes')?.value.trim() || '';

        if (amount <= 0) {
            showToast('أدخل مبلغاً صحيحاً', 'warning');
            return;
        }

        if (!description) {
            showToast('أدخل البيان', 'warning');
            return;
        }

        const btn = $('#saveTransactionBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB.client;
            const payload = {
                id: U.uuid(),
                tenant_id: State.currentUser.tenant_id,
                type: type === 'in' ? 'income' : 'expense',
                amount: amount,
                payment_method: method,
                notes: description + (category ? ` · ${category}` : '') + (notes ? ` · ${notes}` : ''),
                date: U.today(),
                created_by: State.currentUser.id,
                created_at: new Date().toISOString()
            };

            // Save locally
            if (window.localDB?.ready) {
                await window.localDB.put('transactions', payload);
            }

            // Save to cloud
            if (navigator.onLine && client) {
                const { error } = await client.from('transactions').insert(payload);
                if (error) throw error;
            }

            showToast(type === 'in' ? 'تم الإيداع بنجاح' : 'تم تسجيل المصروف', 'success');
            closeModal('transactionModal');

            DB.clearCache();
            await loadData();

        } catch (e) {
            console.error('Save error:', e);
            showToast('فشل الحفظ', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export
       ============================================ */
    function exportMovements() {
        if (!State.filtered.length) {
            showToast('لا توجد بيانات للتصدير', 'info');
            return;
        }

        const rows = [['التاريخ', 'النوع', 'البيان', 'التصنيف', 'المبلغ', 'الاتجاه']];
        State.filtered.forEach(m => {
            rows.push([
                m.date || (m.created_at || '').slice(0, 10),
                m.type,
                m.description,
                m.category || '',
                m.amount,
                m.direction === 'in' ? 'إيداع' : 'صرف'
            ]);
        });

        const csv = rows.map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cashbox-${U.today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('تم التصدير', 'success');
    }

    /* ============================================
       UI Helpers
       ============================================ */
    function updateUserUI() {
        const avatar = $('#userAvatar');
        const name = $('#sidebarUserName');
        if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
        if (name) name.textContent = State.currentUser.fullName || 'مدير';
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);
        const status = $('#connStatus');
        if (status) {
            status.textContent = online ? 'متصل' : 'غير متصل';
            status.style.color = online ? 'var(--success)' : 'var(--danger)';
        }
    }

    function updateThemeIcon() {
        const btn = $('#themeBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const listView = $('#cashboxListView');
        const empty = $('#emptyState');

        if (skeleton) {
            skeleton.innerHTML = Array(5).fill(`
                <div class="skeleton-card" style="height:80px;">
                    <div style="display:flex;gap:14px;align-items:center;">
                        <div style="width:48px;height:48px;background:var(--bg-sunken);border-radius:12px;"></div>
                        <div style="flex:1;">
                            <div style="height:14px;background:var(--bg-sunken);border-radius:6px;margin-bottom:8px;"></div>
                            <div style="height:12px;background:var(--bg-sunken);border-radius:6px;width:60%;"></div>
                        </div>
                    </div>
                </div>
            `).join('');
            skeleton.style.display = 'flex';
            skeleton.style.flexDirection = 'column';
            skeleton.style.gap = '8px';
        }
        if (listView) listView.style.display = 'none';
        if (empty) empty.style.display = 'none';
    }

    function hideSkeleton() {
        const skeleton = $('#skeletonGrid');
        const listView = $('#cashboxListView');
        if (skeleton) skeleton.style.display = 'none';
        if (listView) listView.style.display = 'flex';
    }

    function hideLoadingBar() {
        const bar = $('#loading-bar');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }
    }

    /* ============================================
       Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }

        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 22px;
            background: ${colors[type] || colors.info};
            color: #fff;
            border-radius: 999px;
            font-weight: 700;
            font-size: 14px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            pointer-events: auto;
        `;
        toast.innerHTML = `<i class="fas fa-${icons[type]}"></i> <span>${U.escape(msg)}</span>`;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /* ============================================
       Events
       ============================================ */
    function bindEvents() {
        // Sidebar
        $('#menuBtn')?.addEventListener('click', () => {
            $('#sidebar')?.classList.add('open');
            $('#sidebarOverlay')?.classList.add('show');
        });
        $('#sidebarOverlay')?.addEventListener('click', () => {
            $('#sidebar')?.classList.remove('open');
            $('#sidebarOverlay')?.classList.remove('show');
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                $('#sidebar')?.classList.remove('open');
                $('#sidebarOverlay')?.classList.remove('show');
            });
        });

        // Theme
        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        // Logout
        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        // Refresh
        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadData();
            showToast('تم التحديث', 'success');
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportMovements);

        // Cash In/Out buttons
        $('#cashInBtn')?.addEventListener('click', () => openTransactionModal('in'));
        $('#cashOutBtn')?.addEventListener('click', () => openTransactionModal('out'));

        // Tabs
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.type));
        });

        // Search
        $('#searchInput')?.addEventListener('input', U.debounce((e) => {
            State.filters.search = e.target.value.trim();
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'grid' : 'none';
            applyFilters();
        }, 200));

        $('#clearSearchBtn')?.addEventListener('click', () => {
            const input = $('#searchInput');
            if (input) input.value = '';
            State.filters.search = '';
            $('#clearSearchBtn').style.display = 'none';
            applyFilters();
        });

        // Date filter
        $('#dateFilter')?.addEventListener('change', (e) => {
            State.filters.date = e.target.value;
            applyFilters();
        });

        // Payment methods in modal
        $$('#transactionModal .method-btn').forEach(btn => {
            btn.addEventListener('click', () => setTransactionMethod(btn.dataset.method));
        });

        // Save transaction
        $('#saveTransactionBtn')?.addEventListener('click', saveTransaction);

        // Enter key in amount
        $('#transactionAmount')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') $('#transactionDescription')?.focus();
        });
        $('#transactionDescription')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') $('#saveTransactionBtn')?.click();
        });

        // Close modals
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
            }
        });

        // Connection
        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال', 'success');
        });
        window.addEventListener('offline', () => {
            updateConnStatus();
            showToast('انقطع الاتصال', 'warning');
        });
    }

    /* ============================================
       Start
       ============================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
