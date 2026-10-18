/* ============================================================================
 * BL.Card - komponen kartu produk BERSAMA untuk tab Voucher dan Barang.
 * Satu desain, satu tempat perawatan: foto/ikon berlatar gradien, label (provider
 * atau brand), lencana stok, tombol detail ⓘ, nama, harga, lalu tombol
 * "+ Keranjang" atau stepper. Hanya membangun string HTML (tanpa DOM, mudah diuji).
 *
 * Aksi yang dipancarkan lewat atribut data-act (ditangani modul pemakai):
 *   card-add | card-inc | card-dec | card-info
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    const UI = BL.UI;
    const F = BL.Format;
    const L = BL.Logic;
    const esc = UI.esc;

    /** Bagian bawah kartu: Stok Habis | stepper | + Keranjang. */
    function actionHtml(stock, qty) {
        if (stock <= 0) return '<button type="button" class="btn-cart" disabled>Stok Habis</button>';
        if (qty > 0) {
            return '<div class="stepper">' +
                '<button type="button" class="st-btn" data-act="card-dec" aria-label="Kurang">−</button>' +
                '<span class="st-val">' + qty + '</span>' +
                '<button type="button" class="st-btn" data-act="card-inc" aria-label="Tambah">+</button></div>';
        }
        return '<button type="button" class="btn-cart" data-act="card-add">+ Keranjang</button>';
    }

    /**
     * @param {object} o
     *   id, name, price, stock, qty  - data produk dan jumlah di keranjang
     *   tag                          - label kiri-bawah foto (nama provider / brand)
     *   icon                         - emoji pengganti foto
     *   color                        - warna dasar gradien (#RRGGBB)
     */
    function html(o) {
        const lvl = L.stockLevel(o.stock);
        const c1 = L.safeColor(o.color, '#546E7A');
        const c2 = L.shade(c1, 0.55);
        return '<div class="p-card' + (lvl === 'out' ? ' is-out' : '') + '" data-pid="' + o.id + '">' +
            '<div class="p-photo" style="--p1:' + c1 + ';--p2:' + c2 + '">' +
                '<span class="p-emoji">' + esc(o.icon || '📦') + '</span>' +
                '<span class="tag-label">' + esc(o.tag) + '</span>' +
                '<span class="tag-stock ' + lvl + '">Stok: ' + o.stock + '</span>' +
                '<button type="button" class="p-info-btn" data-act="card-info" aria-label="Detail produk">ⓘ</button>' +
                (lvl === 'out' ? '<div class="oos"><span>HABIS</span></div>' : '') +
            '</div>' +
            '<div class="p-body"><div class="p-name">' + esc(o.name) + '</div>' +
                '<div class="p-price">' + F.rupiah(o.price) + '</div>' +
                '<div class="p-action">' + actionHtml(o.stock, o.qty || 0) + '</div></div>' +
        '</div>';
    }

    BL.Card = { html: html, actionHtml: actionHtml };
})(window);
