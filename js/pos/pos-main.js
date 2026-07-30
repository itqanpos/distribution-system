'use strict';
(function() {
    const POS = window.POS;
    POS.init = async function() {
        POS._applyUserPrefs(); POS._cacheDOM(); POS._applySafeArea();
        POS._bindKeyboardShortcuts(); POS._bindEvents(); POS._connStatus();
        POS._setupErrorMonitoring(); POS._setupBarcodeBuffer(); POS._setupRealtimeSync();
        POS._setupAutoTheme(); POS._setupConnectionCheck(); POS._startTodayStatsUpdater();
        POS._enableDragDrop(); POS._setupServiceWorker();
        window.addEventListener('online',()=>{ POS._connStatus(); POS._syncOfflineSales(); });
        window.addEventListener('offline',()=>POS._connStatus());
        document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ POS._saveCart(); POS._savePaymentDraft(); POS._stopBarcodeScan(); } });
        await POS._loadData();
        await POS._sidebarUser();
        POS._updateHeader();
        POS._restorePaymentDraft();
        window.addEventListener('beforeunload',()=>{ POS._stopBarcodeScan(); POS._saveCart(); POS._savePaymentDraft(); });
    };
    document.addEventListener('DOMContentLoaded',()=>{ POS.init().catch(e=>console.error(e)); });
})();
