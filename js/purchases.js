/* =============================================
   purchases.js - المشتريات (إصدار احترافي)
   تم التحديث: استخدام PurchaseService + دالة الخادم
   ============================================= */
'use strict';

// ========== Toast (مستقل) ==========
const Toast = {
  _el: null,
  _timer: null,
  _getEl() {
    if (!this._el) this._el = document.getElementById('toast');
    return this._el;
  },
  show(msg, type = 'info') {
    const el = this._getEl();
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + type + ' show';
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.remove('show'), 3000);
  },
  info(msg) { this.show(msg, 'info'); },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); }
};
window.Toast = Toast;

// ========== الأدوات المساعدة ==========
const Utils = {
  formatMoney: (amount, currency = 'ج.م') => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency,
  getToday: () => new Date().toISOString().split('T')[0],
  escapeHTML: (str) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; },
  debounce: (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; },
  round: (value, decimals = 3) => Number(Math.round(value + 'e' + decimals) + 'e-' + decimals),
  generateUUID: () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
  isDBReady: () => !!(window.DB && window.supabase),
  hasLocalDB: () => !!(window.localDB)
};

const Purchases = {
  state: {
    products: [], suppliers: [], cart: [],
    selectedSupplierId: null,
    isDBReady: false, isProcessing: false,
    subtotal: 0, discount: 0, discountType: 'amount', discountValue: 0, netTotal: 0
  },
  cache: { productMap: new Map(), supplierMap: new Map() },
  el: {},

  init() {
    this.cacheDOM();
    this.bindEvents();
    if (window.App) { if (!App.requireAuth()) return; App.initUserInterface(); }
    this.loadInitialData();
    this.initSidebarUser();
  },

  cacheDOM() {
    const ids = [
      'menuToggle', 'sidebar', 'sidebarOverlay', 'logoutBtn',
      'productSearchInput', 'productDropdown',
      'supplierSearchInput', 'supplierDropdown', 'supplierBalanceDisplay',
      'cartItemsContainer', 'discountValue', 'discountType',
      'itemTypesCount', 'totalPieces', 'subtotal', 'netTotal', 'saveBtn',
      'paymentModal', 'paySubtotal', 'payDiscount', 'payNet',
      'cashField', 'transferField', 'cashAmount', 'transferAmount',
      'remainingDisplay', 'supplierBalanceAfterLabel', 'supplierBalanceAfter',
      'paymentMethod', 'paymentNotes', 'confirmAndSaveBtn', 'closePaymentModalBtn',
      'receiptModal', 'receiptPrintArea', 'printReceiptBtn', 'cancelReceiptModalBtn', 'closeReceiptModalBtn',
      'sidebarAvatar', 'sidebarUserName', 'toast'
    ];
    ids.forEach(id => { this.el[id] = document.getElementById(id); });
  },

  bindEvents() {
    this.el.menuToggle?.addEventListener('click', () => { this.el.sidebar.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
    this.el.sidebarOverlay?.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay.classList.remove('show'); });
    document.querySelectorAll('.menu-item').forEach(link => { link.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); }); });
    this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

    const debouncedProductSearch = Utils.debounce(() => this.filterProducts(), 150);
    this.el.productSearchInput?.addEventListener('input', debouncedProductSearch);
    this.el.productDropdown?.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (item?.dataset.id) { this.addToCart(item.dataset.id); this.hideProductDropdown(); this.el.productSearchInput.value = ''; }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search-header')) this.hideProductDropdown(); });

    const debouncedSupplierSearch = Utils.debounce(() => this.filterSuppliers(), 150);
    this.el.supplierSearchInput?.addEventListener('input', debouncedSupplierSearch);
    this.el.supplierDropdown?.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (item?.dataset.id) {
        this.state.selectedSupplierId = item.dataset.id;
        this.el.supplierSearchInput.value = this.cache.supplierMap.get(item.dataset.id)?.name || '';
        this.updateSupplierDisplay();
        this.hideSupplierDropdown();
      }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.supplier-box')) this.hideSupplierDropdown(); });

    this.el.discountValue?.addEventListener('input', () => { this.state.discountValue = +this.el.discountValue.value || 0; this.updateTotalsAndUI(); });
    this.el.discountType?.addEventListener('change', () => { this.state.discountType = this.el.discountType.value; this.updateTotalsAndUI(); });
    this.el.saveBtn?.addEventListener('click', () => this.openPaymentModal());

    this.el.confirmAndSaveBtn?.addEventListener('click', async (e) => { e.preventDefault(); await this.completePurchase(); });
    this.el.closePaymentModalBtn?.addEventListener('click', () => this.closeModal('paymentModal'));
    this.el.paymentMethod?.addEventListener('change', () => this.togglePaymentFields());
    this.el.cashAmount?.addEventListener('input', () => this.updatePaymentPreview());
    this.el.transferAmount?.addEventListener('input', () => this.updatePaymentPreview());

    this.el.closeReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
    this.el.cancelReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
    this.el.printReceiptBtn?.addEventListener('click', () => this.printReceipt());
  },

  initSidebarUser() {
    const user = window.App?.getCurrentUser?.();
    if (user) {
      if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.avatar || 'U';
      if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
    }
  },

  async loadInitialData() {
    this.state.isDBReady = Utils.isDBReady();
    try {
      if (this.state.isDBReady) {
        this.state.products = await DB.getProducts() || [];
        this.state.suppliers = await DB.getParties('supplier') || [];
      } else if (Utils.hasLocalDB()) {
        this.state.products = await localDB.getAll('products') || [];
        this.state.suppliers = (await localDB.getAll('parties') || []).filter(p => p.type === 'supplier');
      }
      this.state.products.forEach(p => { if (typeof p.units === 'string') try { p.units = JSON.parse(p.units); } catch {} });
      this.buildCache();
    } catch (e) { Toast.error('فشل تحميل البيانات'); }
  },

  buildCache() {
    this.cache.productMap.clear(); this.cache.supplierMap.clear();
    for (const p of this.state.products) { this.cache.productMap.set(String(p.id), p); this.cache.productMap.set(p.id, p); }
    for (const s of this.state.suppliers) { this.cache.supplierMap.set(String(s.id), s); this.cache.supplierMap.set(s.id, s); }
  },

  filterSuppliers() {
    const term = this.el.supplierSearchInput?.value.trim().toLowerCase() || '';
    const dropdown = this.el.supplierDropdown;
    if (!dropdown) return;
    let filtered = this.state.suppliers;
    if (term) filtered = filtered.filter(s => s.name?.toLowerCase().includes(term));
    dropdown.innerHTML = filtered.map(s => `<div class="dropdown-item" data-id="${s.id}">${Utils.escapeHTML(s.name)}</div>`).join('');
    dropdown.classList.add('show');
  },
  hideSupplierDropdown() { this.el.supplierDropdown?.classList.remove('show'); },
  updateSupplierDisplay() {
    const div = this.el.supplierBalanceDisplay; if (!div) return;
    const s = this.state.selectedSupplierId ? this.cache.supplierMap.get(this.state.selectedSupplierId) : null;
    div.innerHTML = s ? `رصيد المورد: ${Utils.formatMoney(s.balance || 0)}` : '';
  },

  filterProducts() {
    const term = this.el.productSearchInput?.value.trim().toLowerCase() || '';
    const dropdown = this.el.productDropdown; if (!dropdown) return;
    if (!term) { dropdown.classList.remove('show'); return; }
    const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term));
    dropdown.innerHTML = filtered.length ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}">${Utils.escapeHTML(p.name)}</div>`).join('') : '<div class="dropdown-item" style="color:#94a3b8;">لا توجد نتائج</div>';
    dropdown.classList.add('show');
  },
  hideProductDropdown() { this.el.productDropdown?.classList.remove('show'); },

  addToCart(productId) {
    const product = this.cache.productMap.get(String(productId));
    if (!product) return;
    const existing = this.state.cart.find(i => i.productId === product.id);
    if (existing) existing.quantity += 1;
    else this.state.cart.push({ productId: product.id, productName: product.name, unitName: product.units[0]?.name || 'وحدة', quantity: 1, cost: product.units[0]?.cost || 0, factor: product.units[0]?.factor || 1 });
    this.renderCart();
  },

  calculateTotals() {
    let subtotal = 0;
    for (const item of this.state.cart) subtotal += Utils.round(item.cost * item.quantity);
    subtotal = Utils.round(subtotal, 2);
    let discount = 0;
    if (this.state.discountType === 'amount') discount = Math.min(this.state.discountValue, subtotal);
    else discount = Utils.round(subtotal * this.state.discountValue / 100, 2);
    const net = Utils.round(subtotal - discount, 2);
    this.state.subtotal = subtotal; this.state.discount = discount; this.state.netTotal = net;
    return { subtotal, discount, net };
  },

  updateTotalsAndUI() {
    const { subtotal, net } = this.calculateTotals();
    if (this.el.subtotal) this.el.subtotal.textContent = Utils.formatMoney(subtotal);
    if (this.el.netTotal) this.el.netTotal.textContent = Utils.formatMoney(net);
    if (this.el.itemTypesCount) this.el.itemTypesCount.textContent = this.state.cart.length;
    let pieces = 0; for (const i of this.state.cart) pieces += i.quantity;
    if (this.el.totalPieces) this.el.totalPieces.textContent = Math.round(pieces);
  },

  renderCart() {
    const container = this.el.cartItemsContainer; if (!container) return;
    container.innerHTML = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>التكلفة</span><span>الإجمالي</span><span></span></div>`;
    if (!this.state.cart.length) { container.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>'); this.updateTotalsAndUI(); return; }
    let rows = '';
    this.state.cart.forEach((item, idx) => {
      rows += `<div class="cart-item-row">
        <div>${Utils.escapeHTML(item.productName)}</div>
        <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}"></div>
        <div><input type="number" value="${item.cost}" step="0.01" class="cart-cost-input" data-idx="${idx}"></div>
        <div>${Utils.formatMoney(Utils.round(item.cost * item.quantity, 2))}</div>
        <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" data-idx="${idx}"></i></div>
      </div>`;
    });
    container.insertAdjacentHTML('beforeend', rows);
    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('cart-qty-input')) { const idx = +e.target.dataset.idx; const q = +e.target.value; if (isNaN(q) || q <= 0) this.state.cart.splice(idx, 1); else this.state.cart[idx].quantity = q; this.renderCart(); }
      else if (e.target.classList.contains('cart-cost-input')) { const idx = +e.target.dataset.idx; const c = +e.target.value; if (!isNaN(c) && c >= 0) this.state.cart[idx].cost = c; this.renderCart(); }
    });
    container.addEventListener('click', (e) => {
      if (e.target.closest('.fa-trash')) { const idx = +e.target.closest('.fa-trash').dataset.idx; this.state.cart.splice(idx, 1); this.renderCart(); }
    });
    this.updateTotalsAndUI();
  },

  showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
  closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); },

  openPaymentModal() {
    if (!this.state.cart.length) { Toast.info('السلة فارغة'); return; }
    if (!this.state.selectedSupplierId) { Toast.info('اختر مورداً'); return; }
    const totals = this.calculateTotals();
    this.el.paySubtotal.textContent = Utils.formatMoney(totals.subtotal);
    this.el.payDiscount.textContent = Utils.formatMoney(totals.discount);
    this.el.payNet.textContent = Utils.formatMoney(totals.net);
    this.el.cashAmount.value = ''; this.el.transferAmount.value = '';
    this.el.paymentMethod.value = 'cash';
    this.togglePaymentFields(); this.updatePaymentPreview();
    this.showModal('paymentModal');
  },

  togglePaymentFields() {
    const method = this.el.paymentMethod?.value || 'cash';
    this.el.cashField.style.display = (method === 'cash' || method === 'mixed') ? 'block' : 'none';
    this.el.transferField.style.display = (method === 'transfer' || method === 'mixed') ? 'block' : 'none';
    this.updatePaymentPreview();
  },

  updatePaymentPreview() {
    const net = this.state.netTotal;
    let cashPaid = 0, transferPaid = 0;
    const method = this.el.paymentMethod?.value || 'cash';
    if (method === 'cash') cashPaid = +this.el.cashAmount?.value || 0;
    else if (method === 'transfer') transferPaid = +this.el.transferAmount?.value || 0;
    else if (method === 'mixed') { cashPaid = +this.el.cashAmount?.value || 0; transferPaid = +this.el.transferAmount?.value || 0; }

    const totalPaid = Utils.round(cashPaid + transferPaid, 2);
    const diff = Utils.round(net - totalPaid, 2); // الفرق المتبقي للمورد

    this.el.remainingDisplay.textContent = diff <= 0 ? `فائض ${Utils.formatMoney(-diff)}` : `متبقي ${Utils.formatMoney(diff)}`;
    this.el.supplierBalanceAfterLabel.textContent = diff >= 0 ? 'دين على المتجر للمورد:' : 'رصيد المورد بعد الدفع:';
    this.el.supplierBalanceAfter.textContent = Utils.formatMoney(Math.abs(diff));
  },

  async completePurchase() {
    if (this.state.isProcessing) { Toast.info('جاري المعالجة...'); return; }
    this.state.isProcessing = true;
    this.el.confirmAndSaveBtn.disabled = true;

    try {
      const totals = this.calculateTotals();
      let cashPaid = 0, transferPaid = 0;
      const method = this.el.paymentMethod?.value || 'cash';
      if (method === 'cash') cashPaid = +this.el.cashAmount?.value || 0;
      else if (method === 'transfer') transferPaid = +this.el.transferAmount?.value || 0;
      else if (method === 'mixed') { cashPaid = +this.el.cashAmount?.value || 0; transferPaid = +this.el.transferAmount?.value || 0; }
      const totalPaid = Utils.round(cashPaid + transferPaid, 2);
      const diff = Utils.round(totals.net - totalPaid, 2);

      const invoiceNumber = this.state.isDBReady ? await DB.generateInvoiceNumber() : 'P-' + Utils.generateUUID().substring(0,8);

      const purchase = {
        id: Utils.generateUUID(),
        invoice_number: invoiceNumber,
        date: Utils.getToday(),
        supplier_id: this.state.selectedSupplierId,
        items: this.state.cart.map(item => ({...item})),
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.net,
        cash_paid: cashPaid,
        transfer_paid: transferPaid,
        paid: totalPaid,
        remaining: diff > 0 ? diff : 0,
        status: diff <= 0 ? 'paid' : 'partial',
        notes: this.el.paymentNotes?.value || ''
      };

      const result = await PurchaseService.createPurchaseInvoice(purchase);

      if (!result || !result.success) {
        throw new Error(result?.error || 'فشل غير معروف');
      }

      this.closeModal('paymentModal');
      await this.loadInitialData(); // إعادة تحميل المنتجات والموردين
      this.buildCache();

      this.showReceiptModal(purchase, totals);
      this.resetCart();
      Toast.success('تم حفظ فاتورة الشراء بنجاح');
    } catch (error) {
      console.error('خطأ في الشراء:', error);
      alert('خطأ: ' + (error.message || 'حدث خطأ غير متوقع'));
    } finally {
      this.state.isProcessing = false;
      this.el.confirmAndSaveBtn.disabled = false;
    }
  },

  resetCart() {
    this.state.cart = [];
    this.state.selectedSupplierId = null;
    this.state.discountValue = 0;
    if (this.el.discountValue) this.el.discountValue.value = 0;
    if (this.el.supplierSearchInput) this.el.supplierSearchInput.value = '';
    this.renderCart();
  },

  showReceiptModal(purchase, totals) {
    const supplier = this.cache.supplierMap.get(this.state.selectedSupplierId);
    let itemsRows = '';
    for (const item of this.state.cart) {
      itemsRows += `<tr><td>${Utils.escapeHTML(item.productName)}</td><td>${item.quantity}</td><td>${Utils.formatMoney(item.cost)}</td><td>${Utils.formatMoney(Utils.round(item.cost * item.quantity, 2))}</td></tr>`;
    }
    this.el.receiptPrintArea.innerHTML = `
      <div class="company-name">فاتورة مشتريات</div>
      <p><strong>المورد:</strong> ${Utils.escapeHTML(supplier?.name || '')}</p>
      <p><strong>التاريخ:</strong> ${purchase.date}</p>
      <div class="divider"></div>
      <table><thead><tr><th>الصنف</th><th>الكمية</th><th>التكلفة</th><th>الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table>
      <div class="totals"><p><strong>الإجمالي:</strong> ${Utils.formatMoney(totals.subtotal)}</p>${totals.discount > 0 ? `<p><strong>الخصم:</strong> ${Utils.formatMoney(totals.discount)}</p>` : ''}<p><strong>الصافي:</strong> ${Utils.formatMoney(totals.net)}</p></div>
    `;
    this.showModal('receiptModal');
  },

  printReceipt() {
    const content = this.el.receiptPrintArea?.innerHTML || '';
    const pw = window.open('', '_blank', 'width=400,height=600');
    if (!pw) { Toast.error('الرجاء السماح بالنوافذ المنبثقة'); return; }
    pw.document.write(`<html><head><meta charset="UTF-8"><style>body{direction:rtl;font-family:'Segoe UI',Tahoma;padding:20px;width:80mm;margin:0 auto;}table{width:100%;border-collapse:collapse;}.divider{border-top:1px dashed #000;margin:10px 0;}</style></head><body>${content}</body></html>`);
    pw.document.close(); pw.focus();
    setTimeout(() => { pw.print(); pw.close(); }, 500);
  }
};

window.Purchases = Purchases;
window.addEventListener('DOMContentLoaded', () => Purchases.init());
