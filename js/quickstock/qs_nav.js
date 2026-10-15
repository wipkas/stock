/* ============================================================================
 * QS.Nav - logika navigasi antar produk (murni, tanpa DOM).
 *
 * Urutan dasar = urutan master `store.getProducts()` (sudah dikelompokkan per
 * provider). "Terlihat" mengikuti filter provider/pencarian/lewati stok 0/belum dicek.
 *
 * Hasil navigasi:
 *   { type:'select', pid, wrapped? }            -> pilih produk (terlihat)
 *   { type:'jump',   pid, provider, wrapped? }  -> produk belum dicek yang tersembunyi filter;
 *                                                  pemanggil menyesuaikan filter lalu memilihnya
 *   { type:'done' }                             -> semua produk wajib sudah dicek
 *   { type:'none' }                             -> tidak ada tujuan (khusus prev)
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};

    /** Produk berikutnya. Di ujung daftar: cari produk wajib yang belum dicek (melingkar). */
    function next(store, fromId) {
        const list = store.getProducts();
        const n = list.length;
        if (n === 0) return { type: 'done' };
        const start = fromId === null || fromId === undefined ? -1 : store.indexOf(fromId);

        // a) produk terlihat berikutnya (apa pun statusnya, seperti app)
        for (let i = start + 1; i < n; i++) {
            if (store.isVisible(list[i].id)) return { type: 'select', pid: list[i].id };
        }

        // b) ujung daftar: cari yang wajib & belum dicek, mulai setelah posisi sekarang, melingkar
        for (let k = 1; k <= n; k++) {
            const idx = start + k;
            const cand = list[((idx % n) + n) % n];
            if (cand.id === fromId) continue;
            if (!store.isRequired(cand.id) || store.isChecked(cand.id)) continue;
            const wrapped = idx >= n;
            if (store.isVisible(cand.id)) return { type: 'select', pid: cand.id, wrapped: wrapped };
            return { type: 'jump', pid: cand.id, provider: cand.provider, wrapped: wrapped };
        }
        return { type: 'done' };
    }

    /** Produk terlihat sebelumnya. */
    function prev(store, fromId) {
        const list = store.getProducts();
        const start = fromId === null || fromId === undefined ? -1 : store.indexOf(fromId);
        for (let i = start - 1; i >= 0; i--) {
            if (store.isVisible(list[i].id)) return { type: 'select', pid: list[i].id };
        }
        return { type: 'none' };
    }

    /** Target awal: produk terlihat pertama yang wajib & belum dicek, jika tidak ada produk terlihat pertama. */
    function first(store) {
        const list = store.getProducts();
        let firstVisible = null;
        for (let i = 0; i < list.length; i++) {
            const id = list[i].id;
            if (!store.isVisible(id)) continue;
            if (firstVisible === null) firstVisible = id;
            if (store.isRequired(id) && !store.isChecked(id)) return id;
        }
        return firstVisible;
    }

    QS.Nav = { next: next, prev: prev, first: first };
})(window);
