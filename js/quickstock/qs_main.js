/* ============================================================================
 * QS.Main - bootstrap & orkestrasi Cek Stok Cepat.
 * Menghubungkan Store, Render, Focus, Summary, Draft, Nav, Api. Tidak berisi
 * logika bisnis: aturan ada di Store/Nav/Summary, tampilan di Render/Focus.
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};
    const UI = QS.UI;
    const $ = UI.$;

    let cred = '';
    let storeId = '';
    let empName = '';
    let store = null;
    let batching = false;     // true: abaikan event store, render sekali di akhir
    let leaving = false;      // true: pengguna sudah memilih keluar lewat dialog
    let searchTimer = null;

    function optKey(name) { return 'ksp_opt_' + name + '_' + storeId; }
    function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* abaikan */ } }

    // ---------- Render menyeluruh ----------
    function renderAll() {
        QS.Render.renderChips();
        QS.Render.renderList();
        QS.Render.updateProgress();
        QS.Render.applyModeUI();
        QS.Summary.applyModeUI();
        QS.Render.setFocusedCard(store.getCurrent(), false);
    }

    // ---------- Pemilihan produk ----------
    function selectProduct(pid, opts) {
        opts = opts || {};
        if (pid === null || pid === undefined) {
            store.setCurrent(null);
            QS.Render.setFocusedCard(null);
            if (store.isFocusUi()) QS.Focus.clear();
            return;
        }
        store.setCurrent(pid);
        QS.Render.setFocusedCard(pid, opts.scroll !== false);
        if (store.isFocusUi()) {
            QS.Focus.show(pid, !!opts.focusInput);
        } else if (opts.focusInput) {
            const inp = $('input_stock_' + pid);
            if (inp) { inp.focus(); setTimeout(function () { if (inp.select) inp.select(); }, 0); }
        }
    }

    /** Konfirmasi nilai pada input aktif (mode fokus: panel; mode daftar: input kartu). */
    function commitCurrent() {
        const pid = store.getCurrent();
        if (pid === null || store.getMeta().closed) return;
        if (store.isFocusUi()) { QS.Focus.commit(); return; }
        const inp = $('input_stock_' + pid);
        const n = inp ? parseInt(inp.value, 10) : NaN;
        if (!Number.isNaN(n)) store.setEntry(pid, n);
    }

    function announceMove(fromPid, toPid, wrapped) {
        const from = fromPid !== null ? store.getProduct(fromPid) : null;
        const to = store.getProduct(toPid);
        if (!to) return;
        if (from && from.provider !== to.provider) UI.toast('➡️ Pindah ke ' + to.provider);
        else if (wrapped) UI.toast('↩️ Kembali ke produk yang belum dicek');
    }

    /** Navigasi: 'next' | 'prev' | 'pas'. Dipakai tombol panel fokus dan tombol Enter. */
    function navigate(dir) {
        if (store.getMeta().closed) return;
        const cur = store.getCurrent();
        if (dir === 'pas' && cur !== null) store.setEntry(cur, store.getInitial(cur));
        else commitCurrent();

        if (dir === 'prev') {
            const back = QS.Nav.prev(store, cur);
            if (back.type === 'select') selectProduct(back.pid, { focusInput: true });
            else UI.toast('Sudah di produk pertama');
            return;
        }

        const res = QS.Nav.next(store, cur);
        if (res.type === 'done') {
            const left = store.getTotals().unchecked;
            UI.toast(left > 0 ? '⚠️ Masih ada ' + left + ' produk belum dicek' : '✅ Semua produk wajib sudah dicek');
            QS.Summary.open();
            return;
        }
        if (res.type === 'jump') {
            batching = true;
            const sel = store.getSetting('provider');
            if (sel !== 'all' && sel !== res.provider) store.setSetting('provider', res.provider);
            if (store.getSetting('search')) {
                store.setSetting('search', '');
                const si = $('searchInput');
                if (si) si.value = '';
            }
            batching = false;
            renderAll();
        } else if (store.getSetting('onlyUnchecked')) {
            QS.Render.renderList();   // produk yang baru dicek hilang dari filter
        }
        announceMove(cur, res.pid, res.wrapped);
        selectProduct(res.pid, { focusInput: true });
    }

    // ---------- Handler dari Render ----------
    const renderHandlers = {
        onSelect: function (pid, fromInput) {
            if (pid === null) return;
            if (fromInput) { store.setCurrent(pid); QS.Render.setFocusedCard(pid, false); return; }
            selectProduct(pid, { focusInput: true, scroll: false });
        },
        onType: function (pid, value) {
            if (pid === null || store.getMeta().closed) return;
            const n = parseInt(value, 10);
            if (!Number.isNaN(n)) store.setEntry(pid, n);
        },
        onEnter: function () { navigate('next'); },
        onAction: function (act, pid, delta) {
            if (store.getMeta().closed) return;
            if (act === 'step') {
                const inp = $('input_stock_' + pid);
                const typed = inp ? parseInt(inp.value, 10) : NaN;
                const base = Number.isNaN(typed) ? store.getFinal(pid) : typed;
                store.setEntry(pid, Math.max(0, base + delta));
            } else if (act === 'pas') {
                store.setEntry(pid, store.getInitial(pid));
            }
        },
        onProvider: function (name) { store.setSetting('provider', name); },
        onReload: function () { loadData(); }
    };

    // ---------- Reaksi terhadap perubahan store ----------
    function onSettingChanged(key) {
        if (key === 'skipZero') lsSet(optKey('skip_zero'), String(store.getSetting('skipZero')));
        if (key === 'focusMode') lsSet(optKey('focus_mode'), String(store.getSetting('focusMode')));
        renderAll();
        if (key === 'provider') {
            selectProduct(QS.Nav.first(store), { focusInput: false, scroll: false });
        } else if (key === 'focusMode' && store.getProducts().length > 0) {
            const cur = store.getCurrent();
            selectProduct(cur !== null ? cur : QS.Nav.first(store), { focusInput: false, scroll: true });
        }
    }

    function onStoreEvent(e) {
        if (batching) return;
        if (e.type === 'entry') {
            QS.Render.updateCard(e.pid);
            QS.Render.updateProgress();
            if (e.pid === store.getCurrent() && store.isFocusUi()) QS.Focus.syncState();
        } else if (e.type === 'load' || e.type === 'entries') {
            renderAll();
        } else if (e.type === 'settings') {
            onSettingChanged(e.key);
        }
    }

    // ---------- Pemuatan data & draft ----------
    async function restoreDraft() {
        if (store.getMeta().closed) return;
        const info = QS.Draft.peek(store);
        if (!info) return;
        if (info.isClean) {
            QS.Draft.apply(store, info);
            UI.toast('🔄 Draft dipulihkan (' + info.count + ' produk sudah dicek)');
            return;
        }
        const reasons = [];
        if (info.version === 1) reasons.push('format draft lama (tanpa penanda waktu)');
        if (!info.sameDay) reasons.push('dibuat bukan pada hari ini');
        if (!info.sameShift) reasons.push('berasal dari shift yang berbeda');
        if (info.mismatch > 0) reasons.push(info.mismatch + ' produk punya stok awal yang berbeda dari data saat ini');
        const when = info.ts ? ' (disimpan ' + new Date(info.ts).toLocaleString('id-ID') + ')' : '';
        const choice = await UI.dialog({
            title: '📝 Draft cek stok ditemukan',
            html: '<div class="qs-dialog-text">Ada draft ' + info.count + ' produk yang sudah dicek' + when + ', tetapi:<ul>' +
                reasons.map(function (r) { return '<li>' + UI.escapeHtml(r) + '</li>'; }).join('') +
                '</ul><p style="margin-top:8px;">Selisih bisa tidak akurat jika dipulihkan. Pulihkan tetap?</p></div>',
            actions: [
                { label: 'Buang draft', kind: 'ghost', value: 'discard' },
                { label: 'Pulihkan tetap', kind: 'primary', value: 'restore' }
            ]
        });
        if (choice === 'restore') QS.Draft.apply(store, info);
        else QS.Draft.clear(storeId);
    }

    async function loadData() {
        let res;
        try {
            res = await QS.Api.fetchStoreStock(cred, storeId);
        } catch (err) {
            console.error('[QS.Main] gagal memuat stok', err);
            alert('Terjadi kesalahan jaringan saat memuat data stok.');
            return;
        }
        if (!res.ok) {
            alert(res.message);
            if (res.redirect) global.location.href = 'karyawan.html';
            return;
        }
        const m = res.meta;
        storeId = m.storeId || storeId;
        empName = m.empName || empName;
        store.load({
            storeId: storeId, shiftNum: m.shiftNum, closed: m.alreadyClosed,
            baselineConfirmed: m.hasBaseline, products: res.products
        });

        $('topStoreName').textContent = (empName ? empName + ' • ' : '') + 'Cabang ' + storeId;
        $('badgeShiftLabel').textContent = m.shiftNum === 1 ? '☀️ Shift 1 (Pagi)' : '🌙 Shift 2 (Malam)';
        $('modalSubShift').textContent = 'Shift ' + m.shiftNum + ' • ' + (empName || 'Kasir');
        if (res.usedFallback) UI.toast('ℹ️ Memakai katalog cadangan (tabel vouchers)', 3500);

        await restoreDraft();
        QS.Draft.arm();

        if (store.isFocusUi() && store.getProducts().length > 0) {
            selectProduct(QS.Nav.first(store), { focusInput: false, scroll: false });
        }
        QS.Api.detectPlatformMode(storeId).then(QS.Summary.applyPlatformMode);
    }

    // ---------- Guard keluar ----------
    /**
     * Melindungi hasil cek yang belum disimpan:
     *  - tombol ←: dialog Tetap / Keluar (draft tersimpan) / Buang & keluar
     *  - beforeunload: peringatan bawaan browser saat tab ditutup/di-refresh
     * Tidak aktif jika belum ada yang dicek, shift terkunci, atau sudah submit.
     */
    function bindExitGuard() {
        global.addEventListener('beforeunload', function (e) {
            if (leaving || !QS.Draft.hasPending(store)) return;
            e.preventDefault();
            e.returnValue = '';
        });

        const back = $('btnBack');
        if (!back) return;
        back.addEventListener('click', async function (e) {
            if (!QS.Draft.hasPending(store)) return;   // tidak ada yang dilindungi: navigasi normal
            e.preventDefault();
            const n = Object.keys(store.exportEntries()).length;
            const choice = await UI.dialog({
                title: '🚪 Keluar dari Cek Stok?',
                html: '<div class="qs-dialog-text">Anda sudah mengecek <b>' + n + ' produk</b> dan belum menyimpan atau menutup shift.' +
                    '<ul><li><b>Keluar</b>: draft tersimpan otomatis, bisa dilanjutkan nanti.</li>' +
                    '<li><b>Buang &amp; keluar</b>: semua hasil cek dihapus.</li></ul></div>',
                actions: [
                    { label: 'Tetap di sini', kind: 'primary', value: 'stay' },
                    { label: 'Buang & keluar', kind: 'danger', value: 'discard' },
                    { label: 'Keluar (draft tersimpan)', kind: 'ghost', value: 'leave' }
                ]
            });
            if (choice === 'leave') {
                QS.Draft.flush(store);
                leaving = true;
                global.location.href = back.href;
            } else if (choice === 'discard') {
                QS.Draft.clear(storeId);
                QS.Draft.lock();
                leaving = true;
                global.location.href = back.href;
            }
        });
    }

    // ---------- Kontrol statis ----------
    function bindStaticControls() {
        $('chkSkipZeroStock').addEventListener('change', function (e) { store.setSetting('skipZero', e.target.checked); });
        $('btnOnlyUnchecked').addEventListener('click', function () { store.setSetting('onlyUnchecked', !store.getSetting('onlyUnchecked')); });
        $('btnModeFocus').addEventListener('click', function () { store.setSetting('focusMode', true); });
        $('btnModeList').addEventListener('click', function () { store.setSetting('focusMode', false); });
        $('searchInput').addEventListener('input', function (e) {
            const v = e.target.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { store.setSetting('search', v.toLowerCase().trim()); }, 120);
        });
    }

    function boot() {
        if (typeof global.applySavedTheme === 'function') global.applySavedTheme();

        cred = sessionStorage.getItem('kspcheck_emp_cred') || lsGet('kspcheck_emp_cred') || '';
        let active = null;
        const rawActive = sessionStorage.getItem('kspcheck_active_emp') || lsGet('kspcheck_active_emp');
        if (rawActive) { try { active = JSON.parse(rawActive); } catch (e) { active = null; } }
        if (!cred || !active) {
            alert('Silakan login terlebih dahulu di Portal Karyawan!');
            global.location.href = 'karyawan.html';
            return;
        }
        storeId = active.storeId || '';
        empName = active.name || active.empName || '';

        store = QS.createStore();
        store.setSetting('skipZero', lsGet(optKey('skip_zero')) === 'true');
        store.setSetting('focusMode', lsGet(optKey('focus_mode')) !== 'false');   // default: Fokus

        QS.Render.init(store, renderHandlers);
        QS.Focus.init(store, { onNavigate: navigate });
        QS.Summary.init(store, {
            cred: function () { return cred; },
            empName: function () { return empName; },
            onSubmitted: function () { /* draft sudah dikunci oleh Summary */ },
            onReviewUnchecked: function () {
                store.setSetting('onlyUnchecked', true);
                selectProduct(QS.Nav.first(store), { focusInput: false, scroll: true });
            }
        });
        QS.Draft.bind(store);
        store.subscribe(onStoreEvent);
        bindStaticControls();
        bindExitGuard();
        QS.Render.applyModeUI();

        loadData();
    }

    QS.Main = { boot: boot, reload: loadData, navigate: navigate };
    document.addEventListener('DOMContentLoaded', boot);
})(window);
