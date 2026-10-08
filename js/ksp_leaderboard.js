/**
 * KSP CHECK - MODUL LEADERBOARD & BONUS PERFORMA KASIR (PLUG & PLAY)
 * File: js/ksp_leaderboard.js
 * 
 * Fitur Utama:
 * 1. Pemasangan 1 Baris (Plug & Play): KspLeaderboard.mount('#container', options)
 * 2. Peringkat 100% berbasis Jumlah Transaksi Keseluruhan (Total Tx) & Target Toko
 * 3. Tampilan baris terpadu dengan highlight Piala (🏆 🥇 🥈 🥉) untuk Top 3
 * 4. Progress bar ramping 6px persis store-target-mini-row dengan warna status dinamis
 * 5. Tiga Skema Perhitungan Bonus yang Dapat Disetting:
 *    - Mode 'fixed': Nilai tetap per peringkat (Juara 1, 2, 3) dengan syarat minimal target
 *    - Mode 'percentage': Berdasarkan persentase tercapainya target (Proporsional / Pro-rata)
 *    - Mode 'flat_target': Sama rata untuk semua cabang/kasir asal target tercapai
 * 6. Future-Proof Metrics Adapter: Slot metrik breakdown (TopUp, Pulsa, PLN) disiapkan non-aktif
 *    dan siap diaktifkan kapan saja via showBreakdownMetrics: true tanpa ubah tata letak.
 */

(function (global) {
    'use strict';

    const KspLeaderboard = {};

    const STORAGE_CONFIG_KEY = 'kspcheck_leaderboard_config';

    // Konfigurasi Default
    const DEFAULT_CONFIG = {
        title: 'Leaderboard & Target Kasir',
        storeId: 'all',
        currentEmployeeId: null,
        period: 'today',
        scope: 'all',
        
        scoring: {
            primaryMetric: 'total_tx', // 'total_tx' | 'target_pct'
            minTxThreshold: 0
        },

        // Tiga Mode Perhitungan Bonus
        rewards: {
            enabled: true,
            recipientScope: 'all', // 'all' (Semua Karyawan) | 'top3' (Hanya Juara 1, 2, 3)
            mode: 'percentage', // 'fixed' | 'percentage' | 'flat_target'

            // Mode 1: Nilai Tetap per Peringkat
            fixed: {
                minTargetPct: 80, // Minimal % capaian target agar bonus cair
                prizes: {
                    1: { amount: 150000, label: 'Rp 150.000', badge: '🏆 JUARA 1' },
                    2: { amount: 100000, label: 'Rp 100.000', badge: '🥈 JUARA 2' },
                    3: { amount: 50000,  label: 'Rp 50.000',  badge: '🥉 JUARA 3' }
                }
            },

            // Mode 2: Proporsional Berdasarkan % Tercapainya Target
            percentage: {
                basePool: 100000,     // Nominal dasar jika target 100% tercapai (Rp 100.000)
                minTargetPct: 0,      // Minimal % capaian agar bonus mulai aktif (0 = langsung tampil dari 1% capaian)
                maxBonusCap: 250000   // Batas maksimal bonus
            },

            // Mode 3: Sama Rata untuk Semua Cabang Asal Target Tercapai
            flat_target: {
                targetThresholdPct: 100, // Syarat target (100% tercapai)
                bonusAmount: 100000,     // Nominal bonus sama rata (Rp 100.000)
                label: 'Bonus Target Tercapai'
            }
        },

        ui: {
            showBreakdownMetrics: false, // DITUNDA SEMENTARA (Data belum ada di DB)
            progressStyle: 'store-target-mini-row',
            showSummaryBoxes: true,
            compactMode: false,
            showMotto: true
        }
    };

    // Schema Ekstensi Metrik Masa Depan (Ready to activate)
    const METRIC_SLOTS_SCHEMA = [
        { id: 'topup', label: 'TopUp E-Wallet', icon: '💳' },
        { id: 'tarik', label: 'Tarik Tunai',    icon: '💵' },
        { id: 'pulsa', label: 'Pulsa / Voucher',icon: '🎟️' },
        { id: 'pln',   label: 'Token PLN',      icon: '⚡' },
        { id: 'qris',  label: 'QRIS & Lainnya', icon: '📱' }
    ];

    let instances = new Map();

    /**
     * Format Rupiah
     */
    function formatRupiah(num) {
        if (num === null || num === undefined || isNaN(num)) return 'Rp 0';
        return 'Rp ' + Number(num).toLocaleString('id-ID');
    }

    /**
     * Baca Konfigurasi
     */
    KspLeaderboard.getConfig = function () {
        try {
            const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return deepMerge(DEFAULT_CONFIG, parsed);
            }
        } catch (e) {
            console.warn('[KspLeaderboard] Gagal membaca konfigurasi:', e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    };

    /**
     * Simpan Konfigurasi
     */
    KspLeaderboard.saveConfig = function (newConfig) {
        try {
            const current = KspLeaderboard.getConfig();
            const merged = deepMerge(current, newConfig);
            localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(merged));
            
            instances.forEach((inst, selector) => {
                inst.config = deepMerge(inst.config, merged);
                KspLeaderboard.render(selector);
            });
            return true;
        } catch (e) {
            console.error('[KspLeaderboard] Gagal menyimpan konfigurasi:', e);
            return false;
        }
    };

    /**
     * Engine Perhitungan Bonus (Tiga Mode)
     */
    KspLeaderboard.calculateBonus = function (emp, rank, config) {
        const rewards = config.rewards || DEFAULT_CONFIG.rewards;
        if (!rewards.enabled) {
            return {
                eligible: false,
                amount: 0,
                amountFormatted: 'Rp 0',
                statusText: 'Bonus Nonaktif',
                badgeClass: 'ksp-badge-muted',
                modeLabel: 'Nonaktif'
            };
        }

        const mode = rewards.mode || 'percentage';
        const recipientScope = rewards.recipientScope || 'all';
        const targetPct = Number(emp.targetPct || 0);

        // Filter Penerima Bonus: Jika dibatasi hanya untuk Juara 1, 2, dan 3 (Podium)
        if (recipientScope === 'top3' && rank > 3) {
            return {
                eligible: false,
                amount: 0,
                amountFormatted: 'Rp 0',
                statusText: 'Hanya Juara 1-3',
                badgeClass: 'ksp-badge-muted',
                modeLabel: mode === 'percentage' ? '% Target' : (mode === 'fixed' ? 'Nilai Tetap' : 'Sama Rata')
            };
        }

        // 1. MODE: FIXED (Nilai Tetap per Peringkat Juara 1, 2, 3)
        if (mode === 'fixed') {
            const fixedCfg = rewards.fixed || DEFAULT_CONFIG.rewards.fixed;
            const prize = fixedCfg.prizes && fixedCfg.prizes[rank];
            const minPct = Number(fixedCfg.minTargetPct || 0);

            if (!prize) {
                return {
                    eligible: false,
                    amount: 0,
                    amountFormatted: 'Rp 0',
                    statusText: 'Di Luar Podium Juara',
                    badgeClass: 'ksp-badge-muted',
                    modeLabel: 'Nilai Tetap'
                };
            }

            if (targetPct >= minPct) {
                return {
                    eligible: true,
                    amount: prize.amount,
                    amountFormatted: formatRupiah(prize.amount),
                    statusText: `🎁 Bonus ${formatRupiah(prize.amount)}`,
                    badgeClass: 'ksp-badge-success',
                    modeLabel: 'Nilai Tetap'
                };
            } else {
                const gap = Math.max(1, Math.round(minPct - targetPct));
                return {
                    eligible: false,
                    amount: prize.amount,
                    amountFormatted: formatRupiah(prize.amount),
                    statusText: `⚠️ Butuh +${gap}% target lagi agar bonus cair`,
                    badgeClass: 'ksp-badge-warning',
                    modeLabel: 'Nilai Tetap'
                };
            }
        }

        // 2. MODE: PERCENTAGE (Proporsional Berdasarkan % Capaian Target)
        if (mode === 'percentage') {
            const pctCfg = rewards.percentage || DEFAULT_CONFIG.rewards.percentage;
            const base = Number(pctCfg.basePool !== undefined ? pctCfg.basePool : 100000);
            const minPct = Number(pctCfg.minTargetPct !== undefined ? pctCfg.minTargetPct : 0);
            const cap = Number(pctCfg.maxBonusCap || 250000);

            // Hitung nilai bonus proporsional real-time mengikuti persentase target
            let calculated = Math.round((targetPct / 100) * base);
            if (cap && calculated > cap) calculated = cap;

            // Jika ada batas minimal capaian (> 0%) dan target belum tembus batas minimal
            if (minPct > 0 && targetPct < minPct) {
                const gap = Math.max(1, Math.round(minPct - targetPct));
                return {
                    eligible: false,
                    amount: calculated,
                    amountFormatted: formatRupiah(calculated),
                    statusText: calculated > 0 
                        ? `⏳ Akumulasi ${formatRupiah(calculated)} (Cair di ${minPct}%)` 
                        : `⚠️ Butuh +${gap}% lagi untuk unlock bonus`,
                    badgeClass: 'ksp-badge-warning',
                    modeLabel: '% Target'
                };
            }

            // Jika minimal capaian 0% (langsung aktif dari 1%) atau sudah memenuhi batas minimal
            return {
                eligible: targetPct > 0,
                amount: calculated,
                amountFormatted: formatRupiah(calculated),
                statusText: targetPct > 0 
                    ? `🎁 Bonus ${formatRupiah(calculated)} (${targetPct}%)`
                    : `🎁 Bonus Rp 0 (0%)`,
                badgeClass: targetPct > 0 ? 'ksp-badge-success' : 'ksp-badge-muted',
                modeLabel: '% Target'
            };
        }

        // 3. MODE: FLAT_TARGET (Sama Rata untuk Semua Cabang Asal Target Tercapai)
        if (mode === 'flat_target') {
            const flatCfg = rewards.flat_target || DEFAULT_CONFIG.rewards.flat_target;
            const threshold = Number(flatCfg.targetThresholdPct || 100);
            const amount = Number(flatCfg.bonusAmount || 100000);

            if (targetPct >= threshold) {
                return {
                    eligible: true,
                    amount: amount,
                    amountFormatted: formatRupiah(amount),
                    statusText: `🎁 Bonus Tercapai ${formatRupiah(amount)}`,
                    badgeClass: 'ksp-badge-success',
                    modeLabel: 'Sama Rata'
                };
            } else {
                const gap = Math.max(1, Math.round(threshold - targetPct));
                return {
                    eligible: false,
                    amount: amount,
                    amountFormatted: formatRupiah(amount),
                    statusText: `🔥 Kurang ${gap}% lagi menuju Target & Bonus!`,
                    badgeClass: 'ksp-badge-warning',
                    modeLabel: 'Sama Rata'
                };
            }
        }

        return {
            eligible: false,
            amount: 0,
            amountFormatted: 'Rp 0',
            statusText: '-',
            badgeClass: 'ksp-badge-muted',
            modeLabel: ''
        };
    };

    /**
     * Hitung Status Warna & Label Target Gaya store-target-mini-row
     */
    function calculateStatusBadge(pct) {
        if (pct >= 100) {
            return {
                text: `TERCAPAI (${pct}%)`,
                color: '#10B981',
                bg: 'rgba(16, 185, 129, 0.12)'
            };
        } else if (pct >= 85) {
            return {
                text: `HAMPIR (${pct}%)`,
                color: '#3B82F6',
                bg: 'rgba(59, 130, 246, 0.12)'
            };
        } else if (pct >= 60) {
            return {
                text: `ON TRACK (${pct}%)`,
                color: '#F59E0B',
                bg: 'rgba(245, 158, 11, 0.12)'
            };
        } else {
            return {
                text: `KEJAR TARGET (${pct}%)`,
                color: '#EF4444',
                bg: 'rgba(239, 68, 68, 0.12)'
            };
        }
    }

    /**
     * Scoped CSS Injection
     */
    function ensureStylesInjected() {
        if (document.getElementById('ksp-leaderboard-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'ksp-leaderboard-styles';
        styleEl.textContent = `
            .ksp-lb-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
                font-family: inherit;
                width: 100%;
            }
            .ksp-lb-card {
                background: var(--card-bg, #FFFFFF);
                border: 1px solid var(--card-border, #E5E7EB);
                border-radius: 16px;
                padding: 14px 16px;
                box-shadow: 0 4px 18px rgba(15, 23, 42, 0.04);
            }
            .ksp-lb-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--border-subtle, #F0F2F6);
                margin-bottom: 12px;
                flex-wrap: wrap;
                gap: 8px;
            }
            .ksp-lb-title {
                font-size: 13.5px;
                font-weight: 850;
                color: var(--text-main, #1E293B);
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .ksp-lb-badge {
                font-size: 11px;
                font-weight: 750;
                color: var(--primary, #4F8EF7);
                background: rgba(79, 142, 247, 0.1);
                padding: 2px 8px;
                border-radius: 6px;
            }
            .ksp-lb-summary-strip {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                gap: 8px;
                margin-bottom: 12px;
            }
            .ksp-lb-sum-box {
                background: var(--input-bg, #F8FAFC);
                border: 1px solid var(--card-border, #E5E7EB);
                border-radius: 10px;
                padding: 8px 10px;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .ksp-lb-sum-label {
                font-size: 10px;
                font-weight: 750;
                color: var(--text-muted, #94A3B8);
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            .ksp-lb-sum-val {
                font-size: 14px;
                font-weight: 900;
                color: var(--text-main, #1E293B);
            }
            .ksp-lb-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .ksp-lb-row {
                position: relative;
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 14px 14px 12px;
                border-radius: 16px;
                border: 1px solid var(--card-border, #E5E7EB);
                background: var(--card-bg, #FFFFFF);
                cursor: pointer;
                overflow: hidden;
                isolation: isolate;
                transition: transform 0.15s ease, border-color 0.15s ease;
            }
            .ksp-lb-row:hover {
                border-color: var(--primary, #4F8EF7);
                transform: translateX(2px);
            }
            .ksp-lb-row > * { position: relative; z-index: 2; }

            /* Watermark angka peringkat di belakang kartu */
            .ksp-lb-watermark {
                position: absolute !important;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 74px;
                font-weight: 900;
                font-style: italic;
                line-height: 1;
                letter-spacing: -4px;
                opacity: 0.06;
                pointer-events: none;
                z-index: 1 !important;
            }

            /* ===== Podium: shared (border gradien bergerak + kilau menyapu) ===== */
            .ksp-lb-row.ksp-gold,
            .ksp-lb-row.ksp-silver,
            .ksp-lb-row.ksp-bronze { border-color: transparent; }
            .ksp-lb-row.ksp-gold::before,
            .ksp-lb-row.ksp-silver::before,
            .ksp-lb-row.ksp-bronze::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: inherit;
                padding: 1.5px;
                z-index: 0;
                background-size: 300% 300%;
                -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                pointer-events: none;
            }
            .ksp-lb-row.ksp-gold::after,
            .ksp-lb-row.ksp-silver::after,
            .ksp-lb-row.ksp-bronze::after {
                content: '';
                position: absolute;
                top: -20%;
                bottom: -20%;
                width: 38%;
                left: -60%;
                transform: skewX(-20deg);
                z-index: 1;
                pointer-events: none;
                animation: kspLbSweep 4.2s ease-in-out infinite;
            }
            @keyframes kspLbBorderFlow { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }
            @keyframes kspLbSweep { 0% { left: -60%; } 55%, 100% { left: 130%; } }

            /* ===== Juara 1 — Emas ===== */
            .ksp-lb-row.ksp-gold {
                --score-color: #F59E0B;
                background:
                    radial-gradient(120% 140% at 0% 0%, rgba(255, 214, 10, 0.20) 0%, rgba(255, 214, 10, 0) 55%),
                    linear-gradient(100deg, rgba(255, 200, 0, 0.10), rgba(255, 200, 0, 0.02) 70%),
                    var(--card-bg, #FFFFFF);
                box-shadow: 0 8px 26px -6px rgba(245, 158, 11, 0.45), inset 0 0 0 1px rgba(255, 214, 10, 0.15);
            }
            .ksp-lb-row.ksp-gold::before {
                background-image: linear-gradient(115deg, #B45309, #FFE066, #FFF7CC, #F59E0B, #B45309, #FFE066);
                animation: kspLbBorderFlow 4s linear infinite;
            }
            .ksp-lb-row.ksp-gold::after { background: linear-gradient(100deg, transparent 0%, rgba(255, 255, 255, 0.28) 50%, transparent 100%); }
            .ksp-lb-row.ksp-gold .ksp-lb-watermark { color: #F59E0B; opacity: 0.12; }

            /* ===== Juara 2 — Perak ===== */
            .ksp-lb-row.ksp-silver {
                --score-color: #94A3B8;
                background:
                    radial-gradient(120% 140% at 0% 0%, rgba(203, 213, 225, 0.18) 0%, rgba(203, 213, 225, 0) 55%),
                    linear-gradient(100deg, rgba(148, 163, 184, 0.10), rgba(148, 163, 184, 0.02) 70%),
                    var(--card-bg, #FFFFFF);
                box-shadow: 0 8px 22px -8px rgba(148, 163, 184, 0.5), inset 0 0 0 1px rgba(203, 213, 225, 0.12);
            }
            .ksp-lb-row.ksp-silver::before {
                background-image: linear-gradient(115deg, #64748B, #E2E8F0, #94A3B8, #F8FAFC, #64748B);
                animation: kspLbBorderFlow 6s linear infinite;
            }
            .ksp-lb-row.ksp-silver::after { background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.2), transparent); animation-delay: 1.1s; }
            .ksp-lb-row.ksp-silver .ksp-lb-watermark { color: #94A3B8; opacity: 0.10; }

            /* ===== Juara 3 — Perunggu ===== */
            .ksp-lb-row.ksp-bronze {
                --score-color: #EA8A3C;
                background:
                    radial-gradient(120% 140% at 0% 0%, rgba(234, 138, 60, 0.17) 0%, rgba(234, 138, 60, 0) 55%),
                    linear-gradient(100deg, rgba(217, 119, 6, 0.09), rgba(217, 119, 6, 0.02) 70%),
                    var(--card-bg, #FFFFFF);
                box-shadow: 0 8px 22px -8px rgba(217, 119, 6, 0.5), inset 0 0 0 1px rgba(234, 138, 60, 0.12);
            }
            .ksp-lb-row.ksp-bronze::before {
                background-image: linear-gradient(115deg, #7C2D12, #F59E0B, #C2410C, #FDBA74, #7C2D12);
                animation: kspLbBorderFlow 7s linear infinite;
            }
            .ksp-lb-row.ksp-bronze::after { background: linear-gradient(100deg, transparent, rgba(255, 214, 170, 0.2), transparent); animation-delay: 2.1s; }
            .ksp-lb-row.ksp-bronze .ksp-lb-watermark { color: #EA8A3C; opacity: 0.10; }

            /* Highlight "SAYA" — non-podium tetap biru; podium tetap tampil emas/perak/perunggu */
            .ksp-lb-row.ksp-me:not(.ksp-gold):not(.ksp-silver):not(.ksp-bronze) {
                border-color: var(--primary, #4F8EF7) !important;
                background: rgba(79, 142, 247, 0.08) !important;
            }

            @media (prefers-reduced-motion: reduce) {
                .ksp-lb-row::before, .ksp-lb-row::after,
                .ksp-lb-score-float, .ksp-lb-crown, .ksp-lb-spark,
                .ksp-lb-avatar.ring-gold { animation: none !important; }
            }
            @media (max-width: 380px) {
                .ksp-lb-row { gap: 10px; padding: 12px 10px 10px; }
                .ksp-lb-watermark { font-size: 58px; }
            }
            .ksp-lb-avatar-wrap {
                position: relative;
                flex-shrink: 0;
            }
            .ksp-lb-avatar {
                width: 52px;
                height: 52px;
                border-radius: 50%;
                overflow: hidden;
                background: var(--input-bg, #11141F);
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid var(--card-border, #FFFFFF);
                font-weight: 800;
                font-size: 17px;
                position: relative;
            }
            .ksp-lb-avatar.ring-gold {
                border: 2.5px solid #F59E0B;
                box-shadow: 0 0 0 3px rgba(255, 214, 10, 0.18), 0 0 18px rgba(245, 158, 11, 0.65);
                animation: kspLbGoldPulse 2.4s ease-in-out infinite;
            }
            .ksp-lb-avatar.ring-silver { border: 2.5px solid #CBD5E1; box-shadow: 0 0 14px rgba(203, 213, 225, 0.45); }
            .ksp-lb-avatar.ring-bronze { border: 2.5px solid #EA8A3C; box-shadow: 0 0 14px rgba(234, 138, 60, 0.45); }
            @keyframes kspLbGoldPulse {
                0%, 100% { box-shadow: 0 0 0 3px rgba(255, 214, 10, 0.18), 0 0 12px rgba(245, 158, 11, 0.5); }
                50% { box-shadow: 0 0 0 5px rgba(255, 214, 10, 0.10), 0 0 24px rgba(245, 158, 11, 0.9); }
            }
            .ksp-lb-avatar img { width: 100%; height: 100%; object-fit: cover; }
            .ksp-lb-rank-badge {
                position: absolute;
                bottom: -5px;
                left: 50%;
                transform: translateX(-50%);
                width: 20px;
                height: 20px;
                border-radius: 50%;
                font-size: 10.5px;
                font-weight: 900;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
                background: #334155;
                color: #FFFFFF;
                border: 1.5px solid var(--card-bg, #FFFFFF);
            }
            .ksp-lb-rank-badge.badge-gold { background: linear-gradient(135deg, #FFF1A8, #F59E0B); color: #78350F; }
            .ksp-lb-rank-badge.badge-silver { background: linear-gradient(135deg, #F8FAFC, #94A3B8); color: #1E293B; }
            .ksp-lb-rank-badge.badge-bronze { background: linear-gradient(135deg, #FDBA74, #B45309); color: #FFFFFF; }

            /* Mahkota & percikan Juara 1 */
            .ksp-lb-crown {
                position: absolute;
                top: -14px;
                left: 50%;
                font-size: 18px;
                line-height: 1;
                transform: translateX(-50%) rotate(-8deg);
                filter: drop-shadow(0 2px 4px rgba(245, 158, 11, 0.7));
                animation: kspLbCrownBob 2.2s ease-in-out infinite;
                z-index: 3;
                pointer-events: none;
            }
            @keyframes kspLbCrownBob {
                0%, 100% { transform: translateX(-50%) translateY(0) rotate(-8deg); }
                50% { transform: translateX(-50%) translateY(-3px) rotate(6deg); }
            }
            .ksp-lb-spark {
                position: absolute;
                font-size: 11px;
                z-index: 3;
                pointer-events: none;
                animation: kspLbTwinkle 2.2s ease-in-out infinite;
            }
            .ksp-lb-spark.s1 { top: -4px; right: -8px; }
            .ksp-lb-spark.s2 { bottom: 4px; left: -10px; font-size: 9px; animation-delay: 0.9s; }
            .ksp-lb-spark.s3 { top: 14px; right: -12px; font-size: 8px; animation-delay: 1.5s; }
            @keyframes kspLbTwinkle {
                0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
                50% { opacity: 1; transform: scale(1.1) rotate(25deg); }
            }
            /* Nama Juara 1 bergradien emas */
            .ksp-lb-row.ksp-gold .ksp-lb-name {
                background: linear-gradient(90deg, #D97706, #F59E0B 50%, #D97706);
                -webkit-background-clip: text;
                background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            
            .ksp-lb-info-col {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
            }
            .ksp-lb-name-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                flex-wrap: wrap;
            }
            .ksp-lb-name-group {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }
            .ksp-lb-name {
                font-size: 13.5px;
                font-weight: 800;
                color: var(--text-main, #FFFFFF);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .ksp-lb-trophy-tag {
                font-size: 9.5px;
                font-weight: 900;
                letter-spacing: 0.3px;
                padding: 2px 8px;
                border-radius: 20px;
                display: inline-flex;
                align-items: center;
                gap: 3px;
                flex-shrink: 0;
            }
            .ksp-lb-trophy-tag.tag-gold { background: linear-gradient(90deg, #F59E0B, #FDE047); color: #78350F; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.45); }
            .ksp-lb-trophy-tag.tag-silver { background: linear-gradient(90deg, #CBD5E1, #F1F5F9); color: #334155; box-shadow: 0 2px 7px rgba(148, 163, 184, 0.4); }
            .ksp-lb-trophy-tag.tag-bronze { background: linear-gradient(90deg, #C2410C, #F59E0B); color: #FFFFFF; box-shadow: 0 2px 7px rgba(217, 119, 6, 0.45); }
            .ksp-lb-me-tag {
                background: var(--primary, #4F8EF7);
                color: #FFFFFF;
                font-size: 9px;
                font-weight: 850;
                padding: 1px 6px;
                border-radius: 6px;
            }
            .ksp-lb-score-group {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-shrink: 0;
            }
            .ksp-lb-score-val {
                font-size: 15px;
                font-weight: 900;
                color: var(--primary, #4F8EF7);
            }
            .ksp-lb-status-badge {
                font-size: 9.5px;
                font-weight: 800;
                padding: 1.5px 6px;
                border-radius: 6px;
            }
            /* Progress Bar dengan Efek Api 🔥 & Skor Melayang di Ujung */
            .ksp-lb-progress-wrap {
                position: relative;
                width: 100%;
                height: 6px;
                background: var(--input-bg, #11141F);
                border-radius: 4px;
                border: 1px solid var(--card-border, #262B3D);
                margin: 18px 0 5px 0;
                overflow: visible;
            }
            /* Skor melayang di atas ujung progress (kecil & miring) */
            .ksp-lb-score-float {
                position: absolute;
                bottom: calc(100% + 5px);
                right: -4px;
                font-size: 10px;
                font-style: italic;
                font-weight: 700;
                line-height: 1;
                white-space: nowrap;
                color: var(--score-color, var(--primary, #4F8EF7));
                pointer-events: none;
                animation: kspScoreBob 2.4s ease-in-out infinite;
            }
            .ksp-lb-score-float b { font-weight: 900; font-size: 11px; }
            .ksp-lb-score-float small { font-size: 8.5px; opacity: 0.8; margin-left: 1px; }
            .ksp-lb-score-float.pos-left { right: auto; left: 0; }
            .ksp-lb-score-float.pos-center { right: 0; transform: translateX(50%); animation-name: kspScoreBobCenter; }
            @keyframes kspScoreBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
            @keyframes kspScoreBobCenter { 0%, 100% { transform: translate(50%, 0); } 50% { transform: translate(50%, -2px); } }
            .ksp-lb-progress-fill {
                position: relative;
                height: 100%;
                border-radius: 4px;
                transition: width 0.4s ease;
            }
            .ksp-lb-flame-head {
                position: absolute;
                right: -8px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 13px;
                line-height: 1;
                pointer-events: none;
                filter: drop-shadow(0 0 5px rgba(245, 158, 11, 0.75));
                animation: kspFlameFlicker 1.2s infinite alternate ease-in-out;
            }
            @keyframes kspFlameFlicker {
                0% { transform: translateY(-55%) scale(0.92) rotate(-4deg); filter: drop-shadow(0 0 3px #F59E0B); }
                50% { transform: translateY(-50%) scale(1.1) rotate(4deg); filter: drop-shadow(0 0 7px #EF4444); }
                100% { transform: translateY(-45%) scale(1.0) rotate(0deg); filter: drop-shadow(0 0 4px #F59E0B); }
            }

            /* Kata-kata / Motto Kasir */
            .ksp-lb-quote-text {
                font-size: 11px;
                font-style: italic;
                color: var(--text-muted, #8A92A6);
                line-height: 1.35;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin: 1px 0 3px 0;
            }
            .ksp-lb-quote-quote {
                color: var(--primary, #4F8EF7);
                font-weight: 800;
                font-style: normal;
                margin: 0 1px;
            }

            .ksp-lb-sub-row {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                font-size: 11px;
                color: var(--text-muted, #8A92A6);
                flex-wrap: wrap;
                gap: 4px;
            }
            .ksp-badge-success { color: #10B981; font-weight: 750; }
            .ksp-badge-warning { color: #F59E0B; font-weight: 700; }
            .ksp-badge-muted { color: var(--text-muted, #8A92A6); font-weight: 600; }

            /* Future metrics slot container */
            .ksp-lb-future-metrics {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 11px;
                color: var(--text-muted, #8A92A6);
                margin-top: 4px;
                padding-top: 4px;
                border-top: 1px dashed var(--border-subtle, #F0F2F6);
            }

            /* Tombol Info / Bantuan Leaderboard (?) */
            .ksp-lb-info-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                border: 1px solid var(--card-border, #E5E7EB);
                background: var(--input-bg, #F8FAFC);
                color: var(--text-muted, #8A92A6);
                cursor: pointer;
                transition: all 0.2s ease;
                padding: 0;
                flex-shrink: 0;
                box-sizing: border-box;
            }
            .ksp-lb-info-btn:hover {
                color: var(--primary, #4F8EF7);
                border-color: var(--primary, #4F8EF7);
                background: rgba(79, 142, 247, 0.12);
                transform: scale(1.08);
            }

            /* Modal Dialog Penjelasan & Aturan */
            .ksp-lb-modal-backdrop {
                position: fixed;
                inset: 0;
                z-index: 99999;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 14px;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease, visibility 0.2s ease;
                box-sizing: border-box;
            }
            .ksp-lb-modal-backdrop.open {
                opacity: 1;
                visibility: visible;
            }
            .ksp-lb-modal-card {
                background: var(--card-bg, #1A1F2C);
                border: 1px solid var(--card-border, #2E384D);
                border-radius: 18px;
                max-width: 490px;
                width: 100%;
                max-height: calc(100vh - 28px);
                max-height: calc(100dvh - 28px);
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
                overflow: hidden;
                margin: auto;
                font-family: inherit;
                color: var(--text-main, #FFFFFF);
                animation: kspLbModalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
            }
            @keyframes kspLbModalIn {
                from { transform: scale(0.95); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            .ksp-lb-modal-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                padding: 14px 16px;
                border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
                gap: 10px;
                flex-shrink: 0;
            }
            .ksp-lb-modal-title {
                font-size: 14px;
                font-weight: 850;
                color: var(--text-main, #FFFFFF);
                display: flex;
                align-items: center;
                gap: 6px;
                margin: 0;
            }
            .ksp-lb-modal-subtitle {
                font-size: 11px;
                color: var(--text-muted, #8A92A6);
                margin: 2px 0 0 0;
            }
            .ksp-lb-modal-close {
                background: transparent;
                border: none;
                color: var(--text-muted, #8A92A6);
                font-size: 22px;
                font-weight: 700;
                cursor: pointer;
                line-height: 1;
                padding: 2px 6px;
                border-radius: 6px;
                transition: all 0.15s ease;
            }
            .ksp-lb-modal-close:hover {
                color: var(--text-main, #FFFFFF);
                background: rgba(255, 255, 255, 0.1);
            }
            .ksp-lb-modal-body {
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                flex: 1;
                font-size: 11.5px;
                line-height: 1.5;
            }
            .ksp-lb-info-box {
                background: var(--input-bg, #11141F);
                border: 1px solid var(--card-border, #2E384D);
                border-radius: 12px;
                padding: 12px 14px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .ksp-lb-info-box-title {
                font-size: 11.5px;
                font-weight: 800;
                color: var(--primary, #4F8EF7);
                display: flex;
                align-items: center;
                gap: 6px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            .ksp-lb-info-item {
                display: flex;
                align-items: baseline;
                gap: 6px;
                color: var(--text-main, #FFFFFF);
            }
            .ksp-lb-info-item-label {
                font-weight: 750;
                color: var(--text-muted, #8A92A6);
                min-width: 120px;
                flex-shrink: 0;
            }
            .ksp-lb-copy-preview {
                background: rgba(0, 0, 0, 0.25);
                border: 1px dashed var(--card-border, #2E384D);
                border-radius: 8px;
                padding: 10px;
                font-family: monospace;
                font-size: 10.5px;
                line-height: 1.45;
                white-space: pre-wrap;
                word-break: break-word;
                color: var(--text-main, #FFFFFF);
                max-height: 130px;
                overflow-y: auto;
            }
            .ksp-lb-modal-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
                gap: 8px;
                flex-shrink: 0;
                background: var(--card-bg, #1A1F2C);
            }
            .ksp-lb-btn-copy {
                padding: 9px 16px;
                font-size: 12px;
                font-weight: 800;
                border-radius: 8px;
                border: 1px solid var(--primary, #4F8EF7);
                background: var(--primary, #4F8EF7);
                color: #FFFFFF;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.2s ease;
                flex: 1;
                justify-content: center;
            }
            .ksp-lb-btn-copy:hover {
                filter: brightness(1.1);
            }
            .ksp-lb-btn-close {
                padding: 9px 16px;
                font-size: 12px;
                font-weight: 750;
                border-radius: 8px;
                border: 1px solid var(--card-border, #2E384D);
                background: var(--input-bg, #11141F);
                color: var(--text-main, #FFFFFF);
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .ksp-lb-btn-close:hover {
                background: rgba(255, 255, 255, 0.08);
            }
        `;
        document.head.appendChild(styleEl);
    }

    /**
     * Render UI Modul
     */
    KspLeaderboard.render = function (selector) {
        const inst = instances.get(selector);
        if (!inst) return;

        const container = document.querySelector(selector);
        if (!container) return;

        ensureStylesInjected();

        const config = inst.config;
        const employees = inst.employees || [];
        const primaryMetric = (config.scoring && config.scoring.primaryMetric) || 'total_tx';
        const showMotto = !(config.ui && config.ui.showMotto === false);

        // Pre-kalkulasi targetPct sebelum sorting agar sorting berbasis target_pct akurat
        const currentPeriod = config.period || 'today';
        const defaultFallbackTarget = currentPeriod === 'monthly' ? 1500 : (currentPeriod === 'month_to_date' ? 400 : 50);

        employees.forEach(emp => {
            const score = emp.todayTx || emp.score || 0;
            const targetVal = (emp.target && emp.target > 0) ? emp.target : defaultFallbackTarget;
            if (emp.targetPct === undefined || emp.targetPct === null) {
                emp.targetPct = targetVal > 0 ? Math.round((score / targetVal) * 100) : 0;
            }
        });

        // 1. Sort karyawan sesuai primaryMetric (total_tx atau target_pct)
        const sorted = [...employees].sort((a, b) => {
            if (primaryMetric === 'target_pct') {
                const diffPct = (b.targetPct || 0) - (a.targetPct || 0);
                if (diffPct !== 0) return diffPct;
            }
            return (b.todayTx || b.score || 0) - (a.todayTx || a.score || 0);
        });

        // 2. Hitung Agregat Realtime (Berdasarkan Total Transaksi Riil)
        const totalTx = sorted.reduce((sum, e) => sum + (e.todayTx || e.score || 0), 0);
        const avgTx = sorted.length > 0 ? Math.round(totalTx / sorted.length) : 0;
        let totalBonusPool = 0;

        let rowsHtml = '';
        sorted.forEach((emp, index) => {
            const rank = index + 1;
            const score = emp.todayTx || emp.score || 0;
            const targetVal = (emp.target && emp.target > 0) ? emp.target : defaultFallbackTarget;
            const targetPct = (emp.targetPct !== undefined && emp.targetPct !== null)
                ? Number(emp.targetPct)
                : (targetVal > 0 ? Math.round((score / targetVal) * 100) : 0);
            emp.targetPct = targetPct;

            const isMe = config.currentEmployeeId && (emp.id === config.currentEmployeeId);
            const statusInfo = calculateStatusBadge(targetPct);
            const bonusInfo = KspLeaderboard.calculateBonus(emp, rank, config);

            if (bonusInfo.eligible) {
                totalBonusPool += bonusInfo.amount;
            }

            // Styling Top 3
            let rowClass = '';
            let ringClass = '';
            let badgeClass = '';
            let trophyHtml = '';
            let crownHtml = '';

            if (rank === 1) {
                rowClass = 'ksp-gold';
                ringClass = 'ring-gold';
                badgeClass = 'badge-gold';
                trophyHtml = `<span class="ksp-lb-trophy-tag tag-gold">🥇 JUARA 1</span>`;
                crownHtml = `<span class="ksp-lb-crown">👑</span><span class="ksp-lb-spark s1">✨</span><span class="ksp-lb-spark s2">✦</span><span class="ksp-lb-spark s3">✧</span>`;
            } else if (rank === 2) {
                rowClass = 'ksp-silver';
                ringClass = 'ring-silver';
                badgeClass = 'badge-silver';
                trophyHtml = `<span class="ksp-lb-trophy-tag tag-silver">🥈 JUARA 2</span>`;
            } else if (rank === 3) {
                rowClass = 'ksp-bronze';
                ringClass = 'ring-bronze';
                badgeClass = 'badge-bronze';
                trophyHtml = `<span class="ksp-lb-trophy-tag tag-bronze">🥉 JUARA 3</span>`;
            }

            if (isMe) rowClass += ' ksp-me';

            const initial = getInitials(emp.name);
            const avatarHtml = emp.photo 
                ? `<img src="${emp.photo}" alt="${emp.name}">` 
                : `<span>${initial}</span>`;

            const storeTag = emp.storeName ? `<span style="font-size: 10px; color: var(--text-muted, #8A92A6);">🏬 ${escapeHtml(emp.storeName)}</span>` : '';

            // Slot Metrik Masa Depan (Otomatis tampil jika showBreakdownMetrics = true)
            let futureMetricsHtml = '';
            if (config.ui && config.ui.showBreakdownMetrics && emp.subMetrics) {
                let slotsHtml = '';
                METRIC_SLOTS_SCHEMA.forEach(slot => {
                    const val = emp.subMetrics[slot.id];
                    if (val !== undefined && val !== null) {
                        slotsHtml += `<span>${slot.icon} ${val}</span>`;
                    }
                });
                if (slotsHtml) {
                    futureMetricsHtml = `<div class="ksp-lb-future-metrics">${slotsHtml}</div>`;
                }
            }

            const fillPct = Math.max(0, Math.min(100, targetPct));
            const scorePosClass = fillPct <= 14 ? 'pos-left' : (fillPct >= 86 ? '' : 'pos-center');
            const scoreColorStyle = rank <= 3 ? '' : `--score-color: ${statusInfo.color};`;

            rowsHtml += `
                <div class="ksp-lb-row ${rowClass}" onclick="KspLeaderboard._handleClick('${selector}', '${emp.id}', ${rank})">
                    <span class="ksp-lb-watermark">${rank}</span>

                    <div class="ksp-lb-avatar-wrap">
                        ${crownHtml}
                        <div class="ksp-lb-avatar ${ringClass}">
                            ${avatarHtml}
                        </div>
                        <div class="ksp-lb-rank-badge ${badgeClass}">${rank}</div>
                    </div>

                    <div class="ksp-lb-info-col">
                        <div class="ksp-lb-name-row">
                            <div class="ksp-lb-name-group">
                                <span class="ksp-lb-name">${escapeHtml(emp.name)}</span>
                                ${trophyHtml}
                                ${isMe ? '<span class="ksp-lb-me-tag">SAYA</span>' : ''}
                                ${storeTag}
                            </div>
                        </div>

                        <!-- Motto / Kata-kata Kasir jika ada & aktif -->
                        ${(showMotto && emp.quote) ? `
                            <div class="ksp-lb-quote-text" title="${escapeHtml(emp.quote)}">
                                <span class="ksp-lb-quote-quote">“</span>${escapeHtml(emp.quote)}<span class="ksp-lb-quote-quote">”</span>
                            </div>
                        ` : ''}

                        <!-- Progress Bar: Api 🔥 + Skor Melayang di Ujung -->
                        <div class="ksp-lb-progress-wrap" title="Capaian: ${targetPct}%">
                            <div class="ksp-lb-progress-fill" style="width: ${fillPct}%; background: ${statusInfo.color};">
                                ${targetPct > 0 ? `
                                    <span class="ksp-lb-flame-head" title="Capaian: ${targetPct}%">🔥</span>
                                ` : ''}
                                <span class="ksp-lb-score-float ${scorePosClass}" style="${scoreColorStyle}"><b>${score.toLocaleString('id-ID')}</b><small>tx</small></span>
                            </div>
                        </div>

                        <div class="ksp-lb-sub-row">
                            <span class="${bonusInfo.badgeClass}">
                                ${bonusInfo.statusText}
                            </span>
                        </div>

                        ${futureMetricsHtml}
                    </div>
                </div>
            `;
        });

        // 3. Strip Ringkasan Agregat (Hanya Metrik Riil Total Transaksi & Bonus)
        let summaryBoxesHtml = '';
        if (config.ui && config.ui.showSummaryBoxes) {
            summaryBoxesHtml = `
                <div class="ksp-lb-summary-strip">
                    <div class="ksp-lb-sum-box">
                        <span class="ksp-lb-sum-label">👥 Kasir Aktif</span>
                        <span class="ksp-lb-sum-val">${sorted.length} Kasir</span>
                    </div>
                    <div class="ksp-lb-sum-box">
                        <span class="ksp-lb-sum-label">📊 Total Transaksi</span>
                        <span class="ksp-lb-sum-val" style="color: var(--primary, #4F8EF7);">${totalTx.toLocaleString('id-ID')} tx</span>
                    </div>
                    <div class="ksp-lb-sum-box">
                        <span class="ksp-lb-sum-label">⏱️ Rata-rata / Kasir</span>
                        <span class="ksp-lb-sum-val">${avgTx.toLocaleString('id-ID')} tx</span>
                    </div>
                    <div class="ksp-lb-sum-box">
                        <span class="ksp-lb-sum-label">🎁 Total Bonus Cair</span>
                        <span class="ksp-lb-sum-val" style="color: #10B981;">${formatRupiah(totalBonusPool)}</span>
                    </div>
                </div>
            `;
        }

        // Render Akhir
        container.innerHTML = `
            <div class="ksp-lb-container">
                <div class="ksp-lb-card">
                    <div class="ksp-lb-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="ksp-lb-title">
                                <span>🏆</span>
                                <span>${escapeHtml(config.title)}</span>
                            </div>
                            <button type="button" class="ksp-lb-info-btn" onclick="KspLeaderboard.openInfoModal('${selector}')" title="Penjelasan &amp; Aturan Leaderboard" aria-label="Penjelasan &amp; Aturan Leaderboard">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                            </button>
                        </div>
                    </div>

                    ${summaryBoxesHtml}

                    <div class="ksp-lb-list">
                        ${rowsHtml || '<div style="text-align:center; padding:16px; color:var(--text-muted,#888);">Belum ada data kasir.</div>'}
                    </div>
                </div>
            </div>
        `;
    };

    /**
     * Pasang Modul (Mount)
     */
    KspLeaderboard.mount = function (selector, options) {
        const storedConfig = KspLeaderboard.getConfig();
        const mergedConfig = deepMerge(storedConfig, options || {});
        
        instances.set(selector, {
            config: mergedConfig,
            employees: options.employees || []
        });

        KspLeaderboard.render(selector);
    };

    /**
     * Perbarui Karyawan
     */
    KspLeaderboard.setEmployees = function (selector, employees) {
        const inst = instances.get(selector);
        if (inst) {
            inst.employees = employees || [];
            KspLeaderboard.render(selector);
        }
    };

    /**
     * Lepas Modul (Unmount)
     */
    KspLeaderboard.unmount = function (selector) {
        const container = document.querySelector(selector);
        if (container) container.innerHTML = '';
        instances.delete(selector);
    };

    /**
     * Ekstraksi & Kalkulasi Data Karyawan dari storesData KSP
     * @param {Array} storesData - Array toko dari localStorage 'kspcheck_stores_data'
     * @param {Object} options - { period: 'today'|'monthly', scope: 'all'|'store', storeId: string }
     */
    KspLeaderboard.extractEmployeesFromStores = function (storesData, options) {
        if (!Array.isArray(storesData) || storesData.length === 0) return [];

        const opt = options || {};
        const period = opt.period || 'today';
        const scope = opt.scope || 'all';
        const targetStoreId = opt.storeId;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayKey = `${year}-${month}-${day}`;
        const currentDayNum = now.getDate();
        const totalDaysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();

        const result = [];

        storesData.forEach(store => {
            if (!store) return;
            if (scope === 'store' && targetStoreId && store.id !== targetStoreId) return;

            const yearMonth = `${year}-${month}`;
            let targetMonthly = 0;
            if (typeof KspTarget !== 'undefined' && typeof KspTarget.getStoreMonthlyTarget === 'function') {
                targetMonthly = KspTarget.getStoreMonthlyTarget(store, yearMonth);
            } else if (store.monthly_targets && typeof store.monthly_targets === 'object' && store.monthly_targets[yearMonth]) {
                targetMonthly = Number(store.monthly_targets[yearMonth]) || 0;
            } else if (typeof store.monthly_target === 'number' && store.monthly_target > 0) {
                targetMonthly = store.monthly_target;
            } else {
                targetMonthly = Number(store.monthly_target || store.target_monthly) || 0;
            }

            const dailyTargetStore = targetMonthly > 0 ? Math.round(targetMonthly / totalDaysInMonth) : 0;

            const employees = (Array.isArray(store.employees) ? store.employees : [])
                .filter(e => e && e.status !== 'inactive');

            const shiftCount = employees.length > 0 ? employees.length : (Array.isArray(store.shifts) ? store.shifts.length : (store.shift_count || 2));
            const dailyTargetPerEmployee = shiftCount > 0 ? Math.round(dailyTargetStore / shiftCount) : dailyTargetStore;

            // Hitung jumlah hari unik yang memiliki data transaksi di bulan ini
            let recordedDaysCount = 0;
            if (store.daily_transactions && typeof store.daily_transactions === 'object') {
                Object.entries(store.daily_transactions).forEach(([dateKey, dayObj]) => {
                    if (dateKey.startsWith(`${year}-${month}`)) {
                        const hasTx = dayObj && (Number(dayObj.total) > 0 || (Array.isArray(dayObj.records) && dayObj.records.some(r => Number(r && r.tx) > 0)));
                        if (hasTx) recordedDaysCount++;
                    }
                });
            }
            const activeRecordedDays = Math.max(1, recordedDaysCount);
            const daysToDate = Math.max(1, currentDayNum);

            let targetPerEmployee = 50;
            if (period === 'monthly') {
                targetPerEmployee = targetMonthly > 0 
                    ? (shiftCount > 0 ? Math.round(targetMonthly / shiftCount) : targetMonthly)
                    : (50 * totalDaysInMonth);
            } else if (period === 'month_to_date') {
                // Proporsional dari tanggal 1 s/d hari ini
                targetPerEmployee = dailyTargetPerEmployee > 0 
                    ? Math.round(dailyTargetPerEmployee * daysToDate)
                    : (50 * daysToDate);
            } else if (period === 'recorded_days') {
                // Proporsional HANYA untuk hari-hari yang tercatat di sistem
                targetPerEmployee = dailyTargetPerEmployee > 0 
                    ? Math.round(dailyTargetPerEmployee * activeRecordedDays)
                    : (50 * activeRecordedDays);
            } else {
                // 'today' (target shift harian)
                targetPerEmployee = dailyTargetPerEmployee > 0 ? dailyTargetPerEmployee : 50;
            }

            const todayData = (store.daily_transactions && store.daily_transactions[todayKey]) || null;
            const todayRecords = todayData && Array.isArray(todayData.records) ? todayData.records : [];

            // Jika belum ada karyawan terdaftar, buat representasi per shift
            let empList = employees;
            if (empList.length === 0) {
                const sCount = shiftCount || 1;
                empList = [];
                for (let i = 1; i <= sCount; i++) {
                    empList.push({
                        id: `${store.id}_shift_${i}`,
                        name: `${store.name || 'Cabang'} (Shift ${i})`,
                        shift_num: i,
                        status: 'active'
                    });
                }
            }

            empList.forEach(emp => {
                let empTx = 0;

                if (period === 'monthly' || period === 'month_to_date' || period === 'recorded_days') {
                    if (store.daily_transactions && typeof store.daily_transactions === 'object') {
                        Object.entries(store.daily_transactions).forEach(([dateKey, dayObj]) => {
                            if (dateKey.startsWith(`${year}-${month}`)) {
                                // Batasi tanggal hanya sampai hari ini untuk month_to_date
                                if (period === 'month_to_date' && dateKey > todayKey) return;

                                if (dayObj && Array.isArray(dayObj.records)) {
                                    const rec = dayObj.records.find(r => r && (r.emp_id === emp.id || r.shift_num === emp.shift_num));
                                    if (rec && typeof rec.tx === 'number') empTx += rec.tx;
                                } else if (dayObj && typeof dayObj.total === 'number' && emp.shift_num === 1) {
                                    empTx += dayObj.total;
                                }
                            }
                        });
                    }

                    // Fallback jika belum ada daily breakdown tapi monthly_tx toko terisi
                    if (empTx === 0 && emp.shift_num === 1 && typeof store.monthly_tx === 'number' && store.monthly_tx > 0) {
                        empTx = store.monthly_tx;
                    }
                } else {
                    // 'today'
                    const rec = todayRecords.find(r => r && (r.emp_id === emp.id || r.shift_num === emp.shift_num));
                    if (rec && typeof rec.tx === 'number') {
                        empTx = rec.tx;
                    } else if (todayRecords.length === 0 && emp.shift_num === 1 && todayData && typeof todayData.total === 'number') {
                        empTx = todayData.total;
                    }
                }

                // Cek apakah karyawan memiliki target khusus tersendiri
                let targetVal = targetPerEmployee;
                if (emp.monthly_target && period === 'monthly') {
                    targetVal = Number(emp.monthly_target);
                } else if (emp.daily_target && period === 'today') {
                    targetVal = Number(emp.daily_target);
                } else if (emp.target) {
                    targetVal = Number(emp.target);
                }

                if (targetVal <= 0) {
                    targetVal = period === 'monthly' ? (50 * totalDaysInMonth) : (period === 'month_to_date' ? (50 * daysToDate) : 50);
                }

                const targetPct = targetVal > 0 ? Math.round((empTx / targetVal) * 100) : 0;

                result.push({
                    id: emp.id,
                    name: emp.name || 'Kasir',
                    photo: emp.photo || '',
                    quote: emp.quote || emp.comment || emp.motto || '',
                    storeId: store.id,
                    storeName: store.name || 'Cabang KSP',
                    shift: emp.shift_num ? `Shift ${emp.shift_num}` : 'Aktif',
                    shiftNum: emp.shift_num,
                    score: empTx,
                    todayTx: empTx,
                    target: targetVal,
                    targetPct: targetPct,
                    subMetrics: null
                });
            });
        });

        return result;
    };

    KspLeaderboard._handleClick = function (selector, empId, rank) {
        const inst = instances.get(selector);
        if (inst && typeof inst.config.onItemClick === 'function') {
            const emp = inst.employees.find(e => e.id === empId);
            inst.config.onItemClick(emp, rank);
        }
    };

    /**
     * Hasilkan Teks Ringkasan Penjelasan & Aturan Leaderboard (Siap Bagikan ke WA)
     */
    KspLeaderboard.generateInfoText = function (selector) {
        let cfg = KspLeaderboard.getConfig();
        if (selector && instances.has(selector)) {
            const inst = instances.get(selector);
            if (inst && inst.config) cfg = inst.config;
        }

        const periodLabel = getPeriodBadgeLabel(cfg.period || 'today');
        const scopeLabel = (cfg.scope === 'store') ? 'Per Cabang Masing-Masing' : 'Antar Seluruh Cabang KSP';
        const primaryMetric = (cfg.scoring && cfg.scoring.primaryMetric) || 'total_tx';
        const metricLabel = primaryMetric === 'target_pct' 
            ? 'Persentase Capaian Target Tertinggi (%)' 
            : 'Jumlah Transaksi Keseluruhan (Total Tx)';

        const rewards = cfg.rewards || {};
        const mode = rewards.mode || 'percentage';
        let rewardText = '';

        if (!rewards.enabled) {
            rewardText = '• Status Bonus: Nonaktif';
        } else if (mode === 'percentage') {
            const pct = rewards.percentage || DEFAULT_CONFIG.rewards.percentage;
            const base = Number(pct.basePool !== undefined ? pct.basePool : 100000);
            const minPct = Number(pct.minTargetPct !== undefined ? pct.minTargetPct : 0);
            const cap = Number(pct.maxBonusCap || 250000);
            rewardText = [
                '• Skema: Proporsional (% Target)',
                `• Base Bonus (100% Target): ${formatRupiah(base)}`,
                `• Syarat Minimal Capaian: ${minPct === 0 ? '0% (Langsung aktif sejak transaksi pertama)' : minPct + '% (Cair setelah tembus ' + minPct + '%)'}`,
                `• Batas Maksimal (Cap): ${formatRupiah(cap)}`,
                '• Contoh Perhitungan:',
                `  - 10% Target = ${formatRupiah(Math.round(base * 0.1))}`,
                `  - 25% Target = ${formatRupiah(Math.round(base * 0.25))}`,
                `  - 50% Target = ${formatRupiah(Math.round(base * 0.5))}`,
                `  - 100% Target = ${formatRupiah(base)}`,
                `  - > 100% Target bertambah proporsional (maks. ${formatRupiah(cap)})`
            ].join('\n');
        } else if (mode === 'fixed') {
            const fixed = rewards.fixed || DEFAULT_CONFIG.rewards.fixed;
            const prizes = fixed.prizes || {};
            const minPct = Number(fixed.minTargetPct || 80);
            rewardText = [
                '• Skema: Nilai Tetap per Peringkat Juara',
                `• Juara 1: ${formatRupiah((prizes[1] && prizes[1].amount) || 150000)}`,
                `• Juara 2: ${formatRupiah((prizes[2] && prizes[2].amount) || 100000)}`,
                `• Juara 3: ${formatRupiah((prizes[3] && prizes[3].amount) || 50000)}`,
                `• Syarat Minimal Target: ${minPct}%`
            ].join('\n');
        } else if (mode === 'flat_target') {
            const flat = rewards.flat_target || DEFAULT_CONFIG.rewards.flat_target;
            const thresh = Number(flat.targetThresholdPct || 100);
            const amt = Number(flat.bonusAmount || 100000);
            rewardText = [
                '• Skema: Sama Rata untuk Semua Cabang',
                `• Syarat Target: Minimal ${thresh}%`,
                `• Hadiah: ${formatRupiah(amt)} per kasir yang mencapai target`
            ].join('\n');
        }

        const showMotto = !(cfg.ui && cfg.ui.showMotto === false);
        const recipientScope = rewards.recipientScope || 'all';
        const recipientLabel = recipientScope === 'top3' ? 'Hanya Juara 1, 2, dan 3 (Podium)' : 'Semua Karyawan (Sesuai Capaian Target)';

        return `🏆 ATURAN & SISTEM LEADERBOARD KASIR KSP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 SISTEM PENILAIAN:
• Dasar Peringkat: ${metricLabel}
• Periode Tolak Ukur: ${periodLabel}
• Lingkup Kompetisi: ${scopeLabel}
• Podium Juara: Top 3 (🏆 Juara 1, 🥈 Juara 2, 🥉 Juara 3)
• Motto Kasir: ${showMotto ? '🟢 Aktif (Tampil di profil kasir)' : '🔴 Dinonaktifkan Admin'}

🎁 PENGATURAN BONUS KASIR:
• Penerima Bonus: ${recipientLabel}
${rewardText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Catatan: Leaderboard dan bonus diperbarui secara real-time berdasarkan transaksi kasir. Tetap semangat dan tingkatkan penjualan! 🚀`;
    };

    /**
     * Buka Modal Dialog Penjelasan & Pengaturan
     */
    KspLeaderboard.openInfoModal = function (selector) {
        ensureStylesInjected();

        let cfg = KspLeaderboard.getConfig();
        if (selector && instances.has(selector)) {
            const inst = instances.get(selector);
            if (inst && inst.config) cfg = inst.config;
        }

        const periodLabel = getPeriodBadgeLabel(cfg.period || 'today');
        const scopeLabel = (cfg.scope === 'store') ? 'Per Cabang Masing-Masing' : 'Antar Seluruh Cabang KSP';
        const primaryMetric = (cfg.scoring && cfg.scoring.primaryMetric) || 'total_tx';
        const metricLabel = primaryMetric === 'target_pct' 
            ? 'Persentase Capaian Target Tertinggi (%)' 
            : 'Jumlah Transaksi Keseluruhan (Total Tx)';

        const rewards = cfg.rewards || {};
        const mode = rewards.mode || 'percentage';
        const recipientScope = rewards.recipientScope || 'all';
        const showMotto = !(cfg.ui && cfg.ui.showMotto === false);

        let rewardDetailsHtml = '';
        if (!rewards.enabled) {
            rewardDetailsHtml = `
                <div style="color: var(--text-muted, #8A92A6); font-style: italic;">
                    Sistem bonus saat ini dinonaktifkan oleh manajemen toko.
                </div>
            `;
        } else if (mode === 'percentage') {
            const pct = rewards.percentage || DEFAULT_CONFIG.rewards.percentage;
            const base = Number(pct.basePool !== undefined ? pct.basePool : 100000);
            const minPct = Number(pct.minTargetPct !== undefined ? pct.minTargetPct : 0);
            const cap = Number(pct.maxBonusCap || 250000);

            rewardDetailsHtml = `
                <div style="background: rgba(79, 142, 247, 0.08); border: 1px solid rgba(79, 142, 247, 0.25); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; font-size: 11px;">
                    📈 <b>Model Proporsional (% Target):</b> Bonus kasir dihitung proporsional secara real-time mengikuti persentase capaian target transaksi.
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">Base Pool (100%):</span>
                    <span style="font-weight: 800; color: #10B981;">${formatRupiah(base)}</span>
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">Minimal Capaian:</span>
                    <span>${minPct === 0 ? '0% (Langsung aktif sejak transaksi pertama)' : minPct + '% (Cair setelah mencapai ' + minPct + '%)'}</span>
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">Maksimal Cap:</span>
                    <span style="font-weight: 750;">${formatRupiah(cap)}</span>
                </div>
                <div style="margin-top: 4px; padding-top: 6px; border-top: 1px dashed rgba(255, 255, 255, 0.1); font-size: 11px; color: var(--text-muted, #8A92A6);">
                    💡 <b>Simulasi:</b> 10% = ${formatRupiah(Math.round(base * 0.1))} | 25% = ${formatRupiah(Math.round(base * 0.25))} | 50% = ${formatRupiah(Math.round(base * 0.5))} | 100% = ${formatRupiah(base)} | 120% = ${formatRupiah(Math.min(cap, Math.round(base * 1.2)))}.
                </div>
            `;
        } else if (mode === 'fixed') {
            const fixed = rewards.fixed || DEFAULT_CONFIG.rewards.fixed;
            const prizes = fixed.prizes || {};
            const minPct = Number(fixed.minTargetPct || 80);

            rewardDetailsHtml = `
                <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; font-size: 11px;">
                    🏆 <b>Model Nilai Tetap (Juara 1-3):</b> Hadiah nominal pasti untuk kasir di podium peringkat juara.
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">🏆 Juara 1:</span>
                    <span style="font-weight: 800; color: #D97706;">${formatRupiah((prizes[1] && prizes[1].amount) || 150000)}</span>
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">🥈 Juara 2:</span>
                    <span style="font-weight: 800; color: #94A3B8;">${formatRupiah((prizes[2] && prizes[2].amount) || 100000)}</span>
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">🥉 Juara 3:</span>
                    <span style="font-weight: 800; color: #D97706;">${formatRupiah((prizes[3] && prizes[3].amount) || 50000)}</span>
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">Syarat Target:</span>
                    <span style="font-weight: 750;">Minimal ${minPct}% Capaian</span>
                </div>
            `;
        } else if (mode === 'flat_target') {
            const flat = rewards.flat_target || DEFAULT_CONFIG.rewards.flat_target;
            const thresh = Number(flat.targetThresholdPct || 100);
            const amt = Number(flat.bonusAmount || 100000);

            rewardDetailsHtml = `
                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; font-size: 11px;">
                    🤝 <b>Model Sama Rata:</b> Semua kasir berhak mendapatkan bonus sama rata begitu target toko tercapai.
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">Syarat Target:</span>
                    <span style="font-weight: 800; color: #10B981;">Minimal ${thresh}%</span>
                </div>
                <div class="ksp-lb-info-item">
                    <span class="ksp-lb-info-item-label">Nominal Bonus:</span>
                    <span style="font-weight: 800; color: #10B981;">${formatRupiah(amt)} per kasir</span>
                </div>
            `;
        }

        const infoText = KspLeaderboard.generateInfoText(selector);

        let modalEl = document.getElementById('kspLeaderboardInfoModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'kspLeaderboardInfoModal';
            modalEl.className = 'ksp-lb-modal-backdrop';
            modalEl.setAttribute('role', 'dialog');
            modalEl.setAttribute('aria-modal', 'true');
            modalEl.onclick = function (e) {
                if (e.target === modalEl) KspLeaderboard.closeInfoModal();
            };
            document.body.appendChild(modalEl);
        }

        modalEl.innerHTML = `
            <div class="ksp-lb-modal-card">
                <div class="ksp-lb-modal-header">
                    <div>
                        <h3 class="ksp-lb-modal-title">
                            <span>ℹ️</span> Penjelasan &amp; Aturan Leaderboard
                        </h3>
                        <p class="ksp-lb-modal-subtitle">Transparansi sistem penilaian performa &amp; perhitungan bonus</p>
                    </div>
                    <button type="button" class="ksp-lb-modal-close" onclick="KspLeaderboard.closeInfoModal()" aria-label="Tutup">&times;</button>
                </div>

                <div class="ksp-lb-modal-body">
                    <!-- SECTION 1: SISTEM LEADERBOARD -->
                    <div class="ksp-lb-info-box">
                        <div class="ksp-lb-info-box-title">
                            <span>🎯</span> Sistem Peringkat
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Dasar Peringkat:</span>
                            <span style="font-weight: 750;">${metricLabel}</span>
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Periode Tolak Ukur:</span>
                            <span style="font-weight: 750; color: #10B981;">⏱️ ${periodLabel}</span>
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Lingkup Kompetisi:</span>
                            <span>🌐 ${scopeLabel}</span>
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Podium Juara:</span>
                            <span>🏆 Juara 1 (Emas), 🥈 Juara 2 (Perak), 🥉 Juara 3 (Perunggu)</span>
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Motto Kasir:</span>
                            <span>${showMotto ? '🟢 Ditampilkan' : '🔴 Dinonaktifkan Admin'}</span>
                        </div>
                    </div>

                    <!-- SECTION 2: PENGATURAN BONUS AKTIF -->
                    <div class="ksp-lb-info-box">
                        <div class="ksp-lb-info-box-title">
                            <span>🎁</span> Pengaturan &amp; Skema Bonus Aktif
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Status Bonus:</span>
                            <span style="font-weight: 800; color: ${rewards.enabled ? '#10B981' : '#EF4444'};">
                                ${rewards.enabled ? '🟢 Aktif' : '🔴 Nonaktif'}
                            </span>
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Model Skema:</span>
                            <span style="font-weight: 750;">${getModeBadgeLabel(mode)}</span>
                        </div>
                        <div class="ksp-lb-info-item">
                            <span class="ksp-lb-info-item-label">Penerima Bonus:</span>
                            <span style="font-weight: 750; color: ${recipientScope === 'top3' ? '#F59E0B' : 'inherit'};">
                                ${recipientScope === 'top3' ? '🏆 Hanya Juara 1, 2, dan 3 (Podium)' : '👥 Semua Karyawan (Sesuai Capaian)'}
                            </span>
                        </div>
                        <div style="margin-top: 4px;">
                            ${rewardDetailsHtml}
                        </div>
                    </div>

                    <!-- SECTION 3: KOTAK PREVIEW TEKS SALIN -->
                    <div class="ksp-lb-info-box" style="gap: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div class="ksp-lb-info-box-title" style="font-size: 11px;">
                                <span>📋</span> Ringkasan Teks Siap Bagikan
                            </div>
                            <span style="font-size: 10px; color: var(--text-muted, #8A92A6);">WhatsApp / Memo</span>
                        </div>
                        <div class="ksp-lb-copy-preview" id="kspLbPreviewText">${escapeHtml(infoText)}</div>
                    </div>
                </div>

                <div class="ksp-lb-modal-footer">
                    <button type="button" class="ksp-lb-btn-copy" id="kspLbCopyBtn" onclick="KspLeaderboard.copyInfoText('${selector || ''}')">
                        <span>📋</span> Salin Penjelasan &amp; Aturan
                    </button>
                    <button type="button" class="ksp-lb-btn-close" onclick="KspLeaderboard.closeInfoModal()">
                        Tutup
                    </button>
                </div>
            </div>
        `;

        requestAnimationFrame(() => {
            modalEl.classList.add('open');
        });

        const handleEsc = function (e) {
            if (e.key === 'Escape') {
                KspLeaderboard.closeInfoModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    };

    /**
     * Tutup Modal Penjelasan
     */
    KspLeaderboard.closeInfoModal = function () {
        const modalEl = document.getElementById('kspLeaderboardInfoModal');
        if (modalEl) {
            modalEl.classList.remove('open');
        }
    };

    /**
     * Salin Teks Penjelasan & Aturan ke Clipboard
     */
    KspLeaderboard.copyInfoText = function (selector) {
        const text = KspLeaderboard.generateInfoText(selector);
        const btn = document.getElementById('kspLbCopyBtn');

        const markSuccess = function () {
            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span>✅</span> Berhasil Disalin!';
                btn.style.background = '#10B981';
                btn.style.borderColor = '#10B981';
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.style.background = '';
                    btn.style.borderColor = '';
                }, 2500);
            }
            if (typeof window.showToast === 'function') {
                window.showToast('📋 Ringkasan aturan leaderboard berhasil disalin!', 'success');
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(markSuccess).catch(() => {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }

        function fallbackCopy(str) {
            const ta = document.createElement('textarea');
            ta.value = str;
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) markSuccess();
                else alert('Gagal menyalin secara otomatis. Silakan salin teks dari kotak ringkasan.');
            } catch (err) {
                console.error('Gagal menyalin:', err);
                alert('Gagal menyalin secara otomatis.');
            }
            document.body.removeChild(ta);
        }
    };

    function getPeriodBadgeLabel(period) {
        if (period === 'month_to_date') return 'Awal Bulan s/d Hari Ini';
        if (period === 'recorded_days') return 'Hari Tercatat Saja';
        if (period === 'monthly') return 'Bulan Penuh';
        return 'Hari Ini';
    }

    function getModeBadgeLabel(mode) {
        if (mode === 'percentage') return 'Proporsional (% Target)';
        if (mode === 'flat_target') return 'Sama Rata (Target Tercapai)';
        return 'Nilai Tetap (Peringkat)';
    }

    function getInitials(name) {
        if (!name) return '??';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    function deepMerge(target, source) {
        const output = Object.assign({}, target);
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target)) Object.assign(output, { [key]: source[key] });
                    else output[key] = deepMerge(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    function isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    global.KspLeaderboard = KspLeaderboard;

})(typeof window !== 'undefined' ? window : this);
