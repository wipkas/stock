/* ============================================================================
 * KSP Check - Sinkronisasi Supabase (dipakai store_manager, store_transactions,
 * karyawan). Tanpa dependensi: memakai fetch langsung ke RPC Supabase.
 *
 * Model:
 *  - Admin  : adminPull() / adminPush() memakai PIN admin (localStorage
 *             'kspcheck_viewer_pin'). Dokumen cabang disimpan utuh.
 *  - Karyawan: empLogin() / empSubmitProposal() memakai password karyawan.
 *             Karyawan hanya mengirim USULAN, tidak pernah menimpa data admin.
 *  - localStorage tetap menjadi cache offline. Perubahan lokal yang belum
 *    terkirim ditandai "dirty" dan dikirim saat online kembali.
 * ========================================================================== */
(function () {
    'use strict';

    var CFG = window.KSP_SYNC_CONFIG || {};
    var LS_STORES = 'kspcheck_stores_data';
    var LS_DIRTY = 'kspcheck_sync_dirty';
    var LS_PIN = 'kspcheck_viewer_pin';

    var opts = { getStores: null, setStores: null, isAdmin: function () { return true; }, onRemoteUpdate: null };
    var pushTimer = null;
    var pushing = false;
    var pushAgain = false;
    var badgeEl = null;

    function enabled() {
        return !!(CFG.url && CFG.key);
    }

    function adminPin() {
        try { return localStorage.getItem(LS_PIN) || ''; } catch (e) { return ''; }
    }

    function isDirty() {
        try { return !!localStorage.getItem(LS_DIRTY); } catch (e) { return false; }
    }

    function setDirty(v) {
        try {
            if (v) localStorage.setItem(LS_DIRTY, String(v));
            else localStorage.removeItem(LS_DIRTY);
        } catch (e) { /* ignore */ }
    }

    // ---------- Badge status ----------
    function setStatus(kind, text) {
        if (!document.body) return;
        if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.id = 'kspSyncBadge';
            badgeEl.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:99999;padding:5px 10px;' +
                'border-radius:20px;font:700 11px/1.2 system-ui,sans-serif;pointer-events:none;' +
                'background:rgba(20,24,38,.88);color:#cbd5e1;border:1px solid rgba(148,163,184,.35);' +
                'box-shadow:0 2px 8px rgba(0,0,0,.25);transition:opacity .4s;';
            document.body.appendChild(badgeEl);
        }
        var colors = { ok: '#34d399', busy: '#fbbf24', err: '#f87171', off: '#94a3b8' };
        badgeEl.style.color = colors[kind] || '#cbd5e1';
        badgeEl.textContent = text;
        badgeEl.style.opacity = '1';
        if (kind === 'ok') {
            setTimeout(function () { if (badgeEl) badgeEl.style.opacity = '0.45'; }, 2500);
        }
    }

    // ---------- RPC ----------
    function rpc(fn, args) {
        var headers = { 'Content-Type': 'application/json', 'apikey': CFG.key };
        // Kunci format lama (JWT) wajib juga dikirim sebagai Bearer; kunci "sb_..." tidak.
        if (String(CFG.key).indexOf('sb_') !== 0) headers['Authorization'] = 'Bearer ' + CFG.key;
        return fetch(CFG.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(args || {})
        }).then(function (res) {
            return res.text().then(function (text) {
                var json = null;
                try { json = text ? JSON.parse(text) : null; } catch (e) { /* bukan JSON */ }
                if (!res.ok) {
                    var msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
                    throw new Error(msg);
                }
                return json;
            });
        });
    }

    // ---------- ADMIN ----------
    function writeLocalCache(stores) {
        try { localStorage.setItem(LS_STORES, JSON.stringify(stores)); } catch (e) { /* ignore */ }
    }

    function adminPush() {
        if (!enabled() || !adminPin() || !opts.getStores) return Promise.resolve({ skipped: true });
        if (pushing) { pushAgain = true; return Promise.resolve({ queued: true }); }
        pushing = true;
        var stamp = localStorage.getItem(LS_DIRTY);
        setStatus('busy', '☁️ Menyimpan ke cloud…');
        return rpc('ksp_admin_save_stores', { p_pin: adminPin(), p_stores: opts.getStores() })
            .then(function (r) {
                if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal menyimpan');
                // Hapus tanda dirty hanya jika tidak ada perubahan baru sejak push dimulai.
                if (localStorage.getItem(LS_DIRTY) === stamp) setDirty(null);
                setStatus('ok', '☁️ Tersinkron');
                return r;
            })
            .catch(function (err) {
                console.warn('[KspSync] push gagal:', err);
                setStatus('err', '⚠️ Cloud: ' + (err.message || 'gagal') + ' (tersimpan lokal)');
                return { error: err };
            })
            .then(function (res) {
                pushing = false;
                if (pushAgain) { pushAgain = false; scheduleAdminPush(); }
                return res;
            });
    }

    function scheduleAdminPush() {
        if (!enabled() || !adminPin()) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(adminPush, 700);
    }

    function adminPull() {
        if (!enabled() || !adminPin() || !opts.getStores) return Promise.resolve({ skipped: true });
        setStatus('busy', '☁️ Mengambil data cloud…');
        var first = isDirty() ? adminPush() : Promise.resolve();
        return first.then(function () {
            return rpc('ksp_admin_get_stores', { p_pin: adminPin() });
        }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal mengambil data');
            var remote = r.stores || [];
            if (remote.length === 0) {
                // Cloud masih kosong: kirim data lokal sebagai data awal.
                var local = opts.getStores() || [];
                if (local.length > 0) {
                    setDirty(Date.now());
                    return adminPush().then(function () { return { seeded: true }; });
                }
                setStatus('ok', '☁️ Tersinkron');
                return { empty: true };
            }
            if (isDirty()) {
                // Masih ada perubahan lokal yang belum terkirim: jangan ditimpa.
                setStatus('err', '⚠️ Ada perubahan lokal belum terkirim');
                return { dirty: true };
            }
            var before = JSON.stringify(opts.getStores());
            var after = JSON.stringify(remote);
            if (before !== after) {
                opts.setStores(remote);
                writeLocalCache(remote);
                if (typeof opts.onRemoteUpdate === 'function') opts.onRemoteUpdate();
            }
            setStatus('ok', '☁️ Tersinkron');
            return { updated: before !== after };
        }).catch(function (err) {
            console.warn('[KspSync] pull gagal:', err);
            setStatus('err', '⚠️ Cloud: ' + (err.message || 'offline') + ' (pakai data lokal)');
            return { error: err };
        });
    }

    function adminDeleteStore(storeId) {
        if (!enabled() || !adminPin()) return Promise.resolve({ skipped: true });
        setStatus('busy', '☁️ Menghapus cabang di cloud…');
        return rpc('ksp_admin_delete_store', { p_pin: adminPin(), p_store_id: storeId })
            .then(function (r) {
                if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal menghapus cabang');
                setStatus('ok', '☁️ Cabang terhapus di cloud');
                return r;
            })
            .catch(function (err) {
                console.warn('[KspSync] delete gagal:', err);
                setStatus('err', '⚠️ Cloud delete: ' + (err.message || 'gagal'));
                throw err;
            });
    }

    function adminTransferEmployee(empId, toStoreId, newShift, reason) {
        if (!enabled() || !adminPin()) return Promise.resolve({ skipped: true });
        setStatus('busy', '☁️ Memproses mutasi cabang di cloud…');
        return rpc('ksp_admin_transfer_employee', {
            p_pin: adminPin(),
            p_emp_id: empId,
            p_to_store_id: toStoreId,
            p_new_shift: newShift || 1,
            p_reason: reason || 'Mutasi penugasan cabang'
        }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal mutasi karyawan');
            setStatus('ok', '☁️ Mutasi cabang berhasil');
            return r;
        }).catch(function (err) {
            console.warn('[KspSync] transfer gagal:', err);
            setStatus('err', '⚠️ Cloud transfer: ' + (err.message || 'gagal'));
            throw err;
        });
    }

    function adminDeactivateEmployee(empId, status, reason) {
        if (!enabled() || !adminPin()) return Promise.resolve({ skipped: true });
        setStatus('busy', '☁️ Memperbarui status karyawan di cloud…');
        return rpc('ksp_admin_deactivate_employee', {
            p_pin: adminPin(),
            p_emp_id: empId,
            p_status: status || 'inactive',
            p_reason: reason || 'Resign / Pensiun'
        }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal mengubah status');
            setStatus('ok', '☁️ Status karyawan tersimpan di cloud');
            return r;
        }).catch(function (err) {
            console.warn('[KspSync] deactivate gagal:', err);
            setStatus('err', '⚠️ Cloud status: ' + (err.message || 'gagal'));
            throw err;
        });
    }

    function adminGetAllEmployees() {
        if (!enabled() || !adminPin()) return Promise.resolve({ skipped: true });
        return rpc('ksp_admin_get_all_employees', { p_pin: adminPin() });
    }

    // ---------- KARYAWAN ----------
    function empLogin(password) {
        if (!enabled()) return Promise.reject(new Error('Sinkronisasi cloud tidak dikonfigurasi'));
        return rpc('ksp_emp_login', { p_password: password });
    }

    function empSubmitProposal(password, proposal) {
        if (!enabled()) return Promise.reject(new Error('Sinkronisasi cloud tidak dikonfigurasi'));
        return rpc('ksp_emp_submit_proposal', { p_password: password, p_proposal: proposal });
    }

    function empUpdateProfile(password, profileData) {
        if (!enabled()) return Promise.reject(new Error('Sinkronisasi cloud tidak dikonfigurasi'));
        setStatus('busy', '⏳ Menyimpan profil karyawan ke cloud...');
        return rpc('ksp_emp_update_profile', {
            p_password: password,
            p_phone: profileData.phone || null,
            p_address: profileData.address || null,
            p_photo: profileData.photo || null
        }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error === 'invalid_password' ? 'Password karyawan tidak cocok' : 'Gagal memperbarui profil');
            setStatus('ok', '✓ Profil karyawan berhasil diperbarui di cloud');
            return r;
        });
    }

    // ---------- INIT ----------
    function hookSave() {
        var orig = window.saveStoresData;
        if (typeof orig !== 'function' || orig.__kspHooked) return;
        var wrapped = function () {
            var out = orig.apply(this, arguments);
            if (opts.isAdmin()) {
                setDirty(Date.now());
                scheduleAdminPush();
            }
            return out;
        };
        wrapped.__kspHooked = true;
        window.saveStoresData = wrapped;
    }

    function modalOpen() {
        return !!document.querySelector('.modal-overlay.open, .modal.open, [id$="Modal"].open');
    }

    function init(o) {
        for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) opts[k] = o[k]; }
        hookSave();
        if (!enabled()) return;
        window.addEventListener('online', function () {
            if (opts.isAdmin() && isDirty()) adminPush();
        });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible' && opts.isAdmin() && !modalOpen()) adminPull();
        });
    }

    window.KspSync = {
        init: init,
        enabled: enabled,
        adminPull: adminPull,
        adminPush: adminPush,
        adminDeleteStore: adminDeleteStore,
        adminTransferEmployee: adminTransferEmployee,
        adminDeactivateEmployee: adminDeactivateEmployee,
        adminGetAllEmployees: adminGetAllEmployees,
        empLogin: empLogin,
        empSubmitProposal: empSubmitProposal,
        empUpdateProfile: empUpdateProfile,
        setStatus: setStatus
    };
})();
