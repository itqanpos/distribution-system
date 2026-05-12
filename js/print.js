/* =============================================
   print.js - نظام الطباعة الشامل (Premium)
   ============================================= */

/**
 * الحصول على إعدادات الطباعة من localStorage
 */
function getPrintSettings() {
    const defaults = {
        company: { name: 'حسابي', phone: '' },
        print: {
            footer_message: 'شكراً لتعاملكم معنا',
            copies: 1,
            font_size: 13,
            paper_width: 42,
            template: 'default'
        }
    };
    try {
        const saved = JSON.parse(localStorage.getItem('app_settings') || '{}');
        return {
            company: { ...defaults.company, ...(saved.company || {}) },
            print: { ...defaults.print, ...(saved.print || {}) }
        };
    } catch (e) {
        return defaults;
    }
}

/**
 * تنسيق المبلغ للطباعة
 */
function formatPrintMoney(amount) {
    return Number(amount || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * تنسيق التاريخ للطباعة
 */
function formatPrintDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

/**
 * الهروب الآمن لـ HTML
 */
function escapePrintHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}

// ==================== الدوال الأساسية ====================

/**
 * طباعة إيصال بيع (نفس شكل الإيصال في المودال)
 * @param {Object} invoice - بيانات الفاتورة
 * @param {Object} customer - بيانات العميل (اختياري)
 * @param {Array} items - أصناف الفاتورة
 * @param {Object} totals - إجماليات الفاتورة {subtotal, discount, net}
 */
function printSaleReceipt(invoice, customer, items, totals) {
    const settings = getPrintSettings();
    const companyName = settings.company.name || 'حسابي';
    const companyPhone = settings.company.phone || '';
    const footerMsg = settings.print.footer_message || 'شكراً لتعاملكم معنا';
    const copies = settings.print.copies || 1;
    const fontSize = settings.print.font_size || 13;
    const paperWidth = settings.print.paper_width || 42;
    const template = settings.print.template || 'default';

    const itemsRows = (items || []).map(item => `
        <tr>
            <td>${escapePrintHTML(item.productName)} - ${escapePrintHTML(item.unitName)}</td>
            <td>${item.quantity}</td>
            <td>${formatPrintMoney(item.price)}</td>
            <td>${formatPrintMoney((item.price || 0) * (item.quantity || 0))}</td>
        </tr>
    `).join('');

    // معلومات الرصيد والدفع (مثل نقطة البيع)
    let paymentInfoHTML = '';
    if (customer && customer.name !== 'نقدي') {
        const oldBalance = invoice.old_customer_balance ?? customer.balance ?? 0;
        const usedBalance = invoice.used_customer_balance || 0;
        const currentBalance = customer.balance ?? 0;
        paymentInfoHTML = `
            <div class="payment-info">
                <div class="payment-row"><span>الرصيد السابق:</span> <span>${formatPrintMoney(oldBalance)}</span></div>
                ${usedBalance > 0 ? `<div class="payment-row"><span>خصم من الرصيد:</span> <span>${formatPrintMoney(usedBalance)}</span></div>` : ''}
                <div class="payment-row"><span>المدفوع:</span> <span>${formatPrintMoney(invoice.paid)}</span></div>
                <div class="payment-row"><span>الرصيد الحالي:</span> <span>${formatPrintMoney(currentBalance)}</span></div>
            </div>
        `;
    }

    // توليد الإيصال
    const receiptHTML = `
        <div class="receipt ${template}">
            <div class="header">
                <h1>${escapePrintHTML(companyName)}</h1>
                ${companyPhone ? `<p>${escapePrintHTML(companyPhone)}</p>` : ''}
            </div>
            <div class="divider"></div>
            <div class="info">
                <p><strong>العميل:</strong> ${escapePrintHTML(customer?.name || 'نقدي')}</p>
                <p><strong>رقم الفاتورة:</strong> ${escapePrintHTML(invoice.invoice_number || invoice.id?.substring(0, 8))}</p>
                <p><strong>التاريخ:</strong> ${formatPrintDate(invoice.date)}</p>
            </div>
            <div class="divider"></div>
            <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsRows}</tbody>
            </table>
            <div class="totals">
                <p><strong>الإجمالي:</strong> ${formatPrintMoney(totals.subtotal)}</p>
                ${totals.discount > 0 ? `<p><strong>الخصم:</strong> ${formatPrintMoney(totals.discount)}</p>` : ''}
                <p><strong>الصافي:</strong> ${formatPrintMoney(totals.net)}</p>
            </div>
            ${paymentInfoHTML ? `<div class="divider"></div>${paymentInfoHTML}` : ''}
            <div class="divider"></div>
            <div class="footer">
                <p>${escapePrintHTML(footerMsg)}</p>
            </div>
        </div>
    `;

    // ورقة الأنماط الداخلية للطباعة
    const style = `
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, sans-serif;
                direction: rtl;
                text-align: right;
                padding: 8px;
                font-size: ${fontSize}px;
                width: ${paperWidth}ch;
                margin: 0 auto;
                color: #000;
                background: #fff;
            }
            .header { text-align: center; margin-bottom: 6px; }
            .header h1 { font-size: ${fontSize + 4}px; margin: 0; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .info { font-size: ${fontSize - 1}px; }
            .info p { margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin: 4px 0; }
            th, td { padding: 2px 4px; border-bottom: 1px solid #ddd; font-size: ${fontSize - 1}px; }
            th { background: #f5f5f5; font-size: ${fontSize - 2}px; }
            .totals { font-weight: bold; font-size: ${fontSize + 1}px; margin-top: 6px; }
            .totals p { margin: 2px 0; }
            .payment-info { background: #f9fafb; padding: 4px; font-size: ${fontSize - 1}px; }
            .payment-row { display: flex; justify-content: space-between; }
            .footer { text-align: center; margin-top: 8px; font-size: ${fontSize - 1}px; }
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            .compact th, .compact td { padding: 1px 2px; }
            .bordered { border: 1px solid #000; padding: 8px; }
        </style>
    `;

    const fullHTML = `
        <html>
        <head><meta charset="UTF-8">${style}</head>
        <body>
            ${Array(copies).fill(receiptHTML).join('<div style="page-break-after: always;"></div>')}
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank', `width=${paperWidth * 12},height=600`);
    if (!printWindow) {
        alert('الرجاء السماح بالنوافذ المنبثقة للطباعة');
        return;
    }
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

/**
 * طباعة أمر شراء
 * @param {Object} purchase - بيانات فاتورة الشراء
 */
function printPurchaseOrder(purchase) {
    const settings = getPrintSettings();
    const companyName = settings.company.name || 'حسابي';

    const itemsRows = (purchase.items || []).map(item => `
        <tr>
            <td>${escapePrintHTML(item.productName)} - ${escapePrintHTML(item.unitName)}</td>
            <td>${item.quantity}</td>
            <td>${formatPrintMoney(item.price)}</td>
            <td>${formatPrintMoney((item.price || 0) * (item.quantity || 0))}</td>
        </tr>
    `).join('');

    const html = `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma; direction: rtl; padding: 20px; color: #000; }
                h1 { text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { padding: 8px; border: 1px solid #ddd; }
                th { background: #f5f5f5; }
                .totals { font-weight: bold; margin-top: 10px; }
            </style>
        </head>
        <body>
            <h1>${escapePrintHTML(companyName)} - أمر شراء</h1>
            <p><strong>المورد:</strong> ${escapePrintHTML(purchase.supplier_name || '')}</p>
            <p><strong>التاريخ:</strong> ${formatPrintDate(purchase.date)}</p>
            <p><strong>رقم الفاتورة:</strong> ${escapePrintHTML(purchase.invoice_number || purchase.id?.substring(0,8))}</p>
            <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsRows}</tbody>
            </table>
            <div class="totals">
                <p>الإجمالي: ${formatPrintMoney(purchase.total)}</p>
                <p>المدفوع: ${formatPrintMoney(purchase.paid)}</p>
                <p>المتبقي: ${formatPrintMoney(purchase.remaining)}</p>
            </div>
        </body>
        </html>
    `;
    const pw = window.open('', '_blank');
    if (!pw) { alert('الرجاء السماح بالنوافذ المنبثقة'); return; }
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    setTimeout(() => { pw.print(); pw.close(); }, 500);
}

/**
 * طباعة فاتورة مرتجع
 * @param {Object} returnData - بيانات المرتجع
 */
function printReturnReceipt(returnData) {
    const settings = getPrintSettings();
    const companyName = settings.company.name || 'حسابي';
    const itemsRows = (returnData.items || []).map(item => `
        <tr>
            <td>${escapePrintHTML(item.productName)} - ${escapePrintHTML(item.unitName)}</td>
            <td>${item.quantity}</td>
            <td>${formatPrintMoney(item.price)}</td>
            <td>${formatPrintMoney((item.price || 0) * (item.quantity || 0))}</td>
        </tr>
    `).join('');

    const html = `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma; direction: rtl; padding: 20px; color: #000; }
                h1 { text-align: center; color: #dc2626; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { padding: 8px; border: 1px solid #ddd; }
                th { background: #f5f5f5; }
            </style>
        </head>
        <body>
            <h1>${escapePrintHTML(companyName)} - فاتورة مرتجع</h1>
            <p><strong>رقم المرتجع:</strong> ${escapePrintHTML(returnData.id?.substring(0,8) || '')}</p>
            <p><strong>التاريخ:</strong> ${formatPrintDate(returnData.date)}</p>
            <p><strong>السبب:</strong> ${escapePrintHTML(returnData.reason || '')}</p>
            <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsRows}</tbody>
            </table>
            <h3>الإجمالي: ${formatPrintMoney(returnData.total)}</h3>
        </body>
        </html>
    `;
    const pw = window.open('', '_blank');
    if (!pw) { alert('الرجاء السماح بالنوافذ المنبثقة'); return; }
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    setTimeout(() => { pw.print(); pw.close(); }, 500);
}

/**
 * طباعة تقرير يومي مبسط
 * @param {Object} data - { salesTotal, purchasesTotal, cashBalance, date }
 */
function printDailyReport(data) {
    const settings = getPrintSettings();
    const companyName = settings.company.name || 'حسابي';

    const html = `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma; direction: rtl; padding: 20px; color: #000; }
                h1 { text-align: center; }
                .summary { display: flex; gap: 20px; flex-wrap: wrap; }
                .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; flex: 1; min-width: 120px; text-align: center; }
                .card .value { font-size: 1.5rem; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>${escapePrintHTML(companyName)} - تقرير يومي</h1>
            <p>التاريخ: ${formatPrintDate(data.date)}</p>
            <div class="summary">
                <div class="card"><div class="label">المبيعات</div><div class="value">${formatPrintMoney(data.salesTotal)}</div></div>
                <div class="card"><div class="label">المشتريات</div><div class="value">${formatPrintMoney(data.purchasesTotal)}</div></div>
                <div class="card"><div class="label">رصيد الصندوق</div><div class="value">${formatPrintMoney(data.cashBalance)}</div></div>
            </div>
        </body>
        </html>
    `;
    const pw = window.open('', '_blank');
    if (!pw) { alert('الرجاء السماح بالنوافذ المنبثقة'); return; }
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    setTimeout(() => { pw.print(); pw.close(); }, 500);
}

// ==================== تعريض الدوال ====================
window.printSaleReceipt = printSaleReceipt;
window.printPurchaseOrder = printPurchaseOrder;
window.printReturnReceipt = printReturnReceipt;
window.printDailyReport = printDailyReport;

console.log('✅ نظام الطباعة الشامل جاهز');
