/* ============================================================================
 * BL.Voucher - sisi voucher (ProductsActivity + CartActivity):
 *   chip provider berwarna -> daftar per kategori (kartu 140px) -> bar keranjang
 *   mengambang -> layar keranjang penuh -> Simpan Transaksi (tanpa metode bayar).
 *
 * deps: { reload() }  - muat ulang katalog (setelah simpan / tombol coba lagi)
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

    // ---------- Chip provider ----------
    function renderChips() {
        const mount = $('voucherChips');
        const sel = store.getSelectedVoucherProvider();
        mount.innerHTML = store.getVoucherProviders().map(function (prov) {
            const bg = L.safeColor(prov.bgColor, '#4F8EF7');
            const fg = L.safeColor(prov.textColor, '#FFFFFF');
            const active = sel && sel.id === prov.id;
            return '<button type="button" class="chip chip-color' + (active ? ' active' : '') + '" data-pid="' + prov.id +
                '" style="--chip-bg:' + bg + ';--chip-fg:' + fg + '">' + (active ? '✓ ' : '') + esc(prov.name) + '</button>';
        }).join('');
    }

    // ---------- Kartu produk ----------
    function actionHtml(p, qty) {
        if (qty > 0) {
            return '<div class="counter">' +
                '<button type="button" class="cnt-btn" data-act="v-dec" aria-label="Kurang">−</button>' +
                '<span class="cnt-val">' + qty + '</span>' +
                '<button type="button" class="cnt-btn fill" data-act="v-inc" aria-label="Tambah">+</button></div>';
        }
        return '<button type="button" class="btn-add" data-act="v-add"' + (p.stock <= 0 ? ' disabled' : '') + '>+ Tambah</button>';
    }

    function cardHtml(p, prov) {
        const g1 = L.safeColor(prov.bgColor, '#4F8EF7');
        const g2 = L.shade(g1, -0.3);
        const fg = L.safeColor(prov.textColor, '#FFFFFF');
        const out = p.stock <= 0;
        return '<div class="v-card' + (out ? ' is-out' : '') + '" data-pid="' + p.id + '">' +
            '<div class="v-top">' +
                '<div class="v-name" style="background:linear-gradient(135deg,' + g1 + ',' + g2 + ');color:' + fg + '">' + esc(p.name) + '</div>' +
                '<div class="v-price">' + F.rupiah(p.price) + '</div>' +
            '</div><div class="v-sep"></div>' +
            '<div class="v-action">' + actionHtml(p, store.voucherQty(p.id)) + '</div>' +
            (out ? '<span class="badge-habis">HABIS</span>' : '') +
        '</div>';
    }

    function stateHtml(kind, text) {
        if (kind === 'loading') return '<div class="state"><div class="spinner"></div><div class="state-sub">Memuat produk…</div></div>';
        if (kind === 'error') {
            return '<div class="state"><div class="state-ico">⚠️</div><div class="state-text">' + esc(text) + '</div>' +
                '<button type="button" class="bl-btn bl-btn-outline" data-act="retry">Coba Lagi</button></div>';
        }
        return '<div class="state"><div class="state-ico">📦</div><div class="state-text">' + esc(text) + '</div></div>';
    }

    function renderBody() {
        const mount = $('voucherBody');
        const st = store.getVoucherStatus();
        if (st.status === 'loading' || st.status === 'idle') { mount.innerHTML = stateHtml('loading'); return; }
        if (st.status === 'error') { mount.innerHTML = stateHtml('error', st.error); return; }
        const prov = store.getSelectedVoucherProvider();
        const cats = store.getVoucherCategories();
        if (!prov || cats.length === 0) { mount.innerHTML = stateHtml('empty', 'Pilih provider untuk melihat produk'); return; }
        mount.innerHTML = cats.map(function (c) {
            return '<section class="cat"><h3 class="cat-title">' + esc(c.name) + '</h3>' +
                (c.products.length
                    ? '<div class="row-scroll">' + c.products.map(function (p) { return cardHtml(p, prov); }).join('') + '</div>'
                    : '<div class="state-sub">Tidak ada produk dalam kategori ini</div>') +
                '</section>';
        }).join('');
    }

    /** Perbarui satu kartu tanpa render ulang daftar. */
    function updateCard(pid) {
        const card = $('voucherBody').querySelector('.v-card[data-pid="' + pid + '"]');
        const entry = card ? findProduct(pid) : null;
        if (card && entry) card.querySelector('.v-action').innerHTML = actionHtml(entry, store.voucherQty(pid));
    }
    function findProduct(pid) {
        const cats = store.getVoucherCategories();
        for (let i = 0; i < cats.length; i++) {
            const hit = cats[i].products.find(function (p) { return p.id === pid; });
            if (hit) return hit;
        }
        return null;
    }

    function addWithFeedback(pid) {
        const r = store.voucherAdd(pid);
        if (r === 'out') UI.toast('Stok produk ini habis');
        else if (r === 'max') UI.toast('Maksimum stok tersedia: ' + store.getVoucherMax(pid));
    }

    // ---------- Bar keranjang mengambang ----------
    function updateBar() {
        const t = store.getVoucherTotals();
        $('vBarBadge').textContent = t.count;
        $('vBarCount').textContent = t.count + ' item';
        $('vBarTotal').textContent = F.rupiah(t.total);
        $('voucherCartBar').hidden = !(t.count > 0 && store.getTab() === 'voucher' && $('vCartScreen').hidden);
    }

    // ---------- Layar keranjang ----------
    function cartItemHtml(it) {
        const bg = L.safeColor(it.provider.bgColor, '#4F8EF7');
        const fg = L.safeColor(it.provider.textColor, '#FFFFFF');
        return '<div class="c-card" data-pid="' + it.product.id + '">' +
            '<div class="c-info"><span class="prov-badge" style="background:' + bg + ';color:' + fg + '">' + esc(it.providerName) + '</span>' +
            '<div class="c-name">' + esc(it.product.name) + '</div><div class="c-price">' + F.rupiah(it.unitPrice) + '</div></div>' +
            '<div class="c-qty"><button type="button" class="sq-btn" data-act="c-dec" aria-label="Kurang">−</button>' +
            '<span class="c-qty-val">' + it.qty + '</span>' +
            '<button type="button" class="sq-btn fill" data-act="c-inc" aria-label="Tambah">+</button></div>' +
            '<div class="c-sub">' + F.rupiah(it.subtotal) + '</div></div>';
    }

    function renderCart() {
        const items = store.getVoucherCartItems();
        const t = store.getVoucherTotals();
        const empty = items.length === 0;
        $('vCartList').innerHTML = items.map(cartItemHtml).join('');
        $('vCartList').hidden = empty;
        $('vCartEmpty').hidden = !empty;
        $('vCartSummary').hidden = empty;
        $('vCartItems').textContent = t.count + ' pcs';
        $('vCartTotal').textContent = F.rupiah(t.total);
        const sh = BL.Shift.display();
        $('vCartShiftEmoji').textContent = sh.emoji;
        $('vCartShift').textContent = sh.text;
    }

    function openCart() {
        $('vCartDate').textContent = F.displayDate(new Date());
        $('vCartScreen').hidden = false;
        $('voucherCartBar').hidden = true;
        renderCart();
    }
    function closeCart() {
        $('vCartScreen').hidden = true;
        updateBar();
    }

    async function clearWithConfirm() {
        const ok = await UI.modal({
            title: 'Kosongkan Keranjang',
            html: '<p class="dlg-text">Apakah Anda yakin ingin menghapus semua item dari keranjang?</p>',
            actions: [{ label: 'Batal', kind: 'ghost', value: false }, { label: 'Ya, Hapus', kind: 'danger', value: true }]
        });
        if (ok) { store.voucherClear(); renderCart(); UI.toast('Keranjang dikosongkan'); }
    }

    async function save() {
        const items = store.getVoucherCartItems();
        if (items.length === 0) { UI.toast('Keranjang kosong'); return; }
        const shift = await BL.Shift.ensureConfirmed('checkout');
        if (shift === null) return;
        const details = L.expandDetails(items.map(function (it) {
            return { productId: it.product.id, name: it.product.name, price: it.unitPrice, providerName: it.providerName, qty: it.qty };
        }), new Date());

        UI.loading(true);
        let res;
        try { res = await BL.Data.saveVoucherTransaction({ shift: shift > 0 ? shift : 1, details: details }); }
        catch (err) { console.error('[BL.Voucher] simpan gagal', err); res = { ok: false }; }
        UI.loading(false);

        if (res.ok) {
            UI.toast('✅ Transaksi berhasil disimpan!');
            store.voucherClear();
            closeCart();
            deps.reload();
        } else {
            UI.toast('❌ Gagal menyimpan transaksi');
        }
    }

    // ---------- Init ----------
    function init(s, d) {
        store = s;
        deps = d;

        $('voucherChips').addEventListener('click', function (e) {
            const chip = e.target.closest('.chip');
            if (chip) store.selectVoucherProvider(Number(chip.getAttribute('data-pid')));
        });
        $('btnVoucherRefresh').addEventListener('click', function () { deps.reload(); });

        $('voucherBody').addEventListener('click', function (e) {
            const actEl = e.target.closest('[data-act]');
            if (actEl) {
                if (actEl.disabled) return;
                const act = actEl.getAttribute('data-act');
                if (act === 'retry') { deps.reload(); return; }
                const card = actEl.closest('.v-card');
                if (!card) return;
                const pid = Number(card.getAttribute('data-pid'));
                if (act === 'v-dec') store.voucherDec(pid); else addWithFeedback(pid);
                return;
            }
            const card = e.target.closest('.v-card');
            if (card) addWithFeedback(Number(card.getAttribute('data-pid')));   // tap kartu = tambah 1 (seperti app)
        });

        $('btnOpenVCart').addEventListener('click', openCart);
        $('btnVCartBack').addEventListener('click', closeCart);
        $('btnVSave').addEventListener('click', save);
        $('btnVClear').addEventListener('click', clearWithConfirm);
        $('vCartList').addEventListener('click', function (e) {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const pid = Number(btn.closest('.c-card').getAttribute('data-pid'));
            if (btn.getAttribute('data-act') === 'c-inc') addWithFeedback(pid); else store.voucherDec(pid);
            renderCart();
        });
    }

    BL.Voucher = {
        init: init, renderChips: renderChips, renderBody: renderBody, updateCard: updateCard, updateBar: updateBar,
        renderCart: renderCart, isCartOpen: function () { return !$('vCartScreen').hidden; }
    };
})(window);
