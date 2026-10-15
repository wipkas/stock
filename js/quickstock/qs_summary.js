/* ============================================================================
 * QS.Summary - modal rekap, aturan produk belum dicek, pembuatan payload & submit.
 *
 * deps: { cred(): string, onReviewUnchecked(), onSubmitted() }
 *
 * Aturan produk belum dicek:
 *   - Mode baseline (stok awal cabang): WAJIB semua dicek, tombol simpan terkunci.
 *   - Mode lain: boleh disimpan hanya setelah kasir mencentang "anggap pas".
 *   - Payload tetap mengirim semua produk (kompatibel dengan RPC); yang belum dicek
 *     dikirim new_stock = initial_stock dengan checked:false.
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};
    const UI = QS.UI;
    const esc = UI.escapeHtml;
    const $ = UI.$;
    let store = null;
    let deps = null;
    let submitting = false;
    let platformMode = null;

    function show(id, on, display) { const el = $(id); if (el) el.style.display = on ? (display || 'block') : 'none'; }

    function sessionType() {
        if (!store.getMeta().baselineConfirmed) return 'initial_baseline';
        const checked = document.querySelector('input[name="radOpnameType"]:checked');
        return checked ? checked.value : 'shift_sales';
    }

    function submitLabel() {
        const t = sessionType();
        if (t === 'initial_baseline') return '🚀 Tetapkan Stok Awal';
        if (t === 'stock_adjustment') return '⚖️ Simpan Koreksi Stok';
        return '🚀 Simpan & Tutup Shift';
    }

    // ---------- Tampilan rekap ----------
    function changedHtml() {
        const groups = Object.create(null);
        const order = [];
        store.getProducts().forEach(function (p) {
            const diff = store.getDelta(p.id);
            if (diff === 0) return;
            if (!groups[p.provider]) { groups[p.provider] = []; order.push(p.provider); }
            groups[p.provider].push({ p: p, init: store.getInitial(p.id), fin: store.getFinal(p.id), diff: diff });
        });
        if (order.length === 0) return '<div class="qs-empty-note">Tidak ada selisih penjualan maupun restok pada produk yang sudah dicek.</div>';
        return order.map(function (prov) {
            return '<div class="qs-group-title">' + esc(prov) + '</div>' + groups[prov].map(function (r) {
                const color = r.diff < 0 ? 'var(--danger)' : 'var(--success)';
                const label = r.diff < 0 ? 'Terjual ' + Math.abs(r.diff) : 'Restok +' + r.diff;
                return '<div class="qs-row"><div><b>' + esc(r.p.name) + '</b></div>' +
                    '<div style="text-align:right;color:' + color + ';font-weight:800;">' + esc(label) + ' pcs ' +
                    '<span style="color:var(--text-muted);font-weight:600;">(' + r.init + ' → ' + r.fin + ')</span></div></div>';
            }).join('');
        }).join('');
    }

    function uncheckedHtml() {
        const groups = Object.create(null);
        const order = [];
        store.getUnchecked().forEach(function (p) {
            if (!groups[p.provider]) { groups[p.provider] = []; order.push(p.provider); }
            groups[p.provider].push(p.name);
        });
        return order.map(function (prov) {
            return '<div><b>' + esc(prov) + '</b> (' + groups[prov].length + '): ' + groups[prov].map(esc).join(', ') + '</div>';
        }).join('');
    }

    function updateSubmitState() {
        const t = store.getTotals();
        const baseline = !store.getMeta().baselineConfirmed;
        const ack = $('chkAckUnchecked');
        const blocked = t.unchecked > 0 && (baseline || !(ack && ack.checked));
        const btn = $('btnConfirmSubmitOpname');
        if (btn) { btn.disabled = submitting || blocked; btn.textContent = submitting ? '⏳ Menyimpan...' : submitLabel(); }
    }

    function applyModeUI() {
        const baseline = !store.getMeta().baselineConfirmed;
        const adj = sessionType() === 'stock_adjustment';
        show('containerOpnameType', !baseline);
        show('modalBaselineNotice', baseline);
        show('boxSyncHistory', !baseline && !adj);
        updateSubmitState();
    }

    function applyPlatformMode(mode) {
        platformMode = mode;
        const chk = $('chkSyncToHistory');
        const desc = $('descSyncHistory');
        if (!chk || !desc) return;
        if (mode === 'android') {
            chk.checked = false;
            desc.innerHTML = '📱 <b>Cabang HP Android KSP Check:</b> penjualan voucher sudah otomatis dicatat lewat aplikasi di HP Android. Opsi ini dinonaktifkan agar tidak tercatat dobel (centang manual bila memang diperlukan).';
        } else if (mode === 'web') {
            chk.checked = true;
            desc.innerHTML = '🌐 <b>Cabang Murni Web:</b> selisih stok yang berkurang akan otomatis dicatat sebagai transaksi penjualan voucher ke <b>store_history.html</b>.';
        }
    }

    function open() {
        const m = store.getMeta();
        if (m.closed) { UI.toast('Shift hari ini sudah ditutup.'); return; }
        const t = store.getTotals();
        $('sumTotalChecked').textContent = t.checkedRequired + ' / ' + t.required;
        $('sumTotalUnchecked').textContent = String(t.unchecked);
        $('sumTotalUnchecked').style.color = t.unchecked > 0 ? 'var(--warning)' : 'var(--success)';
        $('sumTotalSold').textContent = t.sold + ' pcs';
        $('sumTotalRestock').textContent = t.restock + ' pcs';
        $('summaryItemsListMount').innerHTML = changedHtml();

        const baseline = !m.baselineConfirmed;
        const box = $('summaryUncheckedBox');
        box.style.display = t.unchecked > 0 ? 'flex' : 'none';
        if (t.unchecked > 0) {
            $('summaryUncheckedTitle').textContent = '⚠️ ' + t.unchecked + ' produk belum dicek';
            $('summaryUncheckedList').innerHTML = uncheckedHtml();
            show('summaryBaselineBlock', baseline);
            show('summaryAckRow', !baseline, 'flex');
            $('summaryAckText').textContent = 'Saya mengerti: ' + t.unchecked + ' produk yang belum dicek dianggap Pas (stok tidak berubah).';
        }
        $('chkAckUnchecked').checked = false;
        applyModeUI();
        $('summaryModal').classList.add('open');
    }

    function close() { $('summaryModal').classList.remove('open'); }

    // ---------- Payload ----------
    function buildPayload(type, syncToHistory) {
        const m = store.getMeta();
        const t = store.getTotals();
        const emp = deps.empName();
        const details = store.getProducts().map(function (p) {
            return {
                product_id: p.id, product_name: p.name, provider_name: p.providerRaw, category_name: p.categoryRaw,
                initial_stock: store.getInitial(p.id), new_stock: store.getFinal(p.id), delta: store.getDelta(p.id),
                sell_price: p.sell, cost_price: p.cost, checked: store.isChecked(p.id)
            };
        });
        const lines = details.filter(function (d) { return d.delta !== 0; })
            .map(function (d) { return '- ' + d.product_name + ': ' + d.initial_stock + ' → ' + d.new_stock + ' (' + (d.delta > 0 ? '+' : '') + d.delta + ')'; });
        const head = type === 'initial_baseline' ? 'STOK AWAL CABANG (BASELINE)' : (type === 'stock_adjustment' ? 'KOREKSI STOK FISIK' : 'TUTUP SHIFT ' + m.shiftNum);
        let summary = head + ' - ' + (emp || 'Kasir') + '\nDicek: ' + t.checkedAll + '/' + t.total + ' produk | Terjual: ' + t.sold + ' | Restok: ' + t.restock;
        if (t.unchecked > 0) summary += '\nBelum dicek (dianggap pas): ' + t.unchecked;
        if (lines.length) summary += '\n' + lines.join('\n');
        return {
            store_name: m.storeId, shift_num: m.shiftNum, session_type: type, is_baseline: type === 'initial_baseline',
            sync_to_history: syncToHistory, total_products: t.total, total_initial: t.initialSum, total_final: t.finalSum,
            total_sold: t.sold, total_restock: t.restock, total_diff: t.finalSum - t.initialSum,
            unchecked_count: t.unchecked, details: details, summary_text: summary
        };
    }

    async function submit() {
        if (submitting) return;
        const t = store.getTotals();
        const baseline = !store.getMeta().baselineConfirmed;
        if (t.unchecked > 0 && (baseline || !$('chkAckUnchecked').checked)) { updateSubmitState(); return; }

        const type = sessionType();
        const syncChk = $('chkSyncToHistory');
        const syncToHistory = type === 'shift_sales' && !!(syncChk && syncChk.checked);
        submitting = true;
        updateSubmitState();
        try {
            const res = await QS.Api.submitOpname(deps.cred(), buildPayload(type, syncToHistory));
            if (res && res.ok) {
                QS.Draft.clear(store.getMeta().storeId);
                QS.Draft.lock();
                deps.onSubmitted();
                const emp = deps.empName();
                if (type === 'initial_baseline') {
                    alert('✅ Stok Fisik Awal Berhasil Ditetapkan!\n\n• Angka fisik ini resmi menjadi patokan stok awal Cabang ' + store.getMeta().storeId + '.\n• TIDAK ada transaksi penjualan yang dicatat ke HistoriKu (uang kasir aman).');
                } else if (type === 'stock_adjustment') {
                    alert('✅ Koreksi Stok Fisik Berhasil Disimpan!\n\n• Stok berjalan cabang sudah diperbarui sesuai hitungan fisik.\n• Koreksi ini TIDAK dicatat sebagai penjualan.');
                } else {
                    const tx = res.history_tx_created || 0;
                    alert('✅ Shift ' + store.getMeta().shiftNum + ' berhasil ditutup' + (emp ? ', ' + emp : '') + '!\n\n• Terjual: ' + t.sold + ' pcs | Restok: ' + t.restock + ' pcs' +
                        '\n• ' + (res.android_tx_existed ? 'Transaksi dari HP Android sudah ada, web tidak mencatat ulang.' : (tx > 0 ? tx + ' transaksi penjualan dicatat ke riwayat.' : 'Tidak ada transaksi baru dicatat ke riwayat.')));
                }
                global.location.href = 'karyawan.html';
                return;
            }
            const msg = res && (res.message || res.error) ? (res.message || res.error) : 'Koneksi ditolak';
            alert('❌ Gagal menyimpan: ' + msg);
            if (res && res.error === 'shift_already_closed') global.location.reload();
        } catch (err) {
            console.error('[QS.Summary] submit gagal', err);
            alert('❌ Terjadi kesalahan jaringan saat menyimpan. Draft Anda tetap aman, coba lagi.');
        }
        submitting = false;
        updateSubmitState();
    }

    function init(s, d) {
        store = s;
        deps = d;
        $('btnOpenSummary').addEventListener('click', open);
        $('btnCloseSummary').addEventListener('click', close);
        $('btnContinueCheck').addEventListener('click', close);
        $('btnConfirmSubmitOpname').addEventListener('click', submit);
        $('btnReviewUnchecked').addEventListener('click', function () { close(); deps.onReviewUnchecked(); });
        $('chkAckUnchecked').addEventListener('change', updateSubmitState);
        document.querySelectorAll('input[name="radOpnameType"]').forEach(function (r) { r.addEventListener('change', applyModeUI); });
    }

    QS.Summary = { init: init, open: open, close: close, applyModeUI: applyModeUI, applyPlatformMode: applyPlatformMode, buildPayload: buildPayload };
})(window);
