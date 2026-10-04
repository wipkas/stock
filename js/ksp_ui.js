/* ============================================================================
 * KSP Check - Utilitas UI bersama.
 *
 * Menggantikan salinan `escapeHtml` yang sebelumnya diulang di setiap halaman.
 * Perilaku dipertahankan sama dengan versi lama: nilai falsy -> string kosong.
 *
 * Pemakaian:
 *   KspUI.escapeHtml(teks)   // atau cukup escapeHtml(teks) (alias global)
 * ========================================================================== */
(function () {
    'use strict';

    var ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function (m) { return ESCAPE_MAP[m]; });
    }

    window.KspUI = {
        escapeHtml: escapeHtml
    };

    // Alias global agar kode lama (onclick inline, template string) tetap berjalan.
    if (typeof window.escapeHtml !== 'function') window.escapeHtml = escapeHtml;
})();
