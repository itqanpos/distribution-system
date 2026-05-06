'use strict';
const U = {
    formatMoney: (v) => Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2})+' ج.م',
    today: ()=>new Date().toISOString().split('T')[0],
    escapeHTML: (s) => { const d=document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
};
const PurchaseReturns = {
    el: {},
    state: { returns: [], purchases: [], products: [], suppliers: [], ready: false },
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
                   'addReturnBtn','returnModal','closeReturnModalBtn','returnForm','originalPurchase',
                   'returnReason','toast'];
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
                this.state.returns = (await DB.getReturns('purchase')) || [];
                this.state.purchases = await DB.getPurchases() || [];
                this.state.products = await DB.getProducts() || [];
                this.state.suppliers = await DB.getParties('supplier') || [];
            } else if(window.localDB) {
                this.state.returns = (await localDB.getAll('returns')).filter(r=>r.type==='purchase') || [];
                this.state.purchases = await localDB.getAll('purchases') || [];
                this.state.products = await localDB.getAll('products') || [];
                const parties = await localDB.getAll('parties') || [];
                this.state.suppliers = parties.filter(p=>p.type==='supplier');
            }
        } catch(e) { console.error(e); }
    },
    renderTable() {
        const tbody = this.el.returnsBody;
        if(!tbody) return;
        if(!this.state.returns.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:30px;">لا توجد مرتجعات</td></tr>'; return; }
        tbody.innerHTML = this.state.returns.map(r => {
            const supplier = this.state.suppliers.find(s=>s.id===r.party_id) || {};
            return `<tr>
                <td>${U.escapeHTML(r.id?.substring(0,8)||'')}</td>
                <td>${r.date}</td>
                <td>${U.escapeHTML(supplier.name||'غير معروف')}</td>
                <td>${U.formatMoney(r.total)}</td>
                <td>${U.escapeHTML(r.notes||'-')}</td>
                <td class="action-icons"><i class="fas fa-eye" onclick="PurchaseReturns.viewReturn('${r.id}')"></i></td>
            </tr>`;
        }).join('');
    },
    openReturnModal() {
        this.el.originalPurchase.innerHTML = '<option value="">اختر أمر شراء</option>' + this.state.purchases.map(p => `<option value="${p.id}">${U.escapeHTML(p.invoice_number||p.id.substring(0,8))} - ${U.escapeHTML(p.supplier_name||'مورد')}</option>`).join('');
        this.el.returnModal.classList.add('open');
    },
    async saveReturn() {
        const purId = this.el.originalPurchase.value;
        if(!purId) return alert('اختر أمر شراء');
        const purchase = this.state.purchases.find(p=>p.id===purId);
        if(!purchase) return alert('أمر الشراء غير موجود');
        const items = JSON.parse(JSON.stringify(purchase.items || []));
        const total = items.reduce((s,i)=>s+((i.price||0)*(i.quantity||0)),0);
        const ret = {
            id: crypto.randomUUID(),
            type: 'purchase',
            date: U.today(),
            original_invoice_id: purId,
            party_id: purchase.supplier_id,
            party_name: purchase.supplier_name,
            items: items,
            total: total,
            notes: this.el.returnReason.value || 'مرتجع مشتريات'
        };
        try {
            if(this.state.ready===true) {
                await DB.saveReturn(ret);
                for(const item of items) {
                    const prod = this.state.products.find(p=>p.name===item.productName);
                    if(prod) {
                        const unit = prod.units?.find(u=>u.name===item.unitName);
                        if(unit) { prod.units[0].stock = Math.max(0, (prod.units[0].stock||0) - (item.quantity||0)); await DB.saveProduct(prod); }
                    }
                }
                const supplier = this.state.suppliers.find(s=>s.id===purchase.supplier_id);
                if(supplier) { supplier.balance = (supplier.balance||0) - total; await DB.saveParty(supplier); }
            } else if(window.localDB) {
                await localDB.put('returns', ret);
                for(const item of items) {
                    const prod = this.state.products.find(p=>p.name===item.productName);
                    if(prod) { prod.units[0].stock = Math.max(0, (prod.units[0].stock||0) - (item.quantity||0)); await localDB.put('products', prod); }
                }
                const supplier = this.state.suppliers.find(s=>s.id===purchase.supplier_id);
                if(supplier) { supplier.balance = (supplier.balance||0) - total; await localDB.put('parties', supplier); }
            }
            this.el.returnModal.classList.remove('open');
            await this.loadAllData();
            this.renderTable();
            this.toast('تم حفظ مرتجع المشتريات');
        } catch(e) { alert('فشل: '+e.message); }
    },
    viewReturn(id) {
        const ret = this.state.returns.find(r=>r.id===id);
        if(!ret) return;
        alert(JSON.stringify(ret, null, 2));
    },
    toast(msg) { const t=this.el.toast; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
};
window.PurchaseReturns = PurchaseReturns;
window.addEventListener('DOMContentLoaded', ()=>PurchaseReturns.init());
