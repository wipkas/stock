/* ============================================================================
 * KSP Check - Tema gelap/terang bersama.
 *
 * Satu implementasi untuk semua halaman. Hook khusus halaman didaftarkan lewat
 * KspTheme.onChange(fn) -- fn(isLight, reason), reason = 'apply' | 'toggle'.
 *
 *   KspTheme.apply()                  // terapkan tema tersimpan (saat load)
 *   KspTheme.toggle()                 // ganti tema + simpan
 *   KspTheme.onChange(fn)             // daftarkan callback
 *   KspTheme.registerButtons(['id'])  // tambah id tombol yang ikonnya disinkronkan
 *
 * Tombol dengan id `themeToggleBtn` dan `pinThemeToggleBtn` otomatis disinkronkan.
 * Alias global applySavedTheme() / toggleTheme() disediakan untuk onclick inline.
 * ========================================================================== */
(function () {
    'use strict';

    var STORAGE_KEY = 'kspcheck_theme';
    var CLASS_LIGHT = 'light-theme';
    var buttonIds = ['themeToggleBtn', 'pinThemeToggleBtn'];
    var listeners = [];

    function readSaved() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function writeSaved(value) {
        try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* ignore */ }
    }

    function isLight() {
        return !!(document.body && document.body.classList.contains(CLASS_LIGHT));
    }

    function paintButtons() {
        var icon = isLight() ? '☀️' : '🌙';
        buttonIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.innerText = icon;
        });
    }

    function notify(reason) {
        var light = isLight();
        listeners.forEach(function (fn) {
            try { fn(light, reason); } catch (e) { console.warn('[KspTheme] listener error:', e); }
        });
    }

    function apply() {
        document.body.classList.toggle(CLASS_LIGHT, readSaved() === 'light');
        paintButtons();
        notify('apply');
    }

    function toggle() {
        var light = document.body.classList.toggle(CLASS_LIGHT);
        writeSaved(light ? 'light' : 'dark');
        paintButtons();
        notify('toggle');
    }

    function onChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }

    function registerButtons(ids) {
        (ids || []).forEach(function (id) {
            if (buttonIds.indexOf(id) === -1) buttonIds.push(id);
        });
    }

    window.KspTheme = {
        apply: apply,
        toggle: toggle,
        isLight: isLight,
        onChange: onChange,
        registerButtons: registerButtons
    };

    // Alias global untuk kode lama / atribut onclick inline.
    window.applySavedTheme = apply;
    window.toggleTheme = toggle;
})();
