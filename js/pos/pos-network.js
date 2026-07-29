'use strict';
(function() {
    const POS = window.POS;
    POS._connStatus = function() {
        const n = document.getElementById('mainNavbar'); if(n) n.classList.toggle('offline',!navigator.onLine);
        document.body.classList.toggle('offline',!navigator.onLine);
    };
    POS._setupRealtimeSync = function() {
        if(!window.supabaseClient) return;
        window.supabaseClient.channel('products-realtime').on('postgres_changes',{event:'*',schema:'public',table:'products'},payload=>{
            if(payload.eventType==='DELETE'){ const id=payload.old?.id; if(id){ POS.state.products=POS.state.products.filter(p=>p.id!==id); POS.cache.prods.delete(String(id)); POS.cache.prods.delete(id); POS._renderProductGrid(); } return; }
            const p=payload.new; if(p){ const idx=POS.state.products.findIndex(prod=>prod.id===p.id); if(idx!==-1) POS.state.products[idx]=p; else POS.state.products.push(p); POS._updateProductInCache(p); POS._renderProductGrid(); }
        }).subscribe();
    };
    POS._startTodayStatsUpdater = function() {
        const update = async ()=>{ if(!POS.state.db) return; try{ const invs=await DB.getInvoicesLight(); const today=U.today(); const todayInvs=invs.filter(i=>i.date===today&&i.type==='sale'); if(POS.el.todaySales) POS.el.todaySales.textContent=U.fmtMoney(todayInvs.reduce((s,i)=>s+(i.total||0),0)); if(POS.el.todayCount) POS.el.todayCount.textContent=todayInvs.length; }catch{} };
        update(); setInterval(update,60000);
    };
    POS._setupConnectionCheck = function() {
        POS.state._connectionCheckTimer = setInterval(async ()=>{ if(!navigator.onLine) return; if(window.supabaseClient) try{ await window.supabaseClient.from('tenants').select('id').limit(1); document.body.classList.remove('slow-connection'); }catch{ document.body.classList.add('slow-connection'); } },30000);
    };
    POS._syncOfflineSales = async function() {
        if(!navigator.onLine||!POS.state.db) return;
        const local=window.localDB; if(!local?.ready) return;
        try{ const sales=await local.getAll('offline_sales'); for(const s of sales){ try{ await DB.createSaleInvoice(s); await local.delete('offline_sales',s.id); }catch{}} }catch{}
    };
    POS._setupErrorMonitoring = function() {
        window.addEventListener('error',e=>{ POS._logErrorToServer({message:e.error?.message,stack:e.error?.stack}); });
        window.addEventListener('unhandledrejection',e=>{ POS._logErrorToServer({message:e.reason?.message,stack:e.reason?.stack}); });
    };
    POS._logErrorToServer = async function(info) {
        try{ if(window.supabaseClient&&POS.state.currentUser?.tenant_id) await window.supabaseClient.from('system_logs').insert({message:info.message,stack:info.stack,timestamp:new Date().toISOString(),tenant_id:POS.state.currentUser.tenant_id}); }catch{}
    };
})();
