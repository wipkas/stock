/* ============================================================================
 * BL.Shift - "pastikan shift benar sebelum simpan" (port ShiftSaveGuard +
 * EmployeeApprovalDialog). Satu pintu untuk kedua checkout (voucher & barang).
 *
 *   await BL.Shift.ensureConfirmed('checkout')  -> shift (1|2) atau null jika dibatalkan
 *
 * Alur: tidak perlu konfirmasi -> langsung lanjut. Perlu (masa transisi / shift tidak
 * cocok jam) -> pilih shift -> persetujuan karyawan (pola ATAU sandi, maks 5 percobaan).
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    const UI = BL.UI;
    const L = BL.Logic;
    const MAX_ATTEMPTS = 5;
    let changeListener = null;

    /** Dipanggil setiap kali shift dipilih ulang lewat dialog (agar indikator di layar ikut berubah). */
    function onChange(fn) { changeListener = fn; }

    /** Tampilan shift untuk indikator: { emoji, text, selected, inTransition }. */
    function display() {
        const st = BL.Data.getShiftState();
        if (st.inTransition && st.selected <= 0) return { emoji: '⏳', text: 'Masa Transisi', selected: 0, inTransition: true };
        const n = st.selected > 0 ? st.selected : 1;
        return { emoji: L.shiftEmoji(n), text: L.shiftLabel(n), selected: n, inTransition: st.inTransition };
    }

    function pickShift(st) {
        const sub = st.inTransition ? 'Tentukan shift untuk transaksi ini:' : 'Shift saat ini tidak sesuai waktu. Tentukan shift:';
        return UI.modal({
            title: 'Pilih Shift',
            html: '<p class="dlg-text">' + UI.esc(sub) + '</p>' +
                '<div class="shift-cards">' +
                '<button type="button" class="shift-card" data-shift="1"><span class="sc-emoji">☀️</span><b>Shift 1</b><small>Pagi</small></button>' +
                '<button type="button" class="shift-card" data-shift="2"><span class="sc-emoji">🌙</span><b>Shift 2</b><small>Malam</small></button>' +
                '</div>',
            actions: [{ label: 'Batal', kind: 'ghost', value: null }],
            onOpen: function (body, close) {
                body.querySelectorAll('.shift-card').forEach(function (btn) {
                    btn.addEventListener('click', function () { close(Number(btn.getAttribute('data-shift'))); });
                });
            }
        });
    }

    function approvalHtml(actionLabel) {
        const creds = BL.Data.demoCredentials || [];
        const hint = creds.map(function (c) { return c.name + ': pola ' + c.pattern.join('-') + ' / sandi ' + c.password; }).join(' • ');
        let dots = '';
        for (let i = 1; i <= 9; i++) dots += '<button type="button" class="pat-dot" data-dot="' + i + '"><span></span></button>';
        return '<p class="dlg-text">Gambar pola Anda untuk ' + UI.esc(actionLabel) + '</p>' +
            '<div id="apPattern"><div class="pat-grid">' + dots + '</div>' +
            '<div class="ap-row"><button type="button" class="bl-btn bl-btn-ghost" id="apReset">Ulangi</button>' +
            '<button type="button" class="bl-btn bl-btn-primary" id="apPatOk">Verifikasi Pola</button></div></div>' +
            '<div id="apPassword" hidden><input type="password" id="apPass" class="ap-input" placeholder="Sandi karyawan" autocomplete="off">' +
            '<div class="ap-row"><button type="button" class="bl-btn bl-btn-primary" id="apPassOk">Verifikasi Sandi</button></div></div>' +
            '<div class="ap-status" id="apStatus" role="status"></div>' +
            '<button type="button" class="text-btn" id="apToggle">Gunakan sandi</button>' +
            (hint ? '<div class="proto-hint">Demo prototype — ' + UI.esc(hint) + '</div>' : '');
    }

    function approve(actionLabel) {
        return UI.modal({
            title: '🔒 Persetujuan Karyawan',
            html: approvalHtml(actionLabel),
            actions: [{ label: 'Batal', kind: 'ghost', value: null }],
            onOpen: function (body, close) {
                let mode = 'pattern';
                let attempts = 0;
                let busy = false;
                let picked = [];
                const status = body.querySelector('#apStatus');
                const dots = body.querySelectorAll('.pat-dot');

                function say(text, ok) { status.textContent = text; status.className = 'ap-status' + (ok === true ? ' ok' : ok === false ? ' bad' : ''); }
                function paintDots() {
                    dots.forEach(function (d) {
                        const idx = picked.indexOf(Number(d.getAttribute('data-dot')));
                        d.classList.toggle('on', idx !== -1);
                        d.firstElementChild.textContent = idx !== -1 ? String(idx + 1) : '';
                    });
                }
                function resetPattern() { picked = []; paintDots(); }

                async function check(req) {
                    if (busy) return;
                    busy = true;
                    const emp = await BL.Data.verifyApproval(req);
                    if (emp) {
                        say('Berhasil! (' + emp.name + ')', true);
                        setTimeout(function () { close(emp); }, 400);
                        return;
                    }
                    attempts++;
                    busy = false;
                    if (attempts >= MAX_ATTEMPTS) {
                        busy = true;
                        say('Terlalu banyak percobaan gagal.', false);
                        setTimeout(function () { UI.toast('❌ Verifikasi gagal'); close(null); }, 600);
                        return;
                    }
                    say((mode === 'pattern' ? 'Pola' : 'Sandi') + ' tidak dikenali. Percobaan ' + attempts + '/' + MAX_ATTEMPTS, false);
                    if (mode === 'pattern') resetPattern(); else body.querySelector('#apPass').value = '';
                }

                dots.forEach(function (d) {
                    d.addEventListener('click', function () {
                        const n = Number(d.getAttribute('data-dot'));
                        if (picked.indexOf(n) === -1) { picked.push(n); paintDots(); say(''); }
                    });
                });
                body.querySelector('#apReset').addEventListener('click', function () { resetPattern(); say(''); });
                body.querySelector('#apPatOk').addEventListener('click', function () {
                    if (picked.length < 4) { say('Pola terlalu pendek, coba lagi.', false); return; }
                    check({ mode: 'pattern', pattern: picked.slice() });
                });
                body.querySelector('#apPassOk').addEventListener('click', function () {
                    const pw = body.querySelector('#apPass').value;
                    if (pw.length < 4) { say('Sandi terlalu pendek, coba lagi.', false); return; }
                    check({ mode: 'password', password: pw });
                });
                body.querySelector('#apPass').addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') body.querySelector('#apPassOk').click();
                });
                body.querySelector('#apToggle').addEventListener('click', function () {
                    mode = mode === 'pattern' ? 'password' : 'pattern';
                    body.querySelector('#apPattern').hidden = mode !== 'pattern';
                    body.querySelector('#apPassword').hidden = mode !== 'password';
                    body.querySelector('#apToggle').textContent = mode === 'pattern' ? 'Gunakan sandi' : 'Gunakan pola';
                    say('');
                    if (mode === 'password') body.querySelector('#apPass').focus(); else resetPattern();
                });
            }
        });
    }

    /** @returns {Promise<number|null>} shift yang disetujui, atau null bila dibatalkan. */
    async function ensureConfirmed(actionLabel) {
        const st = BL.Data.getShiftState();
        if (!L.needsShiftConfirmation(st)) return st.selected > 0 ? st.selected : 1;

        const picked = await pickShift(st);
        if (!picked) return null;
        const approver = await approve(actionLabel + ' sebagai ' + L.shiftLabel(picked));
        if (!approver) return null;
        BL.Data.saveSelectedShift(picked, approver);
        if (changeListener) changeListener(picked);
        return picked;
    }

    BL.Shift = { display: display, ensureConfirmed: ensureConfirmed, onChange: onChange };
})(window);
