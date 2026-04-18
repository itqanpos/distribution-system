// js/print.js
// وظائف الطباعة الموحدة للنظام

(function() {
    // الإعدادات الافتراضية
    const defaultSettings = {
        companyName: 'Food Distribution Co.',
        companyPhone: '+20 123 456 7890',
        companyAddress: 'Cairo, Egypt',
        footerMessage: 'Thank you for your business!',
        currency: 'EGP'
    };

    // الحصول على إعدادات الشركة من Firestore إذا كانت متاحة
    async function getCompanySettings() {
        try {
            if (window.Storage && window.Storage.getSettings) {
                const settings = await window.Storage.getSettings();
                return {
                    companyName: settings.company?.name || defaultSettings.companyName,
                    companyPhone: settings.company?.phone || defaultSettings.companyPhone,
                    companyAddress: settings.company?.address || defaultSettings.companyAddress,
                    footerMessage: settings.printing?.footer || defaultSettings.footerMessage,
                    currency: settings.system?.currency || defaultSettings.currency
                };
            }
        } catch (e) {
            console.warn('Could not load company settings, using defaults');
        }
        return defaultSettings;
    }

    /**
     * طباعة إيصال بيع (فاتورة)
     * @param {Object} invoice - بيانات الفاتورة
     * @param {Array} invoice.items - الأصناف المباعة
     * @param {string} invoice.id - رقم الفاتورة
     * @param {string} invoice.date - التاريخ
     * @param {string} invoice.customer - اسم العميل
     * @param {number} invoice.total - الإجمالي
     * @param {number} invoice.paid - المدفوع
     * @param {number} invoice.remaining - المتبقي
     */
    window.printReceipt = async function(invoice) {
        const settings = await getCompanySettings();
        
        const width = 320;
        const height = 600;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        
        const win = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
        if (!win) {
            alert('Popup blocked! Please allow popups for this site.');
            return;
        }

        const itemsHtml = (invoice.items || []).map(item => {
            const itemTotal = (item.quantity || 0) * (item.price || 0);
            return `
                <tr>
                    <td>${item.name || 'Item'}</td>
                    <td>${item.quantity || 0}</td>
                    <td>${(item.price || 0).toFixed(2)}</td>
                    <td>${itemTotal.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const now = new Date().toLocaleString('en-US', { hour12: true });

        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt ${invoice.id || ''}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 12px;
                        padding: 10px;
                        width: 100%;
                        max-width: 300px;
                        margin: 0 auto;
                        background: white;
                        color: #000;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 10px;
                        border-bottom: 1px dashed #333;
                        padding-bottom: 8px;
                    }
                    .header h3 {
                        font-size: 16px;
                        font-weight: bold;
                        margin-bottom: 3px;
                    }
                    .header p {
                        font-size: 11px;
                        line-height: 1.3;
                    }
                    .info {
                        margin: 10px 0;
                    }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 3px;
                    }
                    .items-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 10px 0;
                        border-top: 1px dashed #333;
                        border-bottom: 1px dashed #333;
                    }
                    .items-table th,
                    .items-table td {
                        text-align: left;
                        padding: 4px 2px;
                        font-size: 11px;
                    }
                    .items-table th {
                        border-bottom: 1px solid #999;
                        font-weight: bold;
                    }
                    .items-table td:last-child,
                    .items-table th:last-child {
                        text-align: right;
                    }
                    .totals {
                        margin: 10px 0;
                    }
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        font-weight: bold;
                        font-size: 13px;
                        margin-top: 5px;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 15px;
                        font-size: 11px;
                        border-top: 1px dashed #333;
                        padding-top: 8px;
                    }
                    .barcode {
                        text-align: center;
                        margin: 10px 0;
                        font-family: 'Libre Barcode 39', cursive;
                        font-size: 24px;
                    }
                    @media print {
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3>${settings.companyName}</h3>
                    <p>${settings.companyAddress}</p>
                    <p>Tel: ${settings.companyPhone}</p>
                </div>
                
                <div class="info">
                    <div class="info-row"><span>Invoice #:</span><span>${invoice.id || ''}</span></div>
                    <div class="info-row"><span>Date:</span><span>${invoice.date || ''}</span></div>
                    <div class="info-row"><span>Time:</span><span>${now}</span></div>
                    <div class="info-row"><span>Customer:</span><span>${invoice.customer || 'Cash'}</span></div>
                </div>
                
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                
                <div class="totals">
                    <div class="info-row"><span>Subtotal:</span><span>${(invoice.total || 0).toFixed(2)} ${settings.currency}</span></div>
                    ${invoice.tax ? `<div class="info-row"><span>Tax:</span><span>${invoice.tax.toFixed(2)} ${settings.currency}</span></div>` : ''}
                    <div class="total-row">
                        <span>TOTAL:</span>
                        <span>${(invoice.total || 0).toFixed(2)} ${settings.currency}</span>
                    </div>
                    ${invoice.paid !== undefined ? `
                        <div class="info-row"><span>Paid:</span><span>${invoice.paid.toFixed(2)} ${settings.currency}</span></div>
                        <div class="info-row"><span>Remaining:</span><span>${(invoice.remaining || 0).toFixed(2)} ${settings.currency}</span></div>
                    ` : ''}
                </div>
                
                <div class="footer">
                    <p>${settings.footerMessage}</p>
                    <p>${new Date().toLocaleDateString('en-US')}</p>
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() {
                            window.close();
                        }, 500);
                    };
                <\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    /**
     * طباعة كشف حساب عميل
     * @param {Object} customer - بيانات العميل
     * @param {Array} invoices - فواتير العميل
     * @param {Array} payments - مدفوعات العميل
     */
    window.printCustomerStatement = async function(customer, invoices, payments) {
        const settings = await getCompanySettings();
        
        const width = 400;
        const height = 600;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        
        const win = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
        
        const invoicesHtml = (invoices || []).map(inv => `
            <tr>
                <td>${inv.id}</td>
                <td>${inv.date}</td>
                <td>${(inv.total || 0).toFixed(2)}</td>
                <td>${(inv.remaining || 0).toFixed(2)}</td>
            </tr>
        `).join('');
        
        const paymentsHtml = (payments || []).map(p => `
            <tr>
                <td>${p.date}</td>
                <td>${p.description || 'Payment'}</td>
                <td>${(p.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        win.document.write(`
            <html>
            <head><title>Statement - ${customer.name}</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 20px; font-size: 14px; }
                .header { text-align: center; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background: #f2f2f2; }
                .total { font-weight: bold; }
            </style>
            </head>
            <body>
                <div class="header">
                    <h2>${settings.companyName}</h2>
                    <h3>Customer Statement</h3>
                </div>
                <p><strong>Customer:</strong> ${customer.name}</p>
                <p><strong>Current Balance:</strong> ${(customer.balance || 0).toFixed(2)} ${settings.currency}</p>
                
                <h4>Invoices</h4>
                <table>
                    <thead><tr><th>Invoice #</th><th>Date</th><th>Total</th><th>Remaining</th></tr></thead>
                    <tbody>${invoicesHtml}</tbody>
                </table>
                
                <h4>Payments</h4>
                <table>
                    <thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
                    <tbody>${paymentsHtml}</tbody>
                </table>
                
                <p>Printed on: ${new Date().toLocaleString()}</p>
                <script>window.print(); setTimeout(() => window.close(), 500);<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    console.log('✅ Print module loaded');
})();
