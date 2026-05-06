/* =============================================
   print.js - نظام الطباعة (نهائي 100%)
   ============================================= */
'use strict';

const defaultPrintSettings = {
    companyName: 'حسابي',
    companyPhone: '',
    companyAddress: '',
    footerMessage: 'شكراً لتعاملكم معنا',
    currency: 'ج.م',
    fontSize: 13,
    paperWidth: 42,
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
                copies: s?.printing?.copies || defaultPrintSettings.copies
            };
        }
    } catch (e) { /* استخدام الافتراضيات */ }
    return defaultPrintSettings;
}

function formatMoney(amount, currency = 'ج.م') {
    if (amount === null || amount === undefined) amount = 0;
    return Number(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' ' + currency;
}

function separatorLine(widthChars, char = '─') {
    let line = '';
    for (let i = 0; i < widthChars; i++) line += char;
    return line;
}

function buildReceiptHTML(invoice, customer, items, totals, settings) {
    const { companyName, companyPhone, companyAddress, footerMessage, currency, paperWidth } = settings;
    const width = paperWidth;
    const invNumber = invoice.invoice_number || invoice.id?.substring(0, 8) || '──────';
    const customerName = customer?.name || 'نقدي';
    const totalPieces = items ? items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;

    let itemsRows = '';
    if (items && Array.isArray(items)) {
        items.forEach(item => {
            const productName = item.productName || 'صنف';
            const unitName = item.unitName || '';
            const displayName = unitName ? `${productName} (${unitName})` : productName;
            const qty = item.quantity || 0;
            const price = item.price || 0;
            const lineTotal = price * qty;
            itemsRows += `
                <tr>
                    <td class="col-name">${displayName}</td>
                    <td class="col-qty">${qty}</td>
                    <td class="col-price">${formatMoney(price, currency)}</td>
                    <td class="col-total">${formatMoney(lineTotal, currency)}</td>
                </tr>
            `;
        });
    }

    const balance = customer?.balance || 0;
    let balanceHtml = '';
    if (customer && balance !== undefined) {
        const balanceLabel = balance >= 0 ? 'رصيد للعميل:' : 'على العميل:';
        const balanceClass = balance >= 0 ? 'positive' : 'negative';
        balanceHtml = `
            <div class="line">${separatorLine(width, '·')}</div>
            <div class="info-row">
                <span>${balanceLabel}</span>
                <span class="${balanceClass}">${formatMoney(Math.abs(balance), currency)}</span>
            </div>
        `;
    }

    return `
        <div class="receipt">
            <div class="header">${companyName}</div>
            ${companyPhone ? `<div class="sub">${companyPhone}</div>` : ''}
            ${companyAddress ? `<div class="sub">${companyAddress}</div>` : ''}
            
            <div class="line">${separatorLine(width, '═')}</div>
            
            <div class="info-row"><span>رقم الفاتورة:</span> <strong>${invNumber}</strong></div>
            <div class="info-row"><span>التاريخ:</span> ${invoice.date || ''}</div>
            <div class="info-row"><span>العميل:</span> ${customerName}</div>
            
            <div class="line">${separatorLine(width, '─')}</div>
            
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-name">الصنف</th>
                        <th class="col-qty">الكمية</th>
                        <th class="col-price">السعر</th>
                        <th class="col-total">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsRows}</tbody>
            </table>
            
            <div class="pieces-row">
                <span>عدد القطع:</span>
                <strong>${totalPieces}</strong>
            </div>
            
            <div class="line">${separatorLine(width, '─')}</div>
            
            <div class="sum-row"><span>الإجمالي:</span> <span>${formatMoney(totals.subtotal || 0, currency)}</span></div>
            <div class="sum-row"><span>الخصم:</span> <span>${formatMoney(totals.discount || 0, currency)}</span></div>
            <div class="sum-row big"><span>الصافي:</span> <span>${formatMoney(totals.net || 0, currency)}</span></div>
            
            <div class="line">${separatorLine(width, '─')}</div>
            
            <div class="info-row"><span>المدفوع:</span> <span>${formatMoney(invoice.paid || 0, currency)}</span></div>
            <div class="info-row"><span>المتبقي:</span> <span>${formatMoney(invoice.remaining || 0, currency)}</span></div>
            
            ${balanceHtml}
            
            <div class="footer">${footerMessage}</div>
        </div>
    `;
}

window.printSaleReceipt = async function(invoice, customer, items, totals) {
    const settings = await getPrintSettings();
    const win = window.open('', '_blank', `width=400,height=700`);
    if (!win) { alert('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }

    const receiptHtml = buildReceiptHTML(invoice, customer, items, totals, settings);

    win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>إيصال بيع</title>
            <style>
                @page { margin: 0; size: 80mm auto; }
                body { font-family: 'Courier New', monospace; margin: 0; padding: 8px 12px; font-size: ${settings.fontSize}px; line-height: 1.6; color: #000; }
                .receipt { width: 100%; }
                .header { text-align: center; font-weight: bold; font-size: ${settings.fontSize + 2}px; margin-bottom: 4px; }
                .sub { text-align: center; font-size: ${settings.fontSize - 1}px; color: #555; margin-bottom: 2px; }
                .line { text-align: center; margin: 10px 0; letter-spacing: 2px; }
                .info-row { display: flex; justify-content: space-between; margin: 6px 0; }
                .items-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                .items-table th { background: #f0f0f0; padding: 6px 4px; border-bottom: 2px solid #000; text-align: center; font-size: ${settings.fontSize - 1}px; }
                .items-table td { padding: 5px 4px; border-bottom: 1px dashed #ccc; font-size: ${settings.fontSize}px; }
                .col-name { text-align: right; }
                .col-qty { text-align: center; }
                .col-price { text-align: right; }
                .col-total { text-align: right; font-weight: bold; }
                .pieces-row { display: flex; justify-content: space-between; margin: 6px 0; font-weight: bold; }
                .sum-row { display: flex; justify-content: space-between; margin: 6px 0; }
                .sum-row.big { font-weight: bold; font-size: ${settings.fontSize + 2}px; }
                .positive { color: #16a34a; }
                .negative { color: #dc2626; }
                .footer { text-align: center; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #000; font-style: italic; }
                @media print { body { margin: 2mm; } }
            </style>
        </head>
        <body>
            ${receiptHtml}
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); };<\/script>
        </body>
        </html>
    `);
    win.document.close();
};

window.printPurchaseOrder = async function(purchase) {
    const settings = await getPrintSettings();
    const win = window.open('', '_blank', `width=400,height=700`);
    if (!win) return alert('الرجاء السماح بالنوافذ المنبثقة');

    const { companyName, currency, fontSize } = settings;
    const invNumber = purchase.invoice_number || purchase.id?.substring(0, 8) || '------';

    let itemsHtml = '';
    let totalPieces = 0;
    if (purchase.items && Array.isArray(purchase.items)) {
        purchase.items.forEach(item => {
            const productName = item.productName || 'صنف';
            const unitName = item.unitName || '';
            const displayName = unitName ? `${productName} (${unitName})` : productName;
            const qty = item.quantity || 0;
            const price = item.price || 0;
            const lineTotal = price * qty;
            totalPieces += qty;
            itemsHtml += `
                <tr>
                    <td class="col-name">${displayName}</td>
                    <td class="col-qty">${qty}</td>
                    <td class="col-price">${formatMoney(price, currency)}</td>
                    <td class="col-total">${formatMoney(lineTotal, currency)}</td>
                </tr>
            `;
        });
    }

    const receiptHtml = `
        <div class="receipt">
            <div class="header">${companyName} - أمر شراء</div>
            <div class="line">${separatorLine(settings.paperWidth, '═')}</div>
            <div class="info-row"><span>رقم الفاتورة:</span> <strong>${invNumber}</strong></div>
            <div class="info-row"><span>التاريخ:</span> ${purchase.date || ''}</div>
            <div class="info-row"><span>المورد:</span> ${purchase.supplier_name || 'غير معروف'}</div>
            <div class="line">${separatorLine(settings.paperWidth, '─')}</div>
            <table class="items-table"><thead><tr><th class="col-name">الصنف</th><th class="col-qty">الكمية</th><th class="col-price">السعر</th><th class="col-total">الإجمالي</th></tr></thead><tbody>${itemsHtml}</tbody></table>
            <div class="pieces-row"><span>عدد القطع:</span> <strong>${totalPieces}</strong></div>
            <div class="line">${separatorLine(settings.paperWidth, '─')}</div>
            <div class="sum-row big"><span>الإجمالي:</span> <span>${formatMoney(purchase.total || 0, currency)}</span></div>
            <div class="line">${separatorLine(settings.paperWidth, '─')}</div>
            <div class="info-row"><span>المدفوع:</span> <span>${formatMoney(purchase.paid || 0, currency)}</span></div>
            <div class="info-row"><span>المتبقي:</span> <span>${formatMoney(purchase.remaining || 0, currency)}</span></div>
            <div class="footer">تم استلام البضاعة بحالة جيدة</div>
        </div>
    `;

    win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>أمر شراء</title>
            <style>
                @page { margin: 0; size: 80mm auto; }
                body { font-family: 'Courier New', monospace; margin: 0; padding: 8px 12px; font-size: ${fontSize}px; line-height: 1.6; color: #000; }
                .receipt { width: 100%; }
                .header { text-align: center; font-weight: bold; font-size: ${fontSize + 2}px; margin-bottom: 4px; }
                .line { text-align: center; margin: 10px 0; letter-spacing: 2px; }
                .info-row { display: flex; justify-content: space-between; margin: 6px 0; }
                .items-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                .items-table th { background: #f0f0f0; padding: 6px 4px; border-bottom: 2px solid #000; text-align: center; font-size: ${fontSize - 1}px; }
                .items-table td { padding: 5px 4px; border-bottom: 1px dashed #ccc; font-size: ${fontSize}px; }
                .col-name { text-align: right; }
                .col-qty { text-align: center; }
                .col-price { text-align: right; }
                .col-total { text-align: right; font-weight: bold; }
                .pieces-row { display: flex; justify-content: space-between; margin: 6px 0; font-weight: bold; }
                .sum-row { display: flex; justify-content: space-between; margin: 6px 0; }
                .sum-row.big { font-weight: bold; font-size: ${fontSize + 2}px; }
                .footer { text-align: center; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #000; font-style: italic; }
                @media print { body { margin: 2mm; } }
            </style>
        </head>
        <body>
            ${receiptHtml}
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); };<\/script>
        </body>
        </html>
    `);
    win.document.close();
};

console.log('✅ نظام الطباعة جاهز');
