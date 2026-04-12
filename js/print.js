// js/print.js - نظام الطباعة والقوالب
const PrintSystem = {
    // الحصول على إعدادات الطباعة من التخزين
    getSettings() {
        const settings = Storage.getSettings();
        return {
            printerType: settings.printing?.printerType || 'thermal',
            copies: settings.printing?.copies || 1,
            showLogo: settings.printing?.showLogo !== false,
            footer: settings.printing?.footer || 'شكراً لتعاملكم معنا',
            company: settings.company || { name: 'شركة التوزيع الغذائي', phone: '', address: '' },
            templates: settings.printing?.templates || this.getDefaultTemplates()
        };
    },

    // القوالب الافتراضية
    getDefaultTemplates() {
        return {
            thermal: {
                width: '80mm',
                css: `
                    body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 5px; width: 80mm; }
                    .header { text-align: center; margin-bottom: 8px; }
                    .company-name { font-size: 16px; font-weight: bold; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { text-align: right; padding: 3px 0; }
                    .total { font-size: 14px; font-weight: bold; margin-top: 8px; }
                    .footer { text-align: center; margin-top: 10px; font-size: 11px; }
                `
            },
            a4: {
                width: '210mm',
                css: `
                    body { font-family: 'Segoe UI', sans-serif; font-size: 14px; margin: 20px; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
                    .company-info { text-align: right; }
                    .invoice-title { font-size: 24px; font-weight: bold; color: #2c3e50; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th { background: #f2f2f2; padding: 10px; border: 1px solid #ddd; }
                    td { padding: 8px; border: 1px solid #ddd; }
                    .totals { text-align: left; margin-top: 20px; }
                `
            },
            a5: {
                width: '148mm',
                css: `/* يمكن تخصيصه */`
            }
        };
    },

    // طباعة فاتورة (بيع أو شراء)
    printInvoice(invoice, items, customerName = null) {
        const settings = this.getSettings();
        const template = settings.templates[settings.printerType] || settings.templates.thermal;
        
        const printWindow = window.open('', '_blank', `width=800,height=600`);
        const company = settings.company;
        const showLogo = settings.showLogo;
        
        const logoHtml = showLogo ? `<div style="text-align:center;"><i class="fas fa-truck" style="font-size:40px;"></i></div>` : '';
        
        const itemsHtml = items.map(item => `
            <tr>
                <td>${item.productName}</td>
                <td>${item.quantity} ${item.unit || ''}</td>
                <td>${Utils.formatMoney(item.price)}</td>
                <td>${Utils.formatMoney(item.total || item.price * item.quantity)}</td>
            </tr>
        `).join('');

        const typeText = invoice.type === 'sale' ? 'فاتورة بيع' : (invoice.type === 'purchase' ? 'فاتورة شراء' : 'فاتورة');
        const partyLabel = invoice.type === 'sale' ? 'العميل' : 'المورد';
        const partyName = customerName || invoice.customer || invoice.supplier || '-';

        const html = `
            <!DOCTYPE html>
            <html dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <title>${typeText} - ${invoice.id}</title>
                    <style>
                        ${template.css}
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    ${logoHtml}
                    <div class="header">
                        <div class="company-info">
                            <div class="company-name">${company.name}</div>
                            <div>${company.phone || ''}</div>
                            <div>${company.address || ''}</div>
                        </div>
                        <div>
                            <div class="invoice-title">${typeText}</div>
                            <div>رقم: ${invoice.id}</div>
                            <div>التاريخ: ${invoice.date || Utils.getToday()}</div>
                        </div>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div>
                        <strong>${partyLabel}:</strong> ${partyName}<br>
                        ${invoice.paymentMethod ? `<strong>طريقة الدفع:</strong> ${getMethodName(invoice.paymentMethod)}<br>` : ''}
                    </div>
                    
                    <div class="divider"></div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>الصنف</th>
                                <th>الكمية</th>
                                <th>السعر</th>
                                <th>الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                    
                    <div class="totals">
                        <div><strong>الإجمالي:</strong> ${Utils.formatMoney(invoice.total)}</div>
                        ${invoice.discount ? `<div><strong>الخصم:</strong> ${Utils.formatMoney(invoice.discount)}</div>` : ''}
                        <div><strong>المدفوع:</strong> ${Utils.formatMoney(invoice.paid)}</div>
                        <div><strong>المتبقي:</strong> ${Utils.formatMoney(invoice.remaining)}</div>
                    </div>
                    
                    <div class="footer">
                        ${settings.footer}
                    </div>
                    
                    <script>
                        window.onload = function() { window.print(); setTimeout(window.close, 100); };
                    </script>
                </body>
            </html>
        `;
        
        printWindow.document.write(html);
        printWindow.document.close();
    },

    // طباعة إيصال حراري سريع (لنقطة البيع)
    printThermalReceipt(cart, totals, customer = null, paymentMethod = 'cash') {
        const settings = this.getSettings();
        const template = settings.templates.thermal;
        const company = settings.company;
        
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        
        const itemsHtml = cart.map(item => `
            <tr>
                <td>${item.productName}</td>
                <td>${item.quantity} ${item.unitName}</td>
                <td>${Utils.formatMoney(item.price * item.quantity)}</td>
            </tr>
        `).join('');

        const now = new Date();
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('ar-EG');

        const html = `
            <!DOCTYPE html>
            <html dir="rtl">
                <head><meta charset="UTF-8"><title>إيصال بيع</title>
                <style>
                    ${template.css}
                    @media print { body { -webkit-print-color-adjust: exact; } }
                </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-name">${company.name}</div>
                        <div>${company.phone || ''}</div>
                        <div>${dateStr} ${timeStr}</div>
                    </div>
                    <div class="divider"></div>
                    ${customer ? `<div>العميل: ${customer.name || customer}</div><div class="divider"></div>` : ''}
                    <table>
                        <thead><tr><th>الصنف</th><th>كم</th><th>إجمالي</th></tr></thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                    <div class="divider"></div>
                    <div class="total">
                        <div>الإجمالي: ${Utils.formatMoney(totals.subtotal)}</div>
                        ${totals.discount > 0 ? `<div>الخصم: ${Utils.formatMoney(totals.discount)}</div>` : ''}
                        <div>الضريبة: ${Utils.formatMoney(totals.tax)}</div>
                        <div>الصافي: ${Utils.formatMoney(totals.net)}</div>
                        <div>طريقة الدفع: ${getMethodName(paymentMethod)}</div>
                    </div>
                    <div class="divider"></div>
                    <div class="footer">${settings.footer}</div>
                    <script>window.onload=function(){window.print();setTimeout(window.close,100);}</script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    },

    // حفظ قالب مخصص
    saveTemplate(printerType, css) {
        const settings = Storage.getSettings();
        if (!settings.printing) settings.printing = {};
        if (!settings.printing.templates) settings.printing.templates = {};
        settings.printing.templates[printerType] = { ...settings.printing.templates[printerType], css };
        Storage.saveSettings(settings);
    }
};

function getMethodName(method) {
    const names = { cash: 'نقدي', credit: 'آجل', mixed: 'مختلط', bank: 'تحويل بنكي' };
    return names[method] || method;
}

window.PrintSystem = PrintSystem;
