/* ============================================================================
 * BL.Format - format angka/tanggal Beli Langsung (murni, tanpa DOM).
 * Meniru format app Android: titik pemisah ribuan, "Rp 25.000",
 * waktu transaksi "yyyy-MM-dd HH:mm:ss", tampilan "dd MMM yyyy HH:mm".
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    const pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

    /** 1234567 -> "1.234.567" (tanpa bergantung pada ICU/locale browser). */
    function number(n) {
        const v = Math.trunc(Number(n) || 0);
        return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function rupiah(n) { return 'Rp ' + number(n); }

    /** "Rp 25.000" / "25.000" / "25abc000" -> 25000 (mengambil digit saja, seperti replaceAll("[^\\d]")). */
    function digitsToNumber(s) {
        const d = String(s === null || s === undefined ? '' : s).replace(/[^\d]/g, '');
        return d === '' ? 0 : parseInt(d, 10);
    }

    function padEnd(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
    function padStart(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

    /** yyyy-MM-dd HH:mm:ss */
    function dateTime(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
            pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    /** dd MMM yyyy HH:mm (tampilan tanggal di keranjang voucher) */
    function displayDate(d) {
        return pad2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    BL.Format = {
        number: number, rupiah: rupiah, digitsToNumber: digitsToNumber,
        padEnd: padEnd, padStart: padStart, dateTime: dateTime, displayDate: displayDate
    };
})(window);
