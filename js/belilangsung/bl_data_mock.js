/* ============================================================================
 * BL.Data (implementasi CONTOH / mock) - satu pintu data untuk Beli Langsung.
 *
 * Kontrak yang dipakai UI (implementasi Supabase nanti cukup menggantikan file ini):
 *   loadVoucherCatalog()        -> Promise<{ providers }>
 *   loadBarangCatalog()         -> Promise<{ brands, products }>
 *   getShiftState()             -> { selected, timeBased, inTransition }
 *   saveSelectedShift(n)        -> void
 *   verifyApproval({mode,...})  -> Promise<{ id, name } | null>
 *   saveVoucherTransaction(tx)  -> Promise<{ ok, rows }>
 *   saveBarangTransaction(tx)   -> Promise<{ ok, rows }>
 *
 * Bentuk data (harga = angka, bukan string bertitik seperti di SQLite app):
 *   provider: { id, name, bgColor, textColor, categories:[{ id, name, products:[{ id, name, price, stock }] }] }
 *   brand:    { id, name, color }
 *   product (barang): { id, name, price, stock, code, brandId, brandName, brandColor, icon }
 *
 * Skenario prototype (data/shift/gagal simpan/printer) diatur lewat setScenario().
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};

    // ---------- Data awal ----------
    const p = function (id, name, price, stock) { return { id: id, name: name, price: price, stock: stock }; };

    const VOUCHER_SEED = [
        { id: 1, name: 'AXIS', bgColor: '#7B1FA2', textColor: '#FFFFFF', categories: [
            { id: 11, name: 'VOUCHER DATA', products: [p(101, 'AXIS 3GB', 5000, 30), p(102, 'AXIS 5GB', 7000, 22), p(103, 'AXIS 10GB', 12000, 8), p(104, 'AXIS 15GB', 17000, 0)] },
            { id: 12, name: 'PERDANA', products: [p(105, 'AXIS Perdana 25GB', 45000, 4), p(106, 'AXIS Perdana 50GB', 75000, 2)] }
        ] },
        { id: 2, name: 'TELKOMSEL', bgColor: '#D32F2F', textColor: '#FFFFFF', categories: [
            { id: 21, name: 'VOUCHER DATA', products: [p(201, 'Simpati 2GB', 10000, 15), p(202, 'Simpati 5GB', 20000, 9), p(203, 'Simpati 10GB', 35000, 3)] },
            { id: 22, name: 'PULSA', products: [p(204, 'Pulsa 5.000', 6500, 50), p(205, 'Pulsa 10.000', 11500, 40), p(206, 'Pulsa 20.000', 21500, 25)] }
        ] },
        { id: 3, name: 'XL', bgColor: '#1565C0', textColor: '#FFFFFF', categories: [
            { id: 31, name: 'VOUCHER DATA', products: [p(301, 'XL 2GB', 9000, 12), p(302, 'XL 6GB', 18000, 6)] },
            { id: 32, name: 'PERDANA', products: [p(303, 'XL Perdana 20GB', 40000, 5)] }
        ] },
        { id: 4, name: 'INDOSAT', bgColor: '#FBC02D', textColor: '#212121', categories: [
            { id: 41, name: 'VOUCHER DATA', products: [p(401, 'Freedom 3GB', 8000, 14), p(402, 'Freedom 7GB', 15000, 0), p(403, 'Freedom 15GB', 28000, 6)] }
        ] },
        { id: 5, name: 'TRI', bgColor: '#E91E63', textColor: '#FFFFFF', categories: [
            { id: 51, name: 'VOUCHER DATA', products: [p(501, 'Tri 3GB', 6000, 18), p(502, 'Tri 8GB', 14000, 10)] }
        ] }
    ];

    const BRAND_SEED = [
        { id: 1, name: 'ROBOT', color: '#E65100' },
        { id: 2, name: 'VIVAN', color: '#0277BD' },
        { id: 3, name: 'BASEUS', color: '#2E7D32' },
        { id: 4, name: 'LAINNYA', color: '#546E7A' }
    ];
    const b = function (id, name, price, stock, code, brandId, icon) { return { id: id, name: name, price: price, stock: stock, code: code, brandId: brandId, icon: icon }; };
    const BARANG_SEED = [
        b(1001, 'ROBOT Kabel Data Type-C 1M', 25000, 12, 'RBT-KB-C1', 1, '🔌'),
        b(1002, 'ROBOT Charger 20W Fast Charging', 65000, 5, 'RBT-CH-20', 1, '⚡'),
        b(1003, 'ROBOT Earphone RE10 Wired', 35000, 0, 'RBT-EP-10', 1, '🎧'),
        b(1004, 'ROBOT Powerbank 10000mAh', 145000, 3, 'RBT-PB-10', 1, '🔋'),
        b(1005, 'VIVAN Kabel Micro USB 1M', 18000, 20, 'VVN-KB-M1', 2, '🔌'),
        b(1006, 'VIVAN Power Bank 20000mAh', 235000, 2, 'VVN-PB-20', 2, '🔋'),
        b(1007, 'VIVAN Headset TWS Bluetooth', 120000, 7, 'VVN-TW-01', 2, '🎧'),
        b(1008, 'BASEUS Kabel Type-C 66W', 85000, 9, 'BSS-KB-66', 3, '🔌'),
        b(1009, 'BASEUS Charger GaN 65W', 275000, 1, 'BSS-CH-65', 3, '⚡'),
        b(1010, 'Case HP Silikon Universal', 15000, 30, 'LNY-CS-01', 4, '📱'),
        b(1011, 'Tempered Glass Universal', 10000, 40, 'LNY-TG-01', 4, '🛡️'),
        b(1012, 'Memory Card 32GB', 65000, 6, 'LNY-MC-32', 4, '💾'),
        b(1013, 'Flashdisk 16GB', 55000, 0, 'LNY-FD-16', 4, '💽'),
        b(1014, 'Ring Holder HP', 8000, 18, 'LNY-RH-01', 4, '💍')
    ];

    const EMPLOYEES = [
        { id: 1, name: 'Budi', password: '1234', pattern: [1, 2, 3, 6] },
        { id: 2, name: 'Sari', password: '5678', pattern: [1, 4, 7, 8] }
    ];
    // Panjang minimum kredensial: asumsi prototype (PatternUtils/PasswordUtils belum dibaca).
    const MIN_PATTERN = 4;
    const MIN_PASSWORD = 4;

    const DEFAULT_SCENARIO = { data: 'normal', shift: 'normal', saveFail: false, printer: true };

    // ---------- State modul ----------
    let db = null;
    let scenario = Object.assign({}, DEFAULT_SCENARIO);
    let shiftChosen = null;
    let transactions = [];

    const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
    const delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    const latency = function () { return scenario.data === 'slow' ? 1800 : 250; };

    function reset() {
        db = { vouchers: clone(VOUCHER_SEED), brands: clone(BRAND_SEED), barang: clone(BARANG_SEED) };
        shiftChosen = null;
        transactions = [];
    }
    reset();

    // ---------- Skenario ----------
    function setScenario(partial) {
        scenario = Object.assign(scenario, partial || {});
        if (partial && 'shift' in partial) shiftChosen = null;
    }
    function getScenario() { return Object.assign({}, scenario); }

    // ---------- Katalog ----------
    async function loadVoucherCatalog() {
        await delay(latency());
        if (scenario.data === 'error') throw new Error('Gagal memuat data: koneksi database terputus (simulasi)');
        if (scenario.data === 'empty') return { providers: [] };
        return { providers: clone(db.vouchers) };
    }

    async function loadBarangCatalog() {
        await delay(latency());
        if (scenario.data === 'error') throw new Error('Gagal memuat katalog barang: koneksi database terputus (simulasi)');
        if (scenario.data === 'empty') return { brands: [], products: [] };
        const byBrand = {};
        db.brands.forEach(function (br) { byBrand[br.id] = br; });
        const products = db.barang.map(function (x) {
            const br = byBrand[x.brandId];
            return Object.assign({}, x, { brandName: br.name, brandColor: br.color });
        });
        return { brands: clone(db.brands), products: products };
    }

    // ---------- Shift ----------
    function getShiftState() {
        if (scenario.shift === 'transition') return { selected: shiftChosen || 0, timeBased: 2, inTransition: true };
        if (scenario.shift === 'mismatch') return { selected: shiftChosen || 1, timeBased: 2, inTransition: false };
        return { selected: shiftChosen || 1, timeBased: 1, inTransition: false };
    }
    function saveSelectedShift(n) { shiftChosen = n; }

    // ---------- Persetujuan karyawan ----------
    async function verifyApproval(req) {
        await delay(120);
        const found = EMPLOYEES.find(function (e) {
            if (req.mode === 'password') return req.password.length >= MIN_PASSWORD && e.password === req.password;
            return req.pattern.length >= MIN_PATTERN && e.pattern.join('') === req.pattern.join('');
        });
        return found ? { id: found.id, name: found.name } : null;
    }

    // ---------- Simpan transaksi ----------
    function consumeStock(rows, list, idKey) {
        rows.forEach(function (r) {
            const item = list.find(function (x) { return x[idKey] === r.productId; });
            if (item) item.stock = Math.max(0, item.stock - r.quantity);
        });
    }

    async function saveVoucherTransaction(tx) {
        await delay(500);
        if (scenario.saveFail) return { ok: false };
        db.vouchers.forEach(function (prov) { prov.categories.forEach(function (c) { consumeStock(tx.details, c.products, 'id'); }); });
        transactions.push({ kind: 'voucher', shift: tx.shift, rows: tx.details.length, at: new Date().toISOString() });
        return { ok: true, rows: tx.details.length };
    }

    async function saveBarangTransaction(tx) {
        await delay(500);
        if (scenario.saveFail) return { ok: false };
        consumeStock(tx.details, db.barang, 'id');
        transactions.push({ kind: 'barang', shift: tx.shift, method: tx.method, total: tx.total, rows: tx.details.length, at: new Date().toISOString() });
        return { ok: true, rows: tx.details.length };
    }

    BL.Data = {
        isMock: true,
        loadVoucherCatalog: loadVoucherCatalog, loadBarangCatalog: loadBarangCatalog,
        getShiftState: getShiftState, saveSelectedShift: saveSelectedShift, verifyApproval: verifyApproval,
        saveVoucherTransaction: saveVoucherTransaction, saveBarangTransaction: saveBarangTransaction,
        // khusus prototype
        setScenario: setScenario, getScenario: getScenario, reset: reset,
        debugTransactions: function () { return transactions.slice(); },
        demoCredentials: EMPLOYEES.map(function (e) { return { name: e.name, password: e.password, pattern: e.pattern.slice() }; })
    };
})(window);
