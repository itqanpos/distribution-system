// js/print.js - نظام طباعة احترافي مع قوالب متعددة
const PrintSystem = {
    // الحصول على إعدادات الطباعة من التخزين
    async getSettings() {
        const settings = await Storage.getSettings();
        return {
            printerType: settings.printing?.printerType || 'thermal',
            copies: settings.printing?.copies || 1,
            showLogo: settings.printing?.showLogo !== false,
            footer: settings.printing?.footer || 'شكراً لتعاملكم معنا',
            company: settings.company || {
                name: 'شركة التوزيع الغذائي',
                phone: '01234567890',
                email: 'info@fooddist.com',
                address: 'القاهرة، مصر'
            },
            templates: settings.printing?.templates || this.getDefaultTemplates()
        };
    },

    // القوالب الافتراضية الاحترافية
    getDefaultTemplates() {
        return {
            // قالب الإيصال الحراري (80mm)
            thermal: {
                css: `
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Courier New', 'Segoe UI', monospace;
                        font-size: 13px;
                        background: white;
                        color: #1a1a1a;
                        width: 80mm;
                        margin: 0 auto;
                        padding: 8px 5px;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 12px;
                        border-bottom: 1px dashed #888;
                        padding-bottom: 8px;
                    }
                    .company-name {
                        font-size: 18px;
                        font-weight: bold;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .company-details {
                        font-size: 11px;
                        color: #444;
                        margin-top: 3px;
                    }
                    .invoice-title {
                        font-size: 15px;
                        font-weight: bold;
                        margin: 10px 0 5px;
                        text-align: center;
                    }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 4px;
                        font-size: 12px;
                    }
                    .divider {
                        border-top: 1px dashed #888;
                        margin: 10px 0;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 8px 0;
                    }
                    th {
                        text-align: right;
                        font-size: 12px;
                        font-weight: bold;
                        border-bottom: 1px solid #444;
                        padding-bottom: 4px;
                    }
                    td {
                        text-align: right;
                        font-size: 12px;
                        padding: 4px 0;
                    }
                    .totals {
                        margin-top: 8px;
                        border-top: 1px solid #444;
                        padding-top: 8px;
                    }
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        font-size: 13px;
                        margin-bottom: 3px;
                    }
                    .total-row.final {
                        font-weight: bold;
                        font-size: 16px;
                        margin-top: 5px;
                        border-top: 1px dashed #888;
                        padding-top: 5px;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 15px;
                        font-size: 11px;
                        color: #555;
                    }
                    .barcode {
                        text-align: center;
                        margin: 10px 0;
                        font-family: 'Libre Barcode 39', monospace;
                        font-size: 24px;
                    }
                    @media print {
                        body { margin: 0; padding: 5px; }
                        .no-print { display: none; }
                    }
                `
            },
            // قالب فاتورة A4 احترافي
            a4: {
                css: `
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, sans-serif;
                        font-size: 14px;
                        background: white;
                        color: #2c3e50;
                        padding: 30px;
                    }
                    .invoice-container {
                        max-width: 100%;
                        border: 1px solid #e0e0e0;
                        padding: 25px;
                        border-radius: 8px;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #3498db;
                        padding-bottom: 20px;
                    }
                    .company-info {
                        text-align: right;
                    }
                    .company-name {
                        font-size: 28px;
                        font-weight: bold;
                        color: #2c3e50;
                        margin-bottom: 5px;
                    }
                    .company-details {
                        color: #7f8c8d;
                        font-size: 13px;
                    }
                    .invoice-info {
                        text-align: left;
                    }
                    .invoice-title {
                        font-size: 32px;
                        font-weight: bold;
                        color: #3498db;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                    }
                    .invoice-number {
                        font-size: 16px;
                        background: #f0f0f0;
                        padding: 5px 10px;
                        border-radius: 4px;
                        margin-top: 10px;
                    }
                    .customer-section {
                        margin-bottom: 25px;
                        padding: 15px;
                        background: #f8f9fa;
                        border-radius: 8px;
                    }
                    .customer-name {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 5px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 25px 0;
                    }
                    th {
                        background: #34495e;
                        color: white;
                        font-weight: 600;
                        text-align: right;
                        padding: 12px 15px;
                        font-size: 14px;
                    }
                    td {
                        padding: 12px 15px;
                        border-bottom: 1px solid #ecf0f1;
                    }
                    tr:last-child td {
                        border-bottom: none;
                    }
                    .totals {
                        margin-top: 25px;
                        text-align: left;
                        border-top: 2px solid #ecf0f1;
                        padding-top: 20px;
                    }
                    .total-line {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 8px;
                        font-size: 15px;
                    }
                    .total-line.grand {
                        font-size: 20px;
                        font-weight: bold;
                        color: #2c3e50;
                        margin-top: 10px;
                        border-top: 1px solid #bdc3c7;
                        padding-top: 10px;
                    }
                    .footer {
                        margin-top: 30px;
                        text-align: center;
                        color: #7f8c8d;
                        font-size: 13px;
                        border-top: 1px solid #ecf0f1;
                        padding-top: 15px;
                    }
                    @media print {
                        body { padding: 15px; }
                        .invoice-container { border: none; padding: 0; }
                    }
                `
            },
            // قالب A5 (مثالي للفواتير المتوسطة)
            a5: {
                css: `
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, sans-serif;
                        font-size: 12px;
                        background: white;
                        color: #2c3e50;
                        padding: 20px;
                        width: 148mm;
                        margin: 0 auto;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid #3498db;
                    }
                    .company-name {
                        font-size: 22px;
                        font-weight: bold;
                        color: #2c3e50;
                    }
                    .invoice-title {
                        font-size: 20px;
                        font-weight: bold;
                        color: #3498db;
                    }
                    .info-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 15px;
                        margin-bottom: 20px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 15px 0;
                    }
                    th {
                        background: #2c3e50;
                        color: white;
                        padding: 10px;
                        text-align: right;
                    }
                    td {
                        padding: 8px 10px;
                        border-bottom: 1px solid #ddd;
                    }
                    .totals {
                        margin-top: 20px;
                        text-align: left;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        font-size: 11px;
                        color: #7f8c8d;
                    }
                    @media print {
                        body { padding: 10px; }
                    }
                `
            }
        };
    },

    // فتح نافذة الطباعة مع القالب
    async openPrintWindow(content, style, title = 'طباعة') {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        const html = `
            <!DOCTYPE html>
            <html dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <title>${title}</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                    <style>${style}</style>
                </head>
                <body>
                    ${content}
                    <script>
                        window.onload = function() {
                            setTimeout(() => { window.print(); }, 200);
                            setTimeout(() => { window.close(); }, 1000);
                        };
                    <\/script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    },

    // طباعة فاتورة (بيع أو شراء)
    async printInvoice(invoice, items = [], customerName = null) {
        const settings = await this.getSettings();
        const template = settings.templates[settings.printerType] || settings.templates.thermal;
        const company = settings.company;
        const showLogo = settings.showLogo;

        const typeText = invoice.type === 'sale' ? 'فاتورة بيع' : (invoice.type === 'purchase' ? 'فاتورة شراء' : 'فاتورة');
        const partyLabel = invoice.type === 'sale' ? 'العميل' : 'المورد';
        const partyName = customerName || invoice.customer || invoice.supplier || '-';
        const invoiceDate = invoice.date || Utils.getToday();

        // بناء صفوف الأصناف
        let itemsHtml = '';
        let subtotal = 0;
        if (items && items.length > 0) {
            items.forEach(item => {
                const itemTotal = item.total || (item.price * item.quantity);
                subtotal += itemTotal;
                itemsHtml += `
                    <tr>
                        <td>${item.productName || item.name}</td>
                        <td>${item.quantity} ${item.unit || item.unitName || ''}</td>
                        <td>${Utils.formatMoney(item.price)}</td>
                        <td>${Utils.formatMoney(itemTotal)}</td>
                    </tr>
                `;
            });
        }

        const discount = invoice.discount || 0;
        const total = invoice.total || subtotal;
        const paid = invoice.paid || 0;
        const remaining = invoice.remaining || (total - paid);
        const paymentMethod = this.getMethodName(invoice.paymentMethod);

        let logoHtml = '';
        if (showLogo) {
            logoHtml = `
                <div style="text-align:center; margin-bottom:15px;">
                    <i class="fas fa-store" style="font-size:48px; color:#3498db;"></i>
                </div>
            `;
        }

        let content = '';
        if (settings.printerType === 'thermal') {
            content = `
                ${logoHtml}
                <div class="header">
                    <div class="company-name">${company.name}</div>
                    <div class="company-details">${company.phone || ''}</div>
                    <div class="company-details">${company.address || ''}</div>
                </div>
                <div class="invoice-title">${typeText}</div>
                <div class="info-row"><span>رقم:</span><span>${invoice.id}</span></div>
                <div class="info-row"><span>التاريخ:</span><span>${invoiceDate}</span></div>
                <div class="info-row"><span>${partyLabel}:</span><span>${partyName}</span></div>
                <div class="divider"></div>
                <table>
                    <thead><tr><th>الصنف</th><th>كم</th><th>سعر</th><th>إجمالي</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div class="divider"></div>
                <div class="totals">
                    <div class="total-row"><span>الإجمالي:</span><span>${Utils.formatMoney(total)}</span></div>
                    ${discount > 0 ? `<div class="total-row"><span>الخصم:</span><span>${Utils.formatMoney(discount)}</span></div>` : ''}
                    <div class="total-row"><span>المدفوع:</span><span>${Utils.formatMoney(paid)}</span></div>
                    <div class="total-row"><span>المتبقي:</span><span>${Utils.formatMoney(remaining)}</span></div>
                    <div class="total-row"><span>طريقة الدفع:</span><span>${paymentMethod}</span></div>
                </div>
                ${invoice.note ? `<div class="info-row"><span>ملاحظة:</span><span>${invoice.note}</span></div>` : ''}
                <div class="footer">${settings.footer}</div>
            `;
        } else {
            // قالب A4 / A5
            content = `
                <div class="invoice-container">
                    <div class="header">
                        <div class="company-info">
                            <div class="company-name">${company.name}</div>
                            <div class="company-details">${company.phone || ''}</div>
                            <div class="company-details">${company.email || ''}</div>
                            <div class="company-details">${company.address || ''}</div>
                        </div>
                        <div class="invoice-info">
                            <div class="invoice-title">${typeText}</div>
                            <div class="invoice-number">رقم: ${invoice.id}</div>
                            <div>التاريخ: ${invoiceDate}</div>
                        </div>
                    </div>
                    <div class="customer-section">
                        <div class="customer-name">${partyLabel}: ${partyName}</div>
                        ${paymentMethod !== '-' ? `<div>طريقة الدفع: ${paymentMethod}</div>` : ''}
                    </div>
                    <table>
                        <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                    <div class="totals">
                        <div class="total-line"><span>الإجمالي:</span><span>${Utils.formatMoney(total)}</span></div>
                        ${discount > 0 ? `<div class="total-line"><span>الخصم:</span><span>${Utils.formatMoney(discount)}</span></div>` : ''}
                        <div class="total-line"><span>المدفوع:</span><span>${Utils.formatMoney(paid)}</span></div>
                        <div class="total-line grand"><span>المتبقي:</span><span>${Utils.formatMoney(remaining)}</span></div>
                    </div>
                    ${invoice.note ? `<p style="margin-top:15px;"><strong>ملاحظة:</strong> ${invoice.note}</p>` : ''}
                    <div class="footer">${settings.footer}</div>
                </div>
            `;
        }

        await this.openPrintWindow(content, template.css, `${typeText} - ${invoice.id}`);
    },

    // طباعة إيصال حراري سريع (لنقطة البيع)
    async printThermalReceipt(cart, totals, customer = null, paymentMethod = 'cash', note = '') {
        const settings = await this.getSettings();
        const template = settings.templates.thermal;
        const company = settings.company;

        let itemsHtml = '';
        cart.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${item.productName}</td>
                    <td>${item.quantity} ${item.unitName || ''}</td>
                    <td>${Utils.formatMoney(item.price * item.quantity)}</td>
                </tr>
            `;
        });

        const now = new Date();
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('ar-EG');

        const content = `
            <div class="header">
                <div class="company-name">${company.name}</div>
                <div class="company-details">${company.phone || ''}</div>
                <div class="company-details">${dateStr} ${timeStr}</div>
            </div>
            <div class="invoice-title">إيصال بيع</div>
            ${customer ? `<div class="info-row"><span>العميل:</span><span>${customer.name || customer}</span></div>` : ''}
            <div class="divider"></div>
            <table>
                <thead><tr><th>الصنف</th><th>كم</th><th>إجمالي</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <div class="divider"></div>
            <div class="totals">
                <div class="total-row"><span>الإجمالي:</span><span>${Utils.formatMoney(totals.subtotal)}</span></div>
                ${totals.discount > 0 ? `<div class="total-row"><span>الخصم:</span><span>${Utils.formatMoney(totals.discount)}</span></div>` : ''}
                <div class="total-row"><span>الضريبة:</span><span>${Utils.formatMoney(totals.tax)}</span></div>
                <div class="total-row final"><span>الصافي:</span><span>${Utils.formatMoney(totals.net)}</span></div>
                <div class="total-row"><span>طريقة الدفع:</span><span>${this.getMethodName(paymentMethod)}</span></div>
            </div>
            ${note ? `<div class="info-row"><span>ملاحظة:</span><span>${note}</span></div>` : ''}
            <div class="footer">${settings.footer}</div>
        `;

        await this.openPrintWindow(content, template.css, 'إيصال بيع');
    },

    getMethodName(method) {
        const names = { cash: 'نقدي', credit: 'آجل', mixed: 'مختلط', bank: 'تحويل بنكي' };
        return names[method] || method;
    },

    // حفظ قالب مخصص
    async saveTemplate(printerType, css) {
        const settings = await Storage.getSettings();
        if (!settings.printing) settings.printing = {};
        if (!settings.printing.templates) settings.printing.templates = {};
        settings.printing.templates[printerType] = { ...settings.printing.templates[printerType], css };
        await Storage.saveSettings(settings);
    }
};

window.PrintSystem = PrintSystem;
