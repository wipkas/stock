/* ============================================================================
 * KSP Check - Utilitas UI bersama.
 *
 * Menyediakan `escapeHtml` & dialog konfirmasi `uiConfirm` yang aman dari
 * sentuhan tidak disengaja (accidental click/tap) di perangkat mobile.
 *
 * Pemakaian:
 *   KspUI.escapeHtml(teks)   // atau escapeHtml(teks)
 *   KspUI.confirm(opts)      // atau uiConfirm(opts) -> Promise<boolean>
 * ========================================================================== */
(function () {
    'use strict';

    // Bersihkan nama file .html dan index.html dari address bar (Clean URL di GitHub Pages)
    function cleanUrl() {
        if (typeof window === 'undefined' || !window.location) return;
        if (window.location.protocol === 'file:') return; // Aman untuk pengujian lokal file:///

        try {
            var path = window.location.pathname;
            var newPath = null;
            if (path.endsWith('/index.html')) {
                newPath = path.slice(0, -10) || '/';
            } else if (path === 'index.html') {
                newPath = './';
            } else if (path.endsWith('.html')) {
                newPath = path.slice(0, -5);
            }

            if (newPath !== null && newPath !== path) {
                window.history.replaceState(null, '', newPath + window.location.search + window.location.hash);
            }
        } catch (e) {
            /* ignore */
        }
    }

    cleanUrl();

    var ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function (m) { return ESCAPE_MAP[m]; });
    }

    // Dialog konfirmasi asinkron (Promise<boolean>) dengan animasi & proteksi aksidental
    // Opsi: { title, message, icon, confirmText, cancelText, danger, requireText }
    function uiConfirm(opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var old = document.getElementById('uiConfirmModal');
            if (old) old.remove();

            var prevFocus = document.activeElement;
            var wrap = document.createElement('div');
            wrap.id = 'uiConfirmModal';
            wrap.className = 'modal-backdrop';
            wrap.style.zIndex = '1500';
            var needText = opts.requireText ? String(opts.requireText) : '';

            wrap.innerHTML =
                '<div class="modal-card" style="max-width: 400px;">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h3 class="modal-title" id="uiConfirmTitle">' + escapeHtml(opts.icon || '⚠️') + ' ' + escapeHtml(opts.title || 'Konfirmasi') + '</h3>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<p style="font-size: 13px; line-height: 1.55; color: var(--text-main, #ffffff); white-space: pre-line; margin: 0;">' + escapeHtml(opts.message || '') + '</p>' +
                        (needText ? (
                            '<div style="margin-top: 12px;">' +
                                '<label class="form-label" for="uiConfirmInput" style="display:block; margin-bottom:6px;">Ketik <b>' + escapeHtml(needText) + '</b> untuk melanjutkan:</label>' +
                                '<input type="text" id="uiConfirmInput" class="form-input" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;">' +
                            '</div>'
                        ) : '') +
                    '</div>' +
                    '<div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px;">' +
                        '<button type="button" class="btn-secondary btn-cancel" id="uiConfirmCancel">' + escapeHtml(opts.cancelText || 'Batal') + '</button>' +
                        '<button type="button" class="' + (opts.danger ? 'btn-danger' : 'btn-primary') + ' btn-action-primary" id="uiConfirmOk">' + escapeHtml(opts.confirmText || 'Ya, Lanjutkan') + '</button>' +
                    '</div>' +
                '</div>';

            wrap.setAttribute('role', 'alertdialog');
            wrap.setAttribute('aria-modal', 'true');
            wrap.setAttribute('aria-labelledby', 'uiConfirmTitle');
            document.body.appendChild(wrap);
            document.body.classList.add('modal-open');

            var okBtn = wrap.querySelector('#uiConfirmOk');
            var cancelBtn = wrap.querySelector('#uiConfirmCancel');
            var input = wrap.querySelector('#uiConfirmInput');

            function syncOk() {
                if (!input) return;
                var match = input.value.trim().toLowerCase() === needText.toLowerCase();
                okBtn.disabled = !match;
                okBtn.style.opacity = match ? '1' : '0.5';
                okBtn.style.cursor = match ? 'pointer' : 'not-allowed';
            }

            function finish(val) {
                document.removeEventListener('keydown', onKey, true);
                wrap.classList.remove('open');
                setTimeout(function () { wrap.remove(); }, 200);
                if (!document.querySelector('.modal-backdrop.open')) {
                    document.body.classList.remove('modal-open');
                }
                if (prevFocus && typeof prevFocus.focus === 'function') {
                    try { prevFocus.focus(); } catch (e) {}
                }
                resolve(val);
            }

            function onKey(ev) {
                if (ev.key === 'Escape') {
                    ev.preventDefault();
                    ev.stopPropagation();
                    finish(false);
                } else if (ev.key === 'Enter' && ev.target === input && !okBtn.disabled) {
                    ev.preventDefault();
                    finish(true);
                } else if (ev.key === 'Tab') {
                    var f = Array.from(wrap.querySelectorAll('button:not([disabled]), input'));
                    if (!f.length) return;
                    var first = f[0], last = f[f.length - 1];
                    if (ev.shiftKey && document.activeElement === first) {
                        ev.preventDefault();
                        last.focus();
                    } else if (!ev.shiftKey && document.activeElement === last) {
                        ev.preventDefault();
                        first.focus();
                    }
                }
            }

            okBtn.addEventListener('click', function () { finish(true); });
            cancelBtn.addEventListener('click', function () { finish(false); });
            wrap.addEventListener('click', function (ev) { if (ev.target === wrap) finish(false); });
            if (input) input.addEventListener('input', syncOk);

            document.addEventListener('keydown', onKey, true);
            syncOk();

            requestAnimationFrame(function () {
                wrap.classList.add('open');
                (input || cancelBtn).focus();
            });
        });
    }

    window.KspUI = {
        escapeHtml: escapeHtml,
        confirm: uiConfirm,
        cleanUrl: cleanUrl
    };

    // Alias global agar kode lama tetap berjalan langsung.
    if (typeof window.escapeHtml !== 'function') window.escapeHtml = escapeHtml;
    if (typeof window.uiConfirm !== 'function') window.uiConfirm = uiConfirm;
})();
