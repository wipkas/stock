/* ============================================================================
 * BL.Main - bootstrap & orkestrasi Beli Langsung.
 * Menghubungkan Store, Voucher, Barang, Checkout, Shift, Data. Tidak berisi
 * aturan bisnis (ada di Logic/Store) maupun markup kartu (ada di modul layar).
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    const UI = BL.UI;
    const $ = UI.$;
    let store = null;
    let voucherToken = 0;
    let barangToken = 0;

    // ---------- Pemuatan katalog ----------
    async function loadVoucher() {
        const token = ++voucherToken;
        store.setVoucherStatus('loading');
        try {
            const r = await BL.Data.loadVoucherCatalog();
            if (token !== voucherToken) return;   // ada pemuatan yang lebih baru
            if (!r.providers.length) {
                store.setVoucherCatalog([]);
                store.setVoucherStatus('error', 'Tidak ada data voucher. Silakan seed data terlebih dahulu.');
                return;
            }
            store.setVoucherCatalog(r.providers);
            store.setVoucherStatus('ready');
        } catch (err) {
            if (token === voucherToken) store.setVoucherStatus('error', (err && err.message) || 'Gagal memuat data');
        }
    }

    async function loadBarang() {
        const token = ++barangToken;
        store.setBarangStatus('loading');
        try {
            const r = await BL.Data.loadBarangCatalog();
            if (token !== barangToken) return;
            store.setBarangCatalog(r);
            store.setBarangStatus('ready');
        } catch (err) {
            if (token === barangToken) store.setBarangStatus('error', (err && err.message) || 'Gagal memuat katalog');
        }
    }

    function reloadAll() { return Promise.all([loadVoucher(), loadBarang()]); }

    // ---------- Indikator shift, tab, bar ----------
    function updateShiftUI() {
        const d = BL.Shift.display();
        $('badgeShift').textContent = d.emoji + ' ' + d.text;
        $('barangShift').textContent = 'Shift: ' + d.emoji + ' ' + d.text;
        if (BL.Voucher.isCartOpen()) BL.Voucher.renderCart();
    }

    function refreshBars() {
        BL.Voucher.updateBar();
        BL.Barang.updateBar();
        const vc = store.getVoucherTotals().count;
        const bc = store.getBarangTotals().count;
        $('tabBadgeVoucher').textContent = vc;
        $('tabBadgeVoucher').hidden = vc === 0;
        $('tabBadgeBarang').textContent = bc;
        $('tabBadgeBarang').hidden = bc === 0;
    }

    function applyTab() {
        const tab = store.getTab();
        document.body.setAttribute('data-tab', tab);
        $('panelVoucher').hidden = tab !== 'voucher';
        $('panelBarang').hidden = tab !== 'barang';
        document.querySelectorAll('.tab').forEach(function (t) {
            const on = t.getAttribute('data-tab') === tab;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        refreshBars();
    }

    function onStoreEvent(e) {
        switch (e.type) {
            case 'tab': applyTab(); break;
            case 'voucher:status':
            case 'voucher:catalog':
                BL.Voucher.renderChips(); BL.Voucher.renderBody(); refreshBars(); break;
            case 'voucher:select':
                BL.Voucher.renderChips(); BL.Voucher.renderBody(); break;
            case 'voucher:cart':
                if (e.pid !== null) BL.Voucher.updateCard(e.pid); else BL.Voucher.renderBody();
                refreshBars(); break;
            case 'barang:status':
            case 'barang:catalog':
                BL.Barang.renderChips(); BL.Barang.renderGrid(); refreshBars(); break;
            case 'barang:filter':
                BL.Barang.renderChips(); BL.Barang.renderGrid(); break;
            case 'barang:cart':
                if (e.pid !== null) BL.Barang.updateCard(e.pid); else BL.Barang.renderGrid();
                refreshBars(); break;
            default: break;
        }
    }

    // ---------- Skenario dari URL ----------
    /**
     * Parameter URL agar skenario bisa dibagikan/di-reload, mis.
     *   ?data=error|empty|slow  &shift=mismatch|transition  &save=fail  &printer=off
     */
    function applyUrlScenario() {
        const q = new URLSearchParams(global.location.search);
        const sc = {};
        const data = q.get('data');
        const shift = q.get('shift');
        if (['normal', 'empty', 'error', 'slow'].indexOf(data) !== -1) sc.data = data;
        if (['normal', 'mismatch', 'transition'].indexOf(shift) !== -1) sc.shift = shift;
        if (q.get('save') === 'fail') sc.saveFail = true;
        if (q.get('printer') === 'off') sc.printer = false;
        if (Object.keys(sc).length) BL.Data.setScenario(sc);
    }

    // ---------- Panel skenario prototype ----------
    function radioGroup(name, label, options, current) {
        return '<fieldset class="sc-group"><legend>' + UI.esc(label) + '</legend>' + options.map(function (o) {
            return '<label class="sc-opt"><input type="radio" name="' + name + '" value="' + UI.esc(String(o[0])) + '"' +
                (String(current) === String(o[0]) ? ' checked' : '') + '><span>' + UI.esc(o[1]) + '</span></label>';
        }).join('') + '</fieldset>';
    }

    async function openScenarioPanel() {
        const sc = BL.Data.getScenario();
        await UI.modal({
            title: '🧪 Skenario Prototype',
            html: '<p class="dlg-text">Ubah kondisi untuk menguji tampilan. Perubahan langsung berlaku.</p>' +
                '<p class="proto-hint">Bisa juga lewat URL: <code>?data=error&amp;shift=mismatch&amp;save=fail&amp;printer=off</code></p>' +
                radioGroup('sc-data', 'Data katalog', [['normal', 'Normal'], ['empty', 'Kosong'], ['error', 'Error'], ['slow', 'Lambat (1,8 dtk)']], sc.data) +
                radioGroup('sc-shift', 'Shift', [['normal', 'Normal (cocok jam)'], ['mismatch', 'Tidak cocok jam'], ['transition', 'Masa transisi']], sc.shift) +
                radioGroup('sc-save', 'Simpan transaksi', [['ok', 'Berhasil'], ['fail', 'Gagal']], sc.saveFail ? 'fail' : 'ok') +
                radioGroup('sc-printer', 'Printer Bluetooth', [['on', 'Terhubung'], ['off', 'Belum terhubung']], sc.printer ? 'on' : 'off') +
                '<button type="button" class="bl-btn bl-btn-outline" id="scReset">↺ Reset stok & keranjang</button>',
            actions: [{ label: 'Tutup', kind: 'primary', value: null }],
            onOpen: function (body) {
                body.addEventListener('change', function (e) {
                    const t = e.target;
                    if (t.name === 'sc-data') { BL.Data.setScenario({ data: t.value }); reloadAll(); }
                    else if (t.name === 'sc-shift') { BL.Data.setScenario({ shift: t.value }); updateShiftUI(); }
                    else if (t.name === 'sc-save') BL.Data.setScenario({ saveFail: t.value === 'fail' });
                    else if (t.name === 'sc-printer') BL.Data.setScenario({ printer: t.value === 'on' });
                });
                body.querySelector('#scReset').addEventListener('click', function () {
                    BL.Data.reset();
                    store.voucherClear();
                    store.barangClear();
                    updateShiftUI();
                    reloadAll();
                    UI.toast('Data demo direset');
                });
            }
        });
    }

    // ---------- Boot ----------
    function boot() {
        applyUrlScenario();
        if (global.KspTheme) global.KspTheme.apply();
        $('themeToggleBtn').addEventListener('click', function () {
            if (global.KspTheme) global.KspTheme.toggle();
            else document.body.classList.toggle('light-theme');
        });

        store = BL.createStore();
        BL.Shift.onChange(updateShiftUI);
        BL.Voucher.init(store, { reload: loadVoucher });
        BL.Barang.init(store, { reload: loadBarang, openCheckout: function () { BL.Checkout.open(); } });
        BL.Checkout.init(store, { reload: loadBarang });
        store.subscribe(onStoreEvent);

        document.querySelectorAll('.tab').forEach(function (t) {
            t.addEventListener('click', function () { store.setTab(t.getAttribute('data-tab')); });
        });
        $('btnScenario').addEventListener('click', openScenarioPanel);

        applyTab();
        updateShiftUI();
        reloadAll();
    }

    BL.Main = { boot: boot, reloadAll: reloadAll };
    document.addEventListener('DOMContentLoaded', boot);
})(window);
