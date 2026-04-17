// js/i18n.js
(function() {
    const translations = {
        ar: {
            // عام
            app_name: 'نظام التوزيع الغذائي',
            dashboard: 'لوحة التحكم',
            sales: 'المبيعات',
            pos: 'نقطة البيع',
            invoices: 'الفواتير',
            purchases: 'المشتريات',
            cashbox: 'الصندوق',
            reports: 'التقارير',
            accounting: 'المحاسبة',
            customers_suppliers: 'العملاء والموردين',
            reps: 'المندوبين',
            products: 'المنتجات',
            settings: 'الإعدادات',
            logout: 'تسجيل الخروج',
            refresh: 'تحديث',
            search: 'بحث...',
            actions: 'إجراءات',
            edit: 'تعديل',
            delete: 'حذف',
            save: 'حفظ',
            cancel: 'إلغاء',
            add: 'إضافة',
            new: 'جديد',
            total: 'الإجمالي',
            paid: 'المدفوع',
            remaining: 'المتبقي',
            status: 'الحالة',
            date: 'التاريخ',
            amount: 'المبلغ',
            description: 'البيان',
            customer: 'العميل',
            supplier: 'المورد',
            phone: 'الهاتف',
            address: 'العنوان',
            balance: 'الرصيد',
            type: 'النوع',
            income: 'إيداع',
            expense: 'سحب',
            deposit: 'إيداع',
            withdraw: 'سحب',
            payment: 'دفعة',
            debt: 'دين',
            main: 'الرئيسية',
            management: 'الإدارة',
            loading: 'جاري التحميل...',
            no_data: 'لا توجد بيانات',
            confirm_delete: 'هل أنت متأكد من الحذف؟',
            success: 'تم بنجاح',
            error: 'حدث خطأ',
            warning: 'تحذير',
            info: 'معلومة',
            today: 'اليوم',
            week: 'هذا الأسبوع',
            month: 'هذا الشهر',
            year: 'هذه السنة',
            custom: 'مخصص',
            apply: 'تطبيق',
            print: 'طباعة',
            export: 'تصدير',
            import: 'استيراد',
            backup: 'نسخ احتياطي',
            restore: 'استعادة',
            language: 'اللغة',
            arabic: 'العربية',
            english: 'English',
            company: 'الشركة',
            email: 'البريد الإلكتروني',
            // لوحة التحكم
            todays_sales: 'مبيعات اليوم',
            todays_purchases: 'مشتريات اليوم',
            active_customers: 'عملاء نشطون',
            cash_balance: 'رصيد الصندوق',
            sales_last_7_days: 'مبيعات آخر 7 أيام',
            important_alerts: 'تنبيهات مهمة',
            recent_invoices: 'آخر الفواتير',
            recent_transactions: 'آخر الحركات',
            view_all: 'عرض الكل',
            invoice: 'فاتورة',
            // المنتجات
            barcode: 'باركود',
            product_name: 'اسم المنتج',
            category: 'تصنيف',
            price: 'السعر',
            stock: 'المخزون',
            units: 'وحدات',
            low_stock: 'مخزون منخفض',
            available: 'متوفر',
            // ... إلخ (سيتم إضافة جميع النصوص المستخدمة)
        },
        en: {
            // General
            app_name: 'Food Distribution System',
            dashboard: 'Dashboard',
            sales: 'Sales',
            pos: 'POS',
            invoices: 'Invoices',
            purchases: 'Purchases',
            cashbox: 'Cashbox',
            reports: 'Reports',
            accounting: 'Accounting',
            customers_suppliers: 'Customers & Suppliers',
            reps: 'Reps',
            products: 'Products',
            settings: 'Settings',
            logout: 'Logout',
            refresh: 'Refresh',
            search: 'Search...',
            actions: 'Actions',
            edit: 'Edit',
            delete: 'Delete',
            save: 'Save',
            cancel: 'Cancel',
            add: 'Add',
            new: 'New',
            total: 'Total',
            paid: 'Paid',
            remaining: 'Remaining',
            status: 'Status',
            date: 'Date',
            amount: 'Amount',
            description: 'Description',
            customer: 'Customer',
            supplier: 'Supplier',
            phone: 'Phone',
            address: 'Address',
            balance: 'Balance',
            type: 'Type',
            income: 'Income',
            expense: 'Expense',
            deposit: 'Deposit',
            withdraw: 'Withdraw',
            payment: 'Payment',
            debt: 'Debt',
            main: 'Main',
            management: 'Management',
            loading: 'Loading...',
            no_data: 'No data',
            confirm_delete: 'Are you sure you want to delete?',
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info',
            today: 'Today',
            week: 'This Week',
            month: 'This Month',
            year: 'This Year',
            custom: 'Custom',
            apply: 'Apply',
            print: 'Print',
            export: 'Export',
            import: 'Import',
            backup: 'Backup',
            restore: 'Restore',
            language: 'Language',
            arabic: 'العربية',
            english: 'English',
            company: 'Company',
            email: 'Email',
            // Dashboard
            todays_sales: 'Today\'s Sales',
            todays_purchases: 'Today\'s Purchases',
            active_customers: 'Active Customers',
            cash_balance: 'Cash Balance',
            sales_last_7_days: 'Sales Last 7 Days',
            important_alerts: 'Important Alerts',
            recent_invoices: 'Recent Invoices',
            recent_transactions: 'Recent Transactions',
            view_all: 'View All',
            invoice: 'Invoice',
            // Products
            barcode: 'Barcode',
            product_name: 'Product Name',
            category: 'Category',
            price: 'Price',
            stock: 'Stock',
            units: 'Units',
            low_stock: 'Low Stock',
            available: 'Available',
            // ... (أضف جميع النصوص المتبقية حسب الحاجة)
        }
    };

    // دالة الترجمة
    window.t = function(key, lang = window.currentLanguage) {
        if (!lang) lang = localStorage.getItem('appLanguage') || 'ar';
        return translations[lang]?.[key] || key;
    };

    // تغيير اللغة
    window.changeLanguage = function(lang) {
        localStorage.setItem('appLanguage', lang);
        window.currentLanguage = lang;
        
        // تحديث اتجاه الصفحة
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        
        // تحديث جميع العناصر التي تحمل data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (el.tagName === 'INPUT' && el.placeholder) {
                el.placeholder = t(key);
            } else {
                el.textContent = t(key);
            }
        });
        
        // تحديث عنوان الصفحة
        document.title = t('app_name') + ' - ' + t(document.body.getAttribute('data-page') || 'dashboard');
        
        // إعادة تحميل بيانات الصفحة إذا لزم الأمر (اختياري)
        if (typeof window.updateUILanguage === 'function') {
            window.updateUILanguage();
        }
    };

    // تطبيق اللغة المحفوظة عند التحميل
    document.addEventListener('DOMContentLoaded', () => {
        const savedLang = localStorage.getItem('appLanguage') || 'ar';
        changeLanguage(savedLang);
    });
})();
