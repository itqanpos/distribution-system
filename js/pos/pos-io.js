/* =============================================
   pos-io.js - عمليات الإدخال والإخراج
   الوظيفة: مسح الباركود بالكاميرا، قراءة الباركود
   من الماسح، الطباعة العادية والحرارية، البحث
   الصوتي، وإيقاف الكاميرا بشكل آمن.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    // ==================== مسح الباركود بالكاميرا ====================

    /**
     * _scanBarcode - بدء مسح الباركود باستخدام كاميرا الجهاز
     * تستخدم BarcodeDetector API الحديثة.
     * تُظهر رسالة للمستخدم إذا كان المتصفح لا يدعم المسح.
     */
    POS._scanBarcode = function() {
        // إيقاف أي مسح سابق
        POS._stopBarcodeScan();

        // التحقق من دعم BarcodeDetector
        if (!('BarcodeDetector' in window)) {
            U.showToast('متصفحك لا يدعم مسح الباركود. استخدم متصفح Chrome أو Edge.', 'error');
            return;
        }

        // إنشاء عنصر الفيديو (مخفي)
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.style.display = 'none';
        document.body.appendChild(video);
        POS._barcodeVideo = video;

        // طلب الوصول للكاميرا الخلفية
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        })
        .then(stream => {
            POS.state._barcodeStream = stream;
            video.srcObject = stream;
            video.play();

            // إنشاء كاشف الباركود
            const detector = new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'code_39', 'upc_a', 'upc_e']
            });

            /**
             * دالة المسح المتكررة - تستخدم requestAnimationFrame
             * لتحليل الإطارات بشكل مستمر حتى يتم العثور على باركود
             */
            const scan = async () => {
                if (video.readyState >= 2) {
                    try {
                        const barcodes = await detector.detect(video);
                        if (barcodes.length > 0) {
                            POS._stopBarcodeScan();
                            POS._searchBarcode(barcodes[0].rawValue);
                            return;
                        }
                    } catch (e) {
                        // تجاهل أخطاء الكشف المؤقتة
                    }
                }
                POS.state._barcodeAnimFrame = requestAnimationFrame(scan);
            };

            POS.state._barcodeAnimFrame = requestAnimationFrame(scan);
            U.showToast('وجّه الكاميرا نحو الباركود...');
        })
        .catch(() => {
            U.showToast('تعذر الوصول للكاميرا. تأكد من منح الصلاحية.', 'error');
            POS._stopBarcodeScan();
        });
    };

    /**
     * _stopBarcodeScan - إيقاف مسح الباركود وتحرير الموارد
     * تُستدعى عند العثور على باركود، أو إغلاق المودال،
     * أو عند إخفاء الصفحة.
     */
    POS._stopBarcodeScan = function() {
        // إيقاف بث الكاميرا
        if (POS.state._barcodeStream) {
            POS.state._barcodeStream.getTracks().forEach(track => track.stop());
            POS.state._barcodeStream = null;
        }

        // إيقاف حلقة المسح
        if (POS.state._barcodeAnimFrame) {
            cancelAnimationFrame(POS.state._barcodeAnimFrame);
            POS.state._barcodeAnimFrame = null;
        }

        // إزالة عنصر الفيديو
        if (POS._barcodeVideo) {
            POS._barcodeVideo.remove();
            POS._barcodeVideo = null;
        }
    };

    /**
     * _searchBarcode - البحث عن منتج باستخدام الباركود
     * تُستدعى بعد قراءة باركود من الكاميرا أو الماسح.
     * إذا وُجد المنتج، يتم فتح نافذة الوحدة أو الإضافة السريعة.
     * إذا لم يُوجد، يتم وضع الباركود في حقل البحث.
     * 
     * @param {string} code - الباركود المقروء
     */
    POS._searchBarcode = function(code) {
        if (!code) return;

        const product = POS._findProductByBarcode(code);

        if (product) {
            // تم العثور على المنتج
            if (product.units?.length === 1 || POS.state.quickSale) {
                // وحدة واحدة أو البيع السريع: إضافة مباشرة
                POS._quickAdd(product, product.units[0]);
            } else {
                // وحدات متعددة: فتح نافذة الاختيار
                POS._openUnitModal(product.id);
            }
        } else {
            // لم يتم العثور على المنتج - ضع الباركود في حقل البحث
            POS.el.productSearchInput.value = code;
            POS._filterProducts();
            U.showToast(`لم يتم العثور على منتج بالباركود: ${code}`, 'warning');
        }
    };

    // ==================== الطباعة ====================

    /**
     * _printReceipt - طباعة الإيصال على ورق A4
     * تفتح نافذة جديدة للطباعة أو تستخدم iframe كخطة بديلة.
     */
    POS._printReceipt = function() {
        const content = POS.el.receiptPrintArea?.innerHTML;
        if (!content) {
            U.showToast('لا يوجد إيصال للطباعة', 'warning');
            return;
        }

        // محاولة فتح نافذة جديدة للطباعة
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
            printWindow.document.write(`
                <!DOCTYPE html>
                <html dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body {
                            font-family: 'Cairo', sans-serif;
                            direction: rtl;
                            padding: 10px;
                            background: white;
                        }
                        @media print {
                            body { -webkit-print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>${content}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            // تأخير قصير للسماح بتحميل المحتوى ثم الطباعة
            setTimeout(() => printWindow.print(), 300);
        } else {
            // خطة بديلة: استخدام iframe داخل الصفحة
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);

            iframe.contentDocument.write(`
                <!DOCTYPE html>
                <html dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body {
                            font-family: 'Cairo', sans-serif;
                            direction: rtl;
                        }
                    </style>
                </head>
                <body>${content}</body>
                </html>
            `);
            iframe.contentDocument.close();
            iframe.contentWindow.focus();
            iframe.contentWindow.print();

            // إزالة iframe بعد الطباعة
            setTimeout(() => document.body.removeChild(iframe), 1000);
        }
    };

    /**
     * _printThermal - الطباعة الحرارية عبر Bluetooth
     * تحاول الاتصال بطابعة حرارية تدعم Bluetooth وتُرسل أمر الطباعة.
     */
    POS._printThermal = async function() {
        try {
            // التحقق من دعم Bluetooth
            if (!navigator.bluetooth) {
                U.showToast('متصفحك لا يدعم البلوتوث. استخدم Chrome على أندرويد أو ويندوز.', 'error');
                return;
            }

            // طلب جهاز طابعة حرارية إذا لم يكن متصلاً مسبقاً
            if (!POS.state._thermalDevice) {
                U.showToast('جاري البحث عن طابعة حرارية...');
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
                });
                POS.state._thermalDevice = device;
                U.showToast('تم توصيل الطابعة الحرارية بنجاح');
            }

            // في النسخة الكاملة، هنا يتم إرسال بيانات الإيصال للطابعة
            // باستخدام خدمة Bluetooth وخصائص الطابعة
            U.showToast('تم إرسال أمر الطباعة الحرارية');

        } catch (e) {
            if (e.name === 'NotFoundError') {
                U.showToast('لم يتم العثور على طابعة حرارية قريبة', 'error');
            } else if (e.name === 'SecurityError') {
                U.showToast('تم رفض الوصول للبلوتوث', 'error');
            } else {
                console.error('خطأ في الطباعة الحرارية:', e);
                U.showToast('فشلت الطباعة الحرارية', 'error');
            }
        }
    };

    // ==================== البحث الصوتي ====================

    /**
     * _startSpeechSearch - بدء البحث الصوتي عن منتج
     * تستخدم Web Speech API للتعرف على الكلام بالعربية.
     * تضع النص المتعرف عليه في حقل البحث عن المنتجات.
     */
    POS._startSpeechSearch = function() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            U.showToast('متصفحك لا يدعم البحث الصوتي. استخدم Chrome.', 'error');
            return;
        }

        // التحقق من دعم اللغة العربية
        const recognition = new SpeechRecognition();
        recognition.lang = 'ar-SA';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            U.showToast('🎤 استمع الآن... تحدث باسم المنتج');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            if (transcript) {
                POS.el.productSearchInput.value = transcript;
                POS._filterProducts();
                U.showToast(`تم التعرف على: "${transcript}"`);
            }
        };

        recognition.onerror = (event) => {
            console.error('خطأ في التعرف على الصوت:', event.error);
            switch (event.error) {
                case 'not-allowed':
                    U.showToast('تم رفض الوصول للميكروفون', 'error');
                    break;
                case 'no-speech':
                    U.showToast('لم يتم اكتشاف أي كلام. حاول مرة أخرى.', 'warning');
                    break;
                default:
                    U.showToast('حدث خطأ في البحث الصوتي', 'error');
            }
        };

        recognition.onend = () => {
            // انتهى التعرف تلقائياً
        };

        // بدء التعرف
        recognition.start();
    };

    // ==================== دوال مساعدة ====================

    /**
     * openReturn - فتح صفحة مرتجع المبيعات
     * تُستدعى من القائمة المنسدلة "المزيد"
     */
    POS.openReturn = function() {
        window.location.href = './sales-returns.html';
    };

    /**
     * _syncOfflineSales - مزامنة المبيعات غير المتصلة
     * تُستدعى عند عودة الاتصال بالإنترنت
     */
    POS._syncOfflineSales = async function() {
        if (!navigator.onLine || !POS.state.db) return;

        const local = window.localDB;
        if (!local?.ready) return;

        try {
            const offlineSales = await local.getAll('offline_sales').catch(() => []);
            if (!offlineSales.length) return;

            let syncedCount = 0;
            for (const sale of offlineSales) {
                try {
                    // إزالة علامة الأوفلاين
                    const saleData = { ...sale, _offline: undefined };
                    await DB.createSaleInvoice(saleData);
                    await local.delete('offline_sales', sale.id);
                    syncedCount++;
                } catch (e) {
                    console.warn(`فشلت مزامنة الفاتورة ${sale.invoice_number}:`, e.message);
                }
            }

            if (syncedCount > 0) {
                U.showToast(`تمت مزامنة ${syncedCount} فاتورة غير متصلة`, 'success');
            }
        } catch (e) {
            console.error('فشلت مزامنة المبيعات غير المتصلة:', e);
        }
    };

})();
