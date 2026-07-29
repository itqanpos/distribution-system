'use strict';
(function() {
    const POS = window.POS;
    POS._applyUserPrefs = function() { if(POS.state.fontSize!==14) document.documentElement.style.fontSize=POS.state.fontSize+'px'; };
    POS._setupAutoTheme = function() {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = e => document.documentElement.setAttribute('data-theme', e.matches?'dark':'light');
        apply(mq); mq.addEventListener('change', apply);
    };
    POS._enableDragDrop = function() {
        if(!POS.el.cartItemsContainer||typeof Sortable==='undefined') return;
        new Sortable(POS.el.cartItemsContainer,{handle:'.cart-item-drag-handle',animation:150,onEnd:()=>{ const rows=[...POS.el.cartItemsContainer.querySelectorAll('.cart-item-row')]; const newCart=[]; rows.forEach(r=>{ const idx=+r.dataset.cartIdx; if(!isNaN(idx)&&POS.state.cart[idx]) newCart.push(POS.state.cart[idx]); }); POS.state.cart=newCart; POS._renderCart(); POS._saveCart(); }});
    };
    POS._setupServiceWorker = function() {
        if(!('serviceWorker' in navigator)) return;
        window.addEventListener('load',()=>{ navigator.serviceWorker.register('./service-worker.js').catch(()=>{}); });
    };
    POS._sidebarUser = async function() {
        if(window.App?.getCurrentUser) {
            const u = await App.getCurrentUser();
            if(u){ if(POS.el.sidebarAvatar) POS.el.sidebarAvatar.textContent=(u.fullName||'U')[0].toUpperCase(); if(POS.el.sidebarUserName) POS.el.sidebarUserName.textContent=u.fullName||u.email; POS.state.currentUser=u; }
        }
    };
})();
