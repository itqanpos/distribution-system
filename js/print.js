// js/print.js
// نظام طباعة مركزي لجميع أجزاء التطبيق

(function() {
    // الإعدادات الافتراضية
    const defaultSettings = {
        companyName: 'شركة التوزيع الغذائي',
        companyPhone: '+20 123 456 7890',
        companyAddress: 'القاهرة، مصر',
        footerMessage: 'شكراً لتعاملكم معنا',
        currency: 'ج.م',
        taxRate: 0.14 // 14% افتراضياً
    };

    // جلب إعدادات الشركة من Supabase
    async function getCompanySettings() {
        try {
            if (window.DB && window.DB.getSettings) {
                const settings = await window.DB.getSettings();
                return {
                    companyName: settings.company?.name || defaultSettings.companyName,
                    companyPhone: settings.company?.phone || defaultSettings.companyPhone,
                    companyAddress: settings.company?.address || defaultSettings.companyAddress,
                    footerMessage: settings.printing?.footer || defaultSettings.footerMessage,
                    currency: settings.system?.currency || defaultSettings.currency,
                    taxRate: (settings.system?.taxRate || 14) / 100
                };
            }
        } catch (e) {
            console.warn('تعذر جلب إعدادات الشركة، استخدام القيم الافتراضية', e);
        }
        return defaultSettings;
    }

    /**
     * طباعة إيصال فاتورة بيع
     * @param {Object} invoice - الفاتورة (id, date, paid, remaining, discount, notes)
     * @param {Object} customer - العميل (name, balance)
     * @param {Array} items - الأصناف [{ productName, unitName, quantity, price, factor }]
     * @param {Object} totals - الحسابات { subtotal, discount, net }
     */
    window.printSaleReceipt = async function(invoice, customer, items, totals) {
        const settings = await getCompanySettings();
        const width = 360, height = 700;
        const left = (screen.width - width) / 2, top = (screen.height - height) / 2;
        const win = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
        if (!win) {
            alert('الرجاء السماح بالنوافذ المنبثقة للطباعة.');
            return;
        }

        const itemsHtml = items.map(i => `
            <tr>
                <td>${i.productName} ${i.unitName ? '(' + i.unitName + ')' : ''}</td>
                <td>${i.quantity}</td>
                <td>${Utils.formatMoney(i.price)}</td>
                <td>${Utils.formatMoney(i.price * i.quantity)}</td>
            </tr>
        `).join('');

        const balanceText = customer.balance >= 0 
            ? `رصيد للعميل: ${Utils.formatMoney(customer.balance)}` 
            : `رصيد على العميل: ${Utils.formatMoney(-customer.balance)}`;

        win.document.write(`
            <html dir="rtl">
            <head>
                <title>إيصال فاتورة - ${invoice.id}</title>
                <style>
                    body { font-family: 'Courier New', monospace; margin: 15px; font-size: 14px; color: #000; }
                    .center { text-align: center; }
                    .line { border-top: 1px dashed #000; margin: 12px 0; }
                    .total { font-weight: bold; font-size: 16px; }
                    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                    th, td { padding: 8px 5px; text-align: right; border-bottom: 1px solid #ccc; }
                    th { background: #f1f5f9; }
                </style>
            </head>
            <body>
                <div class="center">
                    <h2>${settings.companyName}</h2>
                    <p>${settings.companyPhone} - ${settings.companyAddress}</p>
                </div>
                <div class="line"></div>
                <p><strong>فاتورة:</strong> ${invoice.id}</p>
                <p><strong>التاريخ:</strong> ${invoice.date}</p>
                <p><strong>العميل:</strong> ${customer.name}</p>
                <table>
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div class="line"></div>
                <p><strong>الإجمالي:</strong> ${Utils.formatMoney(totals.subtotal)}</p>
                <p><strong>الخصم:</strong> ${Utils.formatMoney(totals.discount)}</p>
                <p class="total"><strong>الصافي:</strong> ${Utils.formatMoney(totals.net)}</p>
                <p><strong>المدفوع:</strong> ${Utils.formatMoney(invoice.paid)}</p>
                <p><strong>المتبقي:</strong> ${Utils.formatMoney(invoice.remaining)}</p>
                <p>${balanceText}</p>
                ${invoice.notes ? `<p><strong>ملاحظات:</strong> ${invoice.notes}</p>` : ''}
                <div class="center" style="margin-top:20px;">${settings.footerMessage}</div>
                <script>window.print();setTimeout(()=>window.close(),500);<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    /**
     * طباعة فاتورة شراء
     * @param {Object} purchase - فاتورة الشراء
     */
    window.printPurchaseOrder = async function(purchase) {
        const settings = await getCompanySettings();
        const width = 360, height = 700;
        const left = (screen.width - width) / 2, top = (screen.height - height) / 2;
        const win = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
        if (!win) {
            alert('الرجاء السماح بالنوافذ المنبثقة للطباعة.');
            return;
        }

        const itemsHtml = (purchase.items || []).map(i => `
            <tr>
                <td>${i.productName}</td>
                <td>${i.quantity}</td>
                <td>${Utils.formatMoney(i.price)}</td>
                <td>${Utils.formatMoney(i.quantity * i.price)}</td>
            </tr>
        `).join('');

        win.document.write(`
            <html dir="rtl">
            <head>
                <title>فاتورة شراء - ${purchase.invoice_number || purchase.id}</title>
                <style>
                    body { font-family: 'Courier New', monospace; margin: 15px; font-size: 14px; color: #000; }
                    .center { text-align: center; }
                    .line { border-top: 1px dashed #000; margin: 12px 0; }
                    .total { font-weight: bold; font-size: 16px; }
                    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                    th, td { padding: 8px 5px; text-align: right; border-bottom: 1px solid #ccc; }
                    th { background: #f1f5f9; }
                </style>
            </head>
            <body>
                <div class="center">
                    <h2>${settings.companyName}</h2>
                    <p>${settings.companyPhone} - ${settings.companyAddress}</p>
                </div>
                <div class="line"></div>
                <p><strong>فاتورة شراء:</strong> ${purchase.invoice_number || purchase.id}</p>
                <p><strong>التاريخ:</strong> ${purchase.date}</p>
                <p><strong>المورد:</strong> ${purchase.supplier_name}</p>
                <table>
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div class="line"></div>
                <p><strong>الإجمالي:</strong> ${Utils.formatMoney(purchase.total)}</p>
                <p><strong>المدفوع:</strong> ${Utils.formatMoney(purchase.paid)}</p>
                <p><strong>المتبقي:</strong> ${Utils.formatMoney(purchase.remaining)}</p>
                ${purchase.notes ? `<p><strong>ملاحظات:</strong> ${purchase.notes}</p>` : ''}
                <div class="center" style="margin-top:20px;">${settings.footerMessage}</div>
                <script>window.print();setTimeout(()=>window.close(),500);<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    /**
     * طباعة كشف حساب عميل
     * @param {Object} customer - العميل
     * @param {Array} invoices - فواتير العميل
     * @param {Array} payments - المدفوعات (اختياري)
     */
    window.printCustomerStatement = async function(customer, invoices, payments = []) {
        const settings = await getCompanySettings();
        const width = 450, height = 700;
        const left = (screen.width - width) / 2, top = (screen.height - height) / 2;
        const win = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
        if (!win) {
            alert('الرجاء السماح بالنوافذ المنبثقة للطباعة.');
            return;
        }

        const invoicesHtml = invoices.map(inv => `
            <tr>
                <td>${inv.id}</td>
                <td>${inv.date}</td>
                <td>${Utils.formatMoney(inv.total)}</td>
                <td>${Utils.formatMoney(inv.paid)}</td>
                <td>${Utils.formatMoney(inv.remaining)}</td>
            </tr>
        `).join('');

        const paymentsHtml = payments.map(p => `
            <tr>
                <td>${p.date}</td>
                <td>${Utils.formatMoney(p.amount)}</td>
                <td>${p.description || ''}</td>
            </tr>
        `).join('');

        const balanceText = customer.balance >= 0 
            ? `رصيد للعميل: ${Utils.formatMoney(customer.balance)}` 
            : `رصيد على العميل: ${Utils.formatMoney(-customer.balance)}`;

        win.document.write(`
            <html dir="rtl">
            <head>
                <title>كشف حساب - ${customer.name}</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; margin: 20px; font-size: 14px; }
                    h2, h3 { color: #1e293b; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th, td { padding: 10px; text-align: right; border: 1px solid #ddd; }
                    th { background: #f8fafc; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .balance { font-size: 18px; font-weight: bold; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>${settings.companyName}</h2>
                    <p>${settings.companyPhone} - ${settings.companyAddress}</p>
                    <h3>كشف حساب عميل</h3>
                </div>
                <p><strong>العميل:</strong> ${customer.name}</p>
                <p><strong>الهاتف:</strong> ${customer.phone || '-'}</p>
                <p class="balance">${balanceText}</p>
                
                <h4>الفواتير</h4>
                <table>
                    <thead><tr><th>الرقم</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
                    <tbody>${invoicesHtml}</tbody>
                </table>

                <h4>المدفوعات</h4>
                <table>
                    <thead><tr><th>التاريخ</th><th>المبلغ</th><th>البيان</th></tr></thead>
                    <tbody>${paymentsHtml || '<tr><td colspan="3">لا توجد مدفوعات</td></tr>'}</tbody>
                </table>

                <p style="margin-top:20px;">تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</p>
                <script>window.print();setTimeout(()=>window.close(),500);<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    /**
     * طباعة كشف حساب مندوب
     * @param {Object} rep - المندوب
     * @param {Array} invoices - فواتير المندوب
     */
    window.printRepStatement = async function(rep, invoices) {
        const settings = await getCompanySettings();
        const width = 450, height = 700;
        const left = (screen.width - width) / 2, top = (screen.height - height) / 2;
        const win = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
        if (!win) {
            alert('الرجاء السماح بالنوافذ المنبثقة للطباعة.');
            return;
        }

        const invoicesHtml = invoices.map(inv => `
            <tr>
                <td>${inv.id}</td>
                <td>${inv.date}</td>
                <td>${inv.customer_name || 'نقدي'}</td>
                <td>${Utils.formatMoney(inv.total)}</td>
                <td>${Utils.formatMoney(inv.paid)}</td>
                <td>${Utils.formatMoney(inv.remaining)}</td>
            </tr>
        `).join('');

        const totalSales = invoices.reduce((s, i) => s + i.total, 0);
        const totalPaid = invoices.reduce((s, i) => s + i.paid, 0);
        const commission = totalPaid * (rep.commission || 0) / 100;

        win.document.write(`
            <html dir="rtl">
            <head>
                <title>كشف حساب مندوب - ${rep.name}</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; margin: 20px; font-size: 14px; }
                    h2, h3 { color: #1e293b; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th, td { padding: 10px; text-align: right; border: 1px solid #ddd; }
                    th { background: #f8fafc; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .summary { background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>${settings.companyName}</h2>
                    <p>${settings.companyPhone} - ${settings.companyAddress}</p>
                    <h3>كشف حساب مندوب</h3>
                </div>
                <p><strong>المندوب:</strong> ${rep.name}</p>
                <p><strong>الهاتف:</strong> ${rep.phone || '-'}</p>
                <p><strong>المنطقة:</strong> ${rep.area || '-'}</p>
                <p><strong>نسبة العمولة:</strong> ${rep.commission || 0}%</p>
                
                <div class="summary">
                    <p><strong>إجمالي المبيعات:</strong> ${Utils.formatMoney(totalSales)}</p>
                    <p><strong>إجمالي التحصيلات:</strong> ${Utils.formatMoney(totalPaid)}</p>
                    <p><strong>العمولة المستحقة:</strong> ${Utils.formatMoney(commission)}</p>
                </div>

                <h4>الفواتير</h4>
                <table>
                    <thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
                    <tbody>${invoicesHtml}</tbody>
                </table>

                <p style="margin-top:20px;">تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</p>
                <script>window.print();setTimeout(()=>window.close(),500);<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    /**
     * طباعة مرتجع (بيع أو شراء)
     * @param {Object} ret - المرتجع
     * @param {string} type - 'sale' أو 'purchase'
     */
    window.printReturnReceipt = async function(ret, type) {
        const settings = await getCompanySettings();
        const width = 360, height = 600;
        const left = (screen.width - width) / 2, top = (screen.height - height) / 2;
        const win = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
        if (!win) {
            alert('الرجاء السماح بالنوافذ المنبثقة للطباعة.');
            return;
        }

        const itemsHtml = (ret.items || []).map(i => `
            <tr>
                <td>${i.productName}</td>
                <td>${i.quantity}</td>
                <td>${Utils.formatMoney(i.price)}</td>
                <td>${Utils.formatMoney(i.quantity * i.price)}</td>
            </tr>
        `).join('');

        const partyName = type === 'sale' ? ret.customer_name : ret.supplier_name;
        const partyLabel = type === 'sale' ? 'العميل' : 'المورد';
        const refLabel = type === 'sale' ? 'الفاتورة الأصلية' : 'فاتورة الشراء';
        const refId = type === 'sale' ? ret.invoice_id : ret.purchase_id;

        win.document.write(`
            <html dir="rtl">
            <head>
                <title>مرتجع ${type === 'sale' ? 'مبيعات' : 'مشتريات'} - ${ret.id}</title>
                <style>
                    body { font-family: 'Courier New', monospace; margin: 15px; font-size: 14px; color: #000; }
                    .center { text-align: center; }
                    .line { border-top: 1px dashed #000; margin: 12px 0; }
                    .total { font-weight: bold; font-size: 16px; }
                    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                    th, td { padding: 8px 5px; text-align: right; border-bottom: 1px solid #ccc; }
                    th { background: #f1f5f9; }
                </style>
            </head>
            <body>
                <div class="center">
                    <h2>${settings.companyName}</h2>
                    <p>${settings.companyPhone} - ${settings.companyAddress}</p>
                </div>
                <div class="line"></div>
                <p><strong>مرتجع ${type === 'sale' ? 'مبيعات' : 'مشتريات'}</strong> ${ret.id}</p>
                <p><strong>التاريخ:</strong> ${ret.date}</p>
                <p><strong>${partyLabel}:</strong> ${partyName}</p>
                <p><strong>${refLabel}:</strong> ${refId}</p>
                <table>
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div class="line"></div>
                <p class="total"><strong>إجمالي المرتجع:</strong> ${Utils.formatMoney(ret.amount)}</p>
                ${ret.notes ? `<p><strong>ملاحظات:</strong> ${ret.notes}</p>` : ''}
                <div class="center" style="margin-top:20px;">${settings.footerMessage}</div>
                <script>window.print();setTimeout(()=>window.close(),500);<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    console.log('✅ نظام الطباعة المركزي جاهز');
})();
