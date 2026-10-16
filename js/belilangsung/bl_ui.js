/* ============================================================================
 * BL.UI - helper UI umum: escapeHtml, toast, loading, modal (Promise), bottom sheet,
 * deteksi tekan-lama. Tanpa dependensi ke modul BL lain.
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    let toastTimer = null;
    let loadingCount = 0;

    function $(id) { return document.getElementById(id); }

    function esc(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function toast(message, ms) {
        const el = $('blToast');
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
    }

    /** Overlay "memproses..." berhitung (aman dipanggil bertumpuk). */
    function loading(on) {
        loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
        const el = $('blLoading');
        if (el) el.hidden = loadingCount === 0;
    }

    /**
     * Modal berbasis Promise.
     * opts: { title, html, actions:[{label, kind:'primary'|'ghost'|'danger', value}],
     *         cancellable (default true), onOpen(bodyEl, close) }
     * Resolve dengan value tombol / nilai close(); null jika dibatalkan lewat backdrop.
     */
    function modal(opts) {
        return new Promise(function (resolve) {
            const root = $('blModal');
            $('blModalTitle').textContent = opts.title || '';
            $('blModalBody').innerHTML = opts.html || '';
            const footer = $('blModalFooter');
            footer.innerHTML = '';
            footer.hidden = !(opts.actions && opts.actions.length);
            let closed = false;

            function close(value) {
                if (closed) return;
                closed = true;
                root.classList.remove('open');
                root.removeEventListener('mousedown', onBackdrop);
                resolve(value === undefined ? null : value);
            }
            function onBackdrop(e) { if (e.target === root && opts.cancellable !== false) close(null); }
            root.addEventListener('mousedown', onBackdrop);

            (opts.actions || []).forEach(function (a) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'bl-btn bl-btn-' + (a.kind || 'ghost');
                btn.textContent = a.label;
                btn.addEventListener('click', function () { close(a.value); });
                footer.appendChild(btn);
            });
            root.classList.add('open');
            if (opts.onOpen) opts.onOpen($('blModalBody'), close);
        });
    }

    function openSheet(id) {
        const backdrop = $(id);
        backdrop.hidden = false;
        requestAnimationFrame(function () { backdrop.classList.add('open'); });
    }
    function closeSheet(id) {
        const backdrop = $(id);
        backdrop.classList.remove('open');
        backdrop.hidden = true;
    }

    /**
     * Tekan-lama pada elemen anak yang cocok `selector` di dalam `root`.
     * Sentuh: pointerdown + timer. Mouse: klik kanan (contextmenu). Klik berikutnya diredam.
     */
    function onLongPress(root, selector, cb, ms) {
        let timer = null;
        let fired = false;
        let lastFire = 0;
        function fire(el) { fired = true; lastFire = Date.now(); cb(el); }
        function cancel() { clearTimeout(timer); timer = null; }

        root.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const hit = e.target.closest(selector);
            if (!hit || e.target.closest('button')) return;
            fired = false;
            cancel();
            if (e.pointerType !== 'mouse') timer = setTimeout(function () { fire(hit); }, ms || 450);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { root.addEventListener(t, cancel); });
        root.addEventListener('contextmenu', function (e) {
            const hit = e.target.closest(selector);
            if (!hit) return;
            e.preventDefault();
            if (Date.now() - lastFire > 700) fire(hit);
        });
        root.addEventListener('click', function (e) {
            if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; }
        }, true);
    }

    BL.UI = { $: $, esc: esc, toast: toast, loading: loading, modal: modal, openSheet: openSheet, closeSheet: closeSheet, onLongPress: onLongPress };
})(window);
