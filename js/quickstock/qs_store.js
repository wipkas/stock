/* ============================================================================
 * QS.createStore - state tunggal Cek Stok Cepat (tanpa DOM, mudah diuji).
 *
 * Prinsip utama:
 *   - `entries` hanya berisi produk yang SUDAH DIKONFIRMASI kasir (ketik angka,
 *     +/-, Enter/Next, atau tombol "Pas"). Tidak ada prefill dari stok awal.
 *   - Status "dicek" = entries.has(pid). Nilai tampil = entries ?? stok awal.
 *   - Produk "dilewati" (opsi Lewati Stok 0) tidak wajib dicek.
 *
 * Event ke subscriber: { type: 'load' | 'entry' | 'entries' | 'settings' | 'current', pid?, key? }
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};

    const toInt = function (v) { const n = parseInt(v, 10); return Number.isNaN(n) ? 0 : n; };

    function normalize(raw) {
        return {
            id: Number(raw.product_id),
            name: raw.product_name || '',
            provider: raw.provider_name || 'Lainnya',   // untuk pengelompokan UI
            category: raw.category_name || 'Voucher',
            providerRaw: raw.provider_name || 'Voucher', // untuk payload (kompatibel versi lama)
            categoryRaw: raw.category_name || '',
            sell: Number(raw.sell_price || 0),
            cost: Number(raw.cost_price || 0),
            stock: toInt(raw.current_stock)
        };
    }

    // Kelompokkan per provider (urutan kemunculan pertama), urutan relatif tetap stabil.
    function orderByProvider(list) {
        const order = new Map();
        list.forEach(function (p) { if (!order.has(p.provider)) order.set(p.provider, order.size); });
        return list
            .map(function (p, i) { return { p: p, i: i }; })
            .sort(function (a, b) { return (order.get(a.p.provider) - order.get(b.p.provider)) || (a.i - b.i); })
            .map(function (x) { return x.p; });
    }

    function createStore() {
        const meta = { storeId: '', shiftNum: 1, closed: false, baselineConfirmed: true };
        const settings = { skipZero: false, focusMode: true, provider: 'all', search: '', onlyUnchecked: false };
        const initial = new Map();
        const entries = new Map();
        let products = [];
        let byId = new Map();
        let indexById = new Map();
        let providerHasStock = new Map();
        let currentId = null;
        let listeners = [];

        function emit(type, data) {
            const evt = Object.assign({ type: type }, data || {});
            listeners.slice().forEach(function (fn) {
                try { fn(evt); } catch (err) { console.error('[QS.Store] listener error', err); }
            });
        }
        function subscribe(fn) {
            listeners.push(fn);
            return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
        }

        // ---------- Muat data ----------
        function load(data) {
            meta.storeId = data.storeId || '';
            meta.shiftNum = data.shiftNum || 1;
            meta.closed = !!data.closed;
            meta.baselineConfirmed = data.baselineConfirmed !== false;
            products = orderByProvider((data.products || []).map(normalize));
            byId = new Map();
            indexById = new Map();
            providerHasStock = new Map();
            initial.clear();
            entries.clear();
            products.forEach(function (p, i) {
                byId.set(p.id, p);
                indexById.set(p.id, i);
                initial.set(p.id, p.stock);
                if (p.stock > 0) providerHasStock.set(p.provider, true);
            });
            currentId = null;
            if (settings.provider !== 'all' && !products.some(function (p) { return p.provider === settings.provider; })) {
                settings.provider = 'all';
            }
            emit('load');
        }

        // ---------- Selector dasar ----------
        function getMeta() { return meta; }
        function getProducts() { return products; }
        function getProduct(pid) { return byId.get(pid) || null; }
        function indexOf(pid) { return indexById.has(pid) ? indexById.get(pid) : -1; }
        function getInitial(pid) { return initial.has(pid) ? initial.get(pid) : 0; }
        function isChecked(pid) { return entries.has(pid); }
        function getFinal(pid) { return entries.has(pid) ? entries.get(pid) : getInitial(pid); }
        function getDelta(pid) { return getFinal(pid) - getInitial(pid); }

        // Dilewati (tidak wajib dicek): opsi aktif, bukan mode baseline, stok awal 0,
        // dan provider-nya masih punya produk ber-stok (smart fallback seperti di app).
        function isSkipped(pid) {
            if (!settings.skipZero || !meta.baselineConfirmed) return false;
            const p = byId.get(pid);
            return !!p && getInitial(pid) <= 0 && providerHasStock.get(p.provider) === true;
        }
        function isRequired(pid) { return !isSkipped(pid); }

        function isFocusUi() { return !!settings.focusMode && !meta.closed; }

        function isVisible(pid) {
            const p = byId.get(pid);
            if (!p) return false;
            if (settings.provider !== 'all' && p.provider !== settings.provider) return false;
            const q = settings.search;
            if (q) {
                const hay = (p.name + ' ' + p.provider + ' ' + p.category).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            } else if (isSkipped(pid)) {
                return false;
            }
            if (settings.onlyUnchecked && isChecked(pid)) return false;
            return true;
        }
        function getVisible() { return products.filter(function (p) { return isVisible(p.id); }); }

        function getProviders() {
            const order = [];
            const map = Object.create(null);
            products.forEach(function (p) {
                let g = map[p.provider];
                if (!g) { g = map[p.provider] = { name: p.provider, total: 0, required: 0, unchecked: 0 }; order.push(g); }
                g.total++;
                if (!isSkipped(p.id)) { g.required++; if (!isChecked(p.id)) g.unchecked++; }
            });
            return order;
        }

        function getUnchecked() {
            return products.filter(function (p) { return !isSkipped(p.id) && !isChecked(p.id); });
        }

        function getTotals() {
            const t = { total: products.length, required: 0, checkedRequired: 0, checkedAll: 0, unchecked: 0, sold: 0, restock: 0, changed: 0, initialSum: 0, finalSum: 0 };
            products.forEach(function (p) {
                const init = getInitial(p.id);
                const fin = getFinal(p.id);
                const diff = fin - init;
                const chk = isChecked(p.id);
                t.initialSum += init;
                t.finalSum += fin;
                if (chk) t.checkedAll++;
                if (!isSkipped(p.id)) {
                    t.required++;
                    if (chk) t.checkedRequired++; else t.unchecked++;
                }
                if (diff < 0) t.sold += -diff;
                else if (diff > 0) t.restock += diff;
                if (diff !== 0) t.changed++;
            });
            return t;
        }

        // ---------- Mutasi ----------
        function setEntry(pid, value) {
            if (!byId.has(pid)) return;
            entries.set(pid, Math.max(0, toInt(value)));
            emit('entry', { pid: pid });
        }
        function clearEntry(pid) {
            if (entries.delete(pid)) emit('entry', { pid: pid });
        }

        function exportEntries() {
            const out = {};
            entries.forEach(function (v, k) { out[k] = v; });
            return out;
        }
        function importEntries(obj) {
            Object.keys(obj || {}).forEach(function (k) {
                const pid = Number(k);
                if (byId.has(pid)) entries.set(pid, Math.max(0, toInt(obj[k])));
            });
            emit('entries');
        }

        // ---------- Pengaturan & fokus ----------
        function getSetting(key) { return settings[key]; }
        function setSetting(key, value) {
            if (!(key in settings) || settings[key] === value) return;
            settings[key] = value;
            emit('settings', { key: key });
        }
        function getCurrent() { return currentId; }
        function setCurrent(pid) {
            if (currentId === pid) return;
            currentId = pid;
            emit('current', { pid: pid });
        }

        return {
            subscribe: subscribe, load: load,
            getMeta: getMeta, getProducts: getProducts, getProduct: getProduct, indexOf: indexOf,
            getInitial: getInitial, getFinal: getFinal, getDelta: getDelta,
            isChecked: isChecked, isSkipped: isSkipped, isRequired: isRequired,
            isVisible: isVisible, getVisible: getVisible, isFocusUi: isFocusUi,
            getProviders: getProviders, getUnchecked: getUnchecked, getTotals: getTotals,
            setEntry: setEntry, clearEntry: clearEntry, exportEntries: exportEntries, importEntries: importEntries,
            getSetting: getSetting, setSetting: setSetting, getCurrent: getCurrent, setCurrent: setCurrent
        };
    }

    QS.createStore = createStore;
})(window);
