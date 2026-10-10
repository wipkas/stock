/**
 * KSP CHECK - MODUL ALASAN PERFORMA TRANSAKSI & PLUGGABLE EXTERNAL PROVIDERS
 * File: js/ksp_performance_reasons.js
 * 
 * Arsitektur:
 * 1. Reason Registry: Master daftar alasan penurunan/kenaikan transaksi dengan metadata terstruktur.
 * 2. Weather Provider: Integrasi API Cuaca Open-Meteo berbasis koordinat GPS cabang toko (tanpa API key).
 * 3. Calendar Provider: Deteksi otomatis periode hari gajian, awal bulan, tanggal tua, dan hari libur.
 * 4. Recommendation Engine: Menganalisa anomali transaksi + cuaca + kalender untuk menyarankan alasan akurat.
 * 5. Dynamic UI Renderer: Komponen render chip, badge riwayat, dan weather banner otomatis.
 */

(function (global) {
    'use strict';

    const KspReasons = {};

    // =========================================================================
    // 1. MASTER REASON REGISTRY (METADATA & KATALOG ALASAN)
    // =========================================================================

    const REASON_CATALOG = [
        // --- ALASAN PENURUNAN / SEPI (CONDITION: 'down') ---
        {
            id: 'heavy_rain',
            label: '🌧️ Hujan Deras',
            category: 'weather',
            condition: 'down',
            icon: '🌧️',
            description: 'Curah hujan deras menghambat mobilitas pelanggan datang ke toko',
            keywords: ['hujan', 'deras', 'lebat', 'gerimis', 'basah'],
            autoDetectProvider: 'weather'
        },
        {
            id: 'flood',
            label: '🌊 Banjir / Genangan',
            category: 'weather',
            condition: 'down',
            icon: '🌊',
            description: 'Genangan air atau banjir memblokir akses jalan menuju cabang',
            keywords: ['banjir', 'genangan', 'rob', 'air'],
            autoDetectProvider: 'weather'
        },
        {
            id: 'blackout',
            label: '⚡ Listrik Padam',
            category: 'utility',
            condition: 'down',
            icon: '⚡',
            description: 'Pemadaman listrik PLN lokal sehingga perangkat tidak dapat beroperasi normal',
            keywords: ['mati lampu', 'listrik', 'pln', 'padam'],
            autoDetectProvider: null
        },
        {
            id: 'signal_down',
            label: '🔌 Sinyal / Provider Down',
            category: 'infrastructure',
            condition: 'down',
            icon: '🔌',
            description: 'Gangguan sinyal seluler, modem, atau koneksi internet WiFi cabang',
            keywords: ['sinyal', 'jaringan', 'provider', 'wifi', 'down', 'lelet'],
            autoDetectProvider: 'network'
        },
        {
            id: 'server_error',
            label: '💻 Server / Bank Eror',
            category: 'system',
            condition: 'down',
            icon: '💻',
            description: 'Sistem bank, aggregator pulsa/e-wallet, atau aplikasi pusat sedang gangguan',
            keywords: ['server', 'bank', 'eror', 'error', 'gangguan', 'maintenance'],
            autoDetectProvider: 'system'
        },
        {
            id: 'stock_empty',
            label: '📦 Saldo Modal Habis',
            category: 'financial',
            condition: 'down',
            icon: '📦',
            description: 'Keterbatasan saldo modal top-up kasir di tengah jam operasional',
            keywords: ['saldo habis', 'modal', 'topup', 'saldo'],
            autoDetectProvider: null
        },
        {
            id: 'cash_empty',
            label: '💵 Uang Tunai Habis',
            category: 'financial',
            condition: 'down',
            icon: '💵',
            description: 'Ketersediaan uang tunai kasir habis untuk melayani tarik tunai nasabah',
            keywords: ['uang habis', 'cash', 'tunai', 'tarik tunai'],
            autoDetectProvider: null
        },
        {
            id: 'month_end',
            label: '💸 Tanggal Tua',
            category: 'calendar',
            condition: 'down',
            icon: '💸',
            description: 'Daya beli masyarakat menurun menjelang akhir siklus gajian (tgl 19-24)',
            keywords: ['tanggal tua', 'tgl tua', 'akhir bulan'],
            autoDetectProvider: 'calendar'
        },
        {
            id: 'holiday',
            label: '🛑 Hari Libur / Tgl Merah',
            category: 'calendar',
            condition: 'down',
            icon: '🛑',
            description: 'Hari libur nasional atau akhir pekan saat aktivitas usaha sekitar berkurang',
            keywords: ['libur', 'tanggal merah', 'minggu', 'cuti'],
            autoDetectProvider: 'calendar'
        },
        {
            id: 'road_closed',
            label: '🚧 Akses Jalan Ditutup',
            category: 'logistics',
            condition: 'down',
            icon: '🚧',
            description: 'Proyek perbaikan jalan, perbaikan jembatan, atau penutupan jalur',
            keywords: ['jalan ditutup', 'akses', 'proyek', 'macet', 'penutupan'],
            autoDetectProvider: null
        },
        {
            id: 'late_open',
            label: '⏳ Buka Terlambat',
            category: 'operation',
            condition: 'down',
            icon: '⏳',
            description: 'Cabang buka lebih lambat dari jam operasional yang ditentukan',
            keywords: ['telat', 'terlambat', 'kesiangan', 'buka telat'],
            autoDetectProvider: null
        },
        {
            id: 'limited_staff',
            label: '👥 Personil Terbatas',
            category: 'operation',
            condition: 'down',
            icon: '👥',
            description: 'Petugas kasir sedang bertugas sendiri atau ada rekan yang izin sakit',
            keywords: ['staf kurang', 'izin', 'sakit', 'sendiri', 'personil'],
            autoDetectProvider: null
        },

        // --- ALASAN KENAIKAN / RAMAI (CONDITION: 'up') ---
        {
            id: 'payday',
            label: '🎉 Hari Gajian',
            category: 'calendar',
            condition: 'up',
            icon: '🎉',
            description: 'Lonjakan transaksi masyarakat pada masa penerimaan gaji (tgl 25-31)',
            keywords: ['gajian', 'payroll', 'uang masuk'],
            autoDetectProvider: 'calendar'
        },
        {
            id: 'month_start',
            label: '📅 Awal Bulan (Tagihan)',
            category: 'calendar',
            condition: 'up',
            icon: '📅',
            description: 'Puncak pembayaran tagihan rutin bulanan (listrik, BPJS, PDAM, cicilan)',
            keywords: ['awal bulan', 'tagihan', 'angsuran', 'listrik', 'pdam'],
            autoDetectProvider: 'calendar'
        },
        {
            id: 'competitor_closed',
            label: '🏬 Toko Lain Tutup/Habis Saldo',
            category: 'market',
            condition: 'up',
            icon: '🏬',
            description: 'Konter atau agen sekitar tutup / kehabisan modal sehingga nasabah beralih ke sini',
            keywords: ['toko sebelah', 'kompetitor', 'tutup', 'saingan'],
            autoDetectProvider: null
        },
        {
            id: 'long_holiday',
            label: '🏖️ Libur Panjang / Event',
            category: 'calendar',
            condition: 'up',
            icon: '🏖️',
            description: 'Keramaian perayaan event lokal, pesta rakyat, atau libur panjang keluarga',
            keywords: ['event', 'libur panjang', 'pesta', 'festival', 'lebaran', 'tahun baru'],
            autoDetectProvider: 'calendar'
        },
        {
            id: 'promo',
            label: '🎁 Promo Cabang',
            category: 'marketing',
            condition: 'up',
            icon: '🎁',
            description: 'Antusiasme nasabah memanfaatkan promo potongan biaya admin atau kupon undian',
            keywords: ['promo', 'diskon', 'hadiah', 'cashback', 'gratis'],
            autoDetectProvider: null
        }
    ];

    KspReasons.getAllReasons = function () {
        return REASON_CATALOG;
    };

    KspReasons.getReasonsByCondition = function (condition) {
        if (!condition || condition === 'normal') return [];
        return REASON_CATALOG.filter(r => r.condition === condition);
    };

    KspReasons.findReasonByLabel = function (label) {
        if (!label) return null;
        const clean = label.trim().toLowerCase();
        return REASON_CATALOG.find(r => r.label.toLowerCase() === clean || r.id === clean) || null;
    };

    // =========================================================================
    // 2. WEATHER PROVIDER (OPEN-METEO API INTEGRATION)
    // =========================================================================
    // Menggunakan Open-Meteo API yang gratis, tanpa API Key, mendukung koordinat seluruh Indonesia.
    // Dokumentasi: https://open-meteo.com/en/docs
    // =========================================================================

    const weatherCache = new Map();
    const WEATHER_CACHE_TTL = 15 * 60 * 1000; // 15 menit cache

    /**
     * Konfigurasi kalibrasi cuaca (dapat diubah dari luar: KspReasons.weatherConfig.rainHourThresholdMm = 0.5)
     * - rainHourThresholdMm: 1 jam baru dihitung "jam hujan" jika curah hujan model >= nilai ini (mm/jam).
     *   Kode cuaca (mis. "Badai Petir") TANPA curah hujan berarti tidak lagi dihitung sebagai jam hujan.
     * - dailyRainMinMm: total curah hujan harian minimum agar hari dianggap "ada hujan" walau tidak ada jam yang lolos ambang.
     * - timezone: 'auto' = zona waktu lokal sesuai koordinat cabang (WIB/WITA/WIT).
     */
    const WEATHER_CONFIG = {
        rainHourThresholdMm: 0.3,
        dailyRainMinMm: 1.0,
        timezone: 'auto'
    };
    KspReasons.weatherConfig = WEATHER_CONFIG;

    // WMO Weather interpretation codes
    const WMO_CODE_MAP = {
        0:  { desc: 'Cerah', icon: '☀️', rainLevel: 0 },
        1:  { desc: 'Cerah Berawan', icon: '🌤️', rainLevel: 0 },
        2:  { desc: 'Berawan Sebagian', icon: '⛅', rainLevel: 0 },
        3:  { desc: 'Mendung', icon: '☁️', rainLevel: 0 },
        45: { desc: 'Berkabut', icon: '🌫️', rainLevel: 0 },
        48: { desc: 'Kabut Tebal', icon: '🌫️', rainLevel: 0 },
        51: { desc: 'Gerimis Ringan', icon: '🌦️', rainLevel: 1 },
        53: { desc: 'Gerimis Sedang', icon: '🌦️', rainLevel: 1 },
        55: { desc: 'Gerimis Lebat', icon: '🌧️', rainLevel: 2 },
        61: { desc: 'Hujan Ringan', icon: '🌧️', rainLevel: 1 },
        63: { desc: 'Hujan Sedang', icon: '🌧️', rainLevel: 2 },
        65: { desc: 'Hujan Deras', icon: '⛈️', rainLevel: 3 },
        80: { desc: 'Hujan Lokal', icon: '🌦️', rainLevel: 1 },
        81: { desc: 'Hujan Lebat Sesaat', icon: '🌧️', rainLevel: 2 },
        82: { desc: 'Hujan Sangat Deras', icon: '⛈️', rainLevel: 3 },
        95: { desc: 'Badai Petir', icon: '🌩️', rainLevel: 3 },
        96: { desc: 'Badai Petir & Es', icon: '⛈️', rainLevel: 3 },
        99: { desc: 'Badai Petir Dahsyat', icon: '⛈️', rainLevel: 3 }
    };

    function groupContiguousHours(hours) {
        if (!hours || hours.length === 0) return [];
        const sorted = Array.from(new Set(hours)).sort((a, b) => a - b);
        const ranges = [];
        let start = sorted[0];
        let prev = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === prev + 1) {
                prev = sorted[i];
            } else {
                const end = prev + 1;
                ranges.push(String(start).padStart(2, '0') + ':00 - ' + String(end).padStart(2, '0') + ':00');
                start = sorted[i];
                prev = sorted[i];
            }
        }
        const end = prev + 1;
        ranges.push(String(start).padStart(2, '0') + ':00 - ' + String(end).padStart(2, '0') + ':00');
        return ranges;
    }

    function parseShiftHours(s, idx) {
        const num = (s && s.shift_num) ? parseInt(s.shift_num, 10) : (idx + 1);
        const name = (s && s.name) ? s.name : `Shift ${num}`;
        let startStr = (s && s.start) ? String(s.start).trim() : (num === 1 ? '07:00' : '15:00');
        let endStr = (s && s.end) ? String(s.end).trim() : (num === 1 ? '15:00' : '23:00');
        const startH = parseInt(startStr.split(':')[0], 10) || (num === 1 ? 7 : 15);
        const endH = parseInt(endStr.split(':')[0], 10) || (num === 1 ? 15 : 23);
        const isOvernight = endH < startH;
        return { shiftNum: num, shiftName: name, startH, endH, startStr, endStr, isOvernight };
    }

    function isHourInShift(h, shift) {
        if (shift.isOvernight) {
            return h >= shift.startH || h < shift.endH;
        }
        return h >= shift.startH && h < shift.endH;
    }

    function analyzeRainAndShifts(hourlyPoints, storeShifts) {
        const rainHours = hourlyPoints.filter(p => p.isRain).map(p => p.hour);
        const dailyTotalRainHours = rainHours.length;
        const dailyTotalRainMm = Number(hourlyPoints.reduce((sum, p) => sum + (p.rainMm || 0), 0).toFixed(1));
        const dailyRainRanges = groupContiguousHours(rainHours);
        const peakPoint = hourlyPoints.reduce((max, p) => (p.rainMm > max.rainMm ? p : max), hourlyPoints[0] || { rainMm: 0, hour: 0 });

        let rawShifts = Array.isArray(storeShifts) && storeShifts.length > 0 ? storeShifts : [
            { shift_num: 1, name: 'Shift 1 Pagi', start: '07:00', end: '15:00' },
            { shift_num: 2, name: 'Shift 2 Malam', start: '15:00', end: '23:00' }
        ];

        const parsedShifts = rawShifts.map((s, idx) => parseShiftHours(s, idx));

        const shiftsAnalysis = parsedShifts.map(shift => {
            const shiftRainList = rainHours.filter(h => isHourInShift(h, shift));
            const shiftPoints = hourlyPoints.filter(p => isHourInShift(p.hour, shift));
            const shiftRainHours = shiftRainList.length;
            const shiftRainMm = Number(shiftPoints.reduce((sum, p) => sum + (p.rainMm || 0), 0).toFixed(1));
            const shiftRainRanges = groupContiguousHours(shiftRainList);

            // Cek hujan sebelum buka shift (2 jam sebelumnya)
            const preH1 = (shift.startH - 2 + 24) % 24;
            const preH2 = (shift.startH - 1 + 24) % 24;
            const preHours = [preH1, preH2];
            const preRainList = rainHours.filter(h => preHours.includes(h));
            const prePoints = hourlyPoints.filter(p => preHours.includes(p.hour));
            const rainBeforeShiftHours = preRainList.length;
            const rainBeforeShiftMm = Number(prePoints.reduce((sum, p) => sum + (p.rainMm || 0), 0).toFixed(1));
            const rainBeforeShiftRanges = groupContiguousHours(preRainList);

            let impact = 'none';
            if (shiftRainMm >= 15.0 || shiftRainHours >= 4) {
                impact = 'flood_risk';
            } else if (shiftRainHours >= 2 || shiftRainMm >= 5.0) {
                impact = 'high';
            } else if (shiftRainHours >= 1 && shiftRainMm >= 2.0) {
                impact = 'medium';
            } else if (shiftRainHours >= 1) {
                impact = 'low';
            }

            let summaryText = 'Cerah / tidak ada hujan di jam kerja ini';
            if (shiftRainHours > 0) {
                summaryText = `Hujan ${shiftRainHours} jam (${shiftRainRanges.join(', ')}, ${shiftRainMm} mm)`;
            }

            return {
                shiftNum: shift.shiftNum,
                shiftName: shift.shiftName,
                shiftHours: `${shift.startStr} - ${shift.endStr}`,
                startH: shift.startH,
                endH: shift.endH,
                isOvernight: shift.isOvernight,
                rainHoursDuringShift: shiftRainHours,
                rainMmDuringShift: shiftRainMm,
                rainRangesDuringShift: shiftRainRanges,
                rainBeforeShiftHours,
                rainBeforeShiftMm,
                rainBeforeShiftRanges,
                impact,
                summaryText
            };
        });

        const isFloodingRisk = dailyTotalRainMm >= 25.0 || peakPoint.rainMm >= 12.0 || shiftsAnalysis.some(s => s.impact === 'flood_risk');
        const isHeavyRain = dailyTotalRainMm >= 10.0 || peakPoint.rainMm >= 4.0 || shiftsAnalysis.some(s => s.impact === 'high' || s.impact === 'flood_risk');
        const isRaining = dailyTotalRainHours > 0 || dailyTotalRainMm >= WEATHER_CONFIG.dailyRainMinMm;

        return {
            dailyTotalRainHours,
            dailyTotalRainMm,
            dailyRainRanges,
            peakPoint,
            isRaining,
            isHeavyRain,
            isFloodingRisk,
            shiftsAnalysis
        };
    }

    /**
     * Mengambil riwayat kondisi cuaca per tanggal dan jam, lengkap dengan pencocokan shift toko.
     * @param {number} lat - Latitude (contoh: 0.5071)
     * @param {number} lng - Longitude (contoh: 101.4478)
     * @param {string|null} targetDate - Tanggal YYYY-MM-DD (opsional, default hari ini)
     * @param {Object} options - { shifts: Array }
     * @returns {Promise<Object|null>} Detail cuaca atau null jika offline/gagal
     */
    KspReasons.fetchStoreWeather = async function (lat, lng, targetDate = null, options = {}) {
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

        let dateStr = targetDate;
        if (!dateStr || typeof dateStr !== 'string' || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            dateStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        }

        const todayStr = new Date().toLocaleDateString('en-CA');
        const isToday = (dateStr === todayStr);

        const cacheKey = `${Number(lat).toFixed(3)}_${Number(lng).toFixed(3)}_${dateStr}`;
        const cached = weatherCache.get(cacheKey);
        const ttl = isToday ? WEATHER_CACHE_TTL : (12 * 60 * 60 * 1000); // 12 jam untuk riwayat lampau
        if (cached && (Date.now() - cached.timestamp < ttl)) {
            return cached.data;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5 detik timeout

            // Endpoint Open-Meteo untuk tanggal terpilih.
            // timezone=auto → jam per jam dikembalikan dalam zona waktu lokal koordinat cabang (WIB/WITA/WIT),
            // sehingga cocok dengan jam shift toko yang dicatat dalam waktu lokal.
            const tzParam = encodeURIComponent(WEATHER_CONFIG.timezone || 'auto');
            let url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&start_date=${dateStr}&end_date=${dateStr}&hourly=precipitation,rain,showers,weather_code,temperature_2m&timezone=${tzParam}`;
            if (isToday) {
                url += '&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,weather_code,wind_speed_10m';
            }

            let resp = await fetch(url, { signal: controller.signal });
            // Fallback ke archive API jika tanggal lebih dari 92 hari lalu
            if (!resp.ok && resp.status >= 400 && dateStr < todayStr) {
                const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&start_date=${dateStr}&end_date=${dateStr}&hourly=precipitation,rain,weather_code,temperature_2m&timezone=${tzParam}`;
                resp = await fetch(archiveUrl, { signal: controller.signal });
            }
            clearTimeout(timeoutId);

            if (!resp.ok) return null;
            const json = await resp.json();
            const hourly = json.hourly;
            if (!hourly || !Array.isArray(hourly.time)) return null;

            const precips = hourly.precipitation || [];
            const rains = hourly.rain || [];
            const showers = hourly.showers || [];
            const codes = hourly.weather_code || [];
            const temps = hourly.temperature_2m || [];

            // Petakan jam lokal → index berdasarkan string waktu API ("YYYY-MM-DDTHH:00"),
            // bukan berdasarkan posisi array, agar tetap benar apa pun zona waktunya.
            const hourIndex = {};
            hourly.time.forEach((t, idx) => {
                const m = String(t).match(/T(\d{2}):/);
                if (m && String(t).startsWith(dateStr)) {
                    const hh = parseInt(m[1], 10);
                    if (hourIndex[hh] === undefined) hourIndex[hh] = idx;
                }
            });

            const threshold = Number(WEATHER_CONFIG.rainHourThresholdMm) || 0.3;
            const hourlyPoints = [];
            for (let h = 0; h < 24; h++) {
                const i = (hourIndex[h] !== undefined) ? hourIndex[h] : h;
                const pMm = precips[i] || 0;
                const rMm = (rains[i] || 0) + (showers[i] || 0);
                const rainMm = Math.max(pMm, rMm);
                const code = codes[i] || 0;
                const wmo = WMO_CODE_MAP[code] || { desc: 'Cerah', icon: '☀️', rainLevel: 0 };
                // Jam hujan HANYA jika curah hujan model mencapai ambang.
                // Kode cuaca hujan/badai tanpa curah hujan berarti ditandai sebagai "sinyal model" saja.
                const isRain = rainMm >= threshold;
                const modelSignalOnly = !isRain && wmo.rainLevel > 0;
                hourlyPoints.push({
                    hour: h,
                    timeStr: String(h).padStart(2, '0') + ':00',
                    rainMm: Number(rainMm.toFixed(1)),
                    weatherCode: code,
                    weatherDesc: wmo.desc,
                    weatherIcon: wmo.icon,
                    rainLevel: wmo.rainLevel,
                    temperature: Math.round(temps[i] || 0),
                    isRain,
                    modelSignalOnly
                });
            }

            const analysis = analyzeRainAndShifts(hourlyPoints, options.shifts || []);

            // Info zona waktu lokal cabang
            const offsetSec = Number(json.utc_offset_seconds);
            const TZ_ABBR_BY_OFFSET = { 25200: 'WIB', 28800: 'WITA', 32400: 'WIT' };
            const tzAbbr = TZ_ABBR_BY_OFFSET[offsetSec] || json.timezone_abbreviation || '';
            const tzName = json.timezone || '';

            // Cuaca representatif hari itu (atau current jika hari ini)
            let currTemp = null;
            let currCode = null;
            let currDesc = 'Cerah';
            let currIcon = '☀️';

            if (isToday && json.current) {
                const curr = json.current;
                currTemp = Math.round(curr.temperature_2m || 0);
                currCode = curr.weather_code;
                const w = WMO_CODE_MAP[currCode] || { desc: 'Biasa', icon: '🌤️' };
                currDesc = w.desc;
                currIcon = w.icon;
            } else {
                const mid = hourlyPoints[12] || hourlyPoints[0] || {};
                const peak = analysis.peakPoint && analysis.peakPoint.rainMm >= threshold ? analysis.peakPoint : mid;
                currTemp = mid.temperature || 28;
                currCode = peak.weatherCode || 0;
                currDesc = peak.weatherDesc || 'Cerah';
                currIcon = peak.weatherIcon || '☀️';
            }

            const suggestedReasons = [];
            if (analysis.isFloodingRisk) {
                suggestedReasons.push('🌊 Banjir / Genangan', '🌧️ Hujan Deras');
            } else if (analysis.isHeavyRain || analysis.isRaining) {
                suggestedReasons.push('🌧️ Hujan Deras');
            }

            const weatherData = {
                lat,
                lng,
                dateKey: dateStr,
                isToday,
                timezone: tzName,
                tzAbbr,
                rainHourThresholdMm: threshold,
                temperature: currTemp,
                weatherCode: currCode,
                weatherDesc: currDesc,
                weatherIcon: currIcon,
                rainAmount: analysis.dailyTotalRainMm,
                hourlyPoints,
                ...analysis,
                suggestedReasons,
                fetchedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            };

            weatherCache.set(cacheKey, { timestamp: Date.now(), data: weatherData });
            return weatherData;
        } catch (err) {
            // Fail-safe: jika offline atau blokir CORS, sistem tetap berjalan tanpa error
            return null;
        }
    };

    // =========================================================================
    // 3. CALENDAR & TIME PROVIDER
    // =========================================================================

    /**
     * Menganalisa tanggal untuk faktor siklus gajian, awal bulan, tanggal tua, atau akhir pekan.
     * @param {Date|string} targetDate - Tanggal transaksi (YYYY-MM-DD atau Date)
     * @returns {Object} Rekomendasi faktor kalender
     */
    KspReasons.detectCalendarFactors = function (targetDate) {
        let d = new Date();
        if (targetDate) {
            d = (typeof targetDate === 'string') ? new Date(targetDate + 'T12:00:00') : new Date(targetDate);
        }
        if (isNaN(d.getTime())) d = new Date();

        const dayOfMonth = d.getDate();
        const dayOfWeek = d.getDay(); // 0 = Minggu, 6 = Sabtu

        const isPaydayWindow = (dayOfMonth >= 25 && dayOfMonth <= 31) || (dayOfMonth === 1);
        const isMonthStartWindow = (dayOfMonth >= 1 && dayOfMonth <= 6);
        const isMonthEndWindow = (dayOfMonth >= 19 && dayOfMonth <= 24);
        const isSunday = (dayOfWeek === 0);

        const downSuggestions = [];
        const upSuggestions = [];

        if (isPaydayWindow) {
            upSuggestions.push('🎉 Hari Gajian');
        }
        if (isMonthStartWindow) {
            upSuggestions.push('📅 Awal Bulan (Tagihan)');
        }
        if (isMonthEndWindow) {
            downSuggestions.push('💸 Tanggal Tua');
        }
        if (isSunday) {
            downSuggestions.push('🛑 Hari Libur / Tgl Merah');
            upSuggestions.push('🏖️ Libur Panjang / Event');
        }

        return {
            dateStr: d.toISOString().slice(0, 10),
            dayOfMonth,
            dayOfWeek,
            isPaydayWindow,
            isMonthStartWindow,
            isMonthEndWindow,
            isSunday,
            downSuggestions,
            upSuggestions
        };
    };

    // =========================================================================
    // 4. SMART RECOMMENDATION ENGINE (GABUNGAN CUACA + KALENDER + STATISTIK)
    // =========================================================================

    /**
     * Menggabungkan cuaca cabang dan kalender untuk menghasilkan saran alasan otomatis
     * @param {Object} options - { storeCoordinates, date, currentCondition, pctDiff, shiftNum, shifts }
     * @returns {Promise<Object>} { suggestedReasons, weather, calendar, hintText }
     */
    KspReasons.getSmartRecommendations = async function (options = {}) {
        const { storeCoordinates, date, currentCondition, pctDiff, shiftNum, shifts } = options;

        const calendarInfo = KspReasons.detectCalendarFactors(date);
        let weatherInfo = null;

        if (storeCoordinates && storeCoordinates.lat && storeCoordinates.lng) {
            weatherInfo = await KspReasons.fetchStoreWeather(storeCoordinates.lat, storeCoordinates.lng, date, { shifts, shiftNum });
        }

        const suggestedSet = new Set();
        let hintParts = [];

        if (currentCondition === 'down') {
            if (weatherInfo) {
                let shiftData = null;
                if (shiftNum && Array.isArray(weatherInfo.shiftsAnalysis)) {
                    shiftData = weatherInfo.shiftsAnalysis.find(s => s.shiftNum === parseInt(shiftNum, 10));
                }

                if (shiftData) {
                    if (shiftData.impact === 'flood_risk') {
                        suggestedSet.add('🌊 Banjir / Genangan');
                        suggestedSet.add('🌧️ Hujan Deras');
                        hintParts.push(`🌊 Hujan lebat & potensi genangan ${shiftData.shiftRainHours} jam saat ${shiftData.shiftName} (${shiftData.rainRangesDuringShift.join(', ')}, ${shiftData.rainMmDuringShift} mm)`);
                    } else if (shiftData.impact === 'high' || shiftData.impact === 'medium') {
                        suggestedSet.add('🌧️ Hujan Deras');
                        hintParts.push(`🌧️ Hujan ${shiftData.shiftRainHours} jam saat ${shiftData.shiftName} (${shiftData.rainRangesDuringShift.join(', ')}, ${shiftData.rainMmDuringShift} mm)`);
                    } else if (shiftData.rainBeforeShiftHours >= 1 && shiftData.rainBeforeShiftMm >= 2.0) {
                        suggestedSet.add('🌧️ Hujan Deras');
                        hintParts.push(`🌧️ Sempat hujan sebelum buka ${shiftData.shiftName} (${shiftData.rainBeforeShiftRanges.join(', ')}, ${shiftData.rainBeforeShiftMm} mm)`);
                    } else if (shiftData.rainHoursDuringShift === 0) {
                        if (weatherInfo.dailyTotalRainHours > 0) {
                            hintParts.push(`🌤️ Jam kerja ${shiftData.shiftName} (${shiftData.shiftHours}) cerah. Hujan terjadi di shift lain (${weatherInfo.dailyRainRanges.join(', ')})`);
                        }
                    }
                } else {
                    if (weatherInfo.isFloodingRisk) {
                        suggestedSet.add('🌊 Banjir / Genangan');
                        suggestedSet.add('🌧️ Hujan Deras');
                        hintParts.push(`🌊 Hujan total ${weatherInfo.dailyTotalRainHours} jam berpotensi genangan (${weatherInfo.dailyTotalRainMm} mm)`);
                    } else if (weatherInfo.isHeavyRain || weatherInfo.isRaining) {
                        suggestedSet.add('🌧️ Hujan Deras');
                        hintParts.push(`🌧️ Hujan total ${weatherInfo.dailyTotalRainHours} jam (${weatherInfo.dailyRainRanges.join(', ')}, ${weatherInfo.dailyTotalRainMm} mm)`);
                    }
                }
            }
            calendarInfo.downSuggestions.forEach(r => suggestedSet.add(r));
        } else if (currentCondition === 'up') {
            calendarInfo.upSuggestions.forEach(r => suggestedSet.add(r));
        }

        const suggestedReasons = Array.from(suggestedSet);

        if (calendarInfo.isPaydayWindow && currentCondition === 'up') {
            hintParts.push(`🎉 Periode gajian tgl ${calendarInfo.dayOfMonth}`);
        } else if (calendarInfo.isMonthEndWindow && currentCondition === 'down') {
            hintParts.push(`💸 Tanggal tua (${calendarInfo.dayOfMonth})`);
        } else if (calendarInfo.isSunday) {
            hintParts.push(`🛑 Hari Libur / Minggu`);
        }

        return {
            suggestedReasons,
            weather: weatherInfo,
            calendar: calendarInfo,
            hintText: hintParts.join(' • ')
        };
    };

    // =========================================================================
    // 5. DYNAMIC UI RENDERERS (CHIPS, BADGES, WEATHER BANNER)
    // =========================================================================

    function ensureStyles() {
        if (typeof document === 'undefined' || document.getElementById('kspReasonsStyles')) return;
        const style = document.createElement('style');
        style.id = 'kspReasonsStyles';
        style.textContent = `
            .tx-reason-chip.suggested {
                border-color: #3b82f6 !important;
                background: rgba(59, 130, 246, 0.08) !important;
                color: #2563eb !important;
                box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25);
            }
            .reason-sparkle {
                display: inline-block;
                animation: kspSparklePulse 1.8s infinite ease-in-out;
            }
            @keyframes kspSparklePulse {
                0%, 100% { transform: scale(1); opacity: 0.85; }
                50% { transform: scale(1.25); opacity: 1; }
            }
            .weather-timeline-bar {
                display: flex;
                gap: 2px;
                background: rgba(0, 0, 0, 0.05);
                padding: 4px 6px;
                border-radius: 6px;
            }
            .weather-hour-segment {
                flex: 1;
                height: 14px;
                border-radius: 2px;
                position: relative;
                cursor: pointer;
                transition: transform 0.15s ease;
            }
            .weather-hour-segment:hover {
                transform: scaleY(1.35);
            }
            .weather-hour-segment.in-shift {
                outline: 1.5px solid rgba(0, 0, 0, 0.35);
                outline-offset: -1px;
            }
            .weather-hour-segment.rain-light {
                background: #93c5fd;
            }
            .weather-hour-segment.rain-medium {
                background: #3b82f6;
            }
            .weather-hour-segment.rain-heavy {
                background: #1d4ed8;
            }
            .weather-hour-segment.rain-extreme {
                background: #1e1b4b;
            }
            .weather-hour-segment.clear {
                background: rgba(148, 163, 184, 0.25);
            }
            .weather-hour-segment.model-signal {
                background: repeating-linear-gradient(45deg, rgba(147, 197, 253, 0.35) 0 2px, transparent 2px 4px);
                outline: 1px dashed rgba(59, 130, 246, 0.45);
                outline-offset: -1px;
            }
            body.dark-theme .weather-hour-segment.in-shift {
                outline-color: rgba(255, 255, 255, 0.6);
            }
            body.dark-theme .weather-timeline-bar {
                background: rgba(255, 255, 255, 0.06);
            }
            body.dark-theme .weather-hour-segment.clear {
                background: rgba(255, 255, 255, 0.1);
            }
            .weather-radar-btn {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                background: rgba(59, 130, 246, 0.08);
                color: #2563eb;
                border: 1px solid rgba(59, 130, 246, 0.28);
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 10px;
                font-weight: 700;
                text-decoration: none;
                transition: all 0.15s ease;
            }
            .weather-radar-btn:hover {
                background: #2563eb;
                color: #ffffff;
                box-shadow: 0 2px 5px rgba(37, 99, 235, 0.25);
            }
            body.dark-theme .weather-radar-btn {
                background: rgba(59, 130, 246, 0.15);
                color: #60a5fa;
                border-color: rgba(96, 165, 250, 0.35);
            }
            body.dark-theme .weather-radar-btn:hover {
                background: #3b82f6;
                color: #ffffff;
            }
            .ksp-input-glow {
                animation: kspInputPulseGlow 1.4s ease-out;
            }
            @keyframes kspInputPulseGlow {
                0% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.45); border-color: #3b82f6 !important; }
                50% { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25); border-color: #3b82f6 !important; }
                100% { box-shadow: none; }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Me-render tombol-tombol chip alasan secara dinamis ke container HTML
     * @param {HTMLElement|string} container - Elemen container atau ID
     * @param {Object} config - { condition: 'down'|'up', selectedReasons: [], suggestedReasons: [], onToggle: Function }
     */
    KspReasons.renderChips = function (container, config = {}) {
        ensureStyles();
        const el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) return;

        const condition = config.condition || 'down';
        const selected = new Set(config.selectedReasons || []);
        const suggested = new Set(config.suggestedReasons || []);
        const onToggle = typeof config.onToggle === 'function' ? config.onToggle : null;

        const reasons = KspReasons.getReasonsByCondition(condition);

        el.innerHTML = '';
        el.className = 'tx-chips-cloud';

        reasons.forEach(reason => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tx-reason-chip';
            btn.setAttribute('data-reason', reason.label);
            btn.setAttribute('data-category', reason.category);

            const isSelected = selected.has(reason.label);
            const isSuggested = suggested.has(reason.label);

            if (isSelected) {
                btn.classList.add('active', 'selected');
            }
            if (isSuggested && !isSelected) {
                btn.classList.add('suggested');
            }

            // Konten tombol chip
            let contentHtml = reason.label;
            if (isSuggested) {
                contentHtml += ' <span class="reason-sparkle" title="Disarankan otomatis berdasarkan cuaca/kalender" style="font-size: 10px; margin-left: 2px;">✨</span>';
            }
            btn.innerHTML = contentHtml;

            btn.addEventListener('click', function (e) {
                e.preventDefault();
                const nowActive = btn.classList.toggle('selected');
                btn.classList.toggle('active', nowActive);
                if (nowActive) {
                    selected.add(reason.label);
                    btn.classList.remove('suggested');
                } else {
                    selected.delete(reason.label);
                    if (isSuggested) btn.classList.add('suggested');
                }

                if (onToggle) {
                    onToggle(reason.label, nowActive, Array.from(selected));
                }
            });

            el.appendChild(btn);
        });
    };

    /**
     * Me-render banner status cuaca terkalibrasi di bagian atas modal catatan harian
     * @param {HTMLElement|string} container - Elemen container atau ID
     * @param {Object} weatherData - Hasil dari fetchStoreWeather
     * @param {Function} onApplySuggestion - Callback saat tombol klik terapkan: function(reasons, autoNoteText)
     * @param {Object} options - { shiftNum: number, shifts: Array }
     */
    KspReasons.renderWeatherBanner = function (container, weatherData, onApplySuggestion, options = {}) {
        ensureStyles();
        const el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) return;

        if (!weatherData) {
            el.innerHTML = '';
            el.style.display = 'none';
            return;
        }

        const shiftNum = options.shiftNum ? parseInt(options.shiftNum, 10) : null;
        let shiftData = null;
        if (shiftNum && Array.isArray(weatherData.shiftsAnalysis)) {
            shiftData = weatherData.shiftsAnalysis.find(s => s.shiftNum === shiftNum);
        }

        const isRainInShift = shiftData ? (shiftData.rainHoursDuringShift > 0 || shiftData.rainBeforeShiftHours > 0) : weatherData.isRaining;
        const isHeavy = shiftData ? (shiftData.impact === 'high' || shiftData.impact === 'flood_risk') : weatherData.isHeavyRain;
        const isFlood = shiftData ? (shiftData.impact === 'flood_risk') : weatherData.isFloodingRisk;

        let bg = 'rgba(245, 158, 11, 0.08)';
        let border = 'rgba(245, 158, 11, 0.25)';
        let color = '#D97706';
        let statusTitle = 'Cuaca Cerah / Berawan';
        let statusIcon = '🌤️';

        if (isFlood) {
            bg = 'rgba(239, 68, 68, 0.1)';
            border = 'rgba(239, 68, 68, 0.35)';
            color = '#DC2626';
            statusTitle = shiftData ? `Hujan Sangat Deras / Risiko Genangan saat ${shiftData.shiftName}` : `Hujan Sangat Deras / Risiko Genangan`;
            statusIcon = '🌊';
        } else if (isHeavy) {
            bg = 'rgba(37, 99, 235, 0.1)';
            border = 'rgba(37, 99, 235, 0.35)';
            color = '#1D4ED8';
            statusTitle = shiftData ? `Hujan Deras saat ${shiftData.shiftName}` : `Hujan Deras di Wilayah Cabang`;
            statusIcon = '⛈️';
        } else if (isRainInShift) {
            bg = 'rgba(59, 130, 246, 0.08)';
            border = 'rgba(59, 130, 246, 0.25)';
            color = '#2563EB';
            statusTitle = shiftData ? `Hujan saat ${shiftData.shiftName}` : `Ada Hujan di Wilayah Cabang`;
            statusIcon = '🌧️';
        } else if (weatherData.dailyTotalRainHours > 0 && shiftData) {
            bg = 'rgba(16, 185, 129, 0.08)';
            border = 'rgba(16, 185, 129, 0.25)';
            color = '#059669';
            statusTitle = `Jam Kerja ${shiftData.shiftName} (${shiftData.shiftHours}) Aman / Cerah`;
            statusIcon = '🌤️';
        } else {
            statusTitle = `Cuaca Cerah (${weatherData.temperature}°C)`;
            statusIcon = weatherData.weatherIcon || '☀️';
        }

        let detailHtml = '';
        let autoNoteText = '';

        if (shiftData) {
            if (shiftData.rainHoursDuringShift > 0) {
                detailHtml += `<div>🕒 <strong>Jam Hujan:</strong> ${shiftData.rainRangesDuringShift.join(', ')} (${shiftData.rainHoursDuringShift} jam di jam kerja ${shiftData.shiftHours})</div>`;
                detailHtml += `<div>💧 <strong>Curah Hujan Shift:</strong> ${shiftData.rainMmDuringShift} mm (Total hari ini: ${weatherData.dailyTotalRainMm} mm)</div>`;
                autoNoteText = `[Hujan ${shiftData.rainRangesDuringShift.join(', ')} (${shiftData.rainHoursDuringShift} jam, ${shiftData.rainMmDuringShift} mm) saat ${shiftData.shiftName}]`;
            } else if (shiftData.rainBeforeShiftHours > 0) {
                detailHtml += `<div>⚠️ <strong>Hujan Sebelum Buka:</strong> ${shiftData.rainBeforeShiftRanges.join(', ')} (${shiftData.rainBeforeShiftHours} jam, ${shiftData.rainBeforeShiftMm} mm)</div>`;
                autoNoteText = `[Hujan sebelum buka ${shiftData.rainBeforeShiftRanges.join(', ')} (${shiftData.rainBeforeShiftHours} jam)]`;
            } else if (weatherData.dailyTotalRainHours > 0) {
                detailHtml += `<div>ℹ️ Hujan turun di luar shift ini (${weatherData.dailyRainRanges.join(', ')}, total ${weatherData.dailyTotalRainHours} jam, ${weatherData.dailyTotalRainMm} mm).</div>`;
                autoNoteText = `[Hujan di shift lain (${weatherData.dailyRainRanges.join(', ')}, ${weatherData.dailyTotalRainHours} jam)]`;
            } else if (weatherData.isRaining) {
                detailHtml += `<div>🌦️ Curah hujan harian terdeteksi ${weatherData.dailyTotalRainMm || 0} mm (${weatherData.weatherDesc || 'Hujan'}).</div>`;
                autoNoteText = `[Cuaca ${weatherData.weatherDesc || 'Hujan'} (${weatherData.temperature ? weatherData.temperature + '°C' : ''}), curah hujan ${weatherData.dailyTotalRainMm || 0} mm]`;
            } else {
                detailHtml += `<div>☀️ Tidak ada catatan hujan pada jam kerja ini.</div>`;
            }
        } else {
            if (weatherData.dailyTotalRainHours > 0) {
                detailHtml += `<div>🕒 <strong>Rentang Hujan:</strong> ${weatherData.dailyRainRanges.join(', ')} (Total ${weatherData.dailyTotalRainHours} jam, ${weatherData.dailyTotalRainMm} mm)</div>`;
                if (Array.isArray(weatherData.shiftsAnalysis)) {
                    const shiftsInfo = weatherData.shiftsAnalysis.map(s => {
                        return `${s.shiftName}: ${s.rainHoursDuringShift > 0 ? `${s.rainHoursDuringShift} jam (${s.rainRangesDuringShift.join(', ')})` : 'Cerah'}`;
                    }).join(' • ');
                    detailHtml += `<div style="font-size: 10px; margin-top: 2px;">👥 <strong>Per Shift:</strong> ${shiftsInfo}</div>`;
                }
                autoNoteText = `[Hujan ${weatherData.dailyRainRanges.join(', ')} (Total ${weatherData.dailyTotalRainHours} jam, ${weatherData.dailyTotalRainMm} mm)]`;
            } else if (weatherData.isRaining) {
                detailHtml += `<div>🌦️ Terdeteksi hujan/gerimis (${weatherData.dailyTotalRainMm || 0} mm, ${weatherData.weatherDesc}).</div>`;
                autoNoteText = `[Cuaca ${weatherData.weatherDesc || 'Hujan'} (${weatherData.temperature ? weatherData.temperature + '°C' : ''}), curah hujan ${weatherData.dailyTotalRainMm || 0} mm]`;
            } else {
                detailHtml += `<div>☀️ Cuaca cerah di sekitar cabang sepanjang hari.</div>`;
            }
        }

        // Pastikan fallback aman agar autoNoteText tidak pernah kosong jika tombol pasang catatan muncul
        if (!autoNoteText && (isRainInShift || weatherData.dailyTotalRainHours > 0 || weatherData.isRaining)) {
            autoNoteText = `[Kondisi cuaca: ${weatherData.weatherDesc || 'Hujan'} (${weatherData.dailyTotalRainMm || 0} mm)]`;
        }

        const lat = weatherData.lat;
        const lng = weatherData.lng;
        const hasCoords = (lat && lng && !isNaN(lat) && !isNaN(lng));
        const windyUrl = hasCoords 
            ? `https://www.windy.com/-Rain-thunder-rain?${encodeURIComponent(Number(lat).toFixed(4))},${encodeURIComponent(Number(lng).toFixed(4))},11`
            : 'https://www.windy.com';
        const zoomEarthUrl = hasCoords
            ? `https://zoom.earth/maps/radar/#view=${encodeURIComponent(Number(lat).toFixed(4))},${encodeURIComponent(Number(lng).toFixed(4))},10z`
            : 'https://zoom.earth';

        const tzLabel = weatherData.tzAbbr || '';
        const thresholdLabel = weatherData.rainHourThresholdMm || WEATHER_CONFIG.rainHourThresholdMm;

        let timelineBars = '';
        if (Array.isArray(weatherData.hourlyPoints)) {
            timelineBars = weatherData.hourlyPoints.map(p => {
                let cls = 'clear';
                if (p.rainMm >= 7.5) cls = 'rain-extreme';
                else if (p.rainMm >= 2.5) cls = 'rain-heavy';
                else if (p.rainMm >= 1.0) cls = 'rain-medium';
                else if (p.isRain) cls = 'rain-light';
                else if (p.modelSignalOnly) cls = 'clear model-signal';

                let inTargetShift = false;
                if (shiftData) {
                    inTargetShift = isHourInShift(p.hour, shiftData);
                }

                const signalNote = p.modelSignalOnly ? ' • sinyal model saja (curah hujan di bawah ambang, tidak dihitung)' : '';
                const tip = `${p.timeStr}${tzLabel ? ' ' + tzLabel : ''} • ${p.weatherDesc} • ${p.rainMm} mm${inTargetShift ? ' (Jam Shift)' : ''}${signalNote}`;
                return `<div class="weather-hour-segment ${cls} ${inTargetShift ? 'in-shift' : ''}" title="${tip}" data-hour="${p.hour}"></div>`;
            }).join('');
        }

        el.style.display = 'block';
        el.innerHTML = `
            <div class="ksp-weather-card" style="background: ${bg}; border: 1px solid ${border}; border-radius: 10px; padding: 9px 12px; margin-bottom: 10px; font-size: 11px;">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 200px;">
                        <div style="display: flex; align-items: center; gap: 6px; color: ${color}; font-weight: 750; font-size: 12px; margin-bottom: 3px; flex-wrap: wrap;">
                            <span style="font-size: 16px;">${statusIcon}</span>
                            <span>${statusTitle}</span>
                            <span style="font-size: 10px; opacity: 0.8; font-weight: 600;">(${weatherData.dateKey || ''}${tzLabel ? ' · ' + tzLabel : ''})</span>
                        </div>
                        <div style="color: var(--text-color); font-size: 10.5px; line-height: 1.45; opacity: 0.9;">
                            ${detailHtml}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                        ${(isRainInShift || weatherData.dailyTotalRainHours > 0 || weatherData.isRaining) ? `
                            <button type="button" class="btn-apply-weather" style="background: #2563EB; color: #fff; border: none; border-radius: 6px; padding: 5px 10px; font-size: 10.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(37,99,235,0.3); transition: transform 0.1s ease;">
                                <span>🌧️</span> Pasang Alasan & Catatan
                            </button>
                        ` : `
                            <span style="font-size: 9.5px; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px;">
                                ${weatherData.isToday ? 'Real-time ' + weatherData.fetchedAt + (tzLabel ? ' ' + tzLabel : '') : 'Data Historis'}
                            </span>
                        `}
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <a href="${windyUrl}" target="_blank" rel="noopener noreferrer" class="weather-radar-btn" title="Cek riwayat awan hujan & radar interaktif di Windy">
                                <span>🌐</span> Radar Windy
                            </a>
                            <a href="${zoomEarthUrl}" target="_blank" rel="noopener noreferrer" class="weather-radar-btn" title="Cek citra radar satelit langsung di Zoom Earth">
                                <span>🛰️</span> Satelit
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Mini Timeline 24 Jam -->
                <div style="margin-top: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
                        <span>00:00</span>
                        <span>06:00 (Pagi)</span>
                        <span>12:00 (Siang)</span>
                        <span>18:00 (Sore)</span>
                        <span>23:00${tzLabel ? ' (' + tzLabel + ')' : ''}</span>
                    </div>
                    <div class="weather-timeline-bar">
                        ${timelineBars}
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; font-size: 9px; color: var(--text-muted); flex-wrap: wrap; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="display: inline-flex; align-items: center; gap: 3px;"><span style="display: inline-block; width: 8px; height: 8px; background: #93c5fd; border-radius: 2px;"></span> Gerimis</span>
                            <span style="display: inline-flex; align-items: center; gap: 3px;"><span style="display: inline-block; width: 8px; height: 8px; background: #3b82f6; border-radius: 2px;"></span> Sedang</span>
                            <span style="display: inline-flex; align-items: center; gap: 3px;"><span style="display: inline-block; width: 8px; height: 8px; background: #1d4ed8; border-radius: 2px;"></span> Deras</span>
                            <span style="display: inline-flex; align-items: center; gap: 3px;"><span style="display: inline-block; width: 8px; height: 8px; background: #1e1b4b; border-radius: 2px;"></span> Sangat Lebat</span>
                            <span style="display: inline-flex; align-items: center; gap: 3px;" title="Kode cuaca mendung/badai tapi curah hujan di bawah ambang ${thresholdLabel} mm (tidak dihitung jam hujan)"><span style="display: inline-block; width: 8px; height: 8px; background: repeating-linear-gradient(45deg, rgba(147, 197, 253, 0.35) 0 2px, transparent 2px 4px); outline: 1px dashed rgba(59, 130, 246, 0.45); border-radius: 2px;"></span> Sinyal Model (< ${thresholdLabel} mm)</span>
                        </div>
                        ${shiftData ? `<span>Highlight border = Jam ${shiftData.shiftName} (${shiftData.shiftHours})</span>` : ''}
                    </div>
                    <div style="font-size: 9px; color: var(--text-muted); opacity: 0.85; margin-top: 5px; border-top: 1px dashed rgba(0,0,0,0.08); padding-top: 4px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
                        <span>💡 Model atmosfer Open-Meteo (${tzLabel || 'Waktu Lokal'}). Ambang jam hujan: ≥ ${thresholdLabel} mm/jam. Cek tombol radar di atas jika jam konveksi hujan lokal bergeser.</span>
                    </div>
                </div>
            </div>
        `;

        const btnApply = el.querySelector('.btn-apply-weather');
        if (btnApply && typeof onApplySuggestion === 'function') {
            btnApply.addEventListener('click', (e) => {
                e.preventDefault();
                let reasonsToApply = isFlood ? ['🌊 Banjir / Genangan', '🌧️ Hujan Deras'] : ['🌧️ Hujan Deras'];
                onApplySuggestion(reasonsToApply, autoNoteText);
            });
        }
    };

    /**
     * Menyisipkan teks catatan secara aman ke elemen textarea, menghindari duplikasi,
     * memicu event input/change, dan memberikan efek visual glow highlight pada textarea.
     * @param {HTMLTextAreaElement|string} textarea - Elemen textarea atau ID elemen
     * @param {string} noteText - Teks yang akan disisipkan
     * @returns {boolean} true jika berhasil disisipkan
     */
    KspReasons.insertNoteWithFeedback = function (textarea, noteText) {
        if (!noteText) return false;
        const el = typeof textarea === 'string' ? document.getElementById(textarea) : textarea;
        if (!el) return false;

        const cleanNote = String(noteText).trim();
        if (!cleanNote) return false;

        const curVal = el.value.trim();
        if (!curVal.includes(cleanNote)) {
            el.value = (curVal ? curVal + '\n' : '') + cleanNote;
        }

        // Posisikan kursor di akhir teks
        try {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        } catch (e) {}

        // Memicu event input & change secara fail-safe
        try {
            if (typeof Event === 'function') {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (typeof document !== 'undefined' && document.createEvent) {
                const evt1 = document.createEvent('Event');
                evt1.initEvent('input', true, true);
                el.dispatchEvent(evt1);
                const evt2 = document.createEvent('Event');
                evt2.initEvent('change', true, true);
                el.dispatchEvent(evt2);
            }
        } catch (e) {}

        // Efek visual glow highlight
        el.classList.remove('ksp-input-glow');
        void el.offsetWidth; // trigger reflow
        el.classList.add('ksp-input-glow');
        setTimeout(() => {
            el.classList.remove('ksp-input-glow');
        }, 1500);

        if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        return true;
    };

    /**
     * Membantu memformat dan me-render badge alasan ke dalam tampilan riwayat tabel
     * @param {Array<string>} tags - Daftar string alasan
     * @returns {string} HTML string badges
     */
    KspReasons.formatBadgesHtml = function (tags) {
        if (!Array.isArray(tags) || tags.length === 0) return '';
        return tags.map(tag => {
            const isUp = tag.includes('🎉') || tag.includes('📅') || tag.includes('🏬') || tag.includes('🏖️') || tag.includes('🎁');
            const bg = isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
            const color = isUp ? '#059669' : '#DC2626';
            const border = isUp ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
            return `<span class="tx-reason-tag" style="background: ${bg}; color: ${color}; border: 1px solid ${border}; border-radius: 12px; padding: 2px 7px; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; line-height: 1.3;">${tag}</span>`;
        }).join(' ');
    };

    // Ekspor ke window / global scope
    global.KspReasons = KspReasons;

})(typeof window !== 'undefined' ? window : this);
