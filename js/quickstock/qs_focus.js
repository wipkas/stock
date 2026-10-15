/* ============================================================================
 * QS.Focus - panel input mode Fokus (satu produk aktif + Prev/Pas/Next).
 *
 * handlers: { onNavigate('next' | 'prev' | 'pas') }
 * Panel hanya menulis ke store lewat setEntry; navigasi diputuskan oleh pemanggil.
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};
    const UI = QS.UI;
    const $ = UI.$;
    let store = null;
    let handlers = null;
    const el = {};

    function parseInput() {
        const raw = el.input.value.trim();
        if (raw === '') return null;
        const n = parseInt(raw, 10);
        return Number.isNaN(n) ? null : Math.max(0, n);
    }

    function selectInputSoon() {
        setTimeout(function () { if (el.input.select) el.input.select(); }, 0);
    }

    function onType() {
        const pid = store.getCurrent();
        if (pid === null || store.getMeta().closed) return;
        const n = parseInput();
        if (n !== null) store.setEntry(pid, n);   // event 'entry' -> main memanggil syncState()
    }

    function step(delta) {
        const pid = store.getCurrent();
        if (pid === null || store.getMeta().closed) return;
        const base = parseInput();
        const n = Math.max(0, (base === null ? store.getFinal(pid) : base) + delta);
        el.input.value = n;
        store.setEntry(pid, n);
    }

    /** Konfirmasi nilai di input sebagai "dicek". Input kosong = tidak mengubah apa pun. */
    function commit() {
        const pid = store.getCurrent();
        if (pid === null || store.getMeta().closed) return false;
        const n = parseInput();
        if (n === null) return false;
        store.setEntry(pid, n);
        return true;
    }

    /** Sinkronkan badge/ghost/tombol dengan state; TIDAK menyentuh nilai input (agar tidak mengganggu pengetikan). */
    function syncState() {
        const pid = store.getCurrent();
        if (pid === null || !store.getProduct(pid)) return;
        const st = QS.Render.statusOf(pid);
        el.delta.className = 'badge-delta ' + st.cls;
        el.delta.textContent = st.text;
        el.input.classList.toggle('ghost', !store.isChecked(pid));
    }

    /** Tampilkan produk di panel. focusInput=true -> fokus ke input (membuka keyboard). */
    function show(pid, focusInput) {
        const p = store.getProduct(pid);
        if (!p) { clear(); return; }
        const closed = store.getMeta().closed;
        el.cat.textContent = p.provider + ' — ' + p.category;
        el.name.textContent = p.name;
        el.initial.textContent = store.getInitial(pid);
        el.input.value = store.getFinal(pid);
        el.input.disabled = closed;
        el.minus.disabled = closed;
        el.plus.disabled = closed;
        el.pas.disabled = closed;
        el.prev.disabled = false;
        el.next.disabled = false;
        syncState();
        if (focusInput && !closed) { el.input.focus(); selectInputSoon(); }
    }

    function clear() {
        el.cat.textContent = '–';
        el.name.textContent = 'Pilih produk untuk mulai';
        el.initial.textContent = '–';
        el.input.value = '';
        el.input.disabled = true;
        el.minus.disabled = true;
        el.plus.disabled = true;
        el.pas.disabled = true;
        el.delta.className = 'badge-delta delta-unchanged';
        el.delta.textContent = '–';
    }

    function init(s, h) {
        store = s;
        handlers = h;
        ['cat', 'name', 'initial', 'delta', 'input', 'minus', 'plus', 'prev', 'pas', 'next'].forEach(function (k) {
            el[k] = $('fp' + k.charAt(0).toUpperCase() + k.slice(1));
        });
        el.input.addEventListener('input', onType);
        el.input.addEventListener('focus', selectInputSoon);
        el.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); handlers.onNavigate('next'); }
        });
        el.minus.addEventListener('click', function () { step(-1); });
        el.plus.addEventListener('click', function () { step(1); });
        el.prev.addEventListener('click', function () { handlers.onNavigate('prev'); });
        el.pas.addEventListener('click', function () { handlers.onNavigate('pas'); });
        el.next.addEventListener('click', function () { handlers.onNavigate('next'); });
        clear();
    }

    QS.Focus = { init: init, show: show, clear: clear, commit: commit, syncState: syncState };
})(window);
