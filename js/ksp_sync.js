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

    function prepareStoresForPush(stores, fallbackLeave) {
        if (!Array.isArray(stores)) return stores;
        return stores.map(function (s) {
            var clone = Object.assign({}, s);
            if (Array.isArray(clone.employees)) {
                clone.employees = clone.employees.map(function (e) {
                    var ec = Object.assign({}, e);
                    if (ec.status === 'leave') {
                        var leaveMeta = {
                            reason: ec.leave_reason || 'Izin Libur',
                            notes: ec.leave_notes || '',
                            date: ec.leave_date || new Date().toISOString(),
                            replaced_by: ec.replaced_by || null,
                            replaced_by_name: ec.replaced_by_name || null
                        };
                        var metaTag = '[LEAVE_INFO:' + encodeURIComponent(JSON.stringify(leaveMeta)) + ']';
                        var baseNotes = (ec.notes || '').replace(/\[LEAVE_INFO:.*?\]/g, '').trim();
                        ec.notes = (baseNotes ? baseNotes + ' ' : '') + metaTag;
                        if (fallbackLeave) {
                            ec.status = 'inactive';
                        }
                    } else if (ec.notes && typeof ec.notes === 'string') {
                        ec.notes = ec.notes.replace(/\[LEAVE_INFO:.*?\]/g, '').trim();
                    }
                    return ec;
                });
            }
            return clone;
        });
    }

    function unpackLeaveInfoFromRemote(stores) {
        if (!Array.isArray(stores)) return stores;
        stores.forEach(function (s) {
            if (Array.isArray(s.employees)) {
                s.employees.forEach(function (e) {
                    if (e.notes && typeof e.notes === 'string') {
                        var m = e.notes.match(/\[LEAVE_INFO:(.*?)\]/);
                        if (m) {
                            try {
                                var rawStr = m[1];
                                var jsonStr = rawStr.indexOf('%') !== -1 ? decodeURIComponent(rawStr) : rawStr;
                                var meta = JSON.parse(jsonStr);
                                if (e.status === 'leave' || e.status === 'inactive') {
                                    e.status = 'leave';
                                    e.leave_reason = meta.reason || 'Izin Libur';
                                    e.leave_notes = meta.notes || '';
                                    e.leave_date = meta.date || null;
                                    e.replaced_by = meta.replaced_by || null;
                                    e.replaced_by_name = meta.replaced_by_name || null;
                                }
                            } catch(ex) {}
                            e.notes = e.notes.replace(/\[LEAVE_INFO:.*?\]/g, '').trim();
                        }
                    }
                });
            }
        });
        return stores;
    }

    function adminPush() {
        if (!enabled() || !adminPin() || !opts.getStores) return Promise.resolve({ skipped: true });
        if (pushing) { pushAgain = true; return Promise.resolve({ queued: true }); }
        pushing = true;
        var stamp = localStorage.getItem(LS_DIRTY);
        setStatus('busy', '☁️ Menyimpan ke cloud…');

        var primaryPayload = prepareStoresForPush(opts.getStores(), false);

        return rpc('ksp_admin_save_stores', { p_pin: adminPin(), p_stores: primaryPayload })
            .then(function (r) {
                if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal menyimpan');
                // Hapus tanda dirty hanya jika tidak ada perubahan baru sejak push dimulai.
                if (localStorage.getItem(LS_DIRTY) === stamp) setDirty(null);
                setStatus('ok', '☁️ Tersinkron');
                return r;
            })
            .catch(function (err) {
                var errMsg = String(err && err.message || '');
                // Auto-fallback jika check constraint di database server belum diupdate ke schema v2.1
                if (errMsg.indexOf('ksp_employees_status_check') !== -1) {
                    console.warn('[KspSync] Server schema mendeteksi constraint status, mencoba fallback mode aman...', err);
                    var fallbackPayload = prepareStoresForPush(opts.getStores(), true);
                    return rpc('ksp_admin_save_stores', { p_pin: adminPin(), p_stores: fallbackPayload })
                        .then(function (r2) {
                            if (!r2 || !r2.ok) throw new Error('Gagal menyimpan');
                            if (localStorage.getItem(LS_DIRTY) === stamp) setDirty(null);
                            setStatus('ok', '☁️ Tersinkron');
                            return r2;
                        });
                }
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
        return rpc('ksp_admin_get_stores', { p_pin: adminPin() })
            .then(function (r) {
                if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal mengambil data');
                var remote = unpackLeaveInfoFromRemote(r.stores || []);

                // Supabase adalah Single Source of Truth (Pusat Kebenaran Mutlak):
                // Jika database cloud kosong, jangan pernah auto-seeding / upload ulang data lokal!
                var before = JSON.stringify(opts.getStores() || []);
                var after = JSON.stringify(remote);
                if (before !== after || isDirty()) {
                    opts.setStores(remote);
                    writeLocalCache(remote);
                    setDirty(null); // Bersihkan tanda dirty lokal karena data cloud menjadi acuan utama
                    if (typeof opts.onRemoteUpdate === 'function') opts.onRemoteUpdate();
                }
                setStatus('ok', remote.length === 0 ? '☁️ Cloud kosong' : '☁️ Tersinkron');
                return { updated: before !== after, count: remote.length };
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

    function adminDeleteEmployee(empId) {
        if (!enabled() || !adminPin()) return Promise.resolve({ skipped: true });
        setStatus('busy', '☁️ Menghapus karyawan di cloud…');
        return rpc('ksp_admin_delete_employee', { p_pin: adminPin(), p_emp_id: empId })
            .then(function (r) {
                if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal menghapus karyawan');
                setStatus('ok', '☁️ Karyawan terhapus di cloud');
                return r;
            })
            .catch(function (err) {
                console.warn('[KspSync] delete employee gagal:', err);
                setStatus('err', '⚠️ Cloud delete: ' + (err.message || 'gagal'));
                throw err;
            });
    }

    function adminDeleteDailyTx(storeId, txDate, empId) {
        if (!enabled() || !adminPin()) return Promise.resolve({ skipped: true });
        setStatus('busy', '☁️ Menghapus transaksi di cloud…');
        return rpc('ksp_admin_delete_daily_tx', {
            p_pin: adminPin(),
            p_store_id: storeId,
            p_tx_date: txDate,
            p_emp_id: empId || null
        }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error === 'unauthorized' ? 'PIN admin ditolak server' : 'Gagal menghapus transaksi');
            setStatus('ok', '☁️ Transaksi terhapus di cloud');
            return r;
        }).catch(function (err) {
            console.warn('[KspSync] delete tx gagal:', err);
            setStatus('err', '⚠️ Cloud delete tx: ' + (err.message || 'gagal'));
            throw err;
        });
    }

    function adminTransferEmployee(empId, toStoreId, newShift, reason) {
        if (!enabled() || !adminPin()) return Promise.resolve({ skipped: true });
        // Lindungi dari target cabang yang tidak valid (seperti 'leave', 'unassigned', atau kosong)
        if (!toStoreId || toStoreId === 'leave' || toStoreId === 'unassigned') {
            return Promise.resolve({ skipped: true, reason: 'invalid_store_id' });
        }
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
        return rpc('ksp_admin_get_all_employees', { p_pin: adminPin() }).then(function (r) {
            if (r && Array.isArray(r.employees)) {
                r.employees.forEach(function (e) {
                    if (e.notes && typeof e.notes === 'string') {
                        var m = e.notes.match(/\[LEAVE_INFO:(.*?)\]/);
                        if (m) {
                            try {
                                var rawStr = m[1];
                                var jsonStr = rawStr.indexOf('%') !== -1 ? decodeURIComponent(rawStr) : rawStr;
                                var meta = JSON.parse(jsonStr);
                                if (e.status === 'leave' || e.status === 'inactive') {
                                    e.status = 'leave';
                                    e.leave_reason = meta.reason || 'Izin Libur';
                                    e.leave_notes = meta.notes || '';
                                    e.leave_date = meta.date || null;
                                    e.replaced_by = meta.replaced_by || null;
                                    e.replaced_by_name = meta.replaced_by_name || null;
                                }
                            } catch(ex) {}
                            e.notes = e.notes.replace(/\[LEAVE_INFO:.*?\]/g, '').trim();
                        }
                    }
                });
            }
            return r;
        });
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
        setStatus('busy', '⏳ Menyimpan foto karyawan ke cloud...');
        var photo = (typeof profileData === 'string') ? profileData : (profileData ? profileData.photo : null);
        return rpc('ksp_emp_update_profile', {
            p_password: password,
            p_photo: photo || null
        }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error === 'invalid_password' ? 'Password karyawan tidak cocok' : 'Gagal memperbarui foto profil');
            setStatus('ok', '✓ Foto profil karyawan berhasil diperbarui di cloud');
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
            if (opts.isAdmin()) adminPull();
        });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible' && opts.isAdmin() && !modalOpen()) adminPull();
        });
        // Tarik data terbaru dari cloud begitu halaman siap (Cloud Authoritative)
        if (opts.isAdmin() && !modalOpen()) {
            adminPull();
        }
    }

    window.KspSync = {
        init: init,
        enabled: enabled,
        adminPull: adminPull,
        adminPush: adminPush,
        adminDeleteStore: adminDeleteStore,
        adminDeleteEmployee: adminDeleteEmployee,
        adminDeleteDailyTx: adminDeleteDailyTx,
        adminTransferEmployee: adminTransferEmployee,
        adminDeactivateEmployee: adminDeactivateEmployee,
        adminGetAllEmployees: adminGetAllEmployees,
        empLogin: empLogin,
        empSubmitProposal: empSubmitProposal,
        empUpdateProfile: empUpdateProfile,
        setStatus: setStatus
    };
})();
