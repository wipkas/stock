/* ============================================================================
 * BL.createStore - state Beli Langsung: tab aktif + DUA keranjang terpisah
 * (voucher dan barang, seperti app: ProductsViewModel vs BeliBarangActivity).
 * Tanpa DOM. Event ke subscriber: { type, pid? } dengan type:
 *   'tab' | 'voucher:status' | 'voucher:catalog' | 'voucher:select' | 'voucher:cart'
 *   'barang:status' | 'barang:catalog' | 'barang:filter' | 'barang:cart'
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};

    function createStore() {
        const v = { status: 'idle', error: '', providers: [], selectedId: null, cart: new Map(), cache: new Map() };
        const b = { status: 'idle', error: '', brands: [], products: [], byId: new Map(), selectedBrandId: null, search: '', cart: new Map() };
        let tab = 'voucher';
        let listeners = [];

        function emit(type, pid) {
            const evt = { type: type, pid: pid === undefined ? null : pid };
            listeners.slice().forEach(function (fn) {
                try { fn(evt); } catch (err) { console.error('[BL.Store] listener error', err); }
            });
        }
        function subscribe(fn) {
            listeners.push(fn);
            return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
        }

        // ---------- Tab ----------
        function getTab() { return tab; }
        function setTab(t) { if (t !== tab) { tab = t; emit('tab'); } }

        // ---------- Voucher: katalog ----------
        function setVoucherStatus(status, error) { v.status = status; v.error = error || ''; emit('voucher:status'); }
        function getVoucherStatus() { return { status: v.status, error: v.error }; }

        function setVoucherCatalog(providers) {
            v.providers = providers;
            v.cache = new Map();
            providers.forEach(function (prov) {
                prov.categories.forEach(function (c) {
                    c.products.forEach(function (pr) { v.cache.set(pr.id, { product: pr, provider: prov }); });
                });
            });
            if (!providers.some(function (x) { return x.id === v.selectedId; })) {
                v.selectedId = providers.length ? providers[0].id : null;
            }
            emit('voucher:catalog');
        }
        function getVoucherProviders() { return v.providers; }
        function getSelectedVoucherProvider() {
            return v.providers.find(function (x) { return x.id === v.selectedId; }) || null;
        }
        function selectVoucherProvider(id) {
            if (v.selectedId === id) return;
            v.selectedId = id;
            emit('voucher:select');
        }
        function getVoucherCategories() {
            const prov = getSelectedVoucherProvider();
            return prov ? prov.categories : [];
        }

        // ---------- Voucher: keranjang (dibatasi stok, seperti ProductsViewModel) ----------
        function voucherQty(pid) { return v.cart.get(pid) || 0; }
        /** -> 'ok' | 'out' | 'max' | 'missing' */
        function voucherAdd(pid) {
            const entry = v.cache.get(pid);
            if (!entry) return 'missing';
            const max = entry.product.stock;
            if (max <= 0) return 'out';
            const cur = v.cart.get(pid) || 0;
            if (cur >= max) return 'max';
            v.cart.set(pid, cur + 1);
            emit('voucher:cart', pid);
            return 'ok';
        }
        function voucherDec(pid) {
            const cur = v.cart.get(pid) || 0;
            if (cur > 1) v.cart.set(pid, cur - 1); else v.cart.delete(pid);
            emit('voucher:cart', pid);
        }
        function voucherRemove(pid) { if (v.cart.delete(pid)) emit('voucher:cart', pid); }
        function voucherClear() { v.cart.clear(); emit('voucher:cart'); }
        function getVoucherCartItems() {
            const items = [];
            v.cart.forEach(function (qty, pid) {
                const entry = v.cache.get(pid);
                if (!entry) return;   // produk sudah tidak ada di katalog: lewati (seperti app)
                items.push({
                    product: entry.product, provider: entry.provider, providerName: entry.provider.name,
                    qty: qty, unitPrice: entry.product.price, subtotal: entry.product.price * qty
                });
            });
            return items;
        }
        function getVoucherTotals() {
            let count = 0;
            let total = 0;
            getVoucherCartItems().forEach(function (it) { count += it.qty; total += it.subtotal; });
            return { count: count, total: total };
        }
        function getVoucherMax(pid) { const e = v.cache.get(pid); return e ? e.product.stock : 0; }

        // ---------- Barang: katalog & filter ----------
        function setBarangStatus(status, error) { b.status = status; b.error = error || ''; emit('barang:status'); }
        function getBarangStatus() { return { status: b.status, error: b.error }; }

        function setBarangCatalog(data) {
            b.brands = data.brands;
            b.products = data.products;
            b.byId = new Map();
            data.products.forEach(function (p) { b.byId.set(p.id, p); });
            if (b.selectedBrandId !== null && !b.brands.some(function (x) { return x.id === b.selectedBrandId; })) b.selectedBrandId = null;
            emit('barang:catalog');
        }
        function getBarangProduct(pid) { return b.byId.get(pid) || null; }
        function getBarangProducts() { return b.products; }
        function selectBrand(id) {
            if (b.selectedBrandId === id) return;
            b.selectedBrandId = id;
            emit('barang:filter');
        }
        function getSelectedBrandId() { return b.selectedBrandId; }
        function setSearch(q) {
            const norm = String(q || '').trim().toLowerCase();
            if (norm === b.search) return;
            b.search = norm;
            emit('barang:filter');
        }
        function getSearch() { return b.search; }
        function getBrandChips() {
            const chips = [{ id: null, name: 'Semua', count: b.products.length }];
            b.brands.forEach(function (br) {
                chips.push({ id: br.id, name: br.name, count: b.products.filter(function (p) { return p.brandId === br.id; }).length });
            });
            return chips;
        }
        function getBarangFiltered() {
            const q = b.search;
            return b.products.filter(function (p) {
                if (b.selectedBrandId !== null && p.brandId !== b.selectedBrandId) return false;
                if (q === '') return true;
                return p.name.toLowerCase().indexOf(q) !== -1 || (p.code || '').toLowerCase().indexOf(q) !== -1;
            });
        }

        // ---------- Barang: keranjang (dibatasi stok, seperti CartBarangItem.canIncrement) ----------
        function barangQty(pid) { return b.cart.get(pid) || 0; }
        /** -> 'ok' | 'out' | 'max' | 'missing' */
        function barangAdd(pid) {
            const p = b.byId.get(pid);
            if (!p) return 'missing';
            if (p.stock <= 0) return 'out';
            const cur = b.cart.get(pid) || 0;
            if (cur >= p.stock) return 'max';
            b.cart.set(pid, cur + 1);
            emit('barang:cart', pid);
            return 'ok';
        }
        function barangDec(pid) {
            const cur = b.cart.get(pid) || 0;
            if (cur - 1 <= 0) b.cart.delete(pid); else b.cart.set(pid, cur - 1);
            emit('barang:cart', pid);
        }
        function barangRemove(pid) { if (b.cart.delete(pid)) emit('barang:cart', pid); }
        function barangClear() { b.cart.clear(); emit('barang:cart'); }
        function getBarangCartItems() {
            const items = [];
            b.cart.forEach(function (qty, pid) {
                const p = b.byId.get(pid);
                if (!p) return;
                items.push({ product: p, providerName: p.brandName, qty: qty, unitPrice: p.price, subtotal: p.price * qty });
            });
            return items;
        }
        function getBarangTotals() {
            let count = 0;
            let total = 0;
            getBarangCartItems().forEach(function (it) { count += it.qty; total += it.subtotal; });
            return { count: count, total: total };
        }

        return {
            subscribe: subscribe, getTab: getTab, setTab: setTab,
            setVoucherStatus: setVoucherStatus, getVoucherStatus: getVoucherStatus, setVoucherCatalog: setVoucherCatalog,
            getVoucherProviders: getVoucherProviders, getSelectedVoucherProvider: getSelectedVoucherProvider,
            selectVoucherProvider: selectVoucherProvider, getVoucherCategories: getVoucherCategories,
            voucherQty: voucherQty, voucherAdd: voucherAdd, voucherDec: voucherDec, voucherRemove: voucherRemove, voucherClear: voucherClear,
            getVoucherCartItems: getVoucherCartItems, getVoucherTotals: getVoucherTotals, getVoucherMax: getVoucherMax,
            setBarangStatus: setBarangStatus, getBarangStatus: getBarangStatus, setBarangCatalog: setBarangCatalog,
            getBarangProduct: getBarangProduct, getBarangProducts: getBarangProducts,
            selectBrand: selectBrand, getSelectedBrandId: getSelectedBrandId, setSearch: setSearch, getSearch: getSearch,
            getBrandChips: getBrandChips, getBarangFiltered: getBarangFiltered,
            barangQty: barangQty, barangAdd: barangAdd, barangDec: barangDec, barangRemove: barangRemove, barangClear: barangClear,
            getBarangCartItems: getBarangCartItems, getBarangTotals: getBarangTotals
        };
    }

    BL.createStore = createStore;
})(window);
