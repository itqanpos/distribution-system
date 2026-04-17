// ========== كود إضافة البيانات التجريبية ==========
// انسخ هذا الكود بالكامل والصقه في Console (F12) ثم اضغط Enter

(async function addAllSampleData() {
    console.log('🚀 بدء إضافة البيانات التجريبية...');

    // --- 1. المنتجات ---
    const products = [
        {
            name: 'خبز', category: 'مخبوزات', description: 'خبز طازج يومي',
            units: [
                { unit: 'قطعة', price: 5, min: 4, max: 6, barcode: '111', stock: 150, baseUnits: 1 },
                { unit: 'ربطة (10 قطع)', price: 45, min: 40, max: 50, barcode: '112', stock: 20, baseUnits: 10 }
            ]
        },
        {
            name: 'زيت ذرة', category: 'زيوت', description: 'زيت نباتي نقي',
            units: [
                { unit: 'لتر', price: 40, min: 38, max: 45, barcode: '221', stock: 85, baseUnits: 1 },
                { unit: 'كرتونة (12 لتر)', price: 450, min: 430, max: 480, barcode: '222', stock: 15, baseUnits: 12 }
            ]
        },
        {
            name: 'أرز بسمتي', category: 'بقوليات', description: 'أرز بسمتي هندي',
            units: [
                { unit: 'كيلو', price: 18, min: 16, max: 20, barcode: '331', stock: 200, baseUnits: 1 }
            ]
        },
        {
            name: 'سكر', category: 'بقوليات', description: 'سكر أبيض ناعم',
            units: [
                { unit: 'كيلو', price: 12, min: 11, max: 14, barcode: '441', stock: 300, baseUnits: 1 }
            ]
        },
        {
            name: 'جبنة بيضاء', category: 'ألبان', description: 'جبنة بيضاء طازجة',
            units: [
                { unit: 'كيلو', price: 90, min: 85, max: 100, barcode: '551', stock: 50, baseUnits: 1 }
            ]
        }
    ];
    for (const p of products) {
        await db.collection('products').add(p);
    }
    console.log('✅ تمت إضافة 5 منتجات');

    // --- 2. العملاء ---
    const customers = [
        { type: 'customer', name: 'مطعم الشيف', phone: '0123456789', address: 'وسط البلد', balance: -12500, lastTransaction: '2024-01-15' },
        { type: 'customer', name: 'سوبرماركت النور', phone: '0123987654', address: 'شرق المدينة', balance: 3400, lastTransaction: '2024-01-16' },
        { type: 'customer', name: 'مخبز الفردوس', phone: '0111222333', address: 'غرب المدينة', balance: -8500, lastTransaction: '2024-01-14' }
    ];
    for (const c of customers) {
        await db.collection('parties').add(c);
    }

    // --- 3. الموردين ---
    const suppliers = [
        { type: 'supplier', name: 'مورد المواد الغذائية', phone: '0111222333', address: 'المنطقة الصناعية', balance: 15000, lastTransaction: '2024-01-10' },
        { type: 'supplier', name: 'مخبز الأمل', phone: '0100999888', address: 'وسط البلد', balance: -2500, lastTransaction: '2024-01-12' }
    ];
    for (const s of suppliers) {
        await db.collection('parties').add(s);
    }
    console.log('✅ تمت إضافة 3 عملاء و2 موردين');

    // --- 4. المندوبين ---
    const reps = [
        { name: 'أحمد محمود', phone: '0100123456', region: 'وسط البلد', target: 15000, commission: 5, sales: 12500, collections: 8500 },
        { name: 'خالد عمرو', phone: '0100654321', region: 'شرق المدينة', target: 12000, commission: 5, sales: 10800, collections: 9200 }
    ];
    let rep1Id, rep2Id;
    for (const r of reps) {
        const docRef = await db.collection('reps').add(r);
        if (r.name === 'أحمد محمود') rep1Id = docRef.id;
        if (r.name === 'خالد عمرو') rep2Id = docRef.id;
    }
    console.log('✅ تمت إضافة 2 مندوبين');

    // --- 5. المستخدمين (للمصادقة المحلية) ---
    const users = [
        { username: 'admin', password: '123456', fullName: 'مدير النظام', role: 'admin', status: 'active' },
        { username: 'مندوب1', password: '123456', fullName: 'أحمد محمود', role: 'rep', repId: rep1Id, status: 'active' },
        { username: 'مندوب2', password: '123456', fullName: 'خالد عمرو', role: 'rep', repId: rep2Id, status: 'active' }
    ];
    for (const u of users) {
        await db.collection('users').add(u);
    }
    console.log('✅ تمت إضافة 3 مستخدمين');

    // --- 6. فواتير بيع ---
    const invoices = [
        { id: 'INV-001', type: 'sale', customer: 'مطعم الشيف', date: '2024-01-15', total: 1250, paid: 1250, remaining: 0, status: 'paid', paymentMethod: 'cash', items: [] },
        { id: 'INV-002', type: 'sale', customer: 'سوبرماركت النور', date: '2024-01-16', total: 3400, paid: 2000, remaining: 1400, status: 'partial', paymentMethod: 'cash', items: [] },
        { id: 'INV-003', type: 'sale', customer: 'مخبز الفردوس', date: '2024-01-14', total: 850, paid: 0, remaining: 850, status: 'unpaid', paymentMethod: 'credit', items: [] }
    ];
    for (const inv of invoices) {
        await db.collection('invoices').doc(inv.id).set(inv);
    }
    console.log('✅ تمت إضافة 3 فواتير بيع');

    // --- 7. فواتير شراء ---
    const purchases = [
        { id: 'PUR-001', supplier: 'مورد المواد الغذائية', date: '2024-01-10', total: 12500, paid: 12500, remaining: 0, status: 'paid', paymentMethod: 'bank', items: [] },
        { id: 'PUR-002', supplier: 'مخبز الأمل', date: '2024-01-12', total: 3400, paid: 0, remaining: 3400, status: 'unpaid', paymentMethod: 'credit', items: [] }
    ];
    for (const pur of purchases) {
        await db.collection('purchases').doc(pur.id).set(pur);
    }
    console.log('✅ تمت إضافة 2 فواتير شراء');

    // --- 8. حركات صندوق ---
    const transactions = [
        { type: 'income', amount: 2500, description: 'بيع نقدي - فاتورة INV-001', paymentMethod: 'cash', date: '2024-01-15' },
        { type: 'expense', amount: 450, description: 'مصروفات نقل', paymentMethod: 'cash', date: '2024-01-16' },
        { type: 'income', amount: 2000, description: 'دفعة من فاتورة INV-002', paymentMethod: 'cash', date: '2024-01-17' },
        { type: 'expense', amount: 12500, description: 'شراء بضاعة - فاتورة PUR-001', paymentMethod: 'bank', date: '2024-01-10' }
    ];
    for (const t of transactions) {
        await db.collection('transactions').add(t);
    }
    console.log('✅ تمت إضافة 4 حركات صندوق');

    // --- 9. الإعدادات ---
    const settings = {
        company: { name: 'شركة التوزيع الغذائي', phone: '01234567890', email: 'info@fooddist.com', address: 'القاهرة، مصر' },
        printing: { printerType: 'thermal', copies: 1, showLogo: true, footer: 'شكراً لتعاملكم معنا' },
        system: { lang: 'ar', currency: 'ج.م', lowStockAlert: 10, taxEnabled: true, taxRate: 14 }
    };
    await db.collection('settings').doc('main').set(settings);
    console.log('✅ تمت إضافة الإعدادات');

    console.log('🎉 تمت إضافة جميع البيانات التجريبية بنجاح!');
    console.log('👤 سجّل الدخول: admin / 123456 أو مندوب1 / 123456');
})();
