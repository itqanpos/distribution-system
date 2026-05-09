/**
 * طباعة إيصال البيع
 * @param {Object} invoice - كائن الفاتورة
 * @param {Object} customer - كائن العميل
 * @param {Array} cartItems - عناصر السلة
 * @param {Object} totals - الإجماليات
 */
function printSaleReceipt(invoice, customer, cartItems, totals) {
    const receiptHTML = `
        <html>
        <head>
            <title>إيصال بيع - ${invoice.invoice_number || invoice.id}</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 10px; direction: rtl; }
                .header { text-align: center; margin-bottom: 15px; }
                .header h2 { margin: 0; font-size: 18px; }
                .header p { margin: 2px 0; font-size: 12px; color: #555; }
                .line { border-top: 1px dashed #000; margin: 10px 0; }
                table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                th, td { padding: 5px 0; font-size: 13px; text-align: right; }
                .total { font-weight: bold; font-size: 16px; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>حسابي</h2>
                <p>نظام إدارة المبيعات والتوزيع</p>
                <p>${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG')}</p>
            </div>
            <div class="line"></div>
            <p><strong>رقم الفاتورة:</strong> ${invoice.invoice_number || invoice.id}</p>
            <p><strong>العميل:</strong> ${customer.name || 'نقدي'}</p>
            <div class="line"></div>
            <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>
                    ${cartItems.map(item => `
                        <tr>
                            <td>${item.productName} - ${item.unitName}</td>
                            <td>${item.quantity}</td>
                            <td>${item.price.toFixed(2)}</td>
                            <td>${(item.quantity * item.price).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="line"></div>
            <p>الإجمالي: <strong>${totals.subtotal.toFixed(2)} ج.م</strong></p>
            <p>الخصم: <strong>${totals.discount.toFixed(2)} ج.م</strong></p>
            <p class="total">الصافي: <strong>${totals.net.toFixed(2)} ج.م</strong></p>
            <div class="footer">
                <p>شكراً لتعاملكم معنا</p>
            </div>
            <script>window.print(); setTimeout(window.close, 500);</script>
        </body>
        </html>
    `;
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
}

/**
 * طباعة أمر شراء
 * @param {Object} purchase - كائن أمر الشراء
 */
function printPurchaseOrder(purchase) {
    const purchaseHTML = `
        <html>
        <head>
            <title>أمر شراء - ${purchase.invoice_number || purchase.id}</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 10px; direction: rtl; }
                .header { text-align: center; margin-bottom: 15px; }
                .header h2 { margin: 0; font-size: 18px; }
                .line { border-top: 1px dashed #000; margin: 10px 0; }
                table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                th, td { padding: 5px 0; font-size: 13px; text-align: right; }
                .total { font-weight: bold; font-size: 16px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>أمر شراء</h2>
                <p>${new Date().toLocaleDateString('ar-EG')}</p>
            </div>
            <div class="line"></div>
            <p><strong>المورد:</strong> ${purchase.supplier_name || ''}</p>
            <p><strong>رقم الفاتورة:</strong> ${purchase.invoice_number || purchase.id}</p>
            <div class="line"></div>
            <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>
                    ${(purchase.items || []).map(item => `
                        <tr>
                            <td>${item.productName} - ${item.unitName}</td>
                            <td>${item.quantity}</td>
                            <td>${item.price.toFixed(2)}</td>
                            <td>${(item.quantity * item.price).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="line"></div>
            <p class="total">الإجمالي: ${(purchase.total || 0).toFixed(2)} ج.م</p>
            <script>window.print(); setTimeout(window.close, 500);</script>
        </body>
        </html>
    `;
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    printWindow.document.write(purchaseHTML);
    printWindow.document.close();
}

window.printSaleReceipt = printSaleReceipt;
window.printPurchaseOrder = printPurchaseOrder;
