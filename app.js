/**
 * ملف التكامل الرئيسي - يربط واجهة الويب مع أنظمة Node.js
 */

class نظامالتكاملالويب {
    constructor() {
        this.API_BASE = 'http://localhost:3000/api';
        this.userData = null;
        this.initialize();
    }

    initialize() {
        console.log('🌐 تهيئة نظام التكامل مع الواجهة');
        this.checkAuth();
        this.setupEventListeners();
    }

    // التحقق من المصادقة
    checkAuth() {
        const user = sessionStorage.getItem('user');
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        this.userData = JSON.parse(user);
    }

    // إعداد مستمعي الأحداث
    setupEventListeners() {
        // سيتم إضافة مستمعي الأحداث هنا
    }

    // الدخول إلى النظام
    async login(username, password) {
        try {
            // في الإصدار الحقيقي، سيتم الاتصال بالسيرفر
            const response = await fetch(`${this.API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.userData = data.user;
                sessionStorage.setItem('user', JSON.stringify(data.user));
                return { success: true, data: data };
            } else {
                return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
            }
        } catch (error) {
            console.error('خطأ في تسجيل الدخول:', error);
            return { success: false, message: 'خطأ في الاتصال بالسيرفر' };
        }
    }

    // جلب بيانات الديون
    async getDebts() {
        try {
            // بيانات تجريبية
            return {
                success: true,
                data: [
                    {
                        id: 1,
                        customer: "مطعم الشيف",
                        amount: 35000,
                        status: "overdue",
                        lastPayment: "2023-12-20",
                        rep: "أحمد محمود"
                    },
                    {
                        id: 2,
                        customer: "محمد أحمد",
                        amount: 25000,
                        status: "overdue",
                        lastPayment: "2024-01-10",
                        rep: "خالد عمرو"
                    }
                ]
            };
        } catch (error) {
            console.error('خطأ في جلب بيانات الديون:', error);
            return { success: false, message: 'خطأ في جلب البيانات' };
        }
    }

    // جلب بيانات المندوبين
    async getRepresentatives() {
        try {
            // بيانات تجريبية
            return {
                success: true,
                data: [
                    {
                        id: 1,
                        name: "أحمد محمود",
                        area: "المنطقة الشرقية",
                        todaySales: 12000,
                        todayCollection: 8000,
                        totalCustomers: 25
                    },
                    {
                        id: 2,
                        name: "خالد عمرو",
                        area: "المنطقة الغربية",
                        todaySales: 10000,
                        todayCollection: 7500,
                        totalCustomers: 20
                    }
                ]
            };
        } catch (error) {
            console.error('خطأ في جلب بيانات المندوبين:', error);
            return { success: false, message: 'خطأ في جلب البيانات' };
        }
    }

    // تسجيل تحصيل جديد
    async recordPayment(paymentData) {
        try {
            console.log('تسجيل تحصيل:', paymentData);
            // في الإصدار الحقيقي، سيتم حفظ البيانات في قاعدة البيانات
            
            return {
                success: true,
                message: 'تم تسجيل التحصيل بنجاح',
                data: paymentData
            };
        } catch (error) {
            console.error('خطأ في تسجيل التحصيل:', error);
            return { success: false, message: 'خطأ في حفظ البيانات' };
        }
    }

    // تسجيل بيع جديد
    async recordSale(saleData) {
        try {
            console.log('تسجيل بيع:', saleData);
            // في الإصدار الحقيقي، سيتم حفظ البيانات في قاعدة البيانات
            
            return {
                success: true,
                message: 'تم تسجيل البيع بنجاح',
                data: saleData
            };
        } catch (error) {
            console.error('خطأ في تسجيل البيع:', error);
            return { success: false, message: 'خطأ في حفظ البيانات' };
        }
    }

    // جلب تقارير التكامل
    async getIntegrationReport() {
        try {
            // بيانات تجريبية
            return {
                success: true,
                data: {
                    totalDebt: 85500,
                    repsPerformance: [
                        { name: "أحمد محمود", debtCollected: 8000, customers: 15 },
                        { name: "خالد عمرو", debtCollected: 7500, customers: 12 }
                    ],
                    alerts: [
                        { type: "overdue", count: 5, amount: 45000 },
                        { type: "inventory", count: 12, severity: "medium" }
                    ]
                }
            };
        } catch (error) {
            console.error('خطأ في جلب تقرير التكامل:', error);
            return { success: false, message: 'خطأ في جلب البيانات' };
        }
    }

    // تصدير تقرير PDF
    async exportPDFReport(type, data) {
        try {
            console.log(`تصدير تقرير ${type}:`, data);
            
            // في الإصدار الحقيقي، سيتم إنشاء ملف PDF
            
            return {
                success: true,
                message: 'تم إنشاء التقرير بنجاح',
                url: `reports/${type}_${Date.now()}.pdf`
            };
        } catch (error) {
            console.error('خطأ في تصدير التقرير:', error);
            return { success: false, message: 'خطأ في إنشاء التقرير' };
        }
    }

    // تسجيل الخروج
    logout() {
        sessionStorage.removeItem('user');
        window.location.href = 'index.html';
    }

    // تحديث البيانات الحية
    async refreshLiveData() {
        try {
            // في الإصدار الحقيقي، سيتم جلب البيانات الحية من السيرفر
            const [debts, reps, integration] = await Promise.all([
                this.getDebts(),
                this.getRepresentatives(),
                this.getIntegrationReport()
            ]);
            
            return {
                debts: debts.data,
                reps: reps.data,
                integration: integration.data
            };
        } catch (error) {
            console.error('خطأ في تحديث البيانات:', error);
            return null;
        }
    }
}

// إنشاء مثيل عالمي من النظام
window.نظامالتوزيع = new نظامالتكاملالويب();
