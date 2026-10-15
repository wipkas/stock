/* ============================================================================
 * QS.Render - semua render DOM daftar produk, chip provider, progres & status mode.
 * Hanya membaca store; aksi pengguna diteruskan lewat `handlers` (event delegation).
 *
 * handlers: { onSelect(pid, fromInput), onType(pid, value), onEnter(pid),
 *             onAction(act, pid, delta), onProvider(name), onReload() }
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};
    const UI = QS.UI;
    const esc = UI.escapeHtml;
    const $ = UI.$;
    let store = null;
    let handlers = null;

    function setText(id, text) { const el = $(id); if (el) el.textContent = text; }
    function setDisplay(id, show, display) { const el = $(id); if (el) el.style.display = show ? (display || 'block') : 'none'; }

    /** Status tampilan sebuah produk -> { cls, text } */
    function statusOf(pid) {
        if (store.getMeta().closed) return { cls: 'delta-unchanged', text: '🔒 Dikunci' };
        if (!store.isChecked(pid)) return { cls: 'delta-pending', text: '○ Belum dicek' };
        const diff = store.getDelta(pid);
        if (diff < 0) return { cls: 'delta-sold', text: '📉 ' + diff + ' (Terjual)' };
        if (diff > 0) return { cls: 'delta-restock', text: '📈 +' + diff + ' (Restok)' };
        return { cls: 'delta-unchanged', text: '✓ Pas' };
    }

    // ---------- Kartu produk ----------
    function cardHtml(p, focusUi) {
        const pid = p.id;
        const closed = store.getMeta().closed;
        const checked = store.isChecked(pid);
        const st = statusOf(pid);
        const dis = closed ? ' disabled' : '';
        const ghost = checked ? '' : ' ghost';
        const val = store.getFinal(pid);
        const badge = '<span class="badge-delta ' + st.cls + '" id="badge_delta_' + pid + '">' + esc(st.text) + '</span>';
        const cls = 'product-card ' + (closed ? '' : (checked ? 'is-checked' : 'is-unchecked')) + (store.getCurrent() === pid ? ' focused' : '');

        let action;
        if (focusUi) {
            action = '<div class="qs-val' + ghost + '">' + val + '</div>' + badge;
        } else {
            action =
                '<div class="input-stock-box">' +
                    '<button type="button" class="btn-step" data-act="step" data-delta="-1"' + dis + '>-</button>' +
                    '<input type="number" id="input_stock_' + pid + '" class="input-stock' + ghost + '" data-role="stock"' +
                        ' inputmode="numeric" pattern="[0-9]*" min="0" enterkeyhint="next" value="' + val + '"' + dis + '>' +
                    '<button type="button" class="btn-step" data-act="step" data-delta="1"' + dis + '>+</button>' +
                '</div>' +
                '<div class="qs-status-row">' + badge +
                    (!checked && !closed ? '<button type="button" class="btn-pas" data-act="pas">✓ Pas</button>' : '') +
                '</div>';
        }

        return '<div class="' + cls + '" id="card_prod_' + pid + '" data-pid="' + pid + '">' +
            '<div class="product-info">' +
                '<div class="product-cat">' + esc(p.provider) + ' • ' + esc(p.category) + '</div>' +
                '<div class="product-name">' + esc(p.name) + '</div>' +
                '<div class="product-baseline"><span>Awal: <b>' + store.getInitial(pid) + ' pcs</b></span></div>' +
            '</div>' +
            '<div class="product-action-wrap">' + action + '</div>' +
        '</div>';
    }

    function emptyHtml() {
        if (store.getProducts().length === 0) {
            return '<div class="qs-empty-card">' +
                '<div class="ico">📦</div>' +
                '<div class="ttl">Katalog Cabang Belum Diinisialisasi</div>' +
                '<div class="dsc">Belum ada daftar produk untuk <b>Cabang ' + esc(store.getMeta().storeId) + '</b>. ' +
                'Silakan hubungi Admin untuk melakukan inisialisasi katalog melalui Web Admin.</div>' +
                '<button type="button" class="btn-modal-cancel" data-act="reload" style="border-color: var(--primary); color: var(--primary); font-weight: 750;">🔄 Muat Ulang</button>' +
            '</div>';
        }
        if (store.getSetting('onlyUnchecked') && !store.getSetting('search')) {
            return '<div class="qs-empty">🎉 Semua produk di filter ini sudah dicek.</div>';
        }
        return '<div class="qs-empty">Tidak ada produk yang cocok dengan filter atau pencarian.</div>';
    }

    function renderList() {
        const mount = $('productsListMount');
        if (!mount) return;
        const visible = store.getVisible();
        if (visible.length === 0) { mount.innerHTML = emptyHtml(); return; }
        const focusUi = store.isFocusUi();
        mount.innerHTML = visible.map(function (p) { return cardHtml(p, focusUi); }).join('');
    }

    /** Perbarui satu kartu tanpa render ulang seluruh daftar. */
    function updateCard(pid) {
        const card = $('card_prod_' + pid);
        if (!card) return;
        const closed = store.getMeta().closed;
        const checked = store.isChecked(pid);
        const st = statusOf(pid);
        card.classList.toggle('is-checked', !closed && checked);
        card.classList.toggle('is-unchecked', !closed && !checked);
        const badge = card.querySelector('.badge-delta');
        if (badge) { badge.className = 'badge-delta ' + st.cls; badge.textContent = st.text; }
        const inp = card.querySelector('input.input-stock');
        if (inp) {
            inp.classList.toggle('ghost', !checked);
            if (document.activeElement !== inp) inp.value = store.getFinal(pid);
        }
        const val = card.querySelector('.qs-val');
        if (val) { val.textContent = store.getFinal(pid); val.classList.toggle('ghost', !checked); }
        if (checked) { const pas = card.querySelector('.btn-pas'); if (pas) pas.remove(); }
    }

    function setFocusedCard(pid, scroll) {
        document.querySelectorAll('.product-card.focused').forEach(function (c) { c.classList.remove('focused'); });
        if (pid === null || pid === undefined) return;
        const card = $('card_prod_' + pid);
        if (!card) return;
        card.classList.add('focused');
        if (scroll) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // ---------- Chip provider ----------
    function chipBadgeText(unchecked, total) {
        if (store.getMeta().closed) return String(total);
        return unchecked > 0 ? String(unchecked) : '✓';
    }

    function renderChips() {
        const mount = $('providerChipsMount');
        if (!mount) return;
        const sel = store.getSetting('provider');
        const provs = store.getProviders();
        let totalUnchecked = 0;
        provs.forEach(function (g) { totalUnchecked += g.unchecked; });
        let html = '<button type="button" class="chip-provider' + (sel === 'all' ? ' active' : '') + '" data-kind="all">' +
            '<span>Semua</span><span class="chip-badge">' + chipBadgeText(totalUnchecked, store.getProducts().length) + '</span></button>';
        provs.forEach(function (g) {
            html += '<button type="button" class="chip-provider' + (sel === g.name ? ' active' : '') + '" data-prov="' + esc(g.name) + '">' +
                '<span>' + esc(g.name) + '</span><span class="chip-badge">' + chipBadgeText(g.unchecked, g.total) + '</span></button>';
        });
        mount.innerHTML = html;
    }

    /** Perbarui badge & status aktif chip tanpa membangun ulang (menjaga posisi scroll). */
    function updateChips() {
        const mount = $('providerChipsMount');
        if (!mount) return;
        const provs = store.getProviders();
        const buttons = mount.querySelectorAll('.chip-provider');
        if (buttons.length !== provs.length + 1) { renderChips(); return; }
        const sel = store.getSetting('provider');
        let totalUnchecked = 0;
        provs.forEach(function (g) { totalUnchecked += g.unchecked; });
        buttons.forEach(function (btn, i) {
            const badge = btn.querySelector('.chip-badge');
            if (i === 0) {
                btn.classList.toggle('active', sel === 'all');
                if (badge) badge.textContent = chipBadgeText(totalUnchecked, store.getProducts().length);
            } else {
                const g = provs[i - 1];
                btn.classList.toggle('active', sel === g.name);
                if (badge) badge.textContent = chipBadgeText(g.unchecked, g.total);
            }
        });
    }

    // ---------- Progres & ringkasan bawah ----------
    function updateProgress() {
        const t = store.getTotals();
        const m = store.getMeta();
        setText('progressCountText', m.closed ? 'Hanya-lihat' : t.checkedRequired + ' / ' + t.required);
        const fill = $('progressBarFill');
        if (fill) fill.style.width = (!m.closed && t.required > 0 ? (t.checkedRequired / t.required) * 100 : 0) + '%';
        setText('txtSoldSummary', t.sold + ' Terjual');
        setText('txtRestockSummary', t.restock + ' Restok');
        setText('txtUncheckedSummary', !m.closed && t.unchecked > 0 ? '○ ' + t.unchecked + ' produk belum dicek' : (!m.closed && t.required > 0 ? '✓ Semua produk sudah dicek' : ''));
        const only = $('btnOnlyUnchecked');
        if (only) {
            only.textContent = '○ Belum dicek (' + t.unchecked + ')';
            only.classList.toggle('active', !!store.getSetting('onlyUnchecked'));
        }
        updateChips();
    }

    /** Banner, tombol utama, toggle mode, dan panel fokus mengikuti state. */
    function applyModeUI() {
        const m = store.getMeta();
        const focusUi = store.isFocusUi() && store.getProducts().length > 0;
        setDisplay('bannerShiftLocked', m.closed && m.baselineConfirmed);
        setDisplay('bannerBaselineMode', !m.baselineConfirmed);

        const btn = $('btnOpenSummary');
        if (btn) {
            if (m.closed) { btn.disabled = true; btn.textContent = '🔒 Shift Sudah Ditutup'; }
            else {
                btn.disabled = false;
                btn.innerHTML = m.baselineConfirmed ? '<span>📋 Simpan &amp; Tutup Shift</span>' : '<span>📦 Review &amp; Set Stok Awal</span>';
            }
        }

        const chk = $('chkSkipZeroStock');
        if (chk) {
            chk.disabled = !m.baselineConfirmed;
            chk.checked = !!store.getSetting('skipZero') && m.baselineConfirmed;
            chk.parentElement.title = m.baselineConfirmed ? '' : 'Tidak tersedia pada mode stok awal: semua produk wajib dihitung.';
        }

        const modeFocus = $('btnModeFocus');
        const modeList = $('btnModeList');
        if (modeFocus) modeFocus.classList.toggle('active', !!store.getSetting('focusMode'));
        if (modeList) modeList.classList.toggle('active', !store.getSetting('focusMode'));

        document.body.classList.toggle('qs-focus', focusUi);
        const panel = $('focusPanel');
        if (panel) panel.classList.toggle('open', focusUi);
    }

    /** Tinggi dock -> variabel CSS; dan angkat dock di atas keyboard (mode fokus). */
    function initDock() {
        const dock = $('bottomDock');
        if (!dock) return;
        const setH = function () { document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px'); };
        setH();
        if (global.ResizeObserver) new ResizeObserver(setH).observe(dock);
        const vv = global.visualViewport;
        if (vv) {
            const adjust = function () {
                const offset = document.body.classList.contains('qs-focus')
                    ? Math.max(0, global.innerHeight - vv.height - vv.offsetTop) : 0;
                dock.style.bottom = offset + 'px';
            };
            vv.addEventListener('resize', adjust);
            vv.addEventListener('scroll', adjust);
        }
    }

    // ---------- Init & delegasi event ----------
    function pidOf(el) {
        const card = el.closest ? el.closest('.product-card') : null;
        return card ? Number(card.getAttribute('data-pid')) : null;
    }

    function init(s, h) {
        store = s;
        handlers = h;

        const list = $('productsListMount');
        list.addEventListener('click', function (e) {
            const actEl = e.target.closest('[data-act]');
            if (actEl) {
                if (actEl.disabled) return;
                const act = actEl.getAttribute('data-act');
                if (act === 'reload') { handlers.onReload(); return; }
                const pid = pidOf(actEl);
                if (pid !== null) handlers.onAction(act, pid, Number(actEl.getAttribute('data-delta')) || 0);
                return;
            }
            const pid = pidOf(e.target);
            if (pid !== null && !e.target.closest('input')) handlers.onSelect(pid, false);
        });
        list.addEventListener('focusin', function (e) {
            if (e.target.matches && e.target.matches('input[data-role="stock"]')) {
                handlers.onSelect(pidOf(e.target), true);
                if (e.target.select) setTimeout(function () { e.target.select(); }, 0);
            }
        });
        list.addEventListener('input', function (e) {
            if (e.target.matches && e.target.matches('input[data-role="stock"]')) handlers.onType(pidOf(e.target), e.target.value);
        });
        list.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-role="stock"]')) {
                e.preventDefault();
                handlers.onEnter(pidOf(e.target));
            }
        });

        $('providerChipsMount').addEventListener('click', function (e) {
            const btn = e.target.closest('.chip-provider');
            if (!btn) return;
            handlers.onProvider(btn.getAttribute('data-kind') === 'all' ? 'all' : btn.getAttribute('data-prov'));
        });

        initDock();
    }

    QS.Render = {
        init: init, statusOf: statusOf, renderList: renderList, renderChips: renderChips, updateChips: updateChips,
        updateCard: updateCard, setFocusedCard: setFocusedCard, updateProgress: updateProgress, applyModeUI: applyModeUI
    };
})(window);
