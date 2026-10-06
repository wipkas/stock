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
            compactMode: false
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
        const targetPct = Number(emp.targetPct || 0);

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
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 12px 14px;
                border-radius: 14px;
                border: 1px solid var(--card-border, #E5E7EB);
                background: var(--card-bg, #FFFFFF);
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .ksp-lb-row:hover {
                border-color: var(--primary, #4F8EF7);
                transform: translateX(2px);
            }
            /* Highlights Top 3 */
            .ksp-lb-row.ksp-gold {
                background: linear-gradient(90deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.02) 100%);
                border: 1.5px solid rgba(255, 215, 0, 0.55);
                box-shadow: 0 4px 12px rgba(255, 215, 0, 0.2);
            }
            .ksp-lb-row.ksp-silver {
                background: linear-gradient(90deg, rgba(148, 163, 184, 0.09) 0%, rgba(148, 163, 184, 0.02) 100%);
                border: 1.5px solid rgba(148, 163, 184, 0.55);
                box-shadow: 0 4px 12px rgba(148, 163, 184, 0.15);
            }
            .ksp-lb-row.ksp-bronze {
                background: linear-gradient(90deg, rgba(217, 119, 6, 0.08) 0%, rgba(217, 119, 6, 0.02) 100%);
                border: 1.5px solid rgba(217, 119, 6, 0.45);
                box-shadow: 0 4px 12px rgba(217, 119, 6, 0.15);
            }
            .ksp-lb-row.ksp-me {
                border-color: var(--primary, #4F8EF7) !important;
                background: rgba(79, 142, 247, 0.08) !important;
            }
            .ksp-lb-avatar-wrap {
                position: relative;
                flex-shrink: 0;
            }
            .ksp-lb-avatar {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                overflow: hidden;
                background: var(--input-bg, #11141F);
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid #FFFFFF;
                font-weight: 800;
                font-size: 16px;
            }
            .ksp-lb-avatar.ring-gold { border-color: #F59E0B; }
            .ksp-lb-avatar.ring-silver { border-color: #94A3B8; }
            .ksp-lb-avatar.ring-bronze { border-color: #D97706; }
            .ksp-lb-avatar img { width: 100%; height: 100%; object-fit: cover; }
            .ksp-lb-rank-badge {
                position: absolute;
                bottom: -4px;
                left: 50%;
                transform: translateX(-50%);
                width: 19px;
                height: 19px;
                border-radius: 50%;
                font-size: 10.5px;
                font-weight: 900;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
                background: #1E293B;
                color: #FFFFFF;
                border: 1.5px solid var(--card-bg, #FFFFFF);
            }
            .ksp-lb-rank-badge.badge-gold { background: linear-gradient(135deg, #FFE066, #F59E0B); color: #78350F; }
            .ksp-lb-rank-badge.badge-silver { background: linear-gradient(135deg, #F1F5F9, #94A3B8); color: #1E293B; }
            .ksp-lb-rank-badge.badge-bronze { background: linear-gradient(135deg, #FCD34D, #B45309); color: #FFFFFF; }
            
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
                font-weight: 850;
                padding: 1.5px 6px;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                gap: 3px;
                flex-shrink: 0;
            }
            .ksp-lb-trophy-tag.tag-gold { background: rgba(255, 215, 0, 0.2); color: #D97706; border: 1px solid rgba(255, 215, 0, 0.5); }
            .ksp-lb-trophy-tag.tag-silver { background: rgba(148, 163, 184, 0.2); color: #475569; border: 1px solid rgba(148, 163, 184, 0.4); }
            .ksp-lb-trophy-tag.tag-bronze { background: rgba(217, 119, 6, 0.18); color: #B45309; border: 1px solid rgba(217, 119, 6, 0.4); }
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
            /* Progress Bar gaya store-target-mini-row */
            .ksp-lb-progress-wrap {
                width: 100%;
                height: 6px;
                background: var(--input-bg, #11141F);
                border-radius: 3px;
                overflow: hidden;
                border: 1px solid var(--card-border, #262B3D);
                margin: 2px 0 3px 0;
            }
            .ksp-lb-progress-fill {
                height: 100%;
                border-radius: 3px;
                transition: width 0.4s ease;
            }
            .ksp-lb-sub-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
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

        // Pre-kalkulasi targetPct sebelum sorting agar sorting berbasis target_pct akurat
        employees.forEach(emp => {
            const score = emp.todayTx || emp.score || 0;
            const targetVal = emp.target || 50;
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
            const targetVal = emp.target || 50;
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

            if (rank === 1) {
                rowClass = 'ksp-gold';
                ringClass = 'ring-gold';
                badgeClass = 'badge-gold';
                trophyHtml = `<span class="ksp-lb-trophy-tag tag-gold">🏆 JUARA 1</span>`;
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

            rowsHtml += `
                <div class="ksp-lb-row ${rowClass}" onclick="KspLeaderboard._handleClick('${selector}', '${emp.id}', ${rank})">
                    <div class="ksp-lb-avatar-wrap">
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
                            <div class="ksp-lb-score-group">
                                <span class="ksp-lb-score-val">${score.toLocaleString('id-ID')} tx</span>
                                <span class="ksp-lb-status-badge" style="background: ${statusInfo.bg}; color: ${statusInfo.color}; border: 1px solid ${statusInfo.color}33;">
                                    ${statusInfo.text}
                                </span>
                            </div>
                        </div>

                        <!-- Progress Bar persis store-target-mini-row -->
                        <div class="ksp-lb-progress-wrap" title="Capaian: ${targetPct}%">
                            <div class="ksp-lb-progress-fill" style="width: ${Math.min(100, targetPct)}%; background: ${statusInfo.color};"></div>
                        </div>

                        <div class="ksp-lb-sub-row">
                            <span class="${bonusInfo.badgeClass}">
                                ${bonusInfo.statusText}
                            </span>
                            <span style="font-size: 10px; color: var(--text-muted, #8A92A6);">
                                ${emp.shift ? `Shift: ${emp.shift}` : 'Aktif'}
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
                        <div class="ksp-lb-title">
                            <span>🏆</span>
                            <span>${escapeHtml(config.title)}</span>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                            <span class="ksp-lb-badge" style="background: rgba(16, 185, 129, 0.12); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.25);">
                                ⏱️ ${getPeriodBadgeLabel(config.period)}
                            </span>
                            <span class="ksp-lb-badge">
                                Skema: ${getModeBadgeLabel(config.rewards.mode)}
                            </span>
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

            const targetMonthly = Number(store.target_monthly) || 0;
            const dailyTargetStore = targetMonthly > 0 ? Math.round(targetMonthly / totalDaysInMonth) : 0;

            const employees = (Array.isArray(store.employees) ? store.employees : [])
                .filter(e => e && e.status !== 'inactive');

            const shiftCount = employees.length > 0 ? employees.length : (Array.isArray(store.shifts) ? store.shifts.length : 2);
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
                targetPerEmployee = shiftCount > 0 ? Math.round(targetMonthly / shiftCount) : targetMonthly;
            } else if (period === 'month_to_date') {
                // Proporsional dari tanggal 1 s/d hari ini
                targetPerEmployee = Math.round(dailyTargetPerEmployee * daysToDate);
            } else if (period === 'recorded_days') {
                // Proporsional HANYA untuk hari-hari yang tercatat di sistem
                targetPerEmployee = Math.round(dailyTargetPerEmployee * activeRecordedDays);
            } else {
                // 'today' (target shift harian)
                targetPerEmployee = dailyTargetPerEmployee;
            }

            const todayData = (store.daily_transactions && store.daily_transactions[todayKey]) || null;
            const todayRecords = todayData && Array.isArray(todayData.records) ? todayData.records : [];

            employees.forEach(emp => {
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
                } else {
                    // 'today'
                    const rec = todayRecords.find(r => r && (r.emp_id === emp.id || r.shift_num === emp.shift_num));
                    if (rec && typeof rec.tx === 'number') {
                        empTx = rec.tx;
                    } else if (todayRecords.length === 0 && emp.shift_num === 1 && todayData && typeof todayData.total === 'number') {
                        empTx = todayData.total;
                    }
                }

                const targetVal = targetPerEmployee > 0 ? targetPerEmployee : 50;
                const targetPct = targetVal > 0 ? Math.round((empTx / targetVal) * 100) : 0;

                result.push({
                    id: emp.id,
                    name: emp.name || 'Kasir',
                    photo: emp.photo || '',
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
