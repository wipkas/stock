/* ============================================================================
 * KSP Check - Autentikasi & sesi bersama.
 *
 * Memusatkan kunci storage dan logika sesi yang sebelumnya tersebar (dan
 * diduplikasi) di index, karyawan, store_manager, dan store_transactions.
 *
 * Bergantung pada (dimuat sebelumnya, bila fungsinya dipakai):
 *   - CryptoJS         -> decryptConfig / verifyAdminPin
 *   - KspSync          -> checkEmployeePassword (cloud) & keamanan clearSession
 *
 * Ringkas:
 *   KspAuth.getAdminPin() / getMode() / hasEmployeeSession()
 *   KspAuth.setAdminSession(pin) / setEmployeeSession(cred, storeId, empId)
 *   KspAuth.decryptConfig(pin)        -> config, ATAU melempar Error berpesan jelas
 *   KspAuth.verifyAdminPin(pin)       -> config | null (tidak melempar)
 *   KspAuth.checkEmployeePassword(p)  -> { store, employee } | null
 *   KspAuth.clearSession({ scope: 'admin' | 'employee' | 'all', wipeCache: true })
 * ========================================================================== */
(function () {
    'use strict';

    var KEYS = {
        ADMIN_PIN: 'kspcheck_viewer_pin',      // localStorage
        STORES_CACHE: 'kspcheck_stores_data',  // localStorage
        SYNC_DIRTY: 'kspcheck_sync_dirty',     // localStorage
        EMP_CRED: 'kspcheck_emp_cred',         // sessionStorage
        ACTIVE_EMP: 'kspcheck_active_emp',     // sessionStorage
        AUTH_MODE: 'kspcheck_auth_mode'        // sessionStorage
    };

    // ---------- Akses storage yang aman (tidak melempar) ----------
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }

    // ---------- Getter ----------
    function getAdminPin() { return lsGet(KEYS.ADMIN_PIN) || ''; }
    function getMode() { return ssGet(KEYS.AUTH_MODE) || ''; }
    function getEmployeeCredential() { return ssGet(KEYS.EMP_CRED) || ''; }

    function getActiveEmployee() {
        var raw = ssGet(KEYS.ACTIVE_EMP);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function hasEmployeeSession() {
        return getMode() === 'employee' || (!!ssGet(KEYS.ACTIVE_EMP) && !getAdminPin());
    }

    // ---------- Setter sesi ----------
    function setAdminSession(pin) {
        lsSet(KEYS.ADMIN_PIN, pin);
        ssSet(KEYS.AUTH_MODE, 'admin');
    }

    function setEmployeeSession(credential, storeId, empId) {
        ssSet(KEYS.EMP_CRED, credential);
        ssSet(KEYS.ACTIVE_EMP, JSON.stringify({ storeId: storeId, empId: empId }));
        ssSet(KEYS.AUTH_MODE, 'employee');
    }

    // ---------- Admin: dekripsi config.enc ----------
    // Melempar Error dengan pesan yang bisa langsung ditampilkan ke pengguna.
    function decryptConfig(pin) {
        if (typeof CryptoJS === 'undefined') {
            return Promise.reject(new Error('Pustaka enkripsi belum termuat.'));
        }
        return fetch('./config.enc?t=' + Date.now()).then(function (res) {
            if (!res.ok) throw new Error('File config.enc tidak ditemukan.');
            return res.text();
        }).then(function (base64Encrypted) {
            // Format: base64( IV[16 byte] + ciphertext ), AES-256-CBC, kunci = SHA256(PIN)
            var combined = CryptoJS.enc.Base64.parse(base64Encrypted.trim());
            var iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), 16);
            var ciphertext = CryptoJS.lib.WordArray.create(combined.words.slice(4), combined.sigBytes - 16);
            var cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertext });

            var decrypted = CryptoJS.AES.decrypt(cipherParams, CryptoJS.SHA256(pin), {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });

            var json = '';
            try { json = decrypted.toString(CryptoJS.enc.Utf8); } catch (e) { /* PIN salah -> UTF-8 rusak */ }
            if (!json) throw new Error('PIN Salah!');

            var config = JSON.parse(json);
            if (!config.supabase_url || !config.supabase_anon_key) {
                throw new Error('Format konfigurasi tidak valid.');
            }
            return config;
        });
    }

    function verifyAdminPin(pin) {
        return decryptConfig(pin).catch(function () { return null; });
    }

    // ---------- Karyawan ----------
    // 1) Cloud (RPC ksp_emp_login), 2) fallback cache lokal bila cloud gagal/offline.
    function checkEmployeePassword(pass) {
        var cloud = Promise.resolve(null);
        if (window.KspSync && typeof window.KspSync.empLogin === 'function') {
            cloud = window.KspSync.empLogin(pass).then(function (r) {
                return (r && r.ok && r.store && r.employee) ? { store: r.store, employee: r.employee } : null;
            }).catch(function (e) {
                console.warn('[KspAuth] Cloud check warning:', e);
                return null;
            });
        }
        return cloud.then(function (found) {
            if (found) return found;
            try {
                var raw = lsGet(KEYS.STORES_CACHE);
                if (!raw) return null;
                var stores = JSON.parse(raw);
                for (var i = 0; i < stores.length; i++) {
                    var emps = stores[i].employees || [];
                    for (var j = 0; j < emps.length; j++) {
                        var e = emps[j];
                        if ((e.status === 'active' || !e.status) && String(e.password).trim() === pass) {
                            return { store: stores[i], employee: e };
                        }
                    }
                }
            } catch (err) { /* cache rusak -> anggap tidak ketemu */ }
            return null;
        });
    }

    // ---------- Logout / kunci ----------
    // Cache toko (berisi data karyawan) hanya dihapus bila AMAN:
    //  - sinkronisasi cloud aktif (cloud menjadi sumber kebenaran),
    //  - tidak ada perubahan lokal yang belum terkirim (dirty),
    //  - tidak ada sesi admin lain yang masih tersimpan di perangkat ini.
    function canWipeCache() {
        var syncOn = !!(window.KspSync && typeof window.KspSync.enabled === 'function' && window.KspSync.enabled());
        return syncOn && !lsGet(KEYS.SYNC_DIRTY) && !getAdminPin();
    }

    function clearSession(opts) {
        opts = opts || {};
        var scope = opts.scope || 'all';
        var clearAdmin = (scope === 'admin' || scope === 'all');
        var clearEmp = (scope === 'employee' || scope === 'all');
        var mode = getMode();

        if (clearAdmin) lsDel(KEYS.ADMIN_PIN);
        if (clearEmp) { ssDel(KEYS.EMP_CRED); ssDel(KEYS.ACTIVE_EMP); }
        if (scope === 'all' || (clearAdmin && mode === 'admin') || (clearEmp && mode === 'employee')) {
            ssDel(KEYS.AUTH_MODE);
        }

        var wiped = false;
        if (opts.wipeCache === true && canWipeCache()) {
            lsDel(KEYS.STORES_CACHE);
            wiped = true;
        }
        return { wiped: wiped };
    }

    window.KspAuth = {
        KEYS: KEYS,
        getAdminPin: getAdminPin,
        getMode: getMode,
        getEmployeeCredential: getEmployeeCredential,
        getActiveEmployee: getActiveEmployee,
        hasEmployeeSession: hasEmployeeSession,
        setAdminSession: setAdminSession,
        setEmployeeSession: setEmployeeSession,
        decryptConfig: decryptConfig,
        verifyAdminPin: verifyAdminPin,
        checkEmployeePassword: checkEmployeePassword,
        clearSession: clearSession
    };
})();
