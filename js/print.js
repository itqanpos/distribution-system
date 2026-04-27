/* =============================================
   نظام الطباعة - حسابي (إصدار كامل مع قالب مخطط)
   ============================================= */
'use strict';

// الدوال الافتراضية للإعدادات
const defaultPrintSettings = {
    companyName: 'حسابي',
    companyPhone: '',
    companyAddress: '',
    footerMessage: 'شكراً لتعاملكم معنا',
    currency: 'ج.م',
    fontSize: 13,
    paperWidth: 42,
    template: 'detailed',
    copies: 1 
};

async function getPrintSettings() {
    try {
        if (window.DB && window.DB.getSettings) {
            const s = await DB.getSettings().catch(() => ({}));
            return {
                companyName: s?.company?.name || defaultPrintSettings.companyName,
                companyPhone: s?.company?.phone || defaultPrintSettings.companyPhone,
                companyAddress: s?.company?.address || defaultPrintSettings.companyAddress,
                footerMessage: s?.printing?.footer_message || defaultPrintSettings.footerMessage,
                currency: s?.financial?.currency || defaultPrintSettings.currency,
                fontSize: s?.printing?.font_size || defaultPrintSettings.fontSize,
                paperWidth: s?.printing?.paper_width || defaultPrintSettings.paperWidth,
                template: s?.printing?.template || defaultPrintSettings.template,
                copies: s?.printing?.copies || defaultPrintSettings.copies
            };
        }
    } catch (e) { /* استخدام الافتراضيات */ }
    return defaultPrintSettings;
}

function formatMoney(amount, currency) {
    if (amount === null || amount === undefined) amount = 0;
    return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
}

function separatorLine(widthChars, char = '-') {
    let line = '';
    for (let i = 0; i < widthChars; i++) line += char;
    return line;
}

/**
 * طباعة إيصال بيع
 */
window.printSaleReceipt = async function(invoice, customer, items, totals) {
    const settings = await getPrintSettings();
    
    const win = window.open('', '_blank', `width=${settings.paperWidth * 10},height=700`);
    if (!win) {
        alert('الرجاء السماح بالنوافذ المنبثقة للطباعة');
        return;
    }

    const { fontSize, paperWidth, template, currency, companyName, companyPhone, companyAddress, footerMessage } = settings;
    const effectiveFontSize = Math.min(fontSize, Math.floor(paperWidth * 0.35));
    const width = paperWidth;
    
    // استخدام رقم الفاتورة الجديد
    const invNumber = invoice.invoice_number || invoice.id.substring(0,8);

    // تحضير صفوف المنتجات
    let itemsHtml = '';
    items.forEach(item => {
        const qty = item.quantity.toString();
        const price = formatMoney(item.price, currency);
        const total = formatMoney(item.price * item.quantity, currency);
        const name = item.productName.length > 18 ? item.productName.substring(0, 16) + '..' : item.productName;
        // لكل قالب قد نستخدم نفس الصف أو نعدل الأعمدة
        itemsHtml += `
            <tr>
                <td class="item-name">${name} <small>(${item.unitName})</small></td>
                <td class="item-qty">${qty}</td>
                <td class="item-price">${price}</td>
                <td class="item-total">${total}</td>
            </tr>
        `;
    });

    const totalPieces = items.reduce((sum, item) => sum + item.quantity, 0);
    const customerName = customer?.name || 'نقدي';
    const balanceText = customer?.balance >= 0
        ? `رصيد العميل: ${formatMoney(customer.balance, currency)}`
        : `على العميل: ${formatMoney(-customer.balance, currency)}`;

    let receiptHtml = '';
    
    if (template === 'compact') {
        receiptHtml = `
            <div class="receipt compact">
                <div class="header">${companyName}</div>
                <div class="sub">${companyPhone} ${companyAddress ? ' - ' + companyAddress : ''}</div>
                <div class="line">${separatorLine(width, '-')}</div>
                <div>فاتورة: ${invNumber} &nbsp;|&nbsp; تاريخ: ${invoice.date}</div>
                <div>عميل: ${customerName}</div>
                <div class="line">${separatorLine(width, '-')}</div>
                <table>${itemsHtml}</table>
                <div class="line">${separatorLine(width, '-')}</div>
                <div class="sum">الإجمالي: ${formatMoney(totals.subtotal, currency)}  |  الخصم: ${formatMoney(totals.discount, currency)}</div>
                <div class="sum big">الصافي: ${formatMoney(totals.net, currency)}</div>
                <div>مدفوع: ${formatMoney(invoice.paid, currency)}  |  ${invoice.remaining === 0 ? 'تم الدفع' : 'متبقي: ' + formatMoney(invoice.remaining, currency)}</div>
                <div>عدد القطع: ${totalPieces}</div>
                <div>${balanceText}</div>
                <div class="center">${footerMessage}</div>
            </div>
        `;
    } else if (template === 'detailed') {
        receiptHtml = `
            <div class="receipt detailed">
                <div class="header">${companyName}</div>
                <div class="sub">${companyPhone} ${companyAddress ? ' - ' + companyAddress : ''}</div>
                <div class="line">${separatorLine(width, '=')}</div>
                <div class="info-row"><span>فاتورة:</span> <strong>${invNumber}</strong></div>
                <div class="info-row"><span>تاريخ:</span> ${invoice.date}</div>
                <div class="info-row"><span>عميل:</span> ${customerName}</div>
                <div class="line">${separatorLine(width, '=')}</div>
                <table>
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div class="line">${separatorLine(width, '-')}</div>
                <div class="sum"><span>الإجمالي:</span> ${formatMoney(totals.subtotal, currency)}</div>
                <div class="sum"><span>الخصم:</span> ${formatMoney(totals.discount, currency)}</div>
                <div class="sum big"><span>الصافي:</span> ${formatMoney(totals.net, currency)}</div>
                <div class="line">${separatorLine(width, '-')}</div>
                <div class="info-row"><span>مدفوع:</span> ${formatMoney(invoice.paid, currency)}</div>
                <div class="info-row"><span>متبقي:</span> ${invoice.remaining === 0 ? '0.00 ' + currency : formatMoney(invoice.remaining, currency)}</div>
                <div class="info-row"><span>عدد القطع:</span> ${totalPieces}</div>
                <div class="info-row"><span>رصيد العميل:</span> ${customer?.balance >= 0 ? formatMoney(customer.balance, currency) : formatMoney(-customer.balance, currency) + ' (عليه)'}</div>
                <div class="center footer">${footerMessage}</div>
            </div>
        `;
    } else if (template === 'bordered') {
        // قالب مخطط بحدود
        receiptHtml = `
            <div class="receipt bordered">
                <div class="header">${companyName}</div>
                <div class="sub">${companyPhone} ${companyAddress ? ' - ' + companyAddress : ''}</div>
                <div class="line">${separatorLine(width, '=')}</div>
                <div class="info-row"><span>فاتورة:</span> <strong>${invNumber}</strong></div>
                <div class="info-row"><span>تاريخ:</span> ${invoice.date}</div>
                <div class="info-row"><span>عميل:</span> ${customerName}</div>
                <div class="line">${separatorLine(width, '=')}</div>
                <table class="bordered-table">
                    <thead>
                        <tr>
                            <th class="col-name">الصنف</th>
                            <th class="col-qty">الكمية</th>
                            <th class="col-price">السعر</th>
                            <th class="col-total">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                <div class="line">${separatorLine(width, '-')}</div>
                <div class="sum"><span>الإجمالي:</span> ${formatMoney(totals.subtotal, currency)}</div>
                <div class="sum"><span>الخصم:</span> ${formatMoney(totals.discount, currency)}</div>
                <div class="sum big"><span>الصافي:</span> ${formatMoney(totals.net, currency)}</div>
                <div class="line">${separatorLine(width, '-')}</div>
                <div class="info-row"><span>مدفوع:</span> ${formatMoney(invoice.paid, currency)}</div>
                <div class="info-row"><span>متبقي:</span> ${invoice.remaining === 0 ? '0.00 ' + currency : formatMoney(invoice.remaining, currency)}</div>
                <div class="info-row"><span>عدد القطع:</span> ${totalPieces}</div>
                <div class="info-row"><span>رصيد العميل:</span> ${customer?.balance >= 0 ? formatMoney(customer.balance, currency) : formatMoney(-customer.balance, currency) + ' (عليه)'}</div>
                <div class="center footer">${footerMessage}</div>
            </div>
        `;
    } else {
        // افتراضي
        receiptHtml = `
            <div class="receipt default">
                <div class="header">${companyName}</div>
                <div class="sub">${companyPhone} ${companyAddress ? ' - ' + companyAddress : ''}</div>
                <div class="line">${separatorLine(width, '-')}</div>
                <div>فاتورة: ${invNumber}</div>
                <div>تاريخ: ${invoice.date}</div>
                <div>عميل: ${customerName}</div>
                <div class="line">${separatorLine(width, '-')}</div>
                <table>${itemsHtml}</table>
                <div class="line">${separatorLine(width, '-')}</div>
                <div>الإجمالي: ${formatMoney(totals.subtotal, currency)}</div>
                <div>الخصم: ${formatMoney(totals.discount, currency)}</div>
                <div>الصافي: ${formatMoney(totals.net, currency)}</div>
                <div>مدفوع: ${formatMoney(invoice.paid, currency)}</div>
                <div>${invoice.remaining === 0 ? 'تم الدفع' : 'متبقي: ' + formatMoney(invoice.remaining, currency)}</div>
                <div>${balanceText}</div>
                <div class="center">${footerMessage}</div>
            </div>
        `;
    }

    // كتابة HTML للنافذة
    win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>إيصال بيع</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    margin: 8px 12px;
                    font-size: ${effectiveFontSize}px;
                    line-height: 1.4;
                    color: #000;
                }
                .receipt {
                    width: 100%;
                    max-width: ${width}ch;
                    margin: 0 auto;
                }
                .header { text-align: center; font-weight: bold; font-size: ${effectiveFontSize + 2}px; margin-bottom: 4px; }
                .sub { text-align: center; font-size: ${effectiveFontSize - 1}px; color: #555; }
                .line { letter-spacing: 2px; margin: 8px 0; }
                table { width: 100%; border-collapse: collapse; margin: 8px 0; }
                th { text-align: right; border-bottom: 1px solid #000; padding: 4px 0; font-size: ${effectiveFontSize - 1}px; }
                td { padding: 3px 0; font-size: ${effectiveFontSize}px; }
                .item-name { text-align: right; word-break: break-word; }
                .item-qty { text-align: center; }
                .item-price { text-align: right; }
                .item-total { text-align: right; font-weight: bold; }
                .sum { display: flex; justify-content: space-between; margin: 4px 0; }
                .sum.big { font-weight: bold; font-size: ${effectiveFontSize + 2}px; margin: 8px 0; }
                .info-row { display: flex; justify-content: space-between; margin: 4px 0; }
                .center { text-align: center; margin-top: 12px; font-style: italic; }
                .footer { border-top: 1px dashed #000; padding-top: 8px; }
                
                /* جدول مخطط (bordered) */
                .bordered-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                    border: 1px solid #000;
                }
                .bordered-table th,
                .bordered-table td {
                    border: 1px solid #000;
                    padding: 5px 8px;
                    text-align: right;
                }
                .bordered-table th {
                    background-color: #f0f0f0;
                    font-weight: bold;
                    text-align: center;
                }
                .bordered-table .col-name { width: 40%; text-align: right; }
                .bordered-table .col-qty { width: 15%; text-align: center; }
                .bordered-table .col-price { width: 20%; text-align: right; }
                .bordered-table .col-total { width: 25%; text-align: right; }
                .bordered-table tbody tr:nth-child(even) {
                    background-color: #fafafa;
                }
                
                @media print {
                    body { margin: 2mm; }
                }
            </style>
        </head>
        <body>
            ${receiptHtml}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    win.document.close();
};

/**
 * طباعة أمر شراء
 */
window.printPurchaseOrder = async function(purchase) {
    const settings = await getPrintSettings();
    const win = window.open('', '_blank', `width=${settings.paperWidth * 10},height=700`);
    if (!win) return alert('الرجاء السماح بالنوافذ المنبثقة');

    const { fontSize, paperWidth, currency, companyName } = settings;
    const width = paperWidth;
    const effectiveFontSize = Math.min(fontSize, Math.floor(paperWidth * 0.35));
    const invNumber = purchase.invoice_number || purchase.id.substring(0,8);

    let itemsHtml = '';
    (purchase.items || []).forEach(item => {
        const qty = item.quantity.toString();
        const price = formatMoney(item.price, currency);
        const total = formatMoney(item.price * item.quantity, currency);
        const name = item.productName.length > 18 ? item.productName.substring(0, 16) + '..' : item.productName;
        itemsHtml += `
            <tr>
                <td>${name} <small>(${item.unitName})</small></td>
                <td>${qty}</td>
                <td>${price}</td>
                <td>${total}</td>
            </tr>
        `;
    });

    win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head><meta charset="UTF-8"><title>أمر شراء</title>
        <style>
            body { font-family: 'Courier New', monospace; margin: 12px; font-size: ${effectiveFontSize}px; }
            .header { text-align: center; font-weight: bold; font-size: ${effectiveFontSize + 2}px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { padding: 4px 0; border-bottom: 1px dashed #ccc; text-align: right; }
            .item-total { font-weight: bold; }
        </style></head>
        <body>
            <div class="header">${companyName} - أمر شراء</div>
            <p>فاتورة: ${invNumber} | تاريخ: ${purchase.date}</p>
            <p>مورد: ${purchase.supplier_name}</p>
            <table>${itemsHtml}</table>
            <p>الإجمالي: ${formatMoney(purchase.total, currency)} | مدفوع: ${formatMoney(purchase.paid, currency)} | متبقي: ${formatMoney(purchase.remaining, currency)}</p>
            <script>window.print(); setTimeout(()=>window.close(),500);<\/script>
        </body></html>
    `);
    win.document.close();
};

console.log('✅ نظام الطباعة المحسّن مع قالب مخطط جاهز');
