'use strict';
import { U, LRUCache, UserPrefs, CASH_CUSTOMER_LABEL, CASH_CUSTOMER_STORED } from './utils.js';
import { createInitialState, _resetCart, _getCust, _calcTotals, _updateTotals,
         _saveCart, _restoreCart, _savePaymentDraft, _restorePaymentDraft,
         _logActivity, _localInvNum } from './pos-state.js';
import { _buildCache, _updateProductInCache } from './pos-cache.js';
import { _cacheDOM, _applySafeArea, _renderCart, _resetCartRender,
         _renderProductGrid, _filterTabletProducts, _filterProducts, _filterCustomers,
         _hideCustDropdown, _hideProdDropdown, _updateCustDisplay,
         _showModal, _closeModal, _applyUserPrefs, _connStatus,
         _togglePaymentFields, _previewPayment, _debouncedRenderGrid } from './pos-dom.js';
import { _bindEvents, _bindKeyboardShortcuts, _setupBarcodeBuffer, _enableDragDrop,
         _onCartChange, _onCartClick, _canChangePrice, _closeAllModals } from './pos-events.js';
import { _openUnitModal, _selectUnit, _updateUnitInfo, _addToCart, _quickAdd,
         _openPayment, _completePayment, _checkStock, _localStockCheck,
         _updateLocalStock, _confirmAction, holdInvoice, loadHeld, _resumeInvoice } from './pos-core.js';
import { _loadData, _fetchProdsAndCusts, _loadEditInvoice,
         _setupRealtimeSync, _setupConnectionCheck, _startTodayStatsUpdater,
         _syncOfflineSales } from './pos-network.js';
import { _scanBarcode, _stopBarcodeScan, _searchBarcode, _startSpeechSearch,
         _showReceipt, _printReceipt, _printThermal } from './pos-io.js';
import { _setupAutoTheme, _setupErrorMonitoring, _logErrorToServer, _sidebarUser } from './pos-init.js';

const POS = {
    U, // نجعل الأدوات متاحة
    state: createInitialState(),
    cache: {
        prods: new LRUCache(800),
        custs: new LRUCache(400),
        barcode: new LRUCache(600)
    },
    el: {},

    // ربط الدوال المستوردة
    _resetCart, _getCust, _calcTotals, _updateTotals,
    _saveCart, _restoreCart, _savePaymentDraft, _restorePaymentDraft,
    _logActivity, _localInvNum,
    _buildCache, _updateProductInCache,
    _cacheDOM, _applySafeArea, _renderCart, _resetCartRender,
    _renderProductGrid, _filterTabletProducts, _filterProducts, _filterCustomers,
    _hideCustDropdown, _hideProdDropdown, _updateCustDisplay,
    _showModal, _closeModal, _applyUserPrefs, _connStatus,
    _togglePaymentFields, _previewPayment, _debouncedRenderGrid,
    _bindEvents, _bindKeyboardShortcuts, _setupBarcodeBuffer, _enableDragDrop,
    _onCartChange, _onCartClick, _canChangePrice, _closeAllModals,
    _openUnitModal, _selectUnit, _updateUnitInfo, _addToCart, _quickAdd,
    _openPayment, _completePayment, _checkStock, _localStockCheck,
    _updateLocalStock, _confirmAction, holdInvoice, loadHeld, _resumeInvoice,
    _loadData, _fetchProdsAndCusts, _loadEditInvoice,
    _setupRealtimeSync, _setupConnectionCheck, _startTodayStatsUpdater,
    _syncOfflineSales,
    _scanBarcode, _stopBarcodeScan, _searchBarcode, _startSpeechSearch,
    _showReceipt, _printReceipt, _printThermal,
    _setupAutoTheme, _setupErrorMonitoring, _logErrorToServer, _sidebarUser,

    async init() {
        // ربط this بكل دالة تحتاج POS
        for (const key of Object.keys(POS)) {
            if (typeof POS[key] === 'function' && key.startsWith('_')) {
                POS[key] = POS[key].bind(null, POS);
            }
        }
        // استثناءات لبعض الدوال التي لا تحتاج POS أو تستخدم this الأصلي
        POS._applyUserPrefs = _applyUserPrefs.bind(null, POS);
        POS._cacheDOM = _cacheDOM.bind(null, POS);
        POS._applySafeArea = _applySafeArea;
        POS._bindKeyboardShortcuts = _bindKeyboardShortcuts.bind(null, POS);
        POS._bindEvents = _bindEvents.bind(null, POS);
        POS._connStatus = _connStatus;
        POS._setupErrorMonitoring = _setupErrorMonitoring.bind(null, POS);
        POS._setupBarcodeBuffer = _setupBarcodeBuffer.bind(null, POS);
        POS._setupRealtimeSync = _setupRealtimeSync.bind(null, POS);
        POS._setupAutoTheme = _setupAutoTheme;
        POS._setupConnectionCheck = _setupConnectionCheck.bind(null, POS);
        POS._startTodayStatsUpdater = _startTodayStatsUpdater.bind(null, POS);
        POS._enableDragDrop = _enableDragDrop.bind(null, POS);

        // التهيئة
        POS._applyUserPrefs();
        POS._cacheDOM();
        POS._applySafeArea();
        POS._bindKeyboardShortcuts();
        POS._bindEvents();
        POS._connStatus();
        POS._setupErrorMonitoring();
        POS._setupBarcodeBuffer();
        POS._setupRealtimeSync();
        POS._setupAutoTheme();
        POS._setupConnectionCheck();
        POS._startTodayStatsUpdater();

        window.addEventListener('online', () => { POS._connStatus(); POS._syncOfflineSales(); });
        window.addEventListener('offline', () => POS._connStatus());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                POS._saveCart();
                POS._savePaymentDraft();
                POS._stopBarcodeScan();
            }
        });

        await POS._loadData();
        await POS._sidebarUser();
        POS._restorePaymentDraft();

        window.addEventListener('beforeunload', () => {
            POS._stopBarcodeScan();
            POS._saveCart();
            POS._savePaymentDraft();
        });
    },

    openReturn() { window.location.href = './sales-returns.html'; }
};

// دوال عامة لا تحتاج ربط بـ POS لأنها تستخدم this من الكائن الأصلي (مثل playBeep عبر U)
window.POS = POS;
