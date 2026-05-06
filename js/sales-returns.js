'use strict';
const U = {
    formatMoney: (v) => Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2})+' ج.م',
    today: ()=>new Date().toISOString().split('T')[0],
    escapeHTML: (s) => { const d=document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
};
const SalesReturns = {
    el: {},
    state: { returns: [], invoices: [], products: [], customers: [], ready: false },
    async init() {
        this.cacheDOM(); this.bindEvents();
        if(window.App){ App.requireAuth(); App.initUserInterface(); }
        await this.waitForDB();
        await this.loadAllData();
        this.renderTable();
        window.addEventListener('online', ()=>this.loadAllData().then(()=>this.renderTable()));
        document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') this.loadAllData().then(()=>this.renderTable()); });
    },
    waitForDB() {
        return new Promise(resolve => {
            if(window.DB&&window.supabase){ this.state.ready=true; resolve(); return; }
            let attempts=0;
            const check = setInterval(()=>{
                if(window.DB&&window.supabase){ this.state.ready=true; clearInterval(check); resolve(); }
                if(++attempts>50){ clearInterval(check); if(window.localDB) this.state.ready='local'; resolve(); }
            },100);
        });
    },
    cacheDOM() {
        const ids=['menuToggle','sidebar','userDropdown','userProfileBtn','logoutBtn','returnsBody',
                   'addReturnBtn','returnModal','closeReturnModalBtn','returnForm','originalInvoice',
                   'returnReason','returnItemsContainer','toast'];
        ids.forEach(id=>this.el[id]=document.getElementById(id));
    },
    bindEvents() {
        this.el.menuToggle?.addEventListener('click',()=>this.el.sidebar.classList.toggle('open'));
        this.el.userProfileBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click',()=>this.el.userDropdown?.classList.remove('show'));
        this.el.logoutBtn?.addEventListener('click',(e)=>{ e.preventDefault(); if(window.App) App.logout(); else location.href='./index.html'; });
        this.el.addReturnBtn?.addEventListener('click',()=>this.openReturnModal());
        this.el.closeReturnModalBtn?.addEventListener('click',()=>this.el.returnModal.classList.remove('open'));
        this.el.returnForm?.addEventListener('submit',(e)=>{ e.preventDefault(); this.saveReturn(); });
        document.querySelectorAll('.menu-item').forEach(link=>link.addEventListener('click',()=>this.el.sidebar.classList.remove('open')));
    },
    async loadAllData() {
        try {
            if(this.state.ready===true) {
                this.state.returns = (await DB.getReturns('sale')) || [];
                this.state.invoices = (await DB.getInvoices()).filter(i=>i.type==='sale') || [];
                this.state.products = await DB.getProducts() || [];
                this.state.customers = await DB.getParties('customer') || [];
            } else if(window.localDB) {
                this.state.returns = (await localDB.getAll('returns')).filter(r=>r.type==='sale') || [];
                this.state.invoices = (await localDB.getAll('invoices')).filter(i=>i.type==='sale') || [];
                this.state.products = await localDB.getAll('products') || [];
                const parties = await localDB.getAll('parties') || [];
                this.state.customers = parties.filter(p=>p.type==='customer');
            }
        } catch(e) { console.error(e); }
    },
    renderTable() {
        const tbody = this.el.returnsBody;
        if(!tbody) return;
        if(!this.state.returns.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:30px;">لا توجد مرتجعات</td></tr>'; return; }
        tbody.innerHTML = this.state.returns.map(r => {
            const customer = this.state.customers.find(c=>c.id===r.party_id) || {};
            return `<tr>
                <td>${U.escapeHTML(r.id?.substring(0,8)||'')}</td>
                <td>${r.date}</td>
                <td>${U.escapeHTML(customer.name||'غير معروف')}</td>
                <td>${U.formatMoney(r.total)}</td>
                <td>${U.escapeHTML(r.notes||'-')}</td>
                <td class="action-icons"><i class="fas fa-eye" onclick="SalesReturns.viewReturn('${r.id}')"></i></td>
            </tr>`;
        }).join('');
    },
    openReturnModal() {
        this.el.originalInvoice.innerHTML = '<option value="">اختر فاتورة</option>' + this.state.invoices.map(inv => `<option value="${inv.id}">${U.escapeHTML(inv.invoice_number||inv.id.substring(0,8))} - ${U.escapeHTML(inv.customer_name||'عميل')}</option>`).join('');
        this.el.returnItemsContainer.innerHTML = '';
        this.el.returnModal.classList.add('open');
    },
    async saveReturn() {
        const invId = this.el.originalInvoice.value;
        if(!invId) return alert('اختر فاتورة');
        const invoice = this.state.invoices.find(i=>i.id===invId);
        if(!invoice) return alert('الفاتورة غير موجودة');
        const items = JSON.parse(JSON.stringify(invoice.items || []));
        const total = items.reduce((s,i)=>s+((i.price||0)*(i.quantity||0)),0);
        const ret = {
            id: crypto.randomUUID(),
            type: 'sale',
            date: U.today(),
            original_invoice_id: invId,
            party_id: invoice.customer_id,
            party_name: invoice.customer_name,
            items: items,
            total: total,
            notes: this.el.returnReason.value || 'مرتجع'
        };
        try {
            if(this.state.ready===true) {
                await DB.saveReturn(ret);
                for(const item of items) {
                    const prod = this.state.products.find(p=>p.name===item.productName);
                    if(prod) {
                        const unit = prod.units?.find(u=>u.name===item.unitName);
                        if(unit) { prod.units[0].stock = (prod.units[0].stock||0) + (item.quantity||0); await DB.saveProduct(prod); }
                    }
                }
                const customer = this.state.customers.find(c=>c.id===invoice.customer_id);
                if(customer) { customer.balance = (customer.balance||0) - total; await DB.saveParty(customer); }
            } else if(window.localDB) {
                await localDB.put('returns', ret);
                for(const item of items) {
                    const prod = this.state.products.find(p=>p.name===item.productName);
                    if(prod) { prod.units[0].stock = (prod.units[0].stock||0) + (item.quantity||0); await localDB.put('products', prod); }
                }
                const customer = this.state.customers.find(c=>c.id===invoice.customer_id);
                if(customer) { customer.balance = (customer.balance||0) - total; await localDB.put('parties', customer); }
            }
            this.el.returnModal.classList.remove('open');
            await this.loadAllData();
            this.renderTable();
            this.toast('تم حفظ المرتجع');
        } catch(e) { alert('فشل: '+e.message); }
    },
    viewReturn(id) {
        const ret = this.state.returns.find(r=>r.id===id);
        if(!ret) return;
        alert(JSON.stringify(ret, null, 2)); // عرض بسيط للتفاصيل
    },
    toast(msg) { const t=this.el.toast; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
};
window.SalesReturns = SalesReturns;
window.addEventListener('DOMContentLoaded', ()=>SalesReturns.init());
