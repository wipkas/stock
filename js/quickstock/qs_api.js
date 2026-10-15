/* ============================================================================
 * QS.Api - akses data Cek Stok Cepat (Supabase via KspSync + fallback tabel vouchers).
 * Tidak menyentuh DOM maupun state.
 * ========================================================================== */
(function (global) {
    'use strict';
    const QS = global.QS = global.QS || {};

    const VOUCHER_SELECT = 'product_id,product_name,provider_name,category_name,stock,sell_price,cost_price,sort_order';

    function restHeaders() {
        const cfg = global.KSP_SYNC_CONFIG || {};
        const headers = { 'apikey': cfg.key };
        // Kunci format lama (JWT) wajib juga sebagai Bearer; kunci "sb_..." tidak.
        if (String(cfg.key).indexOf('sb_') !== 0) headers['Authorization'] = 'Bearer ' + cfg.key;
        return headers;
    }
    function baseUrl() { return String((global.KSP_SYNC_CONFIG || {}).url || '').replace(/\/+$/, ''); }

    async function queryVouchers(deviceId) {
        const url = baseUrl() + '/rest/v1/vouchers?device_id=eq.' + encodeURIComponent(deviceId)
            + '&is_active=neq.false&select=' + VOUCHER_SELECT + '&order=sort_order.asc,product_name.asc';
        const resp = await fetch(url, { headers: restHeaders() });
        return resp.ok ? resp.json() : [];
    }

    /** Ambil semua kemungkinan device_id yang terikat dengan store_id (termasuk dari tabel ksp_devices). */
    async function queryLinkedDeviceIds(storeId) {
        const ids = new Set();
        if (storeId) {
            ids.add(storeId);
            if (storeId.indexOf('-') !== -1) ids.add(storeId.replace(/-/g, ' '));
            if (storeId.indexOf('_') !== -1) ids.add(storeId.replace(/_/g, ' '));
            if (storeId.indexOf('-') !== -1 || storeId.indexOf(' ') !== -1 || storeId.indexOf('_') !== -1) {
                ids.add(storeId.replace(/[-_\s]/g, ''));
            }
        }
        try {
            const url = baseUrl() + '/rest/v1/ksp_devices?store_id=eq.' + encodeURIComponent(storeId)
                + '&select=id,device_name&is_active=neq.false';
            const resp = await fetch(url, { headers: restHeaders() });
            if (resp.ok) {
                const devs = await resp.json();
                if (Array.isArray(devs)) {
                    devs.forEach(function (d) {
                        if (d && d.id) ids.add(String(d.id));
                        if (d && d.device_name) ids.add(String(d.device_name));
                    });
                }
            }
        } catch (e) {
            console.warn('[QS.Api] queryLinkedDeviceIds dilewati:', e);
        }
        return Array.from(ids);
    }

    /** Fallback: katalog cabang belum ada di ksp_store_stock -> coba tabel vouchers (variasi penulisan store id & ksp_devices). */
    async function fetchVouchersFallback(storeId) {
        const cfg = global.KSP_SYNC_CONFIG || {};
        if (!cfg.url || !storeId) return [];
        try {
            const candidates = await queryLinkedDeviceIds(storeId);
            for (let i = 0; i < candidates.length; i++) {
                const data = await queryVouchers(candidates[i]);
                if (Array.isArray(data) && data.length > 0) {
                    return data.map(function (v) {
                        return {
                            product_id: Number(v.product_id),
                            product_name: v.product_name,
                            provider_name: v.provider_name || 'VOUCHER',
                            category_name: v.category_name || '',
                            current_stock: Number(v.stock !== undefined ? v.stock : 0),
                            sell_price: Number(v.sell_price || 0),
                            cost_price: Number(v.cost_price || 0),
                            sort_order: Number(v.sort_order || 0),
                            is_active: true,
                            is_baseline_confirmed: true
                        };
                    });
                }
            }
        } catch (err) {
            console.warn('[QS.Api] fallback vouchers gagal:', err);
        }
        return [];
    }

    /** -> { ok, meta, products, usedFallback } | { ok:false, message, redirect } */
    async function fetchStoreStock(cred, storeIdHint) {
        if (!global.KspSync || !global.KspSync.enabled()) {
            return { ok: false, message: 'Konfigurasi sinkronisasi cloud belum aktif.', redirect: false };
        }
        const res = await global.KspSync.empGetStoreStock(cred);
        if (!res || !res.ok) {
            return { ok: false, message: 'Gagal mengambil data stok toko: ' + ((res && res.error) || 'Koneksi ditolak'), redirect: true };
        }
        let products = Array.isArray(res.products) ? res.products : [];
        let usedFallback = false;
        const targetStoreId = res.store_id || storeIdHint;

        // Cek apakah data dari ksp_store_stock masih kosong atau belum memiliki stok riil
        const totalStoreStock = products.reduce(function (sum, p) { return sum + (Number(p.current_stock) || 0); }, 0);
        const hasConfirmedBaseline = products.some(function (p) { return p.is_baseline_confirmed === true; });

        // Jika ksp_store_stock masih kosong ATAU belum terkonfirmasi dan total stoknya 0,
        // periksa data tabel vouchers (yang di-push oleh HP Android KSP Check)
        if (products.length === 0 || (!hasConfirmedBaseline && totalStoreStock === 0)) {
            const fb = await fetchVouchersFallback(targetStoreId);
            if (fb.length > 0) {
                products = fb;
                usedFallback = true;
            }
        }

        // Tentukan status baseline secara cerdas:
        // Cabang dianggap SUDAH punya baseline jika:
        // 1. RPC menyatakan has_baseline true, ATAU
        // 2. Ada produk yang is_baseline_confirmed = true, ATAU
        // 3. Total stok yang berhasil dimuat > 0 (artinya stok riil sudah di-push dari KSP Check), ATAU
        // 4. Memakai data fallback dari tabel vouchers yang memiliki produk
        const totalFinalStock = products.reduce(function (sum, p) { return sum + (Number(p.current_stock) || 0); }, 0);
        const resolvedHasBaseline = (res.has_baseline === true)
            || hasConfirmedBaseline
            || totalFinalStock > 0
            || (usedFallback && products.length > 0);

        return {
            ok: true,
            usedFallback: usedFallback,
            products: products,
            meta: {
                storeId: targetStoreId,
                empName: res.emp_name || '',
                shiftNum: res.shift_num || 1,
                alreadyClosed: !!res.already_closed,
                hasBaseline: resolvedHasBaseline
            }
        };
    }

    /** Apakah cabang memakai HP Android KSP Check? -> 'android' | 'web' | null (tidak diketahui). */
    async function detectPlatformMode(storeId) {
        try {
            const cfg = global.KSP_SYNC_CONFIG || {};
            if (!cfg.url || !cfg.key || !storeId) return null;
            const url = baseUrl() + '/rest/v1/ksp_history_transactions?store_id=eq.' + encodeURIComponent(storeId)
                + '&device_id=not.like.web*&select=id&limit=1';
            const res = await fetch(url, { headers: restHeaders() });
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data) && data.length > 0 ? 'android' : 'web';
        } catch (e) {
            console.warn('[QS.Api] deteksi platform dilewati:', e);
            return null;
        }
    }

    function submitOpname(cred, payload) { return global.KspSync.empSubmitStockOpname(cred, payload); }

    QS.Api = { fetchStoreStock: fetchStoreStock, detectPlatformMode: detectPlatformMode, submitOpname: submitOpname };
})(window);
