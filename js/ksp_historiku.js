/**
 * ============================================================================
 * KSP Check - Modul HistoriKu (Parity dengan HistoryActivity.java)
 * Engine interaktif: Rendering Tabel Rinci, Bottom Controller Bar, Stepper,
 * TTS Audio Reader, Local Edits Persistence, dan File Import Parser.
 * ============================================================================
 */
(function (window, document) {
    'use strict';

    // State Internal HistoriKu
    const state = {
        storeId: null,
        storeName: '',
        reportData: null,
        activeDate: '',
        activeShift: 0, // 0 = Semua, 1 = Pagi, 2 = Malam
        activeItemIndex: -1,
        flattenedItems: [],
        speechSynth: window.speechSynthesis || null,
        currentUtterance: null,
        isSpeaking: false,
        speakIndex: 0,
        speakItems: [],
        wakeLockSentinel: null,
        settings: {
            stickyAppHeaders: true,
            ringkasMode: true,
            roundingMode: false,
            showSteppers: false,
            ttsSpeed: 0.9,
            ttsDelay: 500,
            ttsVoice: '',
            autoHideCompleted: false,
            sambungMultiDate: true,
            ttsWakeLock: true
        },
        localEdits: {
            deletedIds: new Set(),
            readIds: new Set(),
            editedAmounts: new Map(), // id -> number
            editedCategories: new Map(), // id -> 'income' | 'outcome'
            newItems: []
        }
    };

    // Load saved settings from localStorage
    function loadSavedSettings() {
        try {
            const saved = localStorage.getItem('ksp_historiku_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                state.settings = Object.assign(state.settings, parsed);
            }
            // Load individual setting overrides
            if (localStorage.getItem('ksp_ringkas_mode') !== null) {
                state.settings.ringkasMode = localStorage.getItem('ksp_ringkas_mode') === 'true';
            }
            if (localStorage.getItem('ksp_rounding_mode') !== null) {
                state.settings.roundingMode = localStorage.getItem('ksp_rounding_mode') === 'true';
            }
            if (localStorage.getItem('ksp_show_steppers') !== null) {
                state.settings.showSteppers = localStorage.getItem('ksp_show_steppers') === 'true';
            }
            if (localStorage.getItem('ksp_tts_speed') !== null) {
                state.settings.ttsSpeed = parseFloat(localStorage.getItem('ksp_tts_speed')) || 0.9;
            }
            if (localStorage.getItem('ksp_tts_delay') !== null) {
                state.settings.ttsDelay = parseInt(localStorage.getItem('ksp_tts_delay'), 10) || 500;
            }
            if (localStorage.getItem('ksp_auto_hide_completed') !== null) {
                state.settings.autoHideCompleted = localStorage.getItem('ksp_auto_hide_completed') === 'true';
            }
        } catch (e) {
            console.warn('[Historiku] Error loading settings:', e);
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem('ksp_historiku_settings', JSON.stringify(state.settings));
            localStorage.setItem('ksp_ringkas_mode', String(state.settings.ringkasMode));
            localStorage.setItem('ksp_rounding_mode', String(state.settings.roundingMode));
            localStorage.setItem('ksp_show_steppers', String(state.settings.showSteppers));
            localStorage.setItem('ksp_tts_speed', String(state.settings.ttsSpeed));
            localStorage.setItem('ksp_tts_delay', String(state.settings.ttsDelay));
            localStorage.setItem('ksp_auto_hide_completed', String(state.settings.autoHideCompleted));
        } catch (e) {}
    }

    // Helper: Local Storage Key untuk Edits
    function getEditsStorageKey() {
        if (!state.storeId) return null;
        const d = state.activeDate || 'today';
        const s = state.activeShift || 0;
        return `ksp_historiku_edits_${state.storeId}_${d}_shift${s}`;
    }

    function loadLocalEdits() {
        state.localEdits = {
            deletedIds: new Set(),
            readIds: new Set(),
            editedAmounts: new Map(),
            editedCategories: new Map(),
            newItems: []
        };
        const key = getEditsStorageKey();
        if (!key) return;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.deletedIds)) state.localEdits.deletedIds = new Set(parsed.deletedIds);
                if (Array.isArray(parsed.readIds)) state.localEdits.readIds = new Set(parsed.readIds);
                if (parsed.editedAmounts) state.localEdits.editedAmounts = new Map(Object.entries(parsed.editedAmounts));
                if (parsed.editedCategories) state.localEdits.editedCategories = new Map(Object.entries(parsed.editedCategories));
                if (Array.isArray(parsed.newItems)) state.localEdits.newItems = parsed.newItems;
            }
        } catch (e) {
            console.warn('[Historiku] Error loading local edits:', e);
        }
    }

    function saveLocalEdits() {
        const key = getEditsStorageKey();
        if (!key) return;
        try {
            const hasAnyEdits = state.localEdits.deletedIds.size > 0 ||
                state.localEdits.readIds.size > 0 ||
                state.localEdits.editedAmounts.size > 0 ||
                state.localEdits.editedCategories.size > 0 ||
                state.localEdits.newItems.length > 0;

            if (hasAnyEdits) {
                const obj = {
                    deletedIds: Array.from(state.localEdits.deletedIds),
                    readIds: Array.from(state.localEdits.readIds),
                    editedAmounts: Object.fromEntries(state.localEdits.editedAmounts),
                    editedCategories: Object.fromEntries(state.localEdits.editedCategories),
                    newItems: state.localEdits.newItems,
                    savedAt: new Date().toISOString()
                };
                localStorage.setItem(key, JSON.stringify(obj));
            } else {
                localStorage.removeItem(key);
            }
        } catch (e) {}
    }

    // Helper Format Rupiah & Angka
    function formatRupiah(num) {
        const n = Math.round(Number(num) || 0);
        return 'Rp ' + n.toLocaleString('id-ID');
    }

    function fmtAmt(val) {
        let v = Number(val) || 0;
        if (state.settings.roundingMode) {
            v = Math.round(v / 1000) * 1000;
        }
        if (state.settings.ringkasMode) {
            // Sembunyikan 3 digit 0 di belakang untuk kalkulator kasir
            const ribuan = Math.trunc(v / 1000);
            return ribuan.toLocaleString('id-ID');
        }
        return formatRupiah(v);
    }

    function getTodayKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateDisplay(dateStr) {
        if (!dateStr) return 'Hari Ini';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                const d = parseInt(parts[2], 10);
                const m = months[parseInt(parts[1], 10) - 1];
                const y = parts[0];
                return `${d} ${m} ${y}`;
            }
        } catch (e) {}
        return dateStr;
    }

    // Icon App Mapper
    function getAppIcon(appKey) {
        const key = String(appKey || '').toLowerCase();
        if (key.includes('bca')) return '🔵';
        if (key.includes('bri')) return '🔷';
        if (key.includes('mandiri')) return '🟡';
        if (key.includes('bni')) return '🟠';
        if (key.includes('dana')) return '💠';
        if (key.includes('ovo')) return '🟣';
        if (key.includes('gopay')) return '🟢';
        if (key.includes('shopee')) return '🟧';
        if (key.includes('linkaja')) return '🔴';
        if (key.includes('pln')) return '⚡';
        return '📱';
    }

    // ==========================================
    // INITIALIZATION & STORE LOADING
    // ==========================================
    function init() {
        loadSavedSettings();
        applyStickyHeaderSetting();
        setupGlobalKeyboardListeners();
    }

    function applyStickyHeaderSetting() {
        if (state.settings.stickyAppHeaders) {
            document.body.classList.add('sticky-app-headers');
        } else {
            document.body.classList.remove('sticky-app-headers');
        }
    }

    function loadForStore(storeId, storeName) {
        state.storeId = storeId;
        state.storeName = storeName || 'Cabang';
        if (!state.activeDate) state.activeDate = getTodayKey();
        
        loadLocalEdits();
        closeItemNavBar();
        stopSpeaking();

        // Cari data laporan yang tersimpan di cache atau Supabase
        const cachedData = loadStoreReportDataFromStorage(storeId, state.activeDate);
        if (cachedData) {
            state.reportData = cachedData;
        } else {
            // Cek apakah ada data bawaan di window.STORES_DATA untuk store ini
            state.reportData = generateInitialReportData(storeId, storeName, state.activeDate, state.activeShift);
        }

        render();
    }

    function loadStoreReportDataFromStorage(storeId, dateKey) {
        try {
            const key = `ksp_historiku_data_${storeId}_${dateKey}`;
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return null;
    }

    function saveStoreReportDataToStorage(storeId, dateKey, data) {
        try {
            const key = `ksp_historiku_data_${storeId}_${dateKey}`;
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {}
    }

    // Generator Dummy / Mock Data awal jika belum diimport
    function generateInitialReportData(storeId, storeName, dateKey, shiftNum) {
        return {
            storeId: storeId,
            storeName: storeName,
            dateDb: dateKey,
            dateDisplay: formatDateDisplay(dateKey),
            shift: shiftNum || 0,
            shiftLabel: shiftNum === 1 ? 'Shift 1 (Pagi)' : (shiftNum === 2 ? 'Shift 2 (Malam)' : 'Semua Shift'),
            tarik: [
                { id: `trk_${storeId}_1`, time: "07:35", amount: 500000, jumtar: 500000, adm: 5000, type: "outcome", name: "Bpk. Bambang Pamungkas", app: "BCA", shift: 1 },
                { id: `trk_${storeId}_2`, time: "08:12", amount: 1000000, jumtar: 1000000, adm: 5000, type: "outcome", name: "Ibu Sri Rejeki", app: "BRI", shift: 1 },
                { id: `trk_${storeId}_3`, time: "09:40", amount: 250000, jumtar: 250000, adm: 3000, type: "outcome", name: "Hendra Gunawan", app: "DANA", shift: 1 },
                { id: `trk_${storeId}_4`, time: "11:15", amount: 1500000, jumtar: 1500000, adm: 10000, type: "income", name: "Setoran Kas Cabang", app: "Tunai", shift: 1 }
            ],
            topup: [
                { id: `top_${storeId}_1`, time: "08:25", amount: 100000, modal: 98500, fee: 2000, category: "E-Wallet", provider: "DANA", name: "Rina Marlina", shift: 1 },
                { id: `top_${storeId}_2`, time: "09:50", amount: 50000, modal: 50500, fee: 2500, category: "Pulsa", provider: "TELKOMSEL", name: "08123456789", shift: 1 },
                { id: `top_${storeId}_3`, time: "10:30", amount: 200000, modal: 198000, fee: 3000, category: "Token PLN", provider: "PLN", name: "No. Meter 14223344", shift: 1 }
            ],
            voucher: [
                { id: `vch_${storeId}_1`, time: "08:45", amount: 25000, productName: "Voucher T-Sel 3GB 7Hr", provider: "TELKOMSEL", qty: 1, shift: 1 },
                { id: `vch_${storeId}_2`, time: "10:15", amount: 35000, productName: "Voucher Axis AIGO 5GB", provider: "AXIS", qty: 2, shift: 1 }
            ],
            notif: [
                { id: `ntf_${storeId}_1`, time: "07:34", amount: 505000, app: "com.bca", appName: "BCA", category: "income", title: "Transfer Masuk m-BCA", shift: 1 },
                { id: `ntf_${storeId}_2`, time: "08:10", amount: 1005000, app: "com.bri", appName: "BRImo", category: "income", title: "QRIS / Transfer BRI", shift: 1 },
                { id: `ntf_${storeId}_3`, time: "09:39", amount: 253000, app: "id.dana", appName: "DANA", category: "income", title: "DANA Saldo Masuk", shift: 1 }
            ]
        };
    }

    // ==========================================
    // RENDER UTAMA HISTORIKU
    // ==========================================
    function render() {
        const root = document.getElementById('branchHistorikuContainer');
        if (!root) return;

        if (!state.reportData) {
            root.innerHTML = `
                <div class="hk-empty-state">
                    <div style="font-size: 2rem; margin-bottom: 8px;">📜</div>
                    <div style="font-weight: 800; font-size: 1rem; color: var(--hk-text); margin-bottom: 4px;">Belum Ada Riwayat Transaksi Asli</div>
                    <p style="font-size: 0.8rem; color: var(--hk-muted); margin-bottom: 16px;">
                        Pilih tanggal atau import file laporan HTML / JSON yang diekspor dari aplikasi Android kasir cabang ${state.storeName}.
                    </p>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button type="button" class="hk-btn active" onclick="KspHistoriku.openImportModal()">📥 Import File Laporan</button>
                        <button type="button" class="hk-btn" onclick="KspHistoriku.loadSampleData()">✨ Muat Contoh Data</button>
                    </div>
                </div>`;
            return;
        }

        const data = state.reportData;
        const dateDisplay = data.dateDisplay || formatDateDisplay(state.activeDate);
        const shiftLabel = state.activeShift === 1 ? 'Shift 1 (Pagi)' : (state.activeShift === 2 ? 'Shift 2 (Malam)' : 'Semua Shift');
        const hasSavedEdits = state.localEdits.deletedIds.size > 0 ||
            state.localEdits.readIds.size > 0 ||
            state.localEdits.editedAmounts.size > 0 ||
            state.localEdits.editedCategories.size > 0 ||
            state.localEdits.newItems.length > 0;

        root.innerHTML = `
            <div class="branch-historiku-section ${state.settings.showSteppers ? '' : 'no-steppers'}" id="hk-main-section">
                <!-- 1. HEADER & TOP FILTER BAR -->
                <div class="historiku-header">
                    <div class="historiku-header-row">
                        <div class="historiku-title-wrap">
                            <div class="historiku-title">
                                <span>📜</span>
                                <span>HistoriKu • ${escapeHtml(state.storeName)}</span>
                            </div>
                        </div>
                        <div class="historiku-top-actions">
                            <button type="button" class="hk-btn ${state.settings.autoHideCompleted ? 'active' : ''}" id="hk-btn-hidden-grp" onclick="KspHistoriku.toggleAllGroupsCollapse()" title="Lipat / Buka Semua Grup Transaksi">
                                <span>📁</span> <span>Hidden Group</span>
                            </button>
                            <button type="button" class="hk-btn ${state.isSpeaking ? 'active' : ''}" id="hk-btn-speak" onclick="KspHistoriku.toggleSpeakAll()" title="Bacakan semua transaksi dengan suara">
                                <span>🔊</span> <span>${state.isSpeaking ? 'Stop Suara' : 'Baca Semua'}</span>
                            </button>
                            <button type="button" class="hk-btn" onclick="KspHistoriku.openImportModal()" title="Import File Laporan HTML / JSON dari Android">
                                <span>📥</span> <span>Import</span>
                            </button>
                            <button type="button" class="hk-btn hk-btn-icon-only" onclick="KspHistoriku.openSettingsModal()" title="Pengaturan Laporan & Suara">
                                <span>⚙️</span>
                            </button>
                        </div>
                    </div>

                    <!-- Filter Tanggal & Shift -->
                    <div class="historiku-filter-bar">
                        <div class="historiku-date-shift-wrap">
                            <button type="button" class="hk-date-nav-btn" onclick="KspHistoriku.navDate(-1)" title="Hari Sebelumnya">◀</button>
                            <span class="hk-date-chip" id="hk-chip-date" onclick="KspHistoriku.pickCustomDate()" style="cursor: pointer;" title="Klik untuk ubah tanggal">
                                <span>📅</span> <span>${escapeHtml(dateDisplay)}</span>
                            </span>
                            <button type="button" class="hk-date-nav-btn" onclick="KspHistoriku.navDate(1)" title="Hari Berikutnya">▶</button>
                            <button type="button" class="hk-date-nav-btn" onclick="KspHistoriku.jumpToday()" title="Lompat ke Hari Ini">Hari Ini</button>

                            <select class="hk-shift-select" id="hk-shift-select" onchange="KspHistoriku.onShiftChange(this.value)">
                                <option value="0" ${state.activeShift === 0 ? 'selected' : ''}>Semua Shift</option>
                                <option value="1" ${state.activeShift === 1 ? 'selected' : ''}>Shift 1 (Pagi)</option>
                                <option value="2" ${state.activeShift === 2 ? 'selected' : ''}>Shift 2 (Malam)</option>
                            </select>

                            <span class="hk-date-chip chip-saved" id="hk-chip-saved" style="${hasSavedEdits ? 'display: inline-flex;' : 'display: none;'}" onclick="KspHistoriku.showResetEditsConfirm()" title="Perubahan tersimpan di browser. Klik untuk reset data asli.">
                                <span>💾</span> <span>Tersimpan</span>
                            </span>
                        </div>
                    </div>
                </div>

                <!-- 2. GLOBAL SUMMARY BAR -->
                <div class="hk-summary-bar" id="hk-summary-bar">
                    <div class="hk-sb-it">
                        <span class="hk-sb-l">
                            Total Keluar
                            ${state.settings.roundingMode ? '<span class="hk-sb-rounding-badge">(Round)</span>' : ''}
                        </span>
                        <span class="hk-sb-v c-out" id="hk-sb-total-keluar">Rp 0</span>
                    </div>
                    <div class="hk-sb-it">
                        <span class="hk-sb-l">
                            Total Masuk
                            ${state.settings.roundingMode ? '<span class="hk-sb-rounding-badge">(Round)</span>' : ''}
                        </span>
                        <span class="hk-sb-v c-in" id="hk-sb-total-masuk">Rp 0</span>
                    </div>
                    <div class="hk-sb-it">
                        <span class="hk-sb-l">
                            Selisih (Saldo)
                            ${state.settings.roundingMode ? '<span class="hk-sb-rounding-badge">(Round)</span>' : ''}
                        </span>
                        <span class="hk-sb-v" id="hk-sb-selisih">Rp 0</span>
                    </div>
                    <div class="hk-sb-it">
                        <span class="hk-sb-l">Total Transaksi</span>
                        <span class="hk-sb-v" id="hk-sb-total-trx">0</span>
                    </div>
                </div>

                <!-- 3. REKAP & TOTAL PER MODUL COLLAPSIBLE -->
                <div class="hk-rekap-card" id="hk-rekap-summary-container">
                    <div class="hk-rekap-hd" onclick="KspHistoriku.toggleRekapCollapse()">
                        <span class="hk-rekap-title">
                            <span>📊</span> <span>Rekap &amp; Total per Modul</span>
                        </span>
                        <span class="hk-rekap-toggle-icon" id="hk-rekap-toggle-icon">▼</span>
                    </div>
                    <div class="hk-rekap-body" id="hk-rekap-body">
                        <table class="lv-table" style="font-size: 0.8rem;">
                            <thead class="lv-thead">
                                <tr>
                                    <th class="lv-th l" style="padding: 8px 12px;">Modul / Sumber</th>
                                    <th class="lv-th c" style="width: 70px;">Trx</th>
                                    <th class="lv-th r" style="width: 120px;">Keluar</th>
                                    <th class="lv-th r" style="width: 120px;">Masuk</th>
                                    <th class="lv-th r" style="width: 120px;">Selisih</th>
                                </tr>
                            </thead>
                            <tbody id="hk-rekap-tbody"></tbody>
                            <tfoot id="hk-rekap-tfoot" style="font-weight: bold; background: var(--hk-surface2);"></tfoot>
                        </table>
                    </div>
                </div>

                <!-- 4. GROUPS CONTAINER (TARIK, TOPUP, VOUCHER, NOTIF) -->
                <div class="hk-groups-container" id="hk-groups-container"></div>
            </div>

            <!-- 5. BOTTOM CONTROLLER BAR (#item-nav-bar) -->
            <div id="item-nav-bar" class="item-nav-bar">
                <div class="nav-card-top">
                    <div class="nav-meta-left">
                        <span class="nav-pos-badge" id="nav-pos-badge">1 / 1</span>
                        <span class="nav-group-pill" id="nav-group-pill">📱 Transaksi</span>
                        <span style="color: var(--hk-muted);">·</span>
                        <span class="nav-time" id="nav-time">00:00</span>
                    </div>
                    <div class="nav-meta-right">
                        <span class="nav-read-badge" id="nav-read-badge" onclick="KspHistoriku.toggleCurrentItemRead()" title="Ubah status sudah dibaca">✓ Dibaca</span>
                        <span class="nav-type-tag" id="nav-type-tag" onclick="KspHistoriku.toggleCurrentItemCategory()" title="Ubah Masuk / Keluar">Masuk</span>
                        <button type="button" class="nav-btn-close" onclick="KspHistoriku.closeItemNavBar()" title="Tutup Bar">&times;</button>
                    </div>
                </div>

                <div class="nav-card-mid">
                    <button type="button" class="nav-tool-btn del" id="nav-btn-del" onclick="KspHistoriku.toggleCurrentItemDeleted()" title="Coret transaksi ini (abaikan dari hitungan)">🗑️</button>
                    <button type="button" class="nav-step-btn dec" onclick="KspHistoriku.adjustActiveAmount(-1000, event)" title="Kurang 1.000 (Shift: 5.000)">−</button>
                    <div class="nav-amt-display" onclick="KspHistoriku.editActiveAmountDirect()" title="Klik untuk edit nominal langsung">
                        <span class="nav-amt-val" id="nav-amt-val">Rp 0</span>
                    </div>
                    <button type="button" class="nav-step-btn inc" onclick="KspHistoriku.adjustActiveAmount(1000, event)" title="Tambah 1.000 (Shift: 5.000)">+</button>
                    <button type="button" class="nav-tool-btn add" id="nav-btn-add" onclick="KspHistoriku.addNewItemBelowCurrent()" title="Tambah transaksi baru di bawah ini">➕</button>
                </div>

                <div class="nav-card-bottom">
                    <button type="button" class="nav-split-btn" onclick="KspHistoriku.navigateItem(-1)" title="Item Sebelumnya (Panah Kiri)">
                        <span>◀</span> <span>Sebelumnya</span>
                    </button>
                    <button type="button" class="nav-split-btn" onclick="KspHistoriku.navigateItem(1)" title="Item Berikutnya (Panah Kanan)">
                        <span>Berikutnya</span> <span>▶</span>
                    </button>
                </div>
            </div>
        `;

        renderGroupsAndCalculate();
    }

    // ==========================================
    // RENDERING GROUPS & PERHITUNGAN ULANG
    // ==========================================
    function renderGroupsAndCalculate() {
        const container = document.getElementById('hk-groups-container');
        if (!container || !state.reportData) return;

        state.flattenedItems = [];
        let totalMasuk = 0;
        let totalKeluar = 0;
        let totalTrx = 0;

        const data = state.reportData;
        const rekapRows = [];

        // Helper filter shift
        const filterShift = item => {
            if (state.activeShift === 0) return true;
            return !item.shift || item.shift === state.activeShift;
        };

        // 1. Tarik Tunai Group
        let tarikHtml = '';
        const tarikList = (data.tarik || []).filter(filterShift);
        if (tarikList.length > 0) {
            let grpMasuk = 0, grpKeluar = 0, grpTrx = 0;
            let rowsHtml = '';

            tarikList.forEach((item, idx) => {
                const effective = getEffectiveItemValues(item);
                if (!effective.isDeleted) {
                    totalTrx++;
                    grpTrx++;
                    if (effective.isIncome) {
                        grpMasuk += effective.amount;
                        totalMasuk += effective.amount;
                    } else {
                        grpKeluar += effective.amount;
                        totalKeluar += effective.amount;
                    }
                }
                const desc = item.name || item.desc || item.app || 'Tarik Tunai';
                rowsHtml += renderRowHtml(item, idx + 1, effective, desc, 'tarik');
                state.flattenedItems.push({ item, group: 'tarik', groupLabel: '💸 Tarik' });
            });

            rekapRows.push({ label: '💸 Tarik Tunai', trx: grpTrx, keluar: grpKeluar, masuk: grpMasuk, selisih: grpMasuk - grpKeluar });

            tarikHtml = `
                <div class="lv-group" data-group-id="tarik">
                    <div class="lv-group-hd" onclick="KspHistoriku.toggleGroupCollapse(this, event)">
                        <button type="button" class="grp-toggle-btn" title="Lipat / Buka grup">▼</button>
                        <span class="lv-group-icon">💸</span>
                        <span class="lv-group-name">Tarik Tunai</span>
                        <span class="grp-done-badge" id="badge-done-tarik">✓ Selesai</span>
                        <span class="lv-group-meta">
                            <span class="grp-meta-keluar" onclick="KspHistoriku.copyGroupValues('tarik', 'outcome', event)" style="color: var(--hk-outcome);" title="Klik untuk salin">Keluar: ${fmtAmt(grpKeluar)}</span>
                            ${grpMasuk > 0 ? `<span class="grp-meta-masuk" onclick="KspHistoriku.copyGroupValues('tarik', 'income', event)" style="color: var(--hk-income);" title="Klik untuk salin">/ Masuk: ${fmtAmt(grpMasuk)}</span>` : ''}
                        </span>
                        <button type="button" class="g-act-btn" onclick="KspHistoriku.speakGroup('tarik', event)" title="Bacakan grup ini">🔊</button>
                    </div>
                    <div class="lv-group-body">
                        <table class="lv-table">
                            <thead class="lv-thead">
                                <tr>
                                    <th class="lv-th c" style="width: 36px;">#</th>
                                    <th class="lv-th c" style="width: 65px;">Waktu</th>
                                    <th class="lv-th l">Nama Nasabah</th>
                                    <th class="lv-th r" style="width: 140px;">Nominal</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>`;
        }

        // 2. Top Up Group
        let topupHtml = '';
        const topupList = (data.topup || []).filter(filterShift);
        if (topupList.length > 0) {
            let grpMasuk = 0, grpKeluar = 0, grpTrx = 0;
            let rowsHtml = '';

            topupList.forEach((item, idx) => {
                const effective = getEffectiveItemValues(item);
                if (!effective.isDeleted) {
                    totalTrx++;
                    grpTrx++;
                    // TopUp: Pelanggan bayar (Masuk), Kasir bayar modal (Keluar)
                    grpMasuk += effective.amount;
                    grpKeluar += (item.modal || effective.amount);
                    totalMasuk += effective.amount;
                    totalKeluar += (item.modal || effective.amount);
                }
                const desc = `${item.provider || ''} ${item.category || ''} - ${item.name || ''}`.trim();
                rowsHtml += renderRowHtml(item, idx + 1, effective, desc, 'topup');
                state.flattenedItems.push({ item, group: 'topup', groupLabel: '📱 Top Up' });
            });

            rekapRows.push({ label: '📱 Top Up & PLN', trx: grpTrx, keluar: grpKeluar, masuk: grpMasuk, selisih: grpMasuk - grpKeluar });

            topupHtml = `
                <div class="lv-group" data-group-id="topup">
                    <div class="lv-group-hd" onclick="KspHistoriku.toggleGroupCollapse(this, event)">
                        <button type="button" class="grp-toggle-btn" title="Lipat / Buka grup">▼</button>
                        <span class="lv-group-icon">📱</span>
                        <span class="lv-group-name">Top Up &amp; PLN</span>
                        <span class="grp-done-badge" id="badge-done-topup">✓ Selesai</span>
                        <span class="lv-group-meta">
                            <span class="grp-meta-masuk" style="color: var(--hk-income);">Masuk: ${fmtAmt(grpMasuk)}</span> /
                            <span class="grp-meta-keluar" style="color: var(--hk-outcome);">Modal: ${fmtAmt(grpKeluar)}</span>
                        </span>
                        <button type="button" class="g-act-btn" onclick="KspHistoriku.speakGroup('topup', event)" title="Bacakan grup ini">🔊</button>
                    </div>
                    <div class="lv-group-body">
                        <table class="lv-table">
                            <thead class="lv-thead">
                                <tr>
                                    <th class="lv-th c" style="width: 36px;">#</th>
                                    <th class="lv-th c" style="width: 65px;">Waktu</th>
                                    <th class="lv-th l">Produk / No. Tujuan</th>
                                    <th class="lv-th r" style="width: 140px;">Total Bayar</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>`;
        }

        // 3. Voucher Group
        let voucherHtml = '';
        const voucherList = (data.voucher || []).filter(filterShift);
        if (voucherList.length > 0) {
            let grpMasuk = 0, grpKeluar = 0, grpTrx = 0;
            let rowsHtml = '';

            voucherList.forEach((item, idx) => {
                const effective = getEffectiveItemValues(item);
                if (!effective.isDeleted) {
                    totalTrx++;
                    grpTrx++;
                    grpMasuk += effective.amount;
                    totalMasuk += effective.amount;
                }
                const desc = `${item.productName || item.provider || 'Voucher'} (${item.qty || 1} pcs)`;
                rowsHtml += renderRowHtml(item, idx + 1, effective, desc, 'voucher');
                state.flattenedItems.push({ item, group: 'voucher', groupLabel: '🎫 Voucher' });
            });

            rekapRows.push({ label: '🎫 Voucher Fisik', trx: grpTrx, keluar: grpKeluar, masuk: grpMasuk, selisih: grpMasuk - grpKeluar });

            voucherHtml = `
                <div class="lv-group" data-group-id="voucher">
                    <div class="lv-group-hd" onclick="KspHistoriku.toggleGroupCollapse(this, event)">
                        <button type="button" class="grp-toggle-btn" title="Lipat / Buka grup">▼</button>
                        <span class="lv-group-icon">🎫</span>
                        <span class="lv-group-name">Voucher Fisik</span>
                        <span class="grp-done-badge" id="badge-done-voucher">✓ Selesai</span>
                        <span class="lv-group-meta">
                            <span class="grp-meta-masuk" style="color: var(--hk-income);">Masuk: ${fmtAmt(grpMasuk)}</span>
                        </span>
                        <button type="button" class="g-act-btn" onclick="KspHistoriku.speakGroup('voucher', event)" title="Bacakan grup ini">🔊</button>
                    </div>
                    <div class="lv-group-body">
                        <table class="lv-table">
                            <thead class="lv-thead">
                                <tr>
                                    <th class="lv-th c" style="width: 36px;">#</th>
                                    <th class="lv-th c" style="width: 65px;">Waktu</th>
                                    <th class="lv-th l">Nama Produk</th>
                                    <th class="lv-th r" style="width: 140px;">Harga</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>`;
        }

        // 4. Notifikasi Bank & E-Wallet (Grouped by App)
        let notifHtml = '';
        const notifList = (data.notif || []).filter(filterShift);
        if (notifList.length > 0) {
            const notifByApp = {};
            notifList.forEach(item => {
                const appKey = item.appName || item.app || 'Bank';
                if (!notifByApp[appKey]) notifByApp[appKey] = [];
                notifByApp[appKey].push(item);
            });

            Object.keys(notifByApp).forEach(appKey => {
                const items = notifByApp[appKey];
                let appMasuk = 0, appKeluar = 0, appTrx = 0;
                let rowsHtml = '';

                items.forEach((item, idx) => {
                    const effective = getEffectiveItemValues(item);
                    if (!effective.isDeleted) {
                        totalTrx++;
                        appTrx++;
                        if (effective.isIncome) {
                            appMasuk += effective.amount;
                            totalMasuk += effective.amount;
                        } else {
                            appKeluar += effective.amount;
                            totalKeluar += effective.amount;
                        }
                    }
                    const desc = item.title || item.name || appKey;
                    rowsHtml += renderRowHtml(item, idx + 1, effective, desc, appKey);
                    state.flattenedItems.push({ item, group: appKey, groupLabel: `${getAppIcon(appKey)} ${appKey}` });
                });

                rekapRows.push({ label: `${getAppIcon(appKey)} ${appKey}`, trx: appTrx, keluar: appKeluar, masuk: appMasuk, selisih: appMasuk - appKeluar });

                notifHtml += `
                    <div class="lv-group" data-group-id="${escapeHtml(appKey)}">
                        <div class="lv-group-hd" onclick="KspHistoriku.toggleGroupCollapse(this, event)">
                            <button type="button" class="grp-toggle-btn" title="Lipat / Buka grup">▼</button>
                            <span class="lv-group-icon">${getAppIcon(appKey)}</span>
                            <span class="lv-group-name">${escapeHtml(appKey)}</span>
                            <span class="grp-done-badge">✓ Selesai</span>
                            <span class="lv-group-meta">
                                <span class="grp-meta-masuk" style="color: var(--hk-income);">Masuk: ${fmtAmt(appMasuk)}</span>
                                ${appKeluar > 0 ? `<span class="grp-meta-keluar" style="color: var(--hk-outcome);">/ Keluar: ${fmtAmt(appKeluar)}</span>` : ''}
                            </span>
                            <button type="button" class="g-act-btn" onclick="KspHistoriku.speakGroup('${escapeHtml(appKey)}', event)" title="Bacakan grup ini">🔊</button>
                        </div>
                        <div class="lv-group-body">
                            <table class="lv-table">
                                <thead class="lv-thead">
                                    <tr>
                                        <th class="lv-th c" style="width: 36px;">#</th>
                                        <th class="lv-th c" style="width: 65px;">Waktu</th>
                                        <th class="lv-th l">Keterangan / Pengirim</th>
                                        <th class="lv-th r" style="width: 140px;">Nominal</th>
                                    </tr>
                                </thead>
                                <tbody>${rowsHtml}</tbody>
                            </table>
                        </div>
                    </div>`;
            });
        }

        container.innerHTML = tarikHtml + topupHtml + voucherHtml + notifHtml;

        // Render Summary Bar
        const elKeluar = document.getElementById('hk-sb-total-keluar');
        const elMasuk = document.getElementById('hk-sb-total-masuk');
        const elSelisih = document.getElementById('hk-sb-selisih');
        const elTrx = document.getElementById('hk-sb-total-trx');

        if (elKeluar) elKeluar.textContent = fmtAmt(totalKeluar);
        if (elMasuk) elMasuk.textContent = fmtAmt(totalMasuk);
        if (elTrx) elTrx.textContent = totalTrx.toLocaleString('id-ID');

        const selisih = totalMasuk - totalKeluar;
        if (elSelisih) {
            elSelisih.textContent = (selisih >= 0 ? '+' : '') + fmtAmt(selisih);
            elSelisih.style.color = selisih >= 0 ? 'var(--hk-income)' : 'var(--hk-outcome)';
        }

        // Render Rekap Table
        renderRekapTableRows(rekapRows, totalTrx, totalKeluar, totalMasuk, selisih);
    }

    function getEffectiveItemValues(item) {
        const id = String(item.id);
        const isDeleted = state.localEdits.deletedIds.has(id);
        const isRead = state.localEdits.readIds.has(id);

        let amount = Number(item.amount || item.jumtar || 0);
        if (state.localEdits.editedAmounts.has(id)) {
            amount = Number(state.localEdits.editedAmounts.get(id)) || 0;
        }

        let isIncome = String(item.type || item.category || '').toLowerCase() === 'income';
        if (state.localEdits.editedCategories.has(id)) {
            isIncome = state.localEdits.editedCategories.get(id) === 'income';
        }

        const isModified = state.localEdits.editedAmounts.has(id) || state.localEdits.editedCategories.has(id);

        return { id, isDeleted, isRead, amount, isIncome, isModified };
    }

    function renderRowHtml(item, idx, effective, desc, groupKey) {
        const rowClasses = [
            'lv-row',
            effective.isDeleted ? 'item-deleted' : '',
            effective.isRead ? 'item-read' : '',
            effective.isModified ? 'item-modified' : ''
        ].filter(Boolean).join(' ');

        const timeStr = item.time || '00:00';
        const flatIdx = state.flattenedItems.length;

        return `
            <tr class="${rowClasses}" id="hk-row-${effective.id}" data-id="${effective.id}" data-idx="${flatIdx}" onclick="KspHistoriku.onRowClick('${effective.id}', ${flatIdx}, event)">
                <td class="lv-td lv-td-idx">${idx}</td>
                <td class="lv-td lv-td-time">${escapeHtml(timeStr)}</td>
                <td class="lv-td lv-td-itemname" title="${escapeHtml(desc)}">
                    ${escapeHtml(desc)}
                    ${effective.isModified ? '<span class="tag-item-status tag-item-mod">DIUBAH</span>' : ''}
                </td>
                <td class="lv-td ${effective.isIncome ? 'lv-td-in' : 'lv-td-out'}">
                    <div class="amt-ctrl">
                        <button type="button" class="step-btn" onclick="KspHistoriku.stepItemAmount('${effective.id}', -1000, event)" title="Kurang 1.000">−</button>
                        <span class="lv-amt ${effective.isIncome ? 'income' : 'outcome'} ${effective.isModified ? 'changed' : ''}">
                            ${fmtAmt(effective.amount)}
                        </span>
                        <button type="button" class="step-btn" onclick="KspHistoriku.stepItemAmount('${effective.id}', 1000, event)" title="Tambah 1.000">+</button>
                    </div>
                </td>
            </tr>`;
    }

    function renderRekapTableRows(rows, totalTrx, totalKeluar, totalMasuk, totalSelisih) {
        const tbody = document.getElementById('hk-rekap-tbody');
        const tfoot = document.getElementById('hk-rekap-tfoot');
        if (!tbody || !tfoot) return;

        let bHtml = '';
        rows.forEach(r => {
            bHtml += `
                <tr>
                    <td style="padding: 7px 12px; font-weight: 700;">${r.label}</td>
                    <td style="text-align: center;">${r.trx}</td>
                    <td style="text-align: right; color: var(--hk-outcome); font-variant-numeric: tabular-nums;">${fmtAmt(r.keluar)}</td>
                    <td style="text-align: right; color: var(--hk-income); font-variant-numeric: tabular-nums;">${fmtAmt(r.masuk)}</td>
                    <td style="text-align: right; font-weight: 750; color: ${r.selisih >= 0 ? 'var(--hk-income)' : 'var(--hk-outcome)'}; font-variant-numeric: tabular-nums;">
                        ${(r.selisih >= 0 ? '+' : '') + fmtAmt(r.selisih)}
                    </td>
                </tr>`;
        });
        tbody.innerHTML = bHtml;

        tfoot.innerHTML = `
            <tr>
                <td style="padding: 8px 12px;">TOTAL KESELURUHAN</td>
                <td style="text-align: center;">${totalTrx}</td>
                <td style="text-align: right; color: var(--hk-outcome); font-variant-numeric: tabular-nums;">${fmtAmt(totalKeluar)}</td>
                <td style="text-align: right; color: var(--hk-income); font-variant-numeric: tabular-nums;">${fmtAmt(totalMasuk)}</td>
                <td style="text-align: right; color: ${totalSelisih >= 0 ? 'var(--hk-income)' : 'var(--hk-outcome)'}; font-variant-numeric: tabular-nums;">
                    ${(totalSelisih >= 0 ? '+' : '') + fmtAmt(totalSelisih)}
                </td>
            </tr>`;
    }

    // ==========================================
    // INTERAKSI BOTTOM CONTROLLER BAR
    // ==========================================
    function onRowClick(itemId, flatIndex, event) {
        if (event && event.target && (event.target.classList.contains('step-btn') || event.target.tagName === 'INPUT')) {
            return;
        }
        openItemNavBar(flatIndex);
    }

    function openItemNavBar(flatIndex) {
        if (flatIndex < 0 || flatIndex >= state.flattenedItems.length) return;
        state.activeItemIndex = flatIndex;

        const navBar = document.getElementById('item-nav-bar');
        if (!navBar) return;

        updateNavBarDisplay();
        navBar.classList.add('show');
        highlightActiveRow();
    }

    function closeItemNavBar() {
        const navBar = document.getElementById('item-nav-bar');
        if (navBar) navBar.classList.remove('show');
        state.activeItemIndex = -1;
        removeRowHighlights();
    }

    function updateNavBarDisplay() {
        if (state.activeItemIndex < 0 || state.activeItemIndex >= state.flattenedItems.length) return;
        const entry = state.flattenedItems[state.activeItemIndex];
        const item = entry.item;
        const effective = getEffectiveItemValues(item);

        const posBadge = document.getElementById('nav-pos-badge');
        const grpPill = document.getElementById('nav-group-pill');
        const timeEl = document.getElementById('nav-time');
        const readBadge = document.getElementById('nav-read-badge');
        const typeTag = document.getElementById('nav-type-tag');
        const amtVal = document.getElementById('nav-amt-val');
        const btnDel = document.getElementById('nav-btn-del');

        if (posBadge) posBadge.textContent = `${state.activeItemIndex + 1} / ${state.flattenedItems.length}`;
        if (grpPill) grpPill.textContent = entry.groupLabel || 'Transaksi';
        if (timeEl) timeEl.textContent = item.time || '00:00';

        if (readBadge) {
            readBadge.textContent = effective.isRead ? '✓ Dibaca' : 'Belum';
            readBadge.className = `nav-read-badge ${effective.isRead ? '' : 'unread'}`;
        }

        if (typeTag) {
            typeTag.textContent = effective.isIncome ? 'Masuk' : 'Keluar';
            typeTag.className = `nav-type-tag ${effective.isIncome ? 'c-in' : 'c-out'}`;
        }

        if (amtVal) {
            amtVal.textContent = fmtAmt(effective.amount);
            amtVal.style.color = effective.isIncome ? 'var(--hk-income)' : 'var(--hk-outcome)';
        }

        if (btnDel) {
            if (effective.isDeleted) {
                btnDel.classList.add('is-deleted');
                btnDel.title = 'Pulihkan transaksi ini';
            } else {
                btnDel.classList.remove('is-deleted');
                btnDel.title = 'Coret transaksi ini';
            }
        }
    }

    function highlightActiveRow() {
        removeRowHighlights();
        if (state.activeItemIndex < 0 || state.activeItemIndex >= state.flattenedItems.length) return;
        const entry = state.flattenedItems[state.activeItemIndex];
        const row = document.getElementById(`hk-row-${entry.item.id}`);
        if (row) {
            row.style.outline = '2px solid var(--hk-accent)';
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function removeRowHighlights() {
        document.querySelectorAll('#hk-groups-container .lv-row').forEach(r => {
            r.style.outline = '';
        });
    }

    function navigateItem(direction) {
        if (state.flattenedItems.length === 0) return;
        let newIdx = state.activeItemIndex + direction;
        if (newIdx < 0) newIdx = state.flattenedItems.length - 1;
        if (newIdx >= state.flattenedItems.length) newIdx = 0;
        openItemNavBar(newIdx);
    }

    // Step Amount (+/- 1.000 atau +/- 5.000 dengan Shift)
    function adjustActiveAmount(delta, event) {
        if (state.activeItemIndex < 0 || state.activeItemIndex >= state.flattenedItems.length) return;
        const entry = state.flattenedItems[state.activeItemIndex];
        let actualDelta = delta;
        if (event && event.shiftKey) actualDelta = delta * 5; // shift-multiplier 5x
        stepItemAmount(entry.item.id, actualDelta);
        updateNavBarDisplay();
    }

    function stepItemAmount(itemId, delta, event) {
        if (event) event.stopPropagation();
        let actualDelta = delta;
        if (event && event.shiftKey) actualDelta = delta * 5;

        const id = String(itemId);
        let curAmt = 0;
        const entry = state.flattenedItems.find(f => String(f.item.id) === id);
        if (entry) curAmt = Number(entry.item.amount || entry.item.jumtar || 0);

        if (state.localEdits.editedAmounts.has(id)) {
            curAmt = state.localEdits.editedAmounts.get(id);
        }

        const newAmt = Math.max(0, curAmt + actualDelta);
        state.localEdits.editedAmounts.set(id, newAmt);
        saveLocalEdits();
        renderGroupsAndCalculate();
        if (state.activeItemIndex >= 0) updateNavBarDisplay();
    }

    function editActiveAmountDirect() {
        if (state.activeItemIndex < 0 || state.activeItemIndex >= state.flattenedItems.length) return;
        const entry = state.flattenedItems[state.activeItemIndex];
        const effective = getEffectiveItemValues(entry.item);
        const inputVal = prompt('Masukkan nominal transaksi baru (Rp):', String(effective.amount));
        if (inputVal === null) return;
        const num = parseInt(inputVal.replace(/[^\d]/g, ''), 10);
        if (!isNaN(num) && num >= 0) {
            state.localEdits.editedAmounts.set(String(entry.item.id), num);
            saveLocalEdits();
            renderGroupsAndCalculate();
            updateNavBarDisplay();
        }
    }

    function toggleCurrentItemDeleted() {
        if (state.activeItemIndex < 0 || state.activeItemIndex >= state.flattenedItems.length) return;
        const entry = state.flattenedItems[state.activeItemIndex];
        const id = String(entry.item.id);
        if (state.localEdits.deletedIds.has(id)) {
            state.localEdits.deletedIds.delete(id);
        } else {
            state.localEdits.deletedIds.add(id);
        }
        saveLocalEdits();
        renderGroupsAndCalculate();
        updateNavBarDisplay();
    }

    function toggleCurrentItemRead() {
        if (state.activeItemIndex < 0 || state.activeItemIndex >= state.flattenedItems.length) return;
        const entry = state.flattenedItems[state.activeItemIndex];
        const id = String(entry.item.id);
        if (state.localEdits.readIds.has(id)) {
            state.localEdits.readIds.delete(id);
        } else {
            state.localEdits.readIds.add(id);
        }
        saveLocalEdits();
        renderGroupsAndCalculate();
        updateNavBarDisplay();
    }

    function toggleCurrentItemCategory() {
        if (state.activeItemIndex < 0 || state.activeItemIndex >= state.flattenedItems.length) return;
        const entry = state.flattenedItems[state.activeItemIndex];
        const id = String(entry.item.id);
        const effective = getEffectiveItemValues(entry.item);
        const newCat = effective.isIncome ? 'outcome' : 'income';
        state.localEdits.editedCategories.set(id, newCat);
        saveLocalEdits();
        renderGroupsAndCalculate();
        updateNavBarDisplay();
    }

    function addNewItemBelowCurrent() {
        const desc = prompt('Masukkan keterangan transaksi baru:');
        if (!desc) return;
        const amtStr = prompt('Masukkan nominal transaksi (Rp):', '50000');
        if (!amtStr) return;
        const amt = parseInt(amtStr.replace(/[^\d]/g, ''), 10) || 0;

        const newId = 'manual_' + Date.now();
        const now = new Date();
        const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

        const newItem = {
            id: newId,
            time: time,
            amount: amt,
            jumtar: amt,
            type: 'outcome',
            name: desc,
            app: 'Manual'
        };

        if (!state.reportData.tarik) state.reportData.tarik = [];
        state.reportData.tarik.push(newItem);
        saveStoreReportDataToStorage(state.storeId, state.activeDate, state.reportData);

        renderGroupsAndCalculate();
        openItemNavBar(state.flattenedItems.length - 1);
    }

    // ==========================================
    // REKAP & GROUP COLLAPSE HELPERS
    // ==========================================
    function toggleRekapCollapse() {
        const body = document.getElementById('hk-rekap-body');
        const icon = document.getElementById('hk-rekap-toggle-icon');
        if (!body) return;
        if (body.style.display === 'none') {
            body.style.display = 'block';
            if (icon) icon.textContent = '▼';
        } else {
            body.style.display = 'none';
            if (icon) icon.textContent = '▶';
        }
    }

    function toggleGroupCollapse(headerEl, event) {
        if (event && event.target && event.target.classList.contains('g-act-btn')) return;
        const group = headerEl.closest('.lv-group');
        if (group) group.classList.toggle('collapsed');
    }

    function toggleAllGroupsCollapse() {
        const groups = document.querySelectorAll('#hk-groups-container .lv-group');
        const btn = document.getElementById('hk-btn-hidden-grp');
        const anyOpen = Array.from(groups).some(g => !g.classList.contains('collapsed'));
        groups.forEach(g => {
            if (anyOpen) g.classList.add('collapsed');
            else g.classList.remove('collapsed');
        });
        if (btn) btn.classList.toggle('active', anyOpen);
    }

    function copyGroupValues(groupKey, cat, event) {
        if (event) event.stopPropagation();
        const rows = document.querySelectorAll(`#hk-groups-container .lv-group[data-group-id="${groupKey}"] .lv-row`);
        const values = [];
        rows.forEach(r => {
            if (r.classList.contains('item-deleted')) return;
            const amtEl = r.querySelector('.lv-amt');
            if (amtEl) values.push(amtEl.textContent.trim());
        });
        if (values.length > 0) {
            navigator.clipboard.writeText(values.join('\n')).then(() => {
                showToast(`✓ Berhasil salin ${values.length} baris ${cat}`);
            });
        }
    }

    // ==========================================
    // TTS AUDIO ENGINE (SPEECH SYNTHESIS)
    // ==========================================
    function toggleSpeakAll() {
        if (state.isSpeaking) {
            stopSpeaking();
        } else {
            speakAll();
        }
    }

    function speakAll() {
        if (!state.speechSynth) {
            showToast('⚠️ Fitur suara browser tidak didukung di perangkat ini.');
            return;
        }
        stopSpeaking();
        if (state.flattenedItems.length === 0) return;

        state.isSpeaking = true;
        state.speakIndex = 0;
        state.speakItems = [...state.flattenedItems];
        updateSpeakButtonUI(true);
        requestWakeLock();
        speakNextItem();
    }

    function speakGroup(groupKey, event) {
        if (event) event.stopPropagation();
        if (!state.speechSynth) return;
        stopSpeaking();

        const items = state.flattenedItems.filter(f => f.group === groupKey);
        if (items.length === 0) return;

        state.isSpeaking = true;
        state.speakIndex = 0;
        state.speakItems = items;
        updateSpeakButtonUI(true);
        requestWakeLock();
        speakNextItem();
    }

    function speakNextItem() {
        if (!state.isSpeaking || state.speakIndex >= state.speakItems.length) {
            stopSpeaking();
            return;
        }

        const entry = state.speakItems[state.speakIndex];
        const effective = getEffectiveItemValues(entry.item);

        // Jika dicoret, lewati
        if (effective.isDeleted) {
            state.speakIndex++;
            speakNextItem();
            return;
        }

        highlightSpeakingRow(entry.item.id);

        // Format teks pengucapan nominal
        const textToSpeak = formatNumberToSpeechText(effective.amount);
        const utter = new SpeechSynthesisUtterance(textToSpeak);
        utter.rate = state.settings.ttsSpeed || 0.9;
        utter.lang = 'id-ID';

        // Cari suara Bahasa Indonesia jika ada
        const voices = state.speechSynth.getVoices();
        const idVoice = voices.find(v => v.lang.startsWith('id') || v.lang.includes('ID'));
        if (idVoice) utter.voice = idVoice;

        utter.onend = () => {
            // Tandai sudah dibaca otomatis
            state.localEdits.readIds.add(String(entry.item.id));
            saveLocalEdits();

            state.speakIndex++;
            setTimeout(() => {
                if (state.isSpeaking) speakNextItem();
            }, state.settings.ttsDelay || 500);
        };

        utter.onerror = () => {
            state.speakIndex++;
            if (state.isSpeaking) speakNextItem();
        };

        state.speechSynth.speak(utter);
    }

    function stopSpeaking() {
        state.isSpeaking = false;
        if (state.speechSynth) {
            try { state.speechSynth.cancel(); } catch (e) {}
        }
        updateSpeakButtonUI(false);
        removeSpeakingHighlights();
        releaseWakeLock();
    }

    function updateSpeakButtonUI(speaking) {
        const btn = document.getElementById('hk-btn-speak');
        if (btn) {
            btn.classList.toggle('active', speaking);
            btn.innerHTML = speaking ? '<span>⏹️</span> <span>Stop Suara</span>' : '<span>🔊</span> <span>Baca Semua</span>';
        }
    }

    function highlightSpeakingRow(itemId) {
        removeSpeakingHighlights();
        const row = document.getElementById(`hk-row-${itemId}`);
        if (row) {
            row.classList.add('tts-speaking');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function removeSpeakingHighlights() {
        document.querySelectorAll('#hk-groups-container .lv-row.tts-speaking').forEach(r => {
            r.classList.remove('tts-speaking');
        });
    }

    function formatNumberToSpeechText(num) {
        const n = Math.round(Number(num) || 0);
        if (state.settings.ringkasMode && n >= 1000) {
            const ribuan = Math.trunc(n / 1000);
            return String(ribuan);
        }
        return String(n);
    }

    // Screen Wake Lock
    async function requestWakeLock() {
        if (!state.settings.ttsWakeLock || !navigator.wakeLock) return;
        try {
            state.wakeLockSentinel = await navigator.wakeLock.request('screen');
        } catch (e) {}
    }

    function releaseWakeLock() {
        if (state.wakeLockSentinel) {
            try { state.wakeLockSentinel.release(); } catch (e) {}
            state.wakeLockSentinel = null;
        }
    }

    // ==========================================
    // KEYBOARD NAVIGATION
    // ==========================================
    function setupGlobalKeyboardListeners() {
        window.addEventListener('keydown', e => {
            const navBar = document.getElementById('item-nav-bar');
            if (!navBar || !navBar.classList.contains('show')) return;
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

            if (e.key === 'Escape') {
                closeItemNavBar();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                navigateItem(-1);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                navigateItem(1);
            } else if (e.key === '+' || e.key === '=') {
                adjustActiveAmount(1000, e);
            } else if (e.key === '-' || e.key === '_') {
                adjustActiveAmount(-1000, e);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                toggleCurrentItemDeleted();
            } else if (e.key === ' ' || e.key === 'Enter') {
                toggleCurrentItemRead();
            }
        });
    }

    // ==========================================
    // MODAL PENGATURAN HISTORIKU
    // ==========================================
    function openSettingsModal() {
        const modal = document.getElementById('historikuSettingsModal');
        if (!modal) return;

        // Sync values
        const swSticky = document.getElementById('hk-set-sticky');
        const swRingkas = document.getElementById('hk-set-ringkas');
        const swRound = document.getElementById('hk-set-round');
        const swStep = document.getElementById('hk-set-steppers');
        const swAutoHide = document.getElementById('hk-set-autohide');
        const swWakeLock = document.getElementById('hk-set-wakelock');
        const slSpeed = document.getElementById('hk-set-tts-speed');
        const slDelay = document.getElementById('hk-set-tts-delay');
        const speedVal = document.getElementById('hk-speed-val');
        const delayVal = document.getElementById('hk-delay-val');

        if (swSticky) swSticky.checked = state.settings.stickyAppHeaders;
        if (swRingkas) swRingkas.checked = state.settings.ringkasMode;
        if (swRound) swRound.checked = state.settings.roundingMode;
        if (swStep) swStep.checked = state.settings.showSteppers;
        if (swAutoHide) swAutoHide.checked = state.settings.autoHideCompleted;
        if (swWakeLock) swWakeLock.checked = state.settings.ttsWakeLock;

        if (slSpeed) slSpeed.value = state.settings.ttsSpeed;
        if (speedVal) speedVal.textContent = state.settings.ttsSpeed.toFixed(1) + 'x';

        if (slDelay) slDelay.value = state.settings.ttsDelay;
        if (delayVal) delayVal.textContent = state.settings.ttsDelay + ' ms';

        modal.classList.add('open');
    }

    function closeSettingsModal() {
        const modal = document.getElementById('historikuSettingsModal');
        if (modal) modal.classList.remove('open');
    }

    function saveSettingsFromModal() {
        const swSticky = document.getElementById('hk-set-sticky');
        const swRingkas = document.getElementById('hk-set-ringkas');
        const swRound = document.getElementById('hk-set-round');
        const swStep = document.getElementById('hk-set-steppers');
        const swAutoHide = document.getElementById('hk-set-autohide');
        const swWakeLock = document.getElementById('hk-set-wakelock');
        const slSpeed = document.getElementById('hk-set-tts-speed');
        const slDelay = document.getElementById('hk-set-tts-delay');

        if (swSticky) state.settings.stickyAppHeaders = swSticky.checked;
        if (swRingkas) state.settings.ringkasMode = swRingkas.checked;
        if (swRound) state.settings.roundingMode = swRound.checked;
        if (swStep) state.settings.showSteppers = swStep.checked;
        if (swAutoHide) state.settings.autoHideCompleted = swAutoHide.checked;
        if (swWakeLock) state.settings.ttsWakeLock = swWakeLock.checked;

        if (slSpeed) state.settings.ttsSpeed = parseFloat(slSpeed.value) || 0.9;
        if (slDelay) state.settings.ttsDelay = parseInt(slDelay.value, 10) || 500;

        saveSettings();
        applyStickyHeaderSetting();
        closeSettingsModal();
        render();
        showToast('✓ Pengaturan HistoriKu disimpan');
    }

    function clearAllReadStatus() {
        state.localEdits.readIds.clear();
        saveLocalEdits();
        renderGroupsAndCalculate();
        showToast('✓ Semua tanda sudah dibaca di-reset');
    }

    function testTtsVoice() {
        if (!state.speechSynth) return;
        try { state.speechSynth.cancel(); } catch (e) {}
        const utter = new SpeechSynthesisUtterance('Uji suara laporan HistoriKu. Lima puluh ribu rupiah.');
        utter.rate = state.settings.ttsSpeed || 0.9;
        utter.lang = 'id-ID';
        state.speechSynth.speak(utter);
    }

    // ==========================================
    // MODAL IMPOR FILE LAPORAN (HTML / JSON)
    // ==========================================
    function openImportModal() {
        const modal = document.getElementById('historikuImportModal');
        if (modal) modal.classList.add('open');
    }

    function closeImportModal() {
        const modal = document.getElementById('historikuImportModal');
        if (modal) modal.classList.remove('open');
    }

    function handleFileImport(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            parseAndLoadImportedContent(content, file.name);
        };
        reader.readAsText(file);
    }

    function parseAndLoadImportedContent(text, fileName) {
        try {
            let parsedData = null;

            // Kasus 1: File HTML Laporan (ekstrak JSON antara /* KSPCHECK_REPORT_DATA_JSON */ atau window.REPORT_DATA)
            if (text.includes('/* KSPCHECK_REPORT_DATA_JSON */') || text.includes('REPORT_DATA')) {
                // Regex 1: Cari variabel window.REPORT_DATA = {...};
                const m1 = text.match(/window\.REPORT_DATA\s*=\s*(\{[\s\S]*?\});/);
                if (m1) {
                    parsedData = JSON.parse(m1[1]);
                } else {
                    // Regex 2: Ambil JSON raw di textarea bridge
                    const m2 = text.match(/<textarea[^>]*id="raw-json-data"[^>]*>([\s\S]*?)<\/textarea>/);
                    if (m2) {
                        parsedData = JSON.parse(m2[1]);
                    }
                }
            }

            // Kasus 2: Raw JSON file / string
            if (!parsedData) {
                try {
                    parsedData = JSON.parse(text);
                } catch (err) {}
            }

            if (parsedData && (parsedData.tarik || parsedData.topup || parsedData.voucher || parsedData.notif)) {
                // Berhasil parse!
                state.reportData = parsedData;
                if (parsedData.dateDb) state.activeDate = parsedData.dateDb;
                if (parsedData.shift !== undefined) state.activeShift = parsedData.shift;

                saveStoreReportDataToStorage(state.storeId, state.activeDate, parsedData);
                closeImportModal();
                render();
                showToast(`✓ Berhasil memuat laporan (${fileName || 'File'})`);
            } else {
                alert('Format file tidak valid. Pastikan memilih file laporan HTML atau JSON dari aplikasi Android KSP Check.');
            }
        } catch (err) {
            console.error('[Historiku] Error parsing import:', err);
            alert('Gagal membaca file: ' + err.message);
        }
    }

    function loadSampleData() {
        state.reportData = generateInitialReportData(state.storeId, state.storeName, state.activeDate, state.activeShift);
        saveStoreReportDataToStorage(state.storeId, state.activeDate, state.reportData);
        render();
        showToast('✓ Contoh data transaksi dimuat');
    }

    // ==========================================
    // FILTER DATE & SHIFT NAVIGASI
    // ==========================================
    function navDate(deltaDays) {
        try {
            const parts = state.activeDate.split('-');
            const cur = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            cur.setDate(cur.getDate() + deltaDays);
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            state.activeDate = `${y}-${m}-${d}`;
            loadForStore(state.storeId, state.storeName);
        } catch (e) {}
    }

    function jumpToday() {
        state.activeDate = getTodayKey();
        loadForStore(state.storeId, state.storeName);
    }

    function pickCustomDate() {
        const inp = prompt('Masukkan tanggal (format YYYY-MM-DD):', state.activeDate);
        if (inp && /^\d{4}-\d{2}-\d{2}$/.test(inp.trim())) {
            state.activeDate = inp.trim();
            loadForStore(state.storeId, state.storeName);
        }
    }

    function onShiftChange(val) {
        state.activeShift = parseInt(val, 10) || 0;
        loadLocalEdits();
        render();
    }

    function showResetEditsConfirm() {
        if (confirm('Kembalikan semua transaksi ke data asli? Perubahan coret, edit nominal, dan status dibaca akan dihapus.')) {
            const key = getEditsStorageKey();
            if (key) localStorage.removeItem(key);
            loadLocalEdits();
            render();
            showToast('✓ Data dikembalikan ke kondisi asli');
        }
    }

    // Toast Notification Helper
    function showToast(msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg);
            return;
        }
        let toast = document.getElementById('ksp-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ksp-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Expose Public API
    window.KspHistoriku = {
        init,
        loadForStore,
        render,
        openItemNavBar,
        closeItemNavBar,
        onRowClick,
        navigateItem,
        adjustActiveAmount,
        stepItemAmount,
        editActiveAmountDirect,
        toggleCurrentItemDeleted,
        toggleCurrentItemRead,
        toggleCurrentItemCategory,
        addNewItemBelowCurrent,
        toggleRekapCollapse,
        toggleGroupCollapse,
        toggleAllGroupsCollapse,
        copyGroupValues,
        toggleSpeakAll,
        speakGroup,
        stopSpeaking,
        openSettingsModal,
        closeSettingsModal,
        saveSettingsFromModal,
        clearAllReadStatus,
        testTtsVoice,
        openImportModal,
        closeImportModal,
        handleFileImport,
        parseAndLoadImportedContent,
        loadSampleData,
        navDate,
        jumpToday,
        pickCustomDate,
        onShiftChange,
        showResetEditsConfirm
    };

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window, document);
