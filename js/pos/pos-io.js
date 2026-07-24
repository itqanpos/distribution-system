'use strict';
import { U } from './utils.js';

export function _scanBarcode(POS) {
    POS._stopBarcodeScan();
    if (!('BarcodeDetector' in window)) {
        window.Toast?.error('Browser does not support barcode scanning');
        return;
    }
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.style.display = 'none';
    document.body.appendChild(video);
    POS._barcodeVideo = video;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            POS.state._barcodeStream = stream;
            video.srcObject = stream;
            video.play();
            const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','qr_code'] });
            const scan = async () => {
                if (video.readyState >= 2) {
                    try {
                        const barcodes = await detector.detect(video);
                        if (barcodes.length) {
                            POS._stopBarcodeScan();
                            POS._searchBarcode(barcodes[0].rawValue);
                            return;
                        }
                    } catch {}
                }
                POS.state._barcodeAnimFrame = requestAnimationFrame(scan);
            };
            POS.state._barcodeAnimFrame = requestAnimationFrame(scan);
            window.Toast?.info('Point camera at barcode');
        })
        .catch(() => {
            window.Toast?.error('Camera access denied');
            POS._stopBarcodeScan();
        });
}

export function _stopBarcodeScan(POS) {
    if (POS.state._barcodeStream) {
        POS.state._barcodeStream.getTracks().forEach(t => t.stop());
        POS.state._barcodeStream = null;
    }
    if (POS.state._barcodeAnimFrame) {
        cancelAnimationFrame(POS.state._barcodeAnimFrame);
        POS.state._barcodeAnimFrame = null;
    }
    if (POS._barcodeVideo) {
        POS._barcodeVideo.remove();
        POS._barcodeVideo = null;
    }
}

export function _searchBarcode(POS, code) {
    const found = POS.cache.barcode.get(code);
    if (found) {
        if (found.units?.length === 1 || POS.state.quickSale) {
            POS._quickAdd(found, found.units[0]);
        } else {
            POS._openUnitModal(found.id);
        }
    } else {
        POS.el.productSearchInput.value = code;
        POS._filterProducts();
    }
}

export function _startSpeechSearch(POS) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { window.Toast?.error('Speech not supported'); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'ar-SA';
    rec.interimResults = false;
    rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        POS.el.productSearchInput.value = text;
        POS._filterProducts();
    };
    rec.onerror = () => window.Toast?.error('Speech error');
    rec.start();
}

export function _showReceipt(POS, inv, cust, items, totals, oldBal, pay) {
    const s = JSON.parse(localStorage.getItem('app_settings') || '{}');
    const name = s?.company?.name || 'حسابي';
    const phone = s?.company?.phone || '';
    const foot = s?.print?.footer_message || 'Thank you';
    const fmt = v => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const used = pay.used || 0, diff = pay.diff || 0;
    const newBalance = (oldBal || 0) - used + diff;
    let itemsHtml = '';
    for (const it of items) {
        const lineTotal = U.round(it.price * it.quantity, 2);
        itemsHtml += `<tr><td>${U.escape(it.productName)} - ${U.escape(it.unitName)}${it.note ? ` (${U.escape(it.note)})` : ''}</td><td style="text-align:center;">${it.quantity}</td><td style="text-align:center;">${fmt(it.price)}</td><td style="text-align:left;">${fmt(lineTotal)}</td></tr>`;
    }
    const receiptHtml = `<div style="font-family:'Cairo',sans-serif;font-size:13px;line-height:1.5;direction:rtl;padding:10px;width:80mm;max-width:100%;margin:0 auto;background:white;">
        <div style="text-align:center;font-weight:bold;font-size:16px;">${U.escape(name)}</div>${phone ? `<div style="text-align:center;font-size:12px;">Phone: ${U.escape(phone)}</div>` : ''}<hr>
        <div style="display:flex;justify-content:space-between;"><span>Customer:</span><strong>${U.escape(cust?.name || 'Cash')}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Invoice:</span><strong>${U.escape(inv.invoice_number || inv.id?.substring(0,8))}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Date:</span>${U.fmtDate(inv.date)}</div><hr>
        <table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:center;">Price</th><th style="text-align:left;">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table><hr>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>Subtotal:</span>${fmt(totals.sub)}</div>
        ${totals.disc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Discount:</span>${fmt(totals.disc)}</div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;"><span>Net:</span>${fmt(totals.net)}</div><hr>
        <div style="display:flex;justify-content:space-between;"><span>Cash:</span>${fmt(pay.cash||0)}</div>
        <div style="display:flex;justify-content:space-between;"><span>Transfer:</span>${fmt(pay.trans||0)}</div>
        ${used>0 ? `<div style="display:flex;justify-content:space-between;"><span>From Balance:</span>${fmt(used)}</div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>Paid:</span>${fmt(U.round((pay.cash||0)+(pay.trans||0)+used,2))}</div>
        ${diff>0 ? `<div style="color:green;display:flex;justify-content:space-between;"><span>Change:</span>${fmt(diff)}</div>` : ''}
        ${diff<0 ? `<div style="color:red;display:flex;justify-content:space-between;"><span>Remaining:</span>${fmt(-diff)}</div>` : ''}
        ${cust && cust.name !== CASH_CUSTOMER_STORED ? `<hr><div style="display:flex;justify-content:space-between;"><span>Prev Balance:</span>${fmt(oldBal)}</div>
        ${used>0 ? `<div style="display:flex;justify-content:space-between;"><span>Used:</span>-${fmt(used)}</div>` : ''}
        ${diff>0 ? `<div style="color:green;display:flex;justify-content:space-between;"><span>Added:</span>+${fmt(diff)}</div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>New Balance:</span>${fmt(newBalance)}</div>` : ''}
        <hr><div style="text-align:center;">${U.escape(foot)}</div></div>`;
    POS.el.receiptPrintArea.innerHTML = receiptHtml;
    POS._showModal('receiptModal');
}

export function _printReceipt(POS) {
    const content = POS.el.receiptPrintArea.innerHTML;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (w) {
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;padding:10px;background:white}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>${content}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    } else {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.contentDocument.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl}</style></head><body>${content}</body></html>`);
        iframe.contentDocument.close();
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }
}

export async function _printThermal(POS) {
    try {
        if (navigator.bluetooth && !POS._thermalDevice) {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
            });
            POS._thermalDevice = device;
            window.Toast?.info('Bluetooth printer connected');
        }
        window.Toast?.info('Thermal print sent');
    } catch (e) {
        window.Toast?.error('Bluetooth print failed');
    }
}
