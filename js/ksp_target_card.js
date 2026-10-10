/**
 * KSP CHECK - MODUL TARGET & PROGRESS TRANSAKSI CABANG (CANVAS 2D & WA SHARING)
 * File: js/ksp_target_card.js
 * 
 * Fitur:
 * 1. Kalkulasi metrik target harian, realisasi, sisa hari, wajib/hari, gap, dan status badge.
 * 2. Render Single Branch Card (Mockup 1) resolusi tinggi Canvas 2D.
 * 3. Render Rekap Semua Cabang / Leaderboard (Mockup 2) resolusi tinggi Canvas 2D.
 * 4. Integrasi WhatsApp (Web Share API untuk HP, Fallback Download + Clipboard + wa.me di Desktop).
 */

(function (global) {
    'use strict';

    const KspTarget = {};

    // Daftar nama bulan bahasa Indonesia
    const MONTH_NAMES_ID = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const MONTH_SHORT_ID = [
        'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
        'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];

    // Palet warna khusus cabang (menyesuaikan mockup)
    const BRANCH_COLORS = {
        'mahang': '#3b82f6',    // Biru
        'gading': '#ef4444',    // Merah / Coral
        'marpoyan': '#10b981',  // Hijau
        'karya1': '#f59e0b',    // Oranye / Amber
        'karya2': '#8b5cf6',    // Ungu
        'karya 1': '#f59e0b',
        'karya 2': '#8b5cf6'
    };

    const DEFAULT_COLOR_PALETTE = [
        '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
        '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'
    ];

    /**
     * Dapatkan warna identitas cabang
     */
    KspTarget.getBranchColor = function (storeName, index = 0) {
        if (!storeName) return DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length];
        const lower = storeName.toLowerCase();
        for (const [key, color] of Object.entries(BRANCH_COLORS)) {
            if (lower.includes(key)) return color;
        }
        return DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length];
    };

    /**
     * Dapatkan jumlah hari dalam bulan tertentu
     */
    KspTarget.getDaysInMonth = function (year, monthIndex) {
        return new Date(year, monthIndex + 1, 0).getDate();
    };

    /**
     * Hitung total transaksi toko dalam bulan YYYY-MM dengan batas cutOffDay
     */
    KspTarget.calculateStoreTransactionsForMonth = function (store, yearMonth, cutOffDay) {
        if (!store) return 0;
        let total = 0;
        let hasDailyBreakdown = false;

        if (store.daily_transactions && typeof store.daily_transactions === 'object') {
            for (const [dateKey, dayData] of Object.entries(store.daily_transactions)) {
                if (dateKey.startsWith(yearMonth)) {
                    // Cek batasan hari cut-off jika ditentukan
                    if (cutOffDay && cutOffDay > 0) {
                        const dayPart = parseInt(dateKey.substring(8, 10), 10);
                        if (dayPart > cutOffDay) continue;
                    }

                    let val = 0;
                    if (typeof dayData === 'number') {
                        val = dayData;
                    } else if (dayData && typeof dayData.total === 'number') {
                        val = dayData.total;
                    } else if (dayData && Array.isArray(dayData.records)) {
                        val = dayData.records.reduce((sum, r) => sum + (Number(r && r.tx) || 0), 0);
                    }
                    total += val;
                    hasDailyBreakdown = true;
                }
            }
        }

        // Fallback jika belum ada breakdown per hari tapi toko berada di bulan yang sama
        if (!hasDailyBreakdown) {
            const now = new Date();
            const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            if (yearMonth === currentYearMonth && typeof store.monthly_tx === 'number') {
                total = store.monthly_tx;
            }
        }

        return total;
    };

    /**
     * Dapatkan target bulanan toko untuk periode tertentu
     */
    KspTarget.getStoreMonthlyTarget = function (store, yearMonth) {
        if (!store) return 0;
        if (store.monthly_targets && typeof store.monthly_targets === 'object' && store.monthly_targets[yearMonth]) {
            return Number(store.monthly_targets[yearMonth]) || 0;
        }
        if (typeof store.monthly_target === 'number' && store.monthly_target > 0) {
            return store.monthly_target;
        }
        // Default cadangan jika belum diset (misal 5000 transaksi)
        return Number(store.monthly_target) || 0;
    };

    /**
     * Storage key & helper untuk Mode Target Harian ('flat' | 'dynamic')
     * Default: 'flat' (Target bulanan / total hari bulan)
     */
    KspTarget.DAILY_MODE_STORAGE_KEY = 'ksp_target_daily_mode';

    KspTarget.getDailyMode = function () {
        try {
            const saved = localStorage.getItem(KspTarget.DAILY_MODE_STORAGE_KEY);
            return (saved === 'dynamic') ? 'dynamic' : 'flat';
        } catch (e) {
            return 'flat';
        }
    };

    KspTarget.setDailyMode = function (mode) {
        try {
            const val = (mode === 'dynamic') ? 'dynamic' : 'flat';
            localStorage.setItem(KspTarget.DAILY_MODE_STORAGE_KEY, val);
            return val;
        } catch (e) {
            return 'flat';
        }
    };

    /**
     * Kalkulasi metrik lengkap target toko
     * @param {Object} store Data objek cabang
     * @param {string} [yearMonth] Format 'YYYY-MM' (default bulan ini)
     * @param {number} [cutOffDay] Batas hari cut-off (default hari ini)
     */
    KspTarget.calculateStoreMetrics = function (store, yearMonth, cutOffDay) {
        const now = new Date();
        if (!yearMonth) {
            yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        const [yStr, mStr] = yearMonth.split('-');
        const year = parseInt(yStr, 10);
        const monthIndex = parseInt(mStr, 10) - 1; // 0-indexed
        const totalDaysInMonth = KspTarget.getDaysInMonth(year, monthIndex);

        // Tentukan hari berjalan
        const isCurrentMonth = (now.getFullYear() === year && now.getMonth() === monthIndex);
        let elapsedDays = cutOffDay || (isCurrentMonth ? now.getDate() : totalDaysInMonth);
        elapsedDays = Math.max(1, Math.min(totalDaysInMonth, elapsedDays));

        // Sisa hari
        const remainingDays = Math.max(1, totalDaysInMonth - elapsedDays);

        // Target & Realisasi
        const target = KspTarget.getStoreMonthlyTarget(store, yearMonth);
        const realization = KspTarget.calculateStoreTransactionsForMonth(store, yearMonth, elapsedDays);
        const percentage = target > 0 ? (realization / target) * 100 : 0;

        // Sisa target
        const remainingTarget = Math.max(0, target - realization);

        // Mode target harian aktif ('flat' | 'dynamic')
        const dailyMode = KspTarget.getDailyMode();

        // 1. Target Flat Konstan: Target Bulanan / Total Hari dalam Bulan (misal 5.100 / 30 = 170)
        const flatPerDay = target > 0 ? Math.max(1, Math.round(target / totalDaysInMonth)) : 0;

        // 2. Target Dinamis Kejar Sisa: Sisa Target / Sisa Hari Bulan Berjalan
        const dynamicPerDay = remainingTarget > 0 ? Math.round(remainingTarget / remainingDays) : 0;

        // Wajib harian efektif mengikuti mode yang aktif (default: flat)
        const requiredPerDay = (dailyMode === 'dynamic') ? dynamicPerDay : flatPerDay;
        const currentAveragePerDay = Math.round(realization / elapsedDays);

        // Gap kebutuhan naik
        const gap = requiredPerDay - currentAveragePerDay;

        // Status Badge: TERCAPAI, HAMPIR, PUSH!
        let status = 'PUSH!';
        let statusColor = '#ef4444'; // Red
        let statusBg = 'rgba(239, 68, 68, 0.12)';

        if (target > 0 && realization >= target) {
            status = 'TERCAPAI';
            statusColor = '#10b981'; // Green
            statusBg = 'rgba(16, 185, 129, 0.15)';
        } else if (gap <= 0) {
            status = 'ON TRACK';
            statusColor = '#10b981';
            statusBg = 'rgba(16, 185, 129, 0.12)';
        } else if (gap <= 15 || (requiredPerDay > 0 && currentAveragePerDay / requiredPerDay >= 0.88)) {
            status = 'HAMPIR';
            statusColor = '#10b981'; // Hijau / Teal sesuai mockup
            statusBg = 'rgba(16, 185, 129, 0.12)';
        } else {
            status = 'PUSH!';
            statusColor = '#ef4444';
            statusBg = 'rgba(239, 68, 68, 0.12)';
        }

        return {
            year,
            monthIndex,
            yearMonth,
            monthName: MONTH_NAMES_ID[monthIndex],
            monthShort: MONTH_SHORT_ID[monthIndex],
            totalDaysInMonth,
            elapsedDays,
            remainingDays,
            target,
            realization,
            percentage,
            remainingTarget,
            dailyMode,
            flatPerDay,
            dynamicPerDay,
            requiredPerDay,
            currentAveragePerDay,
            gap,
            status,
            statusColor,
            statusBg,
            updatePeriodText: `1-${elapsedDays} ${MONTH_SHORT_ID[monthIndex]} ${year}`
        };
    };

    /**
     * Kalkulasi ringkasan semua cabang (Leaderboard & Rekap Keseluruhan)
     */
    KspTarget.calculateAllStoresSummary = function (storesList, yearMonth, cutOffDay) {
        const list = Array.isArray(storesList) ? storesList : [];
        let grandTarget = 0;
        let grandRealization = 0;

        const storeMetricsList = list.map((store, idx) => {
            const m = KspTarget.calculateStoreMetrics(store, yearMonth, cutOffDay);
            grandTarget += m.target;
            grandRealization += m.realization;
            return {
                store,
                metrics: m,
                color: KspTarget.getBranchColor(store.name, idx)
            };
        });

        const grandPercentage = grandTarget > 0 ? (grandRealization / grandTarget) * 100 : 0;

        // Cari cabang yang butuh push paling tinggi untuk motivasi footer
        const needPushStores = storeMetricsList
            .filter(item => item.metrics.gap > 0 && item.metrics.target > 0)
            .sort((a, b) => b.metrics.gap - a.metrics.gap);

        let focusText = '';
        if (needPushStores.length > 0) {
            const topPushNames = needPushStores.slice(0, 2).map(s => s.store.name.replace(/^(konter|toko|cabang)\s+/i, ''));
            focusText = `Fokus di ${topPushNames.join(' & ')}`;
        } else {
            focusText = 'Pertahankan Prestasi Seluruh Cabang!';
        }

        // Buat string rincian gap kenaikan
        const gapNotesArray = storeMetricsList
            .filter(item => item.metrics.target > 0)
            .map(item => {
                const shortName = item.store.name.replace(/^(konter|toko|cabang)\s+/i, '');
                const sign = item.metrics.gap >= 0 ? `+${item.metrics.gap}` : `${item.metrics.gap}`;
                return `${shortName} ${sign}`;
            });

        const sampleMetric = storeMetricsList[0] ? storeMetricsList[0].metrics : KspTarget.calculateStoreMetrics(null, yearMonth, cutOffDay);

        return {
            items: storeMetricsList,
            grandTarget,
            grandRealization,
            grandPercentage,
            year: sampleMetric.year,
            monthName: sampleMetric.monthName,
            monthShort: sampleMetric.monthShort,
            elapsedDays: sampleMetric.elapsedDays,
            remainingDays: sampleMetric.remainingDays,
            updatePeriodText: sampleMetric.updatePeriodText,
            gapNotes: gapNotesArray.join(', '),
            focusText
        };
    };

    // =========================================================================
    // CANVAS 2D DRAWING ENGINE (HIGH RESOLUTION RETINA 2X)
    // =========================================================================

    /**
     * Helper: Gambar rounded rectangle dengan opsi fill & stroke
     */
    function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        if (typeof radius === 'number') {
            radius = { tl: radius, tr: radius, br: radius, bl: radius };
        } else {
            radius = Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, radius);
        }
        ctx.beginPath();
        ctx.moveTo(x + radius.tl, y);
        ctx.lineTo(x + width - radius.tr, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        ctx.lineTo(x + width, y + height - radius.br);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        ctx.lineTo(x + radius.bl, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        ctx.lineTo(x, y + radius.tl);
        ctx.quadraticCurveTo(x, y, x + radius.tl, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    /**
     * MOCKUP 1: Single Branch Card Canvas Renderer
     * Menghasilkan Canvas card persis seperti gambar Mockup 1
     */
    KspTarget.renderSingleBranchCanvas = function (store, metrics) {
        if (!metrics) {
            metrics = KspTarget.calculateStoreMetrics(store);
        }

        const scale = 2; // High-DPI 2x untuk ketajaman WhatsApp
        const baseWidth = 460;
        const baseHeight = 980;

        const canvas = document.createElement('canvas');
        canvas.width = baseWidth * scale;
        canvas.height = baseHeight * scale;

        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // 1. Background Bersih Putih
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, baseWidth, baseHeight);

        const cardMargin = 20;
        const cardWidth = baseWidth - (cardMargin * 2);
        const cardX = cardMargin;

        // 2. Header Box Cabang (Rounded Rectangle warna Ungu / Brand Cabang)
        const headerY = 32;
        const headerHeight = 180;
        const headerRadius = 24;
        const branchColor = KspTarget.getBranchColor(store.name, 4); // Default ungu jika karya2

        ctx.fillStyle = branchColor;
        roundRect(ctx, cardX, headerY, cardWidth, headerHeight, headerRadius, true, false);

        // Header Title: Nama Cabang
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const storeDisplayName = (store.name || 'CABANG UTAMA').toUpperCase();
        ctx.fillText(storeDisplayName, baseWidth / 2, headerY + 70);

        // Header Subtitle: Target & Realisasi
        ctx.font = '600 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        const headerSubText = `Target: ${metrics.target.toLocaleString('id-ID')} Trx | Real: ${metrics.realization.toLocaleString('id-ID')} Trx (${metrics.percentage.toFixed(1)}%)`;
        ctx.fillText(headerSubText, baseWidth / 2, headerY + 125);

        // 3. SISA TARGET Section
        const sisaLabelY = headerY + headerHeight + 60;
        ctx.fillStyle = '#828282';
        ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText('SISA TARGET', baseWidth / 2, sisaLabelY);

        // Sisa Angka Besar (e.g. 4485 Trx)
        const sisaValY = sisaLabelY + 48;
        ctx.fillStyle = '#1F2937';
        ctx.font = '800 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(`${metrics.remainingTarget.toLocaleString('id-ID')} Trx`, baseWidth / 2, sisaValY);

        // Sisa Hari (e.g. 27 hari lagi)
        const sisaDaysY = sisaValY + 36;
        ctx.fillStyle = '#6B7280';
        ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(`${metrics.remainingDays} hari lagi`, baseWidth / 2, sisaDaysY);

        // Divider Line
        const dividerY = sisaDaysY + 45;
        ctx.strokeStyle = '#EEEEEE';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cardX + 24, dividerY);
        ctx.lineTo(cardX + cardWidth - 24, dividerY);
        ctx.stroke();

        // 4. TARGET HARIAN WAJIB Section
        const wajibLabelY = dividerY + 50;
        ctx.fillStyle = branchColor;
        ctx.font = '800 14.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const wajibTitle = (metrics.dailyMode === 'dynamic') ? 'TARGET HARIAN (KEJAR SISA)' : 'TARGET HARIAN (KONSTAN)';
        ctx.fillText(wajibTitle, baseWidth / 2, wajibLabelY);

        // Angka Target Wajib Sangat Besar (e.g. 166)
        const wajibNumY = wajibLabelY + 68;
        ctx.fillStyle = branchColor;
        ctx.font = '800 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(`${metrics.requiredPerDay.toLocaleString('id-ID')}`, baseWidth / 2, wajibNumY);

        // Satuan: Trx / hari
        const wajibUnitY = wajibNumY + 54;
        ctx.fillStyle = '#374151';
        ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText('Trx / hari', baseWidth / 2, wajibUnitY);

        // 5. Pill Badge: Rata-rata sekarang: 154 Trx/hari
        const pillY = wajibUnitY + 55;
        const pillHeight = 36;
        const pillText = `Rata-rata sekarang: ${metrics.currentAveragePerDay.toLocaleString('id-ID')} Trx/hari`;
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const pillTextMetrics = ctx.measureText(pillText);
        const pillWidth = pillTextMetrics.width + 36;
        const pillX = (baseWidth - pillWidth) / 2;

        ctx.fillStyle = '#F3F4F6';
        roundRect(ctx, pillX, pillY, pillWidth, pillHeight, 18, true, false);

        ctx.fillStyle = '#4B5563';
        ctx.fillText(pillText, baseWidth / 2, pillY + (pillHeight / 2));

        // 6. Motivasi Text: SEMANGAT! PASTI BISA CAPAI! 🌟
        const motivasiY = pillY + 80;
        ctx.fillStyle = '#111827';
        ctx.font = '800 15.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText('SEMANGAT! PASTI BISA CAPAI! 🌟', baseWidth / 2, motivasiY);

        // 7. Footer: Update: 1-4 Okt 2026
        const footerY = baseHeight - 32;
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(`Update: ${metrics.updatePeriodText}`, baseWidth / 2, footerY);

        return canvas;
    };

    /**
     * MOCKUP 2: Rekap Semua Cabang / Leaderboard Canvas Renderer
     * Menghasilkan Canvas rekap leaderboard persis seperti gambar Mockup 2
     */
    KspTarget.renderAllBranchesCanvas = function (storesList, summary) {
        if (!summary) {
            summary = KspTarget.calculateAllStoresSummary(storesList);
        }

        const scale = 2; // High-DPI 2x Retina
        const baseWidth = 720;
        const cardHeight = 98;
        const cardGap = 12;
        const topHeaderHeight = 110;
        const footerHeight = 130;

        const totalCards = summary.items.length;
        const baseHeight = topHeaderHeight + (totalCards * (cardHeight + cardGap)) + footerHeight;

        const canvas = document.createElement('canvas');
        canvas.width = baseWidth * scale;
        canvas.height = baseHeight * scale;

        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // 1. Background Putih
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, baseWidth, baseHeight);

        // 2. Top Header Title (Biru Navy, Besar, Center)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1E3A8A'; // Navy Blue
        ctx.font = '800 27px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const titleText = `TARGET BULAN ${summary.monthName.toUpperCase()} ${summary.year}`;
        ctx.fillText(titleText, baseWidth / 2, 42);

        // Subtitle: Update Realisasi 1-4 Okt | Total 2.964 / 28.700 Trx (10.3%)
        ctx.fillStyle = '#4B5563';
        ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const subtitleText = `Update Realisasi ${summary.updatePeriodText} | Total ${summary.grandRealization.toLocaleString('id-ID')} / ${summary.grandTarget.toLocaleString('id-ID')} Trx (${summary.grandPercentage.toFixed(1)}%)`;
        ctx.fillText(subtitleText, baseWidth / 2, 75);

        // 3. Render Cards untuk Setiap Cabang
        const marginX = 26;
        const cardWidth = baseWidth - (marginX * 2);
        let startY = topHeaderHeight;

        summary.items.forEach((item, idx) => {
            const m = item.metrics;
            const branchColor = item.color;

            // Box Card dengan Border Warna Cabang
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = branchColor;
            ctx.lineWidth = 2.2;
            roundRect(ctx, marginX, startY, cardWidth, cardHeight, 16, true, true);

            // Kolom 1 (Kiri): Nama Cabang & Real / Target
            const col1X = marginX + 28;
            ctx.textAlign = 'left';

            // Nama Cabang
            ctx.fillStyle = '#111827';
            ctx.font = '800 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            const branchName = item.store.name.toUpperCase().replace(/^(KONTER|TOKO|CABANG)\s+/i, '');
            ctx.fillText(branchName, col1X, startY + 32);

            // Real / Target %
            ctx.fillStyle = '#4B5563';
            ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            ctx.fillText(`Real ${m.realization.toLocaleString('id-ID')} / ${m.target.toLocaleString('id-ID')} (${m.percentage.toFixed(1)}%)`, col1X, startY + 66);

            // Kolom 2: Sisa & Sisa Hari
            const col2X = marginX + 245;
            ctx.fillStyle = '#111827';
            ctx.font = '750 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            ctx.fillText(`Sisa ${m.remainingTarget.toLocaleString('id-ID')}`, col2X, startY + 34);

            ctx.fillStyle = '#6B7280';
            ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            ctx.fillText(`${m.remainingDays} hari lagi`, col2X, startY + 66);

            // Kolom 3: Wajib/hari & Angka Wajib
            const col3X = marginX + 435;
            ctx.fillStyle = branchColor;
            ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            ctx.fillText('Wajib/hari:', col3X, startY + 34);

            ctx.font = '800 21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            ctx.fillText(`${m.requiredPerDay.toLocaleString('id-ID')} Trx`, col3X, startY + 66);

            // Kolom 4 (Kanan): Skrg & Badge Status (HAMPIR / PUSH! / TERCAPAI)
            const col4X = marginX + cardWidth - 28;
            ctx.textAlign = 'right';

            ctx.fillStyle = '#4B5563';
            ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            ctx.fillText(`Skrg: ${m.currentAveragePerDay.toLocaleString('id-ID')}`, col4X, startY + 34);

            // Status Badge
            ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            ctx.fillStyle = m.statusColor;
            ctx.fillText(m.status, col4X, startY + 66);

            startY += cardHeight + cardGap;
        });

        // 4. Footer Section: Rata-rata butuh naik
        const footerStartY = startY + 16;
        ctx.textAlign = 'center';

        // Pill Note Rata-rata butuh naik
        const noteText = `Rata-rata butuh naik: ${summary.gapNotes}`;
        ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const noteMetrics = ctx.measureText(noteText);
        const notePillWidth = Math.min(cardWidth, noteMetrics.width + 36);
        const notePillHeight = 34;
        const notePillX = (baseWidth - notePillWidth) / 2;

        ctx.fillStyle = '#F9FAFB';
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 1;
        roundRect(ctx, notePillX, footerStartY, notePillWidth, notePillHeight, 14, true, true);

        ctx.fillStyle = '#374151';
        ctx.fillText(noteText, baseWidth / 2, footerStartY + (notePillHeight / 2));

        // Motivational Closing Text
        const closingY = footerStartY + notePillHeight + 28;
        ctx.fillStyle = '#1E3A8A';
        ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const closingText = `${summary.monthName} ${summary.year} - Semangat Tim! ${summary.focusText}`;
        ctx.fillText(closingText, baseWidth / 2, closingY);

        return canvas;
    };

    // =========================================================================
    // EXPORT & SHARING HELPERS (WHATSAPP, CLIPBOARD, DOWNLOAD)
    // =========================================================================

    /**
     * Konversi Canvas menjadi Blob PNG
     */
    KspTarget.canvasToBlob = function (canvas) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png', 1.0);
        });
    };

    /**
     * Unduh gambar Canvas sebagai file PNG
     */
    KspTarget.downloadCanvasImage = function (canvas, filename) {
        const link = document.createElement('a');
        link.download = filename || `Target_Progress_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    /**
     * Salin gambar Canvas langsung ke Clipboard (Ctrl+V di WhatsApp Web)
     */
    KspTarget.copyCanvasToClipboard = async function (canvas) {
        if (!navigator.clipboard || !window.ClipboardItem) {
            throw new Error('Clipboard Item API tidak didukung di browser ini.');
        }
        const blob = await KspTarget.canvasToBlob(canvas);
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
    };

    // =========================================================================
    // TEMPLATE TEKS WHATSAPP & PENYIMPANAN LOKAL (LOCALSTORAGE)
    // =========================================================================

    KspTarget.DEFAULT_TEMPLATE_SINGLE = `📊 *UPDATE TARGET & REALISASI BULAN {BULAN} {TAHUN}*
🏢 *Cabang:* {CABANG}
📅 *Periode:* {PERIODE} (Sisa {SISA_HARI} hari lagi)

🎯 *Target Bulanan:* {TARGET} Trx
📈 *Realisasi:* {REALISASI} Trx ({PERSEN}%)
⏳ *Sisa Target:* {SISA_TARGET} Trx

🚨 *TARGET HARIAN WAJIB:* {WAJIB_HARI} Trx/hari
📊 *Rata-rata Saat Ini:* {RATA2_SKRG} Trx/hari
⚡ *Status:* *{STATUS}* {GAP_INFO}

🌟 *SEMANGAT! PASTI BISA CAPAI!* 🚀`;

    KspTarget.DEFAULT_TEMPLATE_SUMMARY = `🏆 *REKAP TARGET & PROGRESS CABANG - {BULAN} {TAHUN}*
📊 Update Realisasi: {PERIODE}
🎯 Total Realisasi: *{TOTAL_REAL} / {TOTAL_TARGET} Trx* ({PERSEN}%)

{LIST_CABANG}

📌 *Catatan Kenaikan:*
{CATATAN_NAIK}

🔥 *{BULAN} {TAHUN} - Semangat Tim! {FOKUS}*`;

    /**
     * Dapatkan Template Tersimpan dari LocalStorage atau Default
     */
    KspTarget.getTemplate = function (mode) {
        try {
            const key = (mode === 'single') ? 'ksp_target_tpl_single' : 'ksp_target_tpl_summary';
            if (typeof localStorage !== 'undefined') {
                const saved = localStorage.getItem(key);
                if (saved && saved.trim()) return saved;
            }
        } catch (e) {
            console.warn('Gagal membaca template dari localStorage:', e);
        }
        return (mode === 'single') ? KspTarget.DEFAULT_TEMPLATE_SINGLE : KspTarget.DEFAULT_TEMPLATE_SUMMARY;
    };

    /**
     * Simpan Template Kustom ke LocalStorage
     */
    KspTarget.saveTemplate = function (mode, templateStr) {
        try {
            const key = (mode === 'single') ? 'ksp_target_tpl_single' : 'ksp_target_tpl_summary';
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, templateStr);
            }
            return true;
        } catch (e) {
            console.warn('Gagal menyimpan template ke localStorage:', e);
            return false;
        }
    };

    /**
     * Reset Template ke Nilai Default Asli
     */
    KspTarget.resetTemplate = function (mode) {
        try {
            const key = (mode === 'single') ? 'ksp_target_tpl_single' : 'ksp_target_tpl_summary';
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
            }
        } catch (e) {}
        return (mode === 'single') ? KspTarget.DEFAULT_TEMPLATE_SINGLE : KspTarget.DEFAULT_TEMPLATE_SUMMARY;
    };

    /**
     * Format teks pesan WhatsApp untuk Single Branch Card (Mendukung Template Kustom)
     */
    KspTarget.formatSingleBranchCaption = function (store, metrics, customTemplate) {
        const storeName = (store.name || 'CABANG').toUpperCase();
        const tpl = customTemplate || KspTarget.getTemplate('single');
        const gapInfo = metrics.gap > 0 ? `(Butuh naik +${metrics.gap} Trx/hari)` : '(Aman & On Track)';
        const gapSign = metrics.gap >= 0 ? `+${metrics.gap}` : `${metrics.gap}`;

        return tpl
            .replace(/\{CABANG\}/g, storeName)
            .replace(/\{BULAN\}/g, metrics.monthName.toUpperCase())
            .replace(/\{TAHUN\}/g, String(metrics.year))
            .replace(/\{PERIODE\}/g, metrics.updatePeriodText)
            .replace(/\{SISA_HARI\}/g, String(metrics.remainingDays))
            .replace(/\{TARGET\}/g, metrics.target.toLocaleString('id-ID'))
            .replace(/\{REALISASI\}/g, metrics.realization.toLocaleString('id-ID'))
            .replace(/\{PERSEN\}/g, metrics.percentage.toFixed(1))
            .replace(/\{SISA_TARGET\}/g, metrics.remainingTarget.toLocaleString('id-ID'))
            .replace(/\{WAJIB_HARI\}/g, metrics.requiredPerDay.toLocaleString('id-ID'))
            .replace(/\{RATA2_SKRG\}/g, metrics.currentAveragePerDay.toLocaleString('id-ID'))
            .replace(/\{STATUS\}/g, metrics.status)
            .replace(/\{GAP_NAIK\}/g, gapSign)
            .replace(/\{GAP_INFO\}/g, gapInfo);
    };

    /**
     * Format teks pesan WhatsApp untuk Rekap Semua Cabang (Mendukung Template Kustom)
     */
    KspTarget.formatAllBranchesCaption = function (summary, customTemplate) {
        const tpl = customTemplate || KspTarget.getTemplate('summary');

        let listText = '';
        summary.items.forEach((item, idx) => {
            const m = item.metrics;
            const bName = item.store.name.toUpperCase().replace(/^(KONTER|TOKO|CABANG)\s+/i, '');
            const badgeEmoji = m.status === 'TERCAPAI' ? '🏆' : (m.status === 'HAMPIR' ? '⚡' : '🔥');
            listText += `${idx + 1}. *${bName}*: Real ${m.realization.toLocaleString('id-ID')} / ${m.target.toLocaleString('id-ID')} (${m.percentage.toFixed(1)}%) | Wajib: *${m.requiredPerDay}/hr* | Skrg: ${m.currentAveragePerDay} [${badgeEmoji} ${m.status}]\n`;
        });

        return tpl
            .replace(/\{BULAN\}/g, summary.monthName.toUpperCase())
            .replace(/\{TAHUN\}/g, String(summary.year))
            .replace(/\{PERIODE\}/g, summary.updatePeriodText)
            .replace(/\{TOTAL_REAL\}/g, summary.grandRealization.toLocaleString('id-ID'))
            .replace(/\{TOTAL_TARGET\}/g, summary.grandTarget.toLocaleString('id-ID'))
            .replace(/\{PERSEN\}/g, summary.grandPercentage.toFixed(1))
            .replace(/\{LIST_CABANG\}/g, listText.trimEnd())
            .replace(/\{CATATAN_NAIK\}/g, summary.gapNotes)
            .replace(/\{FOKUS\}/g, summary.focusText);
    };

    /**
     * Bagikan Gambar ke WhatsApp:
     * - Mobile: Web Share API (1-klik langsung attach gambar PNG & caption ke WA)
     * - Desktop: Unduh otomatis PNG + Salin gambar ke Clipboard + buka WhatsApp link
     */
    KspTarget.shareToWhatsApp = async function (canvas, captionText, filename) {
        const blob = await KspTarget.canvasToBlob(canvas);
        const fileName = filename || `Target_KSP_${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // 1. Coba Web Share API (Android / iOS native share)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Progress Target Cabang',
                    text: captionText
                });
                return { mode: 'web_share', ok: true };
            } catch (err) {
                if (err.name === 'AbortError') {
                    return { mode: 'abort', ok: false };
                }
                console.warn('Web Share gagal, fallback ke desktop flow:', err);
            }
        }

        // 2. Desktop Fallback:
        // A. Unduh file PNG
        KspTarget.downloadCanvasImage(canvas, fileName);

        // B. Salin gambar ke clipboard jika didukung browser
        let clipboardOk = false;
        try {
            await KspTarget.copyCanvasToClipboard(canvas);
            clipboardOk = true;
        } catch (e) {
            console.warn('Clipboard write image tidak didukung:', e);
        }

        // C. Buka link WhatsApp Web / Desktop
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(captionText)}`;
        window.open(waUrl, '_blank');

        return {
            mode: 'fallback',
            ok: true,
            downloaded: true,
            clipboard: clipboardOk
        };
    };

    // Ekspor ke global / browser window
    if (typeof global !== 'undefined') {
        global.KspTarget = KspTarget;
    }
    if (typeof window !== 'undefined') {
        window.KspTarget = KspTarget;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = KspTarget;
    }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

