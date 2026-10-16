/* ============================================================================
 * BL.Logic - aturan bisnis Beli Langsung (murni, tanpa DOM, mudah diuji).
 * Port langsung dari app Android:
 *   - quickCashSuggestions  <- BeliBarangActivity.generateQuickCashSuggestions
 *   - changeInfo            <- BeliBarangActivity.updateKembalian
 *   - needsShiftConfirmation<- ShiftSaveGuard.ensureShiftConfirmed
 *   - expandDetails         <- CartActivity.processCheckout / BeliBarangActivity.processTransaction
 *   - receiptText           <- BeliBarangActivity.showReceiptDialog
 * ========================================================================== */
(function (global) {
    'use strict';
    const BL = global.BL = global.BL || {};
    const F = BL.Format;

    // ---------- Warna ----------
    function safeColor(c, fallback) { return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback; }

    /** Terangkan (pct>0) atau gelapkan (pct<0) warna #RRGGBB. pct di rentang -1..1. */
    function shade(hex, pct) {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        const f = function (c) {
            const v = pct < 0 ? c + c * pct : c + (255 - c) * pct;
            return Math.max(0, Math.min(255, Math.round(v)));
        };
        return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
            .map(function (c) { return f(c).toString(16).padStart(2, '0'); }).join('');
    }

    // ---------- Stok ----------
    /** 'out' (habis) | 'low' (menipis, 1-5) | 'safe'. Ambang 'low' adalah asumsi prototype. */
    function stockLevel(stock) {
        if (stock <= 0) return 'out';
        return stock <= 5 ? 'low' : 'safe';
    }

    // ---------- Tunai ----------
    /**
     * Saran nominal uang tunai (maks 6, naik): uang pas, pembulatan ke atas per pecahan,
     * pecahan uang kertas yang lebih besar dari total, dan kelipatan 100 ribu.
     */
    function quickCashSuggestions(total) {
        if (!(total > 0)) return [];
        const set = new Set([total]);
        [1000, 2000, 5000, 10000, 20000, 50000, 100000].forEach(function (step) {
            const rem = total % step;
            if (rem !== 0) {
                const rounded = total + (step - rem);
                if (rounded > total) set.add(rounded);
            }
        });
        [5000, 10000, 20000, 50000, 100000].forEach(function (bill) { if (bill > total) set.add(bill); });
        if (total >= 100000) {
            const next = (Math.floor(total / 100000) + 1) * 100000;
            set.add(next);
            set.add(next + 100000);
            if (total < 500000) set.add(500000);
        }
        const out = Array.from(set).sort(function (a, b) { return a - b; });
        return out.length > 6 ? out.slice(0, 6) : out;
    }

    /** kind: 'zero' (belum diisi) | 'ok' (kembalian) | 'short' (kurang). */
    function changeInfo(total, paid) {
        if (paid === 0) return { kind: 'zero', amount: 0, text: 'Rp 0' };
        const change = paid - total;
        if (change >= 0) return { kind: 'ok', amount: change, text: F.rupiah(change) };
        return { kind: 'short', amount: -change, text: 'Kurang: ' + F.rupiah(-change) };
    }

    // ---------- Shift ----------
    function shiftLabel(n) { return n === 2 ? 'Shift 2 (Malam)' : 'Shift 1 (Pagi)'; }
    function shiftEmoji(n) { return n === 2 ? '🌙' : '☀️'; }

    /** state: { selected, timeBased, inTransition }. Transisi: selalu konfirmasi; selain itu bila shift tidak cocok jam. */
    function needsShiftConfirmation(state) {
        if (state.inTransition) return true;
        return state.selected !== state.timeBased;
    }

    // ---------- Transaksi ----------
    /**
     * Satu baris per unit (qty=1) dengan selisih detik bertambah, seperti app.
     * items: [{ productId, name, price, providerName, qty }]
     */
    function expandDetails(items, now) {
        let offset = 0;
        const rows = [];
        items.forEach(function (it) {
            const q = it.qty > 0 ? it.qty : 1;
            for (let i = 0; i < q; i++) {
                rows.push({
                    date: F.dateTime(new Date(now.getTime() + (offset++) * 1000)),
                    productId: it.productId, productName: it.name, productPrice: it.price,
                    quantity: 1, providerName: it.providerName
                });
            }
        });
        return rows;
    }

    /** Teks struk monospace, identik dengan format app (32 kolom). */
    function receiptText(r) {
        const L = [];
        L.push('================================');
        L.push('        KSP CHECK STORE        ');
        L.push('   STRUK PEMBELIAN BARANG RETAIL');
        L.push('================================');
        L.push('Waktu : ' + r.time);
        L.push('Shift : ' + shiftLabel(r.shift));
        L.push('Bayar : ' + r.method);
        L.push('--------------------------------');
        r.items.forEach(function (it) {
            let name = it.name;
            if (name.length > 20) name = name.substring(0, 18) + '..';
            L.push(F.padEnd(name, 18) + ' ' + F.padStart(it.qty, 2) + 'x ' + F.padStart(F.number(it.subtotal), 8));
        });
        L.push('--------------------------------');
        L.push('TOTAL       : Rp ' + F.padStart(F.number(r.total), 13));
        if (r.method === 'TUNAI') {
            L.push('TUNAI       : Rp ' + F.padStart(F.number(r.paid), 13));
            L.push('KEMBALIAN   : Rp ' + F.padStart(F.number(r.change), 13));
        }
        L.push('================================');
        L.push('  Terima Kasih Atas Kunjungan Anda');
        return L.join('\n') + '\n';
    }

    BL.Logic = {
        safeColor: safeColor, shade: shade, stockLevel: stockLevel,
        quickCashSuggestions: quickCashSuggestions, changeInfo: changeInfo,
        shiftLabel: shiftLabel, shiftEmoji: shiftEmoji, needsShiftConfirmation: needsShiftConfirmation,
        expandDetails: expandDetails, receiptText: receiptText
    };
})(window);
