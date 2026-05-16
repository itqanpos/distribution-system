'use strict';

const Toast = {
  _el: null, _timer: null,
  _getEl() { if (!this._el) this._el = document.getElementById('toast'); return this._el; },
  show(msg, type = 'info') {
    const el = this._getEl(); if (!el) return;
    el.textContent = msg; el.className = 'toast ' + type + ' show';
    clearTimeout(this._timer); this._timer = setTimeout(() => el.classList.remove('show'), 3000);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); }
};

const U = {
    formatMoney: (v) => Number(v || 0).toLocaleString('en-US', {minimumFractionDigits: 2}) + ' ج.م',
    escapeHTML: (s) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; },
    today: () => new Date().toISOString().split('T')[0],
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    generateUUID: () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); })
};

const Purchases = {
    el: {},
    state: { ready: false, purchases: [], suppliers: [], products: [], editingId: null, currentFilter: 'all' },

    async init() {
        this.cacheDOM();
        this.bindEvents();
        if (window.App) { App.requireAuth(); App.initUserInterface(); }
        this.updateSidebarAvatar();
        await this.waitForDB();
        await this.loadAllData();
        this.renderTable();
        this.updateStats();
        window.addEventListener('online', () => this.loadAllData().then(() => { this.renderTable(); this.updateStats(); }));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.loadAllData().then(() => { this.renderTable(); this.updateStats(); });
        });
    },

    updateSidebarAvatar() {
        const user = window.App?.getCurrentUser?.();
        if (user) { const av = document.getElementById('sidebarAvatar'); if (av) av.textContent = user.avatar || 'U'; }
    },

    waitForDB() {
        return new Promise(resolve => {
            if (window.DB && window.supabase) { this.state.ready = true; resolve(); return; }
            let attempts = 0;
            const check = setInterval(() => {
                if (window.DB && window.supabase) { this.state.ready = true; clearInterval(check); resolve(); }
                if (++attempts > 50) { clearInterval(check); if (window.localDB) this.state.ready = 'local'; resolve(); }
            }, 100);
        });
    },

    cacheDOM() {
        const ids = ['menuToggle', 'sidebar', 'sidebarOverlay', 'moreMenuBtn', 'moreDropdown', 'logoutBtn',
            'searchInput', 'refreshBtn', 'purchasesBody', 'newPurchaseBtn',
            'totalPurchases', 'paidPurchases', 'unpaidPurchases', 'purchaseCount',
            'purchaseModal', 'modalTitle', 'closeModalBtn', 'cancelModalBtn',
            'purchaseForm', 'purchaseId', 'supplierInput', 'supplierList',
            'purchaseDate', 'invoiceNumber', 'itemsContainer', 'addItemBtn',
            'totalAmount', 'paidAmount', 'paymentMethod', 'remainingAmount',
            'detailsModal', 'detailsContent', 'closeDetailsBtn', 'toast',
            'filterBtns', 'printReportBtn', 'sidebarAvatar'];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
        this.el.filterBtns = document.querySelectorAll('.filter-btn');
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => { this.el.sidebar.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
        this.el.sidebarOverlay?.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(link => link.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); }));

        this.el.moreMenuBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.moreDropdown?.classList.toggle('show'); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show'); });

        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else location.href = './index.html'; });
        this.el.printReportBtn?.addEventListener('click', (e) => { e.preventDefault(); this.printReport(); this.el.moreDropdown?.classList.remove('show'); });

        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadAllData().then(() => { this.renderTable(); this.updateStats(); }));

        this.el.filterBtns.forEach(btn => btn.addEventListener('click', () => {
            this.el.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.state.currentFilter = btn.dataset.filter;
            this.renderTable();
        }));

        this.el.newPurchaseBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.purchaseForm?.addEventListener('submit', (e) => { e.preventDefault(); this.savePurchase(); });
        this.el.addItemBtn?.addEventListener('click', () => this.addItemCard());
        this.el.closeDetailsBtn?.addEventListener('click', () => this.el.detailsModal.classList.remove('open'));
    },

    async loadAllData() {
        try {
            if (this.state.ready === true) {
                this.state.purchases = await DB.getPurchases() || [];
                this.state.suppliers = await DB.getParties('supplier') || [];
                this.state.products = await DB.getProducts() || [];
            } else if (window.localDB) {
                this.state.purchases = await localDB.getAll('purchases') || [];
                this.state.suppliers = (await localDB.getAll('parties') || []).filter(p => p.type === 'supplier');
                this.state.products = await localDB.getAll('products') || [];
            }
            this.populateSupplierList();
            this.createProductDatalist();
        } catch (e) { console.error(e); }
    },

    populateSupplierList() { if (this.el.supplierList) this.el.supplierList.innerHTML = this.state.suppliers.map(s => `<option value="${U.escapeHTML(s.name)}">`).join(''); },
    createProductDatalist() {
        const old = document.getElementById('productDatalist'); if (old) old.remove();
        const dl = document.createElement('datalist'); dl.id = 'productDatalist';
        dl.innerHTML = this.state.products.map(p => `<option value="${U.escapeHTML(p.name)}">`).join('');
        document.body.appendChild(dl);
    },

    updateStats() {
        const total = this.state.purchases.reduce((s, p) => s + (p.total || 0), 0);
        const paid = this.state.purchases.reduce((s, p) => s + (p.paid || 0), 0);
        this.el.totalPurchases.textContent = U.formatMoney(total);
        this.el.paidPurchases.textContent = U.formatMoney(paid);
        this.el.unpaidPurchases.textContent = U.formatMoney(total - paid);
        this.el.purchaseCount.textContent = this.state.purchases.length;
    },

    renderTable() {
        const term = (this.el.searchInput?.value || '').trim().toLowerCase();
        let filtered = this.state.purchases.filter(p => !term || (p.invoice_number||'').includes(term) || (p.supplier_name||'').includes(term) || (p.id||'').includes(term));
        if (this.state.currentFilter === 'paid') filtered = filtered.filter(p => p.status === 'paid' || p.remaining === 0);
        else if (this.state.currentFilter === 'unpaid') filtered = filtered.filter(p => p.status !== 'paid' && p.remaining > 0);
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const tbody = this.el.purchasesBody;
        if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;">لا توجد فواتير شراء</td></tr>'; return; }
        tbody.innerHTML = filtered.map(p => {
            const badge = p.status === 'paid' || p.remaining === 0 ? '<span class="badge badge-success">مدفوعة</span>' : '<span class="badge badge-danger">غير مدفوعة</span>';
            return `<tr><td>${U.escapeHTML(p.invoice_number||p.id?.substring(0,8)||'')}</td><td>${p.date}</td><td>${U.escapeHTML(p.supplier_name||'')}</td><td>${U.formatMoney(p.total)}</td><td>${U.formatMoney(p.paid)}</td><td>${U.formatMoney(p.remaining)}</td><td>${badge}</td><td class="action-icons"><i class="fas fa-edit" onclick="Purchases.editPurchase('${p.id}')"></i><i class="fas fa-print" onclick="Purchases.printPurchase('${p.id}')"></i><i class="fas fa-eye" onclick="Purchases.viewDetails('${p.id}')"></i></td></tr>`;
        }).join('');
    },

    openModal(purchase = null) {
        this.state.editingId = purchase?.id || null;
        this.el.modalTitle.textContent = purchase ? 'تعديل فاتورة شراء' : 'فاتورة شراء جديدة';
        this.el.purchaseId.value = purchase?.id || '';
        this.el.supplierInput.value = purchase?.supplier_name || '';
        this.el.purchaseDate.value = purchase?.date || U.today();
        this.el.invoiceNumber.value = purchase?.invoice_number || '';
        this.el.paidAmount.value = purchase?.paid || 0;
        this.el.paymentMethod.value = 'cash';
        this.el.itemsContainer.innerHTML = '';
        (purchase?.items?.length ? purchase.items : [{}]).forEach(item => this.addItemCard(item));
        this.updateTotalAndRemaining();
        this.el.purchaseModal.classList.add('open');
    },
    closeModal() { this.el.purchaseModal.classList.remove('open'); },
    addItemCard(item = null) {
        const card = document.createElement('div'); card.className = 'item-card';
        card.innerHTML = `<input type="text" class="item-product-name" placeholder="اسم المنتج" list="productDatalist" autocomplete="off" value="${U.escapeHTML(item?.productName||'')}" onchange="Purchases.onProductSelected(this)">
            <select class="item-unit" onchange="Purchases.onUnitChange(this)" ${!item?'disabled':''}>${item?this.getUnitOptions(item.productName):'<option>اختر المنتج أولاً</option>'}</select>
            <input type="number" class="item-qty" placeholder="الكمية" min="0.001" step="0.001" value="${item?.quantity||1}" oninput="Purchases.updateTotalAndRemaining()">
            <input type="number" class="item-price" placeholder="سعر الشراء" step="0.01" value="${item?.price||0}" oninput="Purchases.updateTotalAndRemaining()">
            <button type="button" class="remove-btn" onclick="this.closest('.item-card').remove(); Purchases.updateTotalAndRemaining();"><i class="fas fa-times"></i></button>`;
        this.el.itemsContainer.appendChild(card);
        if (item?.unitName) { const sel = card.querySelector('.item-unit'); if (sel) sel.value = item.unitName; }
    },
    getUnitOptions(productName) {
        const p = this.state.products.find(p => p.name === productName);
        return p ? p.units.map(u => `<option value="${U.escapeHTML(u.name)}" data-cost="${u.cost||0}" data-factor="${u.factor||1}">${U.escapeHTML(u.name)}</option>`).join('') : '<option>اختر المنتج أولاً</option>';
    },
    onProductSelected(input) {
        const card = input.closest('.item-card'); const name = input.value.trim();
        const unitSel = card.querySelector('.item-unit'); const priceInp = card.querySelector('.item-price');
        const prod = this.state.products.find(p => p.name === name);
        if (prod) {
            unitSel.innerHTML = this.getUnitOptions(name); unitSel.disabled = false;
            if (prod.units.length) { unitSel.value = prod.units[0].name; priceInp.value = prod.units[0].cost || 0; }
        } else { unitSel.innerHTML = '<option>اختر المنتج أولاً</option>'; unitSel.disabled = true; }
        this.updateTotalAndRemaining();
    },
    onUnitChange(sel) {
        const card = sel.closest('.item-card');
        const opt = sel.options[sel.selectedIndex];
        card.querySelector('.item-price').value = parseFloat(opt?.dataset?.cost) || 0;
        this.updateTotalAndRemaining();
    },
    updateTotalAndRemaining() {
        let total = 0;
        this.el.itemsContainer.querySelectorAll('.item-card').forEach(card => {
            total += (parseFloat(card.querySelector('.item-qty')?.value)||0) * (parseFloat(card.querySelector('.item-price')?.value)||0);
        });
        this.el.totalAmount.textContent = U.formatMoney(total);
        this.updateRemaining();
    },
    updateRemaining() {
        const total = parseFloat(this.el.totalAmount.textContent.replace(/[^0-9.-]+/g, ''))||0;
        this.el.remainingAmount.textContent = U.formatMoney(Math.max(0, total - (parseFloat(this.el.paidAmount.value)||0)));
    },

    async savePurchase() {
        const supplierName = this.el.supplierInput.value.trim();
        if (!supplierName) return alert('اسم المورد مطلوب');
        let supplierId = null;
        if (this.state.ready === true) {
            const exist = this.state.suppliers.find(s => s.name === supplierName);
            if (!exist) {
                const ns = await DB.saveParty({ name: supplierName, type: 'supplier', balance: 0 });
                this.state.suppliers.push(ns); this.populateSupplierList(); supplierId = ns.id;
            } else supplierId = exist.id;
        }
        const date = this.el.purchaseDate.value, paid = parseFloat(this.el.paidAmount.value)||0,
              method = this.el.paymentMethod.value;
        const items = Array.from(this.el.itemsContainer.querySelectorAll('.item-card')).map(card => ({
            productName: card.querySelector('.item-product-name')?.value.trim(),
            unitName: card.querySelector('.item-unit')?.value,
            quantity: parseFloat(card.querySelector('.item-qty')?.value)||0,
            price: parseFloat(card.querySelector('.item-price')?.value)||0
        })).filter(i => i.productName && i.unitName && i.quantity > 0);
        if (!items.length) return alert('أضف صنفًا واحدًا على الأقل');
        const total = items.reduce((s,i) => s + i.quantity*i.price, 0);
        const remaining = Math.max(0, total - paid);
        const purchaseData = { id: this.state.editingId || U.generateUUID(), date, supplier_id: supplierId, supplier_name: supplierName, items, total, paid, remaining, status: remaining===0?'paid':'unpaid', notes: null };
        try {
            if (this.state.ready === true) {
                await PurchaseService.createPurchaseInvoice({ ...purchaseData, cash_paid: method==='cash'?paid:0, transfer_paid: method==='transfer'?paid:0 });
            } else if (window.localDB) {
                await localDB.put('purchases', purchaseData);
                // تحديث محلي للمخزون ... (موجود في النسخة الكاملة)
            }
            this.closeModal(); await this.loadAllData(); this.renderTable(); this.updateStats(); Toast.success('تم حفظ فاتورة الشراء');
        } catch (err) { console.error(err); alert('فشل: '+err.message); }
    },

    viewDetails(id) { /* ... نفس السابق ... */ },
    printPurchase(id) { /* ... */ },
    editPurchase(id) { const p = this.state.purchases.find(p=>p.id===id); if(p) this.openModal(p); },
    printReport() { /* ... طباعة التقرير ... */ }
};

window.Purchases = Purchases;
window.addEventListener('DOMContentLoaded', () => Purchases.init());
