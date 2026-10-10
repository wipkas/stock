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

    /**
     * Mengambil kondisi cuaca terkini berdasarkan koordinat cabang toko.
     * @param {number} lat - Latitude (contoh: 0.5071)
     * @param {number} lng - Longitude (contoh: 101.4478)
     * @returns {Promise<Object|null>} Detail cuaca atau null jika offline/gagal
     */
    KspReasons.fetchStoreWeather = async function (lat, lng) {
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

        const cacheKey = `${Number(lat).toFixed(3)}_${Number(lng).toFixed(3)}`;
        const cached = weatherCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < WEATHER_CACHE_TTL)) {
            return cached.data;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 detik timeout

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,weather_code,wind_speed_10m&timezone=Asia%2FJakarta`;
            const resp = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!resp.ok) return null;
            const json = await resp.json();
            const curr = json.current;
            if (!curr) return null;

            const wmo = WMO_CODE_MAP[curr.weather_code] || { desc: 'Biasa', icon: '🌤️', rainLevel: 0 };
            const rainAmount = (curr.rain || 0) + (curr.showers || 0) + (curr.precipitation || 0);
            const isRaining = wmo.rainLevel > 0 || rainAmount > 0.4;
            const isHeavyRain = wmo.rainLevel >= 2 || rainAmount >= 2.5;
            const isFloodingRisk = rainAmount >= 12.0;

            const suggestedReasons = [];
            if (isFloodingRisk) {
                suggestedReasons.push('🌊 Banjir / Genangan', '🌧️ Hujan Deras');
            } else if (isRaining || isHeavyRain) {
                suggestedReasons.push('🌧️ Hujan Deras');
            }

            const weatherData = {
                lat,
                lng,
                temperature: Math.round(curr.temperature_2m),
                humidity: curr.relative_humidity_2m,
                weatherCode: curr.weather_code,
                weatherDesc: wmo.desc,
                weatherIcon: wmo.icon,
                rainAmount: Number(rainAmount.toFixed(1)),
                isRaining,
                isHeavyRain,
                isFloodingRisk,
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
     * @param {Object} options - { storeCoordinates, date, currentCondition, pctDiff }
     * @returns {Promise<Object>} { suggestedReasons, weather, calendar, hintText }
     */
    KspReasons.getSmartRecommendations = async function (options = {}) {
        const { storeCoordinates, date, currentCondition, pctDiff } = options;

        const calendarInfo = KspReasons.detectCalendarFactors(date);
        let weatherInfo = null;

        if (storeCoordinates && storeCoordinates.lat && storeCoordinates.lng) {
            weatherInfo = await KspReasons.fetchStoreWeather(storeCoordinates.lat, storeCoordinates.lng);
        }

        const suggestedSet = new Set();

        if (currentCondition === 'down') {
            if (weatherInfo && weatherInfo.isRaining) {
                weatherInfo.suggestedReasons.forEach(r => suggestedSet.add(r));
            }
            calendarInfo.downSuggestions.forEach(r => suggestedSet.add(r));
        } else if (currentCondition === 'up') {
            calendarInfo.upSuggestions.forEach(r => suggestedSet.add(r));
        }

        const suggestedReasons = Array.from(suggestedSet);

        // Susun teks ringkasan untuk Smart Hint
        let hintParts = [];
        if (weatherInfo && weatherInfo.isRaining) {
            hintParts.push(`${weatherInfo.weatherIcon} Sedang ${weatherInfo.weatherDesc.toLowerCase()} (${weatherInfo.temperature}°C) di sekitar toko`);
        }
        if (calendarInfo.isPaydayWindow && currentCondition === 'up') {
            hintParts.push(`🎉 Periode gajian tgl ${calendarInfo.dayOfMonth}`);
        } else if (calendarInfo.isMonthEndWindow && currentCondition === 'down') {
            hintParts.push(`💸 Tanggal tua (${calendarInfo.dayOfMonth})`);
        } else if (calendarInfo.isSunday) {
            hintParts.push(`🛑 Hari Minggu`);
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
     * Me-render banner status cuaca mini di bagian atas modal catatan harian
     * @param {HTMLElement|string} container - Elemen container atau ID
     * @param {Object} weatherData - Hasil dari fetchStoreWeather
     * @param {Function} onApplySuggestion - Callback saat tombol klik terapkan
     */
    KspReasons.renderWeatherBanner = function (container, weatherData, onApplySuggestion) {
        const el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) return;

        if (!weatherData) {
            el.innerHTML = '';
            el.style.display = 'none';
            return;
        }

        const isRain = weatherData.isRaining;
        const bg = isRain ? 'rgba(59, 130, 246, 0.08)' : 'rgba(245, 158, 11, 0.08)';
        const border = isRain ? 'rgba(59, 130, 246, 0.25)' : 'rgba(245, 158, 11, 0.25)';
        const color = isRain ? '#2563EB' : '#D97706';

        el.style.display = 'block';
        el.innerHTML = `
            <div style="background: ${bg}; border: 1px solid ${border}; border-radius: 9px; padding: 6px 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px;">
                <div style="display: flex; align-items: center; gap: 6px; color: ${color};">
                    <span style="font-size: 15px;">${weatherData.weatherIcon}</span>
                    <span>
                        <strong>Cuaca Cabang:</strong> ${weatherData.weatherDesc} (${weatherData.temperature}°C${weatherData.rainAmount > 0 ? `, ${weatherData.rainAmount}mm` : ''})
                    </span>
                </div>
                ${isRain ? `
                    <button type="button" class="btn-apply-weather" style="background: #2563EB; color: #fff; border: none; border-radius: 6px; padding: 3px 8px; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 3px;">
                        <span>🌧️</span> Pasang Alasan Hujan
                    </button>
                ` : `
                    <span style="font-size: 9.5px; color: var(--text-muted);">${weatherData.fetchedAt} WIB</span>
                `}
            </div>
        `;

        if (isRain && typeof onApplySuggestion === 'function') {
            const btnApply = el.querySelector('.btn-apply-weather');
            if (btnApply) {
                btnApply.addEventListener('click', (e) => {
                    e.preventDefault();
                    onApplySuggestion(weatherData.suggestedReasons || ['🌧️ Hujan Deras']);
                });
            }
        }
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
