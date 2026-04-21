// js/print.js - نظام الطباعة النهائي
(function() {
    const defaultSettings = { companyName: 'حسابي', companyPhone: '', companyAddress: '', footerMessage: 'شكراً لتعاملكم معنا', currency: 'ج.م' };

    async function getCompanySettings() {
        try { if (window.DB && window.DB.getSettings) { const s = await window.DB.getSettings(); return { ...defaultSettings, ...s.company, ...s.printing, currency: s.system?.currency || defaultSettings.currency }; } } catch (e) {}
        return defaultSettings;
    }

    window.printSaleReceipt = async function(invoice, customer, items, totals) {
        const settings = await getCompanySettings();
        const win = window.open('', '_blank', 'width=360,height=700');
        if (!win) return alert('الرجاء السماح بالنوافذ المنبثقة');
        const itemsHtml = items.map(i => `<tr><td>${i.productName} (${i.unitName})</td><td>${i.quantity}</td><td>${Utils.formatMoney(i.price)}</td><td>${Utils.formatMoney(i.price*i.quantity)}</td></tr>`).join('');
        const balanceText = customer.balance >= 0 ? `رصيد للعميل: ${Utils.formatMoney(customer.balance)}` : `رصيد على العميل: ${Utils.formatMoney(-customer.balance)}`;
        win.document.write(`<html dir="rtl"><head><title>إيصال</title><style>body{font-family:'Courier New',monospace;margin:12px;font-size:13px;}.center{text-align:center;}.line{border-top:1px dashed #000;margin:8px 0;}</style></head><body><div class="center"><h3>${settings.companyName}</h3><p>${settings.companyPhone} - ${settings.companyAddress}</p></div><div class="line"></div><p>فاتورة: ${invoice.id}</p><p>تاريخ: ${invoice.date}</p><p>عميل: ${customer.name}</p><table width="100%"><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr>${itemsHtml}</table><div class="line"></div><p>الإجمالي: ${Utils.formatMoney(totals.subtotal)}</p><p>الخصم: ${Utils.formatMoney(totals.discount)}</p><p>الصافي: ${Utils.formatMoney(totals.net)}</p><p>مدفوع: ${Utils.formatMoney(invoice.paid)}</p><p>${invoice.remaining === 0 ? 'تم الدفع بالكامل' : 'متبقي: ' + Utils.formatMoney(invoice.remaining)}</p><p>${balanceText}</p><div class="center">${settings.footerMessage}</div><script>window.print();setTimeout(()=>window.close(),500);<\/script></body></html>`);
        win.document.close();
    };

    window.printPurchaseOrder = async function(purchase) {
        const settings = await getCompanySettings();
        const win = window.open('', '_blank', 'width=360,height=700');
        if (!win) return alert('الرجاء السماح بالنوافذ المنبثقة');
        const itemsHtml = (purchase.items||[]).map(i => `<tr><td>${i.productName}</td><td>${i.quantity}</td><td>${Utils.formatMoney(i.price)}</td><td>${Utils.formatMoney(i.quantity*i.price)}</td></tr>`).join('');
        win.document.write(`<html dir="rtl"><head><title>فاتورة شراء</title><style>body{font-family:'Courier New',monospace;margin:12px;font-size:13px;}</style></head><body><div class="center"><h3>${settings.companyName}</h3></div><p>فاتورة: ${purchase.invoice_number||purchase.id}</p><p>تاريخ: ${purchase.date}</p><p>مورد: ${purchase.supplier_name}</p><table width="100%">${itemsHtml}</table><p>الإجمالي: ${Utils.formatMoney(purchase.total)}</p><p>مدفوع: ${Utils.formatMoney(purchase.paid)}</p><p>متبقي: ${Utils.formatMoney(purchase.remaining)}</p><script>window.print();setTimeout(()=>window.close(),500);<\/script></body></html>`);
        win.document.close();
    };

    window.printCustomerStatement = async function(customer, invoices, payments) {
        const settings = await getCompanySettings();
        const win = window.open('', '_blank', 'width=450,height=700');
        if (!win) return alert('الرجاء السماح بالنوافذ المنبثقة');
        win.document.write(`<html dir="rtl"><head><title>كشف حساب</title><style>body{font-family:'Segoe UI';margin:20px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border:1px solid #ddd;}</style></head><body><h2>${settings.companyName}</h2><h3>كشف حساب ${customer.name}</h3><p>الرصيد: ${Utils.formatMoney(customer.balance)}</p><h4>الفواتير</h4><table><tr><th>الرقم</th><th>التاريخ</th><th>الإجمالي</th><th>مدفوع</th><th>متبقي</th></tr>${invoices.map(i=>`<tr><td>${i.id}</td><td>${i.date}</td><td>${Utils.formatMoney(i.total)}</td><td>${Utils.formatMoney(i.paid)}</td><td>${Utils.formatMoney(i.remaining)}</td></tr>`).join('')}</table><h4>المدفوعات</h4><table><tr><th>التاريخ</th><th>المبلغ</th><th>البيان</th></tr>${payments.map(p=>`<tr><td>${p.date}</td><td>${Utils.formatMoney(p.amount)}</td><td>${p.description}</td></tr>`).join('')}</table><script>window.print();setTimeout(()=>window.close(),500);<\/script></body></html>`);
        win.document.close();
    };

    console.log('✅ Print module ready');
})();
