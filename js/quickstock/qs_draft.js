/* ============================================================================
 * QS.Draft - persistensi draft cek stok di localStorage (format v2).
 *
 * v2: { v:2, ts, day:'YYYY-MM-DD', shift, store, initial:{pid:n}, entries:{pid:n} }
 * v1 (lama): { pid: stok } polos. Dimigrasi: hanya nilai yang berbeda dari stok
 * awal dianggap sudah dicek (nilai sama tidak bisa dibedakan dari "belum disentuh").
 *
 * Penyimpanan baru aktif setelah arm() dipanggil (setelah keputusan pemulihan),
 * supaya draft lama tidak terhapus oleh simpan otomatis sebelum sempat dipulihkan.
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};
    const PREFIX = 'ksp_draft_stock_';
    const SAVE_DELAY_MS = 400;
    let timer = null;
    let armed = false;
    let locked = false;

    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function keyOf(storeId) { return PREFIX + storeId; }

    function read(storeId) {
        try {
            const raw = localStorage.getItem(keyOf(storeId));
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function saveNow(store) {
        if (!armed || locked) return;
        const m = store.getMeta();
        if (m.closed || !m.storeId) return;
        const entries = store.exportEntries();
        const pids = Object.keys(entries);
        try {
            if (pids.length === 0) { localStorage.removeItem(keyOf(m.storeId)); return; }
            const initial = {};
            pids.forEach(function (k) { initial[k] = store.getInitial(Number(k)); });
            localStorage.setItem(keyOf(m.storeId), JSON.stringify({
                v: 2, ts: Date.now(), day: todayStr(), shift: m.shiftNum, store: m.storeId, initial: initial, entries: entries
            }));
        } catch (e) { /* kuota penuh / mode privat: abaikan */ }
    }

    function scheduleSave(store) {
        if (!armed || locked) return;
        clearTimeout(timer);
        timer = setTimeout(function () { saveNow(store); }, SAVE_DELAY_MS);
    }

    /** Baca draft & nilai kelayakannya terhadap data sekarang. null jika tidak ada draft berguna. */
    function peek(store) {
        const m = store.getMeta();
        const raw = read(m.storeId);
        if (!raw || typeof raw !== 'object') return null;

        const info = { version: 1, entries: {}, count: 0, mismatch: 0, sameDay: true, sameShift: true, ts: null, isClean: false };

        if (raw.v === 2 && raw.entries) {
            info.version = 2;
            info.ts = raw.ts || null;
            info.sameDay = raw.day === todayStr();
            info.sameShift = Number(raw.shift) === Number(m.shiftNum);
            Object.keys(raw.entries).forEach(function (k) {
                const pid = Number(k);
                const val = parseInt(raw.entries[k], 10);
                if (!store.getProduct(pid) || Number.isNaN(val)) return;
                info.entries[pid] = val;
                info.count++;
                if (raw.initial && raw.initial[k] !== undefined && parseInt(raw.initial[k], 10) !== store.getInitial(pid)) info.mismatch++;
            });
        } else {
            Object.keys(raw).forEach(function (k) {
                const pid = Number(k);
                const val = parseInt(raw[k], 10);
                if (!store.getProduct(pid) || Number.isNaN(val)) return;
                if (val !== store.getInitial(pid)) { info.entries[pid] = val; info.count++; }
            });
        }

        if (info.count === 0) { clear(m.storeId); return null; }
        info.isClean = info.version === 2 && info.mismatch === 0 && info.sameDay && info.sameShift;
        return info;
    }

    function apply(store, info) { store.importEntries(info.entries); }
    function clear(storeId) { try { localStorage.removeItem(keyOf(storeId)); } catch (e) { /* abaikan */ } }
    function arm() { armed = true; }
    function lock() { locked = true; clearTimeout(timer); }   // setelah submit sukses / draft dibuang: jangan simpan lagi

    /** Simpan sekarang juga (tanpa menunggu debounce). */
    function flush(store) { clearTimeout(timer); saveNow(store); }

    /** Ada hasil cek yang belum disimpan ke server dan masih layak dilindungi? */
    function hasPending(store) {
        if (locked) return false;
        if (store.getMeta().closed) return false;
        return Object.keys(store.exportEntries()).length > 0;
    }

    /** Pasang auto-save ke store + flush saat tab disembunyikan/ditutup. */
    function bind(store) {
        store.subscribe(function (e) {
            if (e.type === 'entry' || e.type === 'entries') scheduleSave(store);
        });
        const onLeave = function () { flush(store); };
        global.addEventListener('pagehide', onLeave);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') onLeave();
        });
    }

    QS.Draft = { peek: peek, apply: apply, clear: clear, arm: arm, lock: lock, flush: flush, hasPending: hasPending, bind: bind, _todayStr: todayStr };
})(window);
