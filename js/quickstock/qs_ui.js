/* ============================================================================
 * QS.UI - helper UI umum Cek Stok Cepat: escapeHtml, toast, dialog konfirmasi.
 * Tanpa dependensi ke modul QS lain.
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};
    let toastTimer = null;

    function $(id) { return document.getElementById(id); }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toast(message, ms) {
        const el = $('qsToast');
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
    }

    /**
     * Dialog konfirmasi berbasis Promise.
     * opts: { title, html, actions: [{ label, kind: 'primary'|'ghost'|'danger', value }] }
     * Resolve dengan value tombol yang ditekan.
     */
    function dialog(opts) {
        return new Promise(function (resolve) {
            const root = $('qsDialog');
            if (!root) { resolve(null); return; }
            $('qsDialogTitle').textContent = opts.title || '';
            $('qsDialogBody').innerHTML = opts.html || '';
            const footer = $('qsDialogFooter');
            footer.innerHTML = '';
            function done(value) { root.classList.remove('open'); resolve(value); }
            (opts.actions || []).forEach(function (a) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'qs-btn qs-btn-' + (a.kind || 'ghost');
                btn.textContent = a.label;
                btn.addEventListener('click', function () { done(a.value); });
                footer.appendChild(btn);
            });
            root.classList.add('open');
        });
    }

    QS.UI = { $: $, escapeHtml: escapeHtml, toast: toast, dialog: dialog };
})(window);
