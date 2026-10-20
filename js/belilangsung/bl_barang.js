/* ============================================================================
 * BL.Barang - katalog Beli Barang (BeliBarangActivity):
 *   pencarian + input barcode/SKU, chip brand berjumlah, grid kartu foto,
 *   tap = tambah ke keranjang, tekan-lama / tombol ⓘ = detail.
 *   Keranjang dan pembayaran memakai BL.CartBar + BL.Checkout (sama dengan voucher).
 *
 * deps: { reload() }
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    const UI = BL.UI;
    const F = BL.Format;
    const L = BL.Logic;
    const esc = UI.esc;
    const $ = UI.$;
    let store = null;
    let deps = null;

    // ---------- Chip brand ----------
    function renderChips() {
        const sel = store.getSelectedBrandId();
        $('barangChips').innerHTML = store.getBrandChips().map(function (c) {
            const active = c.id === sel;
            return '<button type="button" class="chip' + (active ? ' active' : '') + '" data-brand="' + (c.id === null ? '' : c.id) + '">' +
                esc(c.name) + ' (' + c.count + ')</button>';
        }).join('');
    }

    // ---------- Kartu ----------
    function actionHtml(p, qty) {
        if (p.stock <= 0) return '<button type="button" class="btn-cart" disabled>Stok Habis</button>';
        if (qty > 0) {
            return '<div class="stepper">' +
                '<button type="button" class="st-btn" data-act="b-dec" aria-label="Kurang">−</button>' +
                '<span class="st-val">' + qty + '</span>' +
                '<button type="button" class="st-btn" data-act="b-inc" aria-label="Tambah">+</button></div>';
        }
        return '<button type="button" class="btn-cart" data-act="b-add">+ Keranjang</button>';
    }

    function cardHtml(p) {
        const lvl = L.stockLevel(p.stock);
        const c1 = L.safeColor(p.brandColor, '#546E7A');
        const c2 = L.shade(c1, 0.55);
        return '<div class="b-card' + (lvl === 'out' ? ' is-out' : '') + '" data-pid="' + p.id + '">' +
            '<div class="b-photo" style="--p1:' + c1 + ';--p2:' + c2 + '">' +
                '<span class="b-emoji">' + esc(p.icon || '📦') + '</span>' +
                '<span class="tag-brand">' + esc(p.brandName) + '</span>' +
                '<span class="tag-stock ' + lvl + '">Stok: ' + p.stock + '</span>' +
                '<button type="button" class="b-info-btn" data-act="b-info" aria-label="Detail produk">ⓘ</button>' +
                (lvl === 'out' ? '<div class="oos"><span>HABIS</span></div>' : '') +
            '</div>' +
            '<div class="b-body"><div class="b-name">' + esc(p.name) + '</div>' +
                '<div class="b-price">' + F.rupiah(p.price) + '</div>' +
                '<div class="b-action">' + actionHtml(p, store.barangQty(p.id)) + '</div></div>' +
        '</div>';
    }

    function renderGrid() {
        const mount = $('barangBody');
        const st = store.getBarangStatus();
        if (st.status === 'loading' || st.status === 'idle') {
            mount.innerHTML = '<div class="state"><div class="spinner"></div><div class="state-sub">Memuat katalog…</div></div>';
            $('barangCount').textContent = 'Katalog Barang';
            return;
        }
        if (st.status === 'error') {
            mount.innerHTML = '<div class="state"><div class="state-ico">⚠️</div><div class="state-text">' + esc(st.error) + '</div>' +
                '<button type="button" class="bl-btn bl-btn-outline" data-act="retry">Coba Lagi</button></div>';
            $('barangCount').textContent = 'Katalog Barang';
            return;
        }
        const list = store.getBarangFiltered();
        $('barangCount').textContent = 'Menampilkan ' + list.length + ' barang';
        if (list.length === 0) {
            mount.innerHTML = '<div class="state"><div class="state-ico">🛒</div><div class="state-text">Tidak Ada Barang Ditemukan</div>' +
                '<div class="state-sub">Coba ubah kata kunci pencarian atau filter brand.</div></div>';
            return;
        }
        mount.innerHTML = '<div class="b-grid">' + list.map(cardHtml).join('') + '</div>';
    }

    function updateCard(pid) {
        const card = $('barangBody').querySelector('.b-card[data-pid="' + pid + '"]');
        const p = store.getBarangProduct(pid);
        if (card && p) card.querySelector('.b-action').innerHTML = actionHtml(p, store.barangQty(pid));
    }

    // ---------- Keranjang ----------
    function addWithFeedback(pid) {
        const r = store.barangAdd(pid);
        if (r === 'out') UI.toast('Stok barang ini habis');
        else if (r === 'max') UI.toast('Maksimum stok tersedia: ' + (store.getBarangProduct(pid) || {}).stock);
        return r;
    }

    // ---------- Barcode & detail ----------
    async function openBarcodeDialog() {
        const sample = store.getBarangProducts().slice(0, 2).map(function (p) { return p.code; }).filter(Boolean).join(', ');
        const choice = await UI.modal({
            title: '🔍 Scan / Input Barcode',
            html: '<input type="text" id="bcInput" class="ap-input" placeholder="Ketik atau scan barcode / SKU barang" autocomplete="off">' +
                (sample ? '<div class="proto-hint">Contoh kode (data demo): ' + esc(sample) + '</div>' : ''),
            actions: [{ label: 'Batal', kind: 'ghost', value: null }, { label: 'Cari & Tambah', kind: 'primary', value: 'ok' }],
            onOpen: function (body, close) {
                const input = body.querySelector('#bcInput');
                input.focus();
                input.addEventListener('keydown', function (e) { if (e.key === 'Enter') close('ok'); });
            }
        });
        const code = choice === 'ok' ? $('bcInput').value.trim() : '';
        if (code) processBarcode(code);
    }

    function processBarcode(code) {
        const lower = code.toLowerCase();
        const hit = store.getBarangProducts().find(function (p) { return p.code && p.code.toLowerCase() === lower; });
        if (hit) {
            if (hit.stock > 0) {
                if (addWithFeedback(hit.id) === 'ok') UI.toast('✅ ' + hit.name + ' dimasukkan ke keranjang');
            } else {
                UI.toast('⚠️ Stok barang ini habis!');
            }
        } else {
            $('barangSearch').value = code;
            store.setSearch(code);
            UI.toast('Menampilkan hasil barcode: ' + code);
        }
    }

    async function showQuickDetail(pid) {
        const p = store.getBarangProduct(pid);
        if (!p) return;
        const rows = [['Nama', esc(p.name)], ['Harga', F.rupiah(p.price)], ['Stok Tersedia', p.stock + ' pcs']];
        if (p.code && p.code.trim()) rows.push(['SKU / Barcode', esc(p.code.trim())]);
        const choice = await UI.modal({
            title: '📦 Detail Produk',
            html: '<dl class="detail-list">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>',
            actions: [{ label: 'Tutup', kind: 'ghost', value: null }, { label: '+ Tambah ke Keranjang', kind: 'primary', value: 'add' }]
        });
        if (choice === 'add') addWithFeedback(pid);
    }

    // ---------- Init ----------
    function init(s, d) {
        store = s;
        deps = d;

        $('barangSearch').addEventListener('input', function (e) { store.setSearch(e.target.value); });
        $('btnBarcode').addEventListener('click', openBarcodeDialog);
        $('btnManageStock').addEventListener('click', function () {
            UI.toast('⚙️ Kelola Stok (ManageBarangActivity) belum termasuk prototype ini');
        });
        $('barangChips').addEventListener('click', function (e) {
            const chip = e.target.closest('.chip');
            if (!chip) return;
            const v = chip.getAttribute('data-brand');
            store.selectBrand(v === '' ? null : Number(v));
        });

        const body = $('barangBody');
        body.addEventListener('click', function (e) {
            const actEl = e.target.closest('[data-act]');
            if (actEl && actEl.getAttribute('data-act') === 'retry') { deps.reload(); return; }
            const card = e.target.closest('.b-card');
            if (!card) return;
            const pid = Number(card.getAttribute('data-pid'));
            if (actEl) {
                if (actEl.disabled) return;
                const act = actEl.getAttribute('data-act');
                if (act === 'b-info') showQuickDetail(pid);
                else if (act === 'b-dec') store.barangDec(pid);
                else addWithFeedback(pid);
                return;
            }
            addWithFeedback(pid);   // tap kartu = tambah (atau toast "Stok barang ini habis")
        });
        UI.onLongPress(body, '.b-card', function (card) { showQuickDetail(Number(card.getAttribute('data-pid'))); });
    }

    BL.Barang = { init: init, renderChips: renderChips, renderGrid: renderGrid, updateCard: updateCard };
})(window);
