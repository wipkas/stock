/* ============================================================================
 * BL.CartBar - satu bar keranjang yang menempel di bawah, dipakai kedua tab.
 * Menampilkan jumlah, total, dan tombol "Bayar / Kasir" untuk keranjang tab aktif.
 *
 * deps: { openCheckout(kind) }
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    const UI = BL.UI;
    const F = BL.Format;
    const $ = UI.$;
    let store = null;
    let deps = null;

    function activeKind() { return store.getTab() === 'voucher' ? 'voucher' : 'barang'; }

    function update() {
        const kind = activeKind();
        const t = kind === 'voucher' ? store.getVoucherTotals() : store.getBarangTotals();
        $('cartBarBadge').textContent = t.count;
        $('cartBarTotal').textContent = F.rupiah(t.total);
        $('cartBarText').textContent = t.count + ' pcs ' + kind + ' dipilih';
        $('cartBar').hidden = t.count === 0;
    }

    function init(s, d) {
        store = s;
        deps = d;
        $('btnOpenCheckout').addEventListener('click', function () { deps.openCheckout(activeKind()); });
    }

    BL.CartBar = { init: init, update: update };
})(window);
