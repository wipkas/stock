/* ============================================================================
 * BL.Checkout - checkout Beli Barang: bottom sheet kasir (daftar belanja, total,
 * metode bayar, tunai + saran nominal + kembalian) dan dialog struk.
 * Port dari BeliBarangActivity.openCheckoutBottomSheet / processTransaction / showReceiptDialog.
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
    let payMethod = 'TUNAI';
    let submitting = false;

    function close() { UI.closeSheet('checkoutBackdrop'); }

    function paintPay() {
        document.querySelectorAll('#shPay .pay-chip').forEach(function (c) {
            c.classList.toggle('active', c.getAttribute('data-pay') === payMethod);
        });
        $('shCashBox').hidden = payMethod !== 'TUNAI';
    }

    function itemHtml(it) {
        return '<div class="sh-item" data-pid="' + it.product.id + '">' +
            '<div class="sh-info"><div class="sh-name">' + esc(it.product.name) + '</div>' +
            '<div class="sh-meta">@ ' + F.rupiah(it.unitPrice) + ' <span class="dot">•</span> <b>Subtotal: ' + F.rupiah(it.subtotal) + '</b></div></div>' +
            '<div class="stepper small"><button type="button" class="st-btn" data-act="c-dec" aria-label="Kurang">−</button>' +
            '<span class="st-val">' + it.qty + '</span>' +
            '<button type="button" class="st-btn" data-act="c-inc" aria-label="Tambah">+</button></div>' +
            '<button type="button" class="del-btn" data-act="c-del" aria-label="Hapus">🗑️</button></div>';
    }

    function renderQuickChips(total) {
        $('shQuick').innerHTML = L.quickCashSuggestions(total).map(function (n) {
            return n === total
                ? '<button type="button" class="quick pas" data-cash="' + n + '">Uang Pas</button>'
                : '<button type="button" class="quick" data-cash="' + n + '">' + F.number(n) + '</button>';
        }).join('');
    }

    function updateChange() {
        const total = store.getBarangTotals().total;
        const info = L.changeInfo(total, F.digitsToNumber($('shCashInput').value));
        const el = $('shChange');
        el.textContent = info.text;
        el.className = 'change ' + info.kind;
    }

    /** Render ulang isi sheet (daftar, total, saran nominal, kembalian). Sheet menutup bila keranjang kosong. */
    function render() {
        const items = store.getBarangCartItems();
        if (items.length === 0) { close(); return; }
        const t = store.getBarangTotals();
        $('shItems').innerHTML = items.map(itemHtml).join('');
        $('shCount').textContent = 'Total (' + t.count + ' Barang)';
        $('shTotal').textContent = F.rupiah(t.total);
        renderQuickChips(t.total);
        updateChange();
    }

    function open() {
        if (store.getBarangCartItems().length === 0) { UI.toast('Keranjang belanja kosong'); return; }
        const sh = BL.Shift.display();
        $('shShift').textContent = sh.emoji + ' ' + sh.text;
        payMethod = 'TUNAI';
        paintPay();
        $('shCashInput').value = F.number(store.getBarangTotals().total);   // uang pas sebagai nilai awal
        render();
        UI.openSheet('checkoutBackdrop');
    }

    // ---------- Struk ----------
    function showReceipt(r) {
        $('receiptContent').textContent = L.receiptText(r);
        $('receiptModal').classList.add('open');
    }
    function printReceipt() {
        if (BL.Data.getScenario().printer) UI.toast('✅ Struk berhasil dicetak ke printer! (simulasi)');
        else UI.toast('Printer belum terhubung. Silakan hubungkan printer Bluetooth.', 3500);
    }

    // ---------- Proses transaksi ----------
    async function processTransaction(method, paid, total, shift) {
        const items = store.getBarangCartItems();
        const now = new Date();
        const details = L.expandDetails(items.map(function (it) {
            return { productId: it.product.id, name: it.product.name, price: it.unitPrice, providerName: it.providerName, qty: it.qty };
        }), now);

        UI.loading(true);
        let res;
        try { res = await BL.Data.saveBarangTransaction({ shift: shift, method: method, total: total, paid: paid, details: details }); }
        catch (err) { console.error('[BL.Checkout] simpan gagal', err); res = { ok: false }; }
        UI.loading(false);

        if (!res.ok) { UI.toast('❌ Gagal menyimpan transaksi', 3200); return; }
        UI.toast('✅ Transaksi berhasil!');
        showReceipt({
            time: F.dateTime(now), shift: shift, method: method, total: total, paid: paid, change: Math.max(0, paid - total),
            items: items.map(function (it) { return { name: it.product.name, qty: it.qty, subtotal: it.subtotal }; })
        });
        store.barangClear();
        deps.reload();
    }

    async function submit() {
        if (submitting) return;
        const total = store.getBarangTotals().total;
        let paid = total;
        if (payMethod === 'TUNAI') {
            paid = F.digitsToNumber($('shCashInput').value);
            if (paid < total) { UI.toast('Uang tunai kurang dari total belanja!'); return; }
        }
        submitting = true;
        try {
            const shift = await BL.Shift.ensureConfirmed('checkout barang');
            if (shift === null) return;
            close();
            await processTransaction(payMethod, paid, total, shift > 0 ? shift : 1);
        } finally {
            submitting = false;
        }
    }

    // ---------- Init ----------
    function init(s, d) {
        store = s;
        deps = d;
        const backdrop = $('checkoutBackdrop');
        backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop) close(); });

        $('shItems').addEventListener('click', function (e) {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const pid = Number(btn.closest('.sh-item').getAttribute('data-pid'));
            const act = btn.getAttribute('data-act');
            if (act === 'c-inc') {
                const r = store.barangAdd(pid);
                if (r === 'max') UI.toast('Maksimum stok tersedia: ' + (store.getBarangProduct(pid) || {}).stock);
            } else if (act === 'c-dec') store.barangDec(pid);
            else if (act === 'c-del') store.barangRemove(pid);
            render();
        });

        $('shClear').addEventListener('click', function () {
            store.barangClear();
            close();
            UI.toast('Keranjang dikosongkan');
        });

        $('shPay').addEventListener('click', function (e) {
            const chip = e.target.closest('.pay-chip');
            if (!chip) return;
            payMethod = chip.getAttribute('data-pay');
            paintPay();
        });

        const cash = $('shCashInput');
        cash.addEventListener('input', function () {
            const n = F.digitsToNumber(cash.value);
            cash.value = /\d/.test(cash.value) ? F.number(n) : '';
            updateChange();
        });
        $('shQuick').addEventListener('click', function (e) {
            const q = e.target.closest('.quick');
            if (!q) return;
            cash.value = F.number(Number(q.getAttribute('data-cash')));
            updateChange();
        });

        $('shSubmit').addEventListener('click', submit);
        $('btnPrint').addEventListener('click', printReceipt);
        $('btnReceiptDone').addEventListener('click', function () { $('receiptModal').classList.remove('open'); });
    }

    BL.Checkout = { init: init, open: open };
})(window);
