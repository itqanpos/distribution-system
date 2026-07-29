'use strict';
(function() {
    const POS = window.POS;
    POS._scanBarcode = function() {
        POS._stopBarcodeScan();
        if(!('BarcodeDetector' in window)){ U.showToast('متصفحك لا يدعم مسح الباركود','error'); return; }
        const video = document.createElement('video'); video.setAttribute('playsinline',''); video.style.display='none';
        document.body.appendChild(video); POS._barcodeVideo = video;
        navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(stream=>{
            POS.state._barcodeStream = stream; video.srcObject = stream; video.play();
            const detector = new BarcodeDetector({formats:['ean_13','ean_8','code_128','qr_code']});
            const scan = async () => { if(video.readyState>=2){ try{ const barcodes = await detector.detect(video); if(barcodes.length){ POS._stopBarcodeScan(); POS._searchBarcode(barcodes[0].rawValue); return; } }catch{} } POS.state._barcodeAnimFrame = requestAnimationFrame(scan); };
            POS.state._barcodeAnimFrame = requestAnimationFrame(scan);
        }).catch(()=>{ U.showToast('تعذر الوصول للكاميرا','error'); POS._stopBarcodeScan(); });
    };
    POS._stopBarcodeScan = function() {
        if(POS.state._barcodeStream){ POS.state._barcodeStream.getTracks().forEach(t=>t.stop()); POS.state._barcodeStream=null; }
        if(POS.state._barcodeAnimFrame){ cancelAnimationFrame(POS.state._barcodeAnimFrame); POS.state._barcodeAnimFrame=null; }
        if(POS._barcodeVideo){ POS._barcodeVideo.remove(); POS._barcodeVideo=null; }
    };
    POS._searchBarcode = function(code) {
        const product = POS._findProductByBarcode(code);
        if(product) product.units?.length===1||POS.state.quickSale ? POS._quickAdd(product,product.units[0]) : POS._openUnitModal(product.id);
        else { POS.el.productSearchInput.value = code; POS._filterProducts(); }
    };
    POS._startSpeechSearch = function() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(!SR){ U.showToast('متصفحك لا يدعم البحث الصوتي','error'); return; }
        const rec = new SR(); rec.lang='ar-SA'; rec.interimResults=false;
        rec.onresult = (e)=>{ const text=e.results[0][0].transcript; POS.el.productSearchInput.value=text; POS._filterProducts(); };
        rec.onerror = ()=>U.showToast('خطأ في الميكروفون','error');
        rec.start();
    };
    POS.openReturn = function() { window.location.href = './sales-returns.html'; };
})();
