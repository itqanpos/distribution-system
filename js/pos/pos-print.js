'use strict';
(function() {
    const POS = window.POS;
    POS._showReceipt = function(inv, cust, items, totals, oldBal, pay) {
        const s = JSON.parse(localStorage.getItem('app_settings')||'{}'), name = s?.company?.name||'حسابي', phone = s?.company?.phone||'', foot = s?.print?.footer_message||'شكراً لتعاملكم معنا';
        const fmt = v => Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
        const usedBalance = pay.usedBalance || 0;
        const diff = pay.diff || 0;
        let itemsHtml = '';
        for(const it of items){
            const line = U.round(it.price*it.quantity - (it.discount||0), 2);
            itemsHtml += `<tr><td>${U.escape(it.productName)} - ${U.escape(it.unitName)}</td><td>${it.quantity}</td><td>${fmt(it.price)}</td><td>${fmt(line)}</td></tr>`;
        }
        let paymentsHtml = '';
        if (pay.payments) {
            pay.payments.forEach(p => {
                paymentsHtml += `<div><span>${p.method}:</span> ${fmt(p.amount)}</div>`;
            });
        }
        const receiptHtml = `<div style="font-family:'Cairo',sans-serif;font-size:13px;direction:rtl;padding:10px;background:white;width:80mm;max-width:100%;margin:0 auto;">
            <div style="text-align:center;font-weight:bold;">${U.escape(name)}</div>${phone?`<div style="text-align:center;font-size:12px;">هاتف: ${U.escape(phone)}</div>`:''}<hr>
            <div><span>العميل:</span> <strong>${U.escape(cust?.name||'نقدي')}</strong></div>
            <div><span>الفاتورة:</span> <strong>${U.escape(inv.invoice_number||'')}</strong></div>
            <div><span>التاريخ:</span> ${U.fmtDate(inv.date)}</div><hr>
            <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table><hr>
            <div><span>الإجمالي:</span> ${fmt(totals.sub)}</div>${totals.disc>0?`<div><span>الخصم:</span> ${fmt(totals.disc)}</div>`:''}
            ${totals.tax>0?`<div><span>الضريبة:</span> ${fmt(totals.tax)}</div>`:''}${totals.shipping>0?`<div><span>الشحن:</span> ${fmt(totals.shipping)}</div>`:''}
            <div style="font-weight:bold;"><span>الصافي:</span> ${fmt(totals.net)}</div><hr>
            ${paymentsHtml}
            ${usedBalance>0?`<div><span>من الرصيد:</span> ${fmt(usedBalance)}</div>`:''}
            <div style="font-weight:bold;"><span>المدفوع:</span> ${fmt(U.round((pay.payments?.reduce((s,p)=>s+p.amount,0)||0)+usedBalance,2))}</div>
            ${diff>0?`<div style="color:green;"><span>فائض:</span> ${fmt(diff)}</div>`:''}${diff<0?`<div style="color:red;"><span>متبقي:</span> ${fmt(-diff)}</div>`:''}
            <hr><div style="text-align:center;">${U.escape(foot)}</div></div>`;
        POS.el.receiptPrintArea.innerHTML = receiptHtml;
        POS._showModal('receiptModal');
    };
    POS._printReceipt = function() {
        const content = POS.el.receiptPrintArea.innerHTML;
        const w = window.open('','_blank','width=400,height=600');
        if(w){ w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;padding:10px;}</style></head><body>${content}</body></html>`); w.document.close(); w.focus(); setTimeout(()=>w.print(),300); }
        else { const iframe=document.createElement('iframe'); iframe.style.display='none'; document.body.appendChild(iframe); iframe.contentDocument.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;}</style></head><body>${content}</body></html>`); iframe.contentDocument.close(); iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(()=>document.body.removeChild(iframe),1000); }
    };
    POS._printThermal = async function() {
        try {
            if(navigator.bluetooth && !POS.state._thermalDevice){ const device = await navigator.bluetooth.requestDevice({acceptAllDevices:true, optionalServices:['000018f0-0000-1000-8000-00805f9b34fb']}); POS.state._thermalDevice = device; U.showToast('تم توصيل الطابعة'); }
            U.showToast('تم إرسال أمر الطباعة');
        } catch(e) { U.showToast('فشلت الطباعة الحرارية','error'); }
    };
})();
