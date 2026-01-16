// خادم الواجهة الخلفية
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('واجهة-ويب'));

// API Routes
app.get('/api/debts', (req, res) => {
    // قراءة بيانات الديون من الملفات
    try {
        const debtsData = require('./وحدات/الديون/نظام-الديون.js');
        res.json({ success: true, data: debtsData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // مصادقة مبسطة
    if (username === 'admin' && password === '123456') {
        res.json({
            success: true,
            user: {
                username: 'admin',
                name: 'مدير النظام',
                role: 'admin',
                loginTime: new Date().toLocaleString('ar-EG')
            }
        });
    } else {
        res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }
});

app.post('/api/payments', (req, res) => {
    const paymentData = req.body;
    console.log('تم استلام تحصيل جديد:', paymentData);
    
    // حفظ البيانات في ملف
    const paymentsFile = './data/payments.json';
    let payments = [];
    
    if (fs.existsSync(paymentsFile)) {
        payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf8'));
    }
    
    payments.push({
        ...paymentData,
        id: payments.length + 1,
        date: new Date().toISOString()
    });
    
    fs.writeFileSync(paymentsFile, JSON.stringify(payments, null, 2));
    
    res.json({ success: true, message: 'تم حفظ التحصيل بنجاح' });
});

// خدمة الملفات الثابتة
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'واجهة-ويب', 'index.html'));
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`📁 الواجهة متاحة على: http://localhost:${PORT}/index.html`);
});
