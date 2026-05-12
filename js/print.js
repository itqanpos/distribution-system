/* =============================================
   print.js - نظام طباعة الإيصالات
   ============================================= */

function printSaleReceipt(invoice, customer, items, totals) {
    const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
    const companyName = settings?.company?.name || 'حسابي';
    const companyPhone = settings?.company?.phone || '';
    const footerMsg = settings?.print?.footer_message || 'شكراً لتعاملكم معنا';
    const copies = settings?.print?.copies || 1;
    const fontSize = settings?.print?.font_size || 13;
    const paperWidth = settings?.print?.paper_width || 42;

    const itemsRows = items.map(item => `
        <tr>
            <td>${item.productName} - ${item.unitName}</td>
            <td>${item.quantity}</td>
            <td>${Number(item.price).toFixed(2)}</td>
            <td>${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
    `).join('');

    const receiptHTML = `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, sans-serif;
                    direction: rtl;
                    text-align: right;
                    padding: 10px;
                    font-size: ${fontSize}px;
                    width: ${paperWidth}ch;
                    margin: 0 auto;
                }
                .header { text-align: center; margin-bottom: 10px; }
                .header h1 { font-size: ${fontSize + 4}px; margin: 0; }
                .divider { border-top: 1px dashed #000; margin: 8px 0; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 2px 4px; border-bottom: 1px solid #eee; }
                th { background: #f5f5f5; font-size: ${fontSize - 1}px; }
                .totals { font-weight: bold; font-size: ${fontSize + 1}px; margin-top: 8px; }
                .footer { text-align: center; margin-top: 10px; }
                @media print {
                    body { -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            ${Array(copies).fill(`
                <div class="header">
                    <h1>${companyName}</h1>
                    ${companyPhone ? `<p>${companyPhone}</p>` : ''}
                    <p>${new Date(invoice.date).toLocaleDateString('ar-EG')}</p>
                </div>
                <div class="divider"></div>
                <p><strong>العميل:</strong> ${customer.name || 'نقدي'}</p>
                <p><strong>رقم الفاتورة:</strong> ${invoice.invoice_number || invoice.id?.substring(0, 8)}</p>
                <div class="divider"></div>
                <table>
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsRows}</tbody>
                </table>
                <div class="totals">
                    <p>الإجمالي: ${Number(totals.subtotal).toFixed(2)}</p>
                    ${totals.discount > 0 ? `<p>الخصم: ${Number(totals.discount).toFixed(2)}</p>` : ''}
                    <p>الصافي: ${Number(totals.net).toFixed(2)}</p>
                </div>
                <div class="divider"></div>
                <div class="footer">
                    <p>${footerMsg}</p>
                </div>
                ${copies > 1 ? '<div style="page-break-after: always;"></div>' : ''}
            `).join('')}
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank', `width=${paperWidth * 12},height=600`);
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

// دالة طباعة أمر شراء
function printPurchaseOrder(purchase) {
    const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
    const companyName = settings?.company?.name || 'حسابي';
    
    const itemsRows = (purchase.items || []).map(item => `
        <tr>
            <td>${item.productName} - ${item.unitName}</td>
            <td>${item.quantity}</td>
            <td>${Number(item.price).toFixed(2)}</td>
            <td>${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
    `).join('');

    const html = `
        <html>
        <head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Tahoma;direction:rtl;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{padding:8px;border:1px solid #ddd;}</style></head>
        <body>
            <h1 style="text-align:center;">${companyName} - أمر شراء</h1>
            <p>المورد: ${purchase.supplier_name}</p>
            <p>التاريخ: ${purchase.date}</p>
            <table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table>
            <h3>الإجمالي: ${Number(purchase.total).toFixed(2)}</h3>
        </body>
        </html>
    `;
    const pw = window.open('', '_blank');
    pw.document.write(html);
    pw.document.close();
    setTimeout(() => { pw.print(); pw.close(); }, 500);
}

window.printSaleReceipt = printSaleReceipt;
window.printPurchaseOrder = printPurchaseOrder;
