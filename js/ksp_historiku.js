function getTodayDbDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatDateDisplayShort(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  } catch(e) { return dateStr; }
}

function formatDateDisplayLong(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch(e) { return dateStr; }
}

function createEmptyReportData(storeId, storeName, dateDb, shiftNum) {
  const d = dateDb || getTodayDbDate();
  return {
    dateDb: d,
    dateDisplay: formatDateDisplayLong(d) || d,
    shift: shiftNum || 0,
    shiftLabel: (shiftNum === 1 ? 'Shift 1' : (shiftNum === 2 ? 'Shift 2' : 'Semua Shift')),
    storeId: storeId || '',
    storeName: storeName || 'Cabang',
    tarik: [],
    notif: [],
    voucher: [],
    topup: [],
    summary: {}
  };
}

function getSampleData() {
  return createEmptyReportData('', 'Cabang', getTodayDbDate(), 0);
}

// Inisialisasi awal aman tanpa dummy data 9 September
if (typeof window.REPORT_DATA === 'undefined' || !window.REPORT_DATA) {
  window.REPORT_DATA = createEmptyReportData('', 'Cabang', getTodayDbDate(), 0);
}

function formatRupiah(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

let ringkasMode = true;
try {
  const savedRingkas = localStorage.getItem('ksp_ringkas_mode');
  if (savedRingkas === '0' || savedRingkas === 'false') {
    ringkasMode = false;
  }
} catch(e){}

let roundingMode = false;
try {
  const savedRounding = localStorage.getItem('ksp_rounding_mode');
  if (savedRounding === '1' || savedRounding === 'true') {
    roundingMode = true;
  }
} catch(e){}

function fmtAmt(num) {
  let val = num;
  if (roundingMode) {
    val = Math.round(val / 1000) * 1000;
  }
  if (ringkasMode) {
    return formatRupiah(Math.trunc(val / 1000));
  }
  if (val < 0) {
    return '-Rp ' + formatRupiah(Math.abs(val));
  }
  return 'Rp ' + formatRupiah(val);
}

function refreshRowTexts() {
  document.querySelectorAll('.lv-row').forEach(row => {
    const amtEl = row.querySelector('.lv-amt');
    if (!amtEl || amtEl.querySelector('input')) return;
    const val = parseFloat(row.dataset.val) || 0;
    const orig = parseFloat(row.dataset.orig) || 0;
    const displayVal = roundingMode
      ? (Math.round(val / 1000) * 1000)
      : (ringkasMode ? (Math.trunc(val / 1000) * 1000) : val);
    amtEl.textContent = fmtAmt(displayVal);
    if (val !== orig) {
      amtEl.classList.add('changed');
      const delta = val - orig;
      amtEl.title = 'Asli: Rp ' + formatRupiah(orig) + ' (' + (delta > 0 ? '+' : '') + formatRupiah(delta) + ')';
    } else {
      amtEl.classList.remove('changed');
      amtEl.title = 'Klik untuk ubah langsung';
    }
  });
  if (typeof currentNavRow !== 'undefined' && currentNavRow) {
    const navAmt = document.getElementById('nav-amt-val');
    if (navAmt) {
      const val = parseFloat(currentNavRow.dataset.val) || 0;
      const displayVal = roundingMode
        ? (Math.round(val / 1000) * 1000)
        : (ringkasMode ? (Math.trunc(val / 1000) * 1000) : val);
      navAmt.textContent = fmtAmt(displayVal);
    }
  }
}

function updateRingkasModeBadge() {
  const badge = document.getElementById('ringkas-mode-badge');
  const toggle = document.getElementById('ringkas-mode-toggle');
  if (toggle) toggle.checked = ringkasMode;
  if (badge) {
    badge.textContent = ringkasMode ? 'Aktif (ON)' : 'Nonaktif (OFF)';
    badge.style.background = ringkasMode ? 'var(--accent-lt)' : 'var(--border)';
    badge.style.color = ringkasMode ? 'var(--accent)' : 'var(--muted)';
  }
}

function updateRoundingModeBadge() {
  const badge = document.getElementById('rounding-mode-badge');
  const toggle = document.getElementById('rounding-mode-toggle');
  if (toggle) toggle.checked = roundingMode;
  if (badge) {
    badge.textContent = roundingMode ? 'Aktif (ON)' : 'Nonaktif (OFF)';
    badge.style.background = roundingMode ? 'var(--accent-lt)' : 'var(--border)';
    badge.style.color = roundingMode ? 'var(--accent)' : 'var(--muted)';
  }
}

function updateStepperModeBadge() {
  const badge = document.getElementById('stepper-mode-badge');
  const toggle = document.getElementById('stepper-mode-toggle');
  if (toggle) toggle.checked = showSteppers;
  if (badge) {
    badge.textContent = showSteppers ? 'Tampil (ON)' : 'Sembunyi (OFF)';
    badge.style.background = showSteppers ? 'var(--accent-lt)' : 'var(--border)';
    badge.style.color = showSteppers ? 'var(--accent)' : 'var(--muted)';
  }
}

function applyRingkasState(btn, skipAutoSave) {
  if (!btn) btn = document.getElementById('btn-ringkas');
  if (btn) {
    btn.classList.toggle('active', ringkasMode);
    btn.title = ringkasMode
      ? 'Mode ringkas aktif (potong 000 / kalkulator). Klik untuk kembali ke format penuh (Rp)'
      : 'Sembunyikan tiga angka nol (mode ringkas untuk kalkulator)';
  }
  updateRingkasModeBadge();
  refreshRowTexts();
  recalcAll(skipAutoSave);
}

function toggleRingkas(btn) {
  ringkasMode = !ringkasMode;
  try {
    localStorage.setItem('ksp_ringkas_mode', ringkasMode ? '1' : '0');
  } catch(e){}
  applyRingkasState(btn);
  showToast(ringkasMode ? 'Mode Ringkas aktif (potong 000 / kalkulator)' : 'Mode Normal aktif (format Rp penuh)');
}

function applyRoundingState(btn, skipAutoSave) {
  if (!btn) btn = document.getElementById('btn-rounding');
  if (btn) {
    btn.classList.toggle('active', roundingMode);
    btn.title = roundingMode
      ? 'Efek Pembulatan (Rounding) AKTIF: Tiap item dibulatkan ke ribuan terdekat (sama seperti PDF). Klik untuk matikan.'
      : 'Efek Pembulatan (Rounding) NONAKTIF: Hitungan eksak riil tanpa pembulatan. Klik untuk aktifkan.';
  }
  updateRoundingModeBadge();
  refreshRowTexts();
  recalcAll(skipAutoSave);
}

function toggleRounding(btn) {
  roundingMode = !roundingMode;
  try {
    localStorage.setItem('ksp_rounding_mode', roundingMode ? '1' : '0');
  } catch(e){}
  applyRoundingState(btn);
  showToast(roundingMode
    ? '🔄 Efek Pembulatan Aktif (Mode PDF: Bulatkan per Item)'
    : '🔄 Efek Pembulatan Nonaktif (Hitungan Eksak Riil)'
  );
}

let showSteppers = false;
function toggleSteppers(btn) {
  showSteppers = !showSteppers;
  applySteppersState(btn);
  try { localStorage.setItem('ksp_show_steppers', showSteppers ? '1' : '0'); } catch(e){}
  showToast(showSteppers ? 'Tombol Stepper ditampilkan' : 'Tombol Stepper disembunyikan');
}

function applySteppersState(btn) {
  if (!btn) btn = document.getElementById('btn-stepper');
  if (document.body) {
    document.body.classList.toggle('no-steppers', !showSteppers);
  }
  if (btn) {
    btn.classList.toggle('active', showSteppers);
    btn.title = showSteppers ? 'Sembunyikan Tombol Stepper (+/-)' : 'Tampilkan Tombol Stepper (+/-)';
  }
  updateStepperModeBadge();
}
try {
  const savedSteppers = localStorage.getItem('ksp_show_steppers');
  if (savedSteppers === '1' || savedSteppers === 'true') {
    showSteppers = true;
  }
} catch(e){}
// applySteppersState(); (diinisialisasi aman saat DOM ready)

let stickyAppHeaders = true;

function updateStickyAppHeadersBadge() {
  const badge = document.getElementById('sticky-header-badge');
  const toggle = document.getElementById('sticky-header-toggle');
  if (toggle) toggle.checked = stickyAppHeaders;
  if (badge) {
    badge.textContent = stickyAppHeaders ? 'Aktif (ON)' : 'Nonaktif (OFF)';
    badge.style.background = stickyAppHeaders ? 'var(--accent-lt)' : 'var(--border)';
    badge.style.color = stickyAppHeaders ? 'var(--accent)' : 'var(--muted)';
  }
}

function syncHeaderHeight() {
  const hdr = document.querySelector('#historikuView header, header.historiku-header') || document.querySelector('header');
  if (hdr) {
    const h = hdr.offsetHeight || 34;
    document.documentElement.style.setProperty('--header-h', h + 'px');
  }
}
window.addEventListener('resize', syncHeaderHeight);
window.addEventListener('orientationchange', syncHeaderHeight);

function applyStickyAppHeadersState() {
  if (document.body) {
    document.body.classList.toggle('sticky-app-headers', stickyAppHeaders);
  }
  updateStickyAppHeadersBadge();
  syncHeaderHeight();
  requestSideStickyUpdate();
}

function toggleStickyAppHeaders() {
  stickyAppHeaders = !stickyAppHeaders;
  try {
    localStorage.setItem('ksp_sticky_app_headers', stickyAppHeaders ? '1' : '0');
  } catch(e){}
  applyStickyAppHeadersState();
  showToast(stickyAppHeaders ? '📌 Header App Sticky aktif' : 'Header App Sticky nonaktif');
}
try {
  const savedSticky = localStorage.getItem('ksp_sticky_app_headers');
  if (savedSticky === null || savedSticky === undefined) {
    stickyAppHeaders = true;
  } else {
    stickyAppHeaders = (savedSticky === '1' || savedSticky === 'true');
  }
} catch(e) {
  stickyAppHeaders = true;
}

// --- TEXT SIZE / FONT SIZE CONTROLS ---
let currentTextSize = 100;
try {
  const savedSize = localStorage.getItem('ksp_text_size');
  if (savedSize) {
    const n = parseInt(savedSize, 10);
    if (!isNaN(n) && n >= 70 && n <= 160) {
      currentTextSize = n;
    }
  }
} catch(e) {}

function updateTextSizeUI() {
  const slider = document.getElementById('text-size-slider');
  if (slider && String(slider.value) !== String(currentTextSize)) {
    slider.value = currentTextSize;
  }
  const badge = document.getElementById('text-size-val');
  if (badge) {
    let label = currentTextSize + '%';
    if (currentTextSize <= 85) label = 'Kecil (' + currentTextSize + '%)';
    else if (currentTextSize === 100) label = 'Normal (100%)';
    else if (currentTextSize >= 125) label = 'Ekstra (' + currentTextSize + '%)';
    else if (currentTextSize >= 110) label = 'Besar (' + currentTextSize + '%)';

    badge.textContent = label;
    if (currentTextSize === 100) {
      badge.style.background = 'var(--border)';
      badge.style.color = 'var(--muted)';
    } else {
      badge.style.background = 'var(--accent-lt)';
      badge.style.color = 'var(--accent)';
    }
  }
  document.querySelectorAll('.btn-preset-size').forEach(btn => {
    const bSize = parseInt(btn.dataset.size, 10);
    btn.classList.toggle('active', bSize === currentTextSize);
  });
}

function setTextSize(val, skipToast) {
  let num = parseInt(val, 10);
  if (isNaN(num) || num < 70 || num > 160) {
    num = 100;
  }
  currentTextSize = num;

  if (num === 100) {
    document.documentElement.style.fontSize = '';
  } else {
    document.documentElement.style.fontSize = num + '%';
  }

  updateTextSizeUI();

  try {
    localStorage.setItem('ksp_text_size', String(num));
  } catch(e) {}

  if (typeof syncHeaderHeight === 'function') {
    syncHeaderHeight();
  }

  if (!skipToast) {
    showToast('🔤 Ukuran teks: ' + num + '%');
  }
}
window.setTextSize = setTextSize;

function updateSideSpreadStickyHeaders() {
  const container = document.getElementById('side-spread-container') || document.getElementById('book-carousel');
  if (!container || typeof container.querySelectorAll !== 'function') return;

  const stickyEnabled = typeof stickyAppHeaders === 'boolean' ? stickyAppHeaders : true;
  const groups = container.querySelectorAll('.lv-group');

  if (!stickyEnabled) {
    groups.forEach(g => {
      const hd = g.querySelector('.lv-group-hd');
      if (hd) {
        hd.classList.remove('is-side-stuck');
        hd.style.position = '';
        hd.style.top = '';
        hd.style.left = '';
        hd.style.width = '';
        hd.style.transform = '';
        hd.style.visibility = '';
      }
      g.style.paddingTop = '';
    });
    return;
  }

  const mainHeader = document.querySelector('header');
  const topLimit = (mainHeader ? mainHeader.getBoundingClientRect().bottom : 56) - 1;
  const viewportW = (typeof window !== 'undefined' && window.innerWidth) || (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientWidth) || 400;

  groups.forEach(group => {
    const hd = group.querySelector('.lv-group-hd');
    if (!hd) return;

    if (group.classList.contains('collapsed')) {
      if (hd.classList.contains('is-side-stuck')) {
        hd.classList.remove('is-side-stuck');
        hd.style.position = '';
        hd.style.top = '';
        hd.style.left = '';
        hd.style.width = '';
        hd.style.transform = '';
        hd.style.visibility = '';
        group.style.paddingTop = '';
      }
      return;
    }

    const groupRect = group.getBoundingClientRect();
    const hdHeight = hd.offsetHeight || 42;

    if (groupRect.top <= topLimit && groupRect.bottom > topLimit) {
      if (!hd.classList.contains('is-side-stuck')) {
        hd.classList.add('is-side-stuck');
        group.style.paddingTop = `${hdHeight}px`;
      }
      hd.style.position = 'fixed';
      hd.style.top = `${topLimit}px`;
      hd.style.left = `${Math.round(groupRect.left)}px`;
      hd.style.width = `${Math.round(groupRect.width)}px`;

      if (groupRect.right <= 10 || groupRect.left >= viewportW - 10) {
        hd.style.visibility = 'hidden';
      } else {
        hd.style.visibility = 'visible';
      }

      if (groupRect.bottom < topLimit + hdHeight) {
        const pushOffset = groupRect.bottom - (topLimit + hdHeight);
        hd.style.transform = `translate3d(0, ${Math.round(pushOffset)}px, 0)`;
      } else {
        if (hd.style.transform) hd.style.transform = '';
      }
    } else {
      if (hd.classList.contains('is-side-stuck')) {
        hd.classList.remove('is-side-stuck');
        hd.style.position = '';
        hd.style.top = '';
        hd.style.left = '';
        hd.style.width = '';
        hd.style.transform = '';
        hd.style.visibility = '';
        group.style.paddingTop = '';
      }
    }
  });
}

let sideStickyTicking = false;
function requestSideStickyUpdate() {
  if (!sideStickyTicking) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        updateSideSpreadStickyHeaders();
        sideStickyTicking = false;
      });
    } else {
      updateSideSpreadStickyHeaders();
      sideStickyTicking = false;
    }
    sideStickyTicking = true;
  }
}

let sideStickyInitialized = false;
function initSideSpreadStickyHeaders() {
  if (!sideStickyInitialized) {
    window.addEventListener('scroll', requestSideStickyUpdate, { passive: true });
    window.addEventListener('resize', requestSideStickyUpdate, { passive: true });
    window.addEventListener('orientationchange', requestSideStickyUpdate, { passive: true });
    sideStickyInitialized = true;
  }

  const spreadCont = document.getElementById('side-spread-container');
  if (spreadCont && !spreadCont._hasSideStickyListener) {
    spreadCont.addEventListener('scroll', requestSideStickyUpdate, { passive: true });
    spreadCont._hasSideStickyListener = true;
  }
  const bookCar = document.getElementById('book-carousel');
  if (bookCar && !bookCar._hasSideStickyListener) {
    bookCar.addEventListener('scroll', requestSideStickyUpdate, { passive: true });
    bookCar._hasSideStickyListener = true;
  }

  requestSideStickyUpdate();
}

// applyStickyAppHeadersState(); (diinisialisasi aman saat DOM ready)

function updateRowMarkTags(row) {
  if (!row) return;
  const val = parseFloat(row.dataset.val) || 0;
  const orig = parseFloat(row.dataset.orig) || 0;
  const isNew = row.classList.contains('item-new') || row.dataset.isNew === 'true';
  const isChanged = !isNew && (val !== orig);
  const delta = val - orig;

  row.classList.toggle('item-new', isNew);
  row.classList.toggle('item-modified', isChanged);

  // Update amt element styling
  const amtEl = row.querySelector('.lv-amt');
  if (amtEl) {
    amtEl.classList.toggle('changed', isChanged);
    if (isChanged) {
      const deltaStr = (delta > 0 ? '+' : '') + formatRupiah(delta);
      amtEl.title = 'Asli: Rp ' + formatRupiah(orig) + ' (' + deltaStr + ')';
    } else if (isNew) {
      amtEl.title = 'Item baru ditambahkan';
    } else {
      amtEl.title = 'Klik untuk dengar / ubah';
    }
  }

  // Update tag in time cell
  const timeTd = row.querySelector('.lv-td-time');
  if (timeTd) {
    let tag = timeTd.querySelector('.tag-item-status');
    if (isNew) {
      if (!tag) {
        tag = document.createElement('span');
        timeTd.appendChild(tag);
      }
      tag.className = 'tag-item-status tag-item-new';
      tag.textContent = 'Baru';
      tag.title = 'Item tambahan baru';
    } else if (isChanged) {
      const deltaStr = (delta > 0 ? '+' : '') + formatRupiah(delta);
      if (!tag) {
        tag = document.createElement('span');
        timeTd.appendChild(tag);
      }
      tag.className = 'tag-item-status tag-item-mod';
      tag.textContent = 'Diubah';
      tag.title = 'Asli: Rp ' + formatRupiah(orig) + ' (' + deltaStr + ')';
    } else {
      if (tag) tag.remove();
    }
  }

  if (currentNavRow === row) {
    const allRows = getAllReportRows();
    updateNavBarUI(row, allRows.indexOf(row), allRows.length);
  }
}

function adjustAmt(btn, step, event) {
  if (event && event.shiftKey) step *= 5;
  const tr = btn.closest('tr');
  if (!tr) return;
  let val = parseFloat(tr.dataset.val) || 0;
  const orig = parseFloat(tr.dataset.orig) || 0;
  val = Math.max(0, val + step);
  tr.dataset.val = val;
  if (typeof syncRowEditToReportData === 'function') syncRowEditToReportData(tr, val);
  const amtEl = tr.querySelector('.lv-amt');
  if (amtEl) {
    amtEl.textContent = fmtAmt(val);
    if (val !== orig) {
      amtEl.classList.add('changed');
      const delta = val - orig;
      amtEl.title = 'Asli: Rp ' + formatRupiah(orig) + ' (' + (delta > 0 ? '+' : '') + formatRupiah(delta) + ')';
    } else {
      amtEl.classList.remove('changed');
      amtEl.title = 'Klik untuk ubah langsung';
    }
  }
  if (currentNavRow === tr) {
    const navAmt = document.getElementById('nav-amt-val');
    if (navAmt) navAmt.textContent = fmtAmt(val);
  }
  if (typeof updateRowMarkTags === 'function') updateRowMarkTags(tr);
  if (typeof recalcAll === 'function') recalcAll();
  if (typeof saveReportEdits === 'function') saveReportEdits();
}

function editAmt(span) {
  const tr = span.closest('tr');
  if (!tr) return;
  if (span.querySelector('input')) return;
  const currentVal = parseFloat(tr.dataset.val) || 0;
  const orig = parseFloat(tr.dataset.orig) || 0;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.className = 'edit-input';

  if (ringkasMode) {
    // Mode Ringkas: tampilkan dan edit dalam satuan ribuan (misal 20 untuk 20.000)
    input.value = currentVal / 1000;
    input.placeholder = '0';
    input.title = 'Mode Ringkas: masukkan nominal ribuan (misal: 20 untuk 20.000)';
  } else {
    // Mode Penuh (Rp)
    input.value = currentVal;
    input.placeholder = '0';
    input.title = 'Masukkan nominal penuh (Rp)';
  }

  const finish = (save) => {
    if (input._done) return;
    input._done = true;
    let val = currentVal;
    if (save && input.value.trim() !== '') {
      const parsed = parseFloat(input.value.trim().replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 0) {
        val = ringkasMode ? Math.round(parsed * 1000) : parsed;
      }
    }
    tr.dataset.val = val;
    if (typeof syncRowEditToReportData === 'function') syncRowEditToReportData(tr, val);
    span.textContent = fmtAmt(val);
    if (val !== orig) {
      span.classList.add('changed');
      const delta = val - orig;
      span.title = 'Asli: Rp ' + formatRupiah(orig) + ' (' + (delta > 0 ? '+' : '') + formatRupiah(delta) + ')';
    } else {
      span.classList.remove('changed');
      span.title = 'Klik untuk ubah langsung';
    }
    if (currentNavRow === tr) {
      const navAmt = document.getElementById('nav-amt-val');
      if (navAmt) navAmt.textContent = fmtAmt(val);
    }
    if (typeof updateRowMarkTags === 'function') updateRowMarkTags(tr);
    if (typeof recalcAll === 'function') recalcAll();
    if (typeof saveReportEdits === 'function') saveReportEdits();
  };
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  span.textContent = '';
  span.appendChild(input);
  input.focus();
  input.select();
}

function updateVoucherSubheaders() {
  const vGroup = document.querySelector('.lv-group[data-group-id="voucher"]');
  if (!vGroup) return;
  const tbody = vGroup.querySelector('tbody');
  if (!tbody) return;
  let currentSubhdMeta = null;
  let provCount = 0;
  let provTotal = 0;

  Array.from(tbody.children).forEach(tr => {
    if (tr.classList.contains('lv-subhd-row')) {
      if (currentSubhdMeta) {
        currentSubhdMeta.textContent = `${provCount} item · ${fmtAmt(provTotal)}`;
      }
      currentSubhdMeta = tr.querySelector('.lv-subhd-meta');
      provCount = 0;
      provTotal = 0;
    } else if (tr.classList.contains('lv-row')) {
      if (!tr.classList.contains('item-deleted')) {
        provCount++;
        let val = parseFloat(tr.dataset.val) || 0;
        if (roundingMode) {
          val = Math.round(val / 1000) * 1000;
        } else if (ringkasMode) {
          val = Math.trunc(val / 1000) * 1000;
        }
        provTotal += val;
      }
    }
  });
  if (currentSubhdMeta) {
    currentSubhdMeta.textContent = `${provCount} item · ${fmtAmt(provTotal)}`;
  }
}

function recalcAll() {
  let totalMasuk = 0;
  let totalKeluar = 0;
  let totalTrx = 0;
  document.querySelectorAll('.lv-group').forEach(group => {
    let grpMasuk = 0;
    let grpKeluar = 0;
    let grpTrx = 0;
    const isTopUpGroup = (group.dataset.groupId === 'topup' || group.dataset.appKey === 'topup' || (group.dataset.groupId && group.dataset.groupId.startsWith('topup')));
    group.querySelectorAll('.lv-row').forEach(row => {
      if (row.classList.contains('item-deleted')) return;
      grpTrx++;
      let val = parseFloat(row.dataset.val) || 0;
      let realVal = parseFloat(row.dataset.real) || 0;
      if (roundingMode) {
        val = Math.round(val / 1000) * 1000;
        realVal = Math.round(realVal / 1000) * 1000;
      } else if (ringkasMode) {
        val = Math.trunc(val / 1000) * 1000;
        realVal = Math.trunc(realVal / 1000) * 1000;
      }
      const cat = row.dataset.cat;
      if (isTopUpGroup) {
        grpMasuk += val;
        grpKeluar += realVal;
        totalMasuk += val;
        totalKeluar += realVal;
      } else if (cat === 'income') {
        grpMasuk += val;
        totalMasuk += val;
      } else {
        grpKeluar += val;
        totalKeluar += val;
      }
    });

    group.dataset.calcMasuk = grpMasuk;
    group.dataset.calcKeluar = grpKeluar;
    group.dataset.calcTrx = grpTrx;
    totalTrx += grpTrx;

    const metaMasuk = group.querySelector('.grp-meta-masuk');
    const metaKeluar = group.querySelector('.grp-meta-keluar');
    if (metaMasuk) metaMasuk.textContent = fmtAmt(grpMasuk);
    if (metaKeluar) {
      if (metaMasuk) {
        metaKeluar.textContent = fmtAmt(grpKeluar);
      } else {
        metaKeluar.textContent = (ringkasMode ? '' : 'Keluar: ') + fmtAmt(grpKeluar);
      }
    }
  });
  const totalBersih = totalKeluar - totalMasuk;
  const elMasuk = document.getElementById('sb-total-masuk');
  const elKeluar = document.getElementById('sb-total-keluar');
  const elSelisih = document.getElementById('sb-selisih');
  const elTrx = document.getElementById('sb-total-trx');
  if (elMasuk) elMasuk.textContent = fmtAmt(totalMasuk);
  if (elKeluar) elKeluar.textContent = fmtAmt(totalKeluar);
  if (elSelisih) {
    if (totalBersih > 0) {
      elSelisih.textContent = '+' + fmtAmt(totalBersih);
      elSelisih.className = 'sb-v c-in';
    } else if (totalBersih < 0) {
      elSelisih.textContent = fmtAmt(totalBersih);
      elSelisih.className = 'sb-v c-out';
    } else {
      elSelisih.textContent = fmtAmt(0);
      elSelisih.className = 'sb-v';
    }
  }
  if (elTrx) elTrx.textContent = totalTrx;

  document.querySelectorAll('.sb-rounding-badge').forEach(badge => {
    badge.style.display = roundingMode ? 'inline' : 'none';
  });

  updateVoucherSubheaders();
  updateMultiDayMetrics();
  renderRekapSummaryTable();
}

function updateMultiDayMetrics() {
  // 1. Mode Lembar Berdampingan (.side-day-sheet)
  document.querySelectorAll('.side-day-sheet').forEach(sheet => {
    let dayMasuk = 0, dayKeluar = 0, dayTrx = 0;
    const groups = sheet.querySelectorAll('.lv-group');
    if (groups.length > 0) {
      groups.forEach(group => {
        dayMasuk += parseFloat(group.dataset.calcMasuk) || 0;
        dayKeluar += parseFloat(group.dataset.calcKeluar) || 0;
        dayTrx += parseInt(group.dataset.calcTrx) || 0;
      });
    } else {
      sheet.querySelectorAll('.lv-row').forEach(row => {
        if (row.classList.contains('item-deleted')) return;
        dayTrx++;
        let val = parseFloat(row.dataset.val) || 0;
        let realVal = parseFloat(row.dataset.real) || 0;
        if (roundingMode) {
          val = Math.round(val / 1000) * 1000;
          realVal = Math.round(realVal / 1000) * 1000;
        } else if (ringkasMode) {
          val = Math.trunc(val / 1000) * 1000;
          realVal = Math.trunc(realVal / 1000) * 1000;
        }
        const parentGroup = row.closest('.lv-group');
        const isTopUp = parentGroup && (parentGroup.dataset.groupId === 'topup' || parentGroup.dataset.appKey === 'topup' || (parentGroup.dataset.groupId && parentGroup.dataset.groupId.startsWith('topup')));
        const cat = row.dataset.cat;
        if (isTopUp) {
          dayMasuk += val;
          dayKeluar += realVal;
        } else if (cat === 'income') {
          dayMasuk += val;
        } else {
          dayKeluar += val;
        }
      });
    }
    const dayNet = dayKeluar - dayMasuk;

    const elKeluar = sheet.querySelector('.sheet-metric-keluar');
    const elMasuk = sheet.querySelector('.sheet-metric-masuk');
    const elBersih = sheet.querySelector('.sheet-metric-bersih');
    const elTrx = sheet.querySelector('.sheet-metric-trx, .side-day-sheet-num');

    if (elKeluar) elKeluar.textContent = fmtAmt(dayKeluar);
    if (elMasuk) elMasuk.textContent = fmtAmt(dayMasuk);
    if (elBersih) {
      elBersih.textContent = (dayNet > 0 ? '+' : '') + fmtAmt(dayNet);
      elBersih.style.color = dayNet >= 0 ? 'var(--income)' : 'var(--outcome)';
    }
    if (elTrx) elTrx.textContent = `${dayTrx} trx`;

    // Fallback if specific classes are not present
    if (!elKeluar || !elMasuk) {
      const bTags = sheet.querySelectorAll('.side-day-sheet-metrics b');
      if (bTags.length >= 2) {
        bTags[0].textContent = fmtAmt(dayKeluar);
        bTags[1].textContent = fmtAmt(dayMasuk);
        if (bTags.length >= 3) {
          bTags[2].textContent = (dayNet > 0 ? '+' : '') + fmtAmt(dayNet);
          bTags[2].style.color = dayNet >= 0 ? 'var(--income)' : 'var(--outcome)';
        }
      }
    }
  });

  // 2. Mode Susun Bawah (.stack-day-card)
  document.querySelectorAll('.stack-day-card').forEach(card => {
    let dayMasuk = 0, dayKeluar = 0, dayTrx = 0;
    const groups = card.querySelectorAll('.lv-group');
    if (groups.length > 0) {
      groups.forEach(group => {
        dayMasuk += parseFloat(group.dataset.calcMasuk) || 0;
        dayKeluar += parseFloat(group.dataset.calcKeluar) || 0;
        dayTrx += parseInt(group.dataset.calcTrx) || 0;
      });
    } else {
      card.querySelectorAll('.lv-row').forEach(row => {
        if (row.classList.contains('item-deleted')) return;
        dayTrx++;
        let val = parseFloat(row.dataset.val) || 0;
        let realVal = parseFloat(row.dataset.real) || 0;
        if (roundingMode) { val = Math.round(val / 1000) * 1000; realVal = Math.round(realVal / 1000) * 1000; }
        else if (ringkasMode) { val = Math.trunc(val / 1000) * 1000; realVal = Math.trunc(realVal / 1000) * 1000; }
        const parentGroup = row.closest('.lv-group');
        const isTopUp = parentGroup && (parentGroup.dataset.groupId === 'topup' || parentGroup.dataset.appKey === 'topup' || (parentGroup.dataset.groupId && parentGroup.dataset.groupId.startsWith('topup')));
        if (isTopUp) { dayMasuk += val; dayKeluar += realVal; }
        else if (row.dataset.cat === 'income') dayMasuk += val;
        else dayKeluar += val;
      });
    }
    const elKeluar = card.querySelector('.stack-metric-keluar');
    const elMasuk = card.querySelector('.stack-metric-masuk');
    const pill = card.querySelector('.stack-summary-pill, .stack-metric-trx');
    if (elKeluar) elKeluar.textContent = fmtAmt(dayKeluar);
    if (elMasuk) elMasuk.textContent = fmtAmt(dayMasuk);
    if (pill) {
      if (elKeluar && elMasuk) {
        pill.textContent = `${dayTrx} trx`;
      } else {
        pill.textContent = `${dayTrx} trx • Keluar: ${fmtAmt(dayKeluar)} • Masuk: ${fmtAmt(dayMasuk)}`;
      }
    }
  });

  // 3. Mode Buku (.book-page)
  document.querySelectorAll('.book-page').forEach(page => {
    let dayMasuk = 0, dayKeluar = 0, dayTrx = 0;
    const groups = page.querySelectorAll('.lv-group');
    if (groups.length > 0) {
      groups.forEach(group => {
        dayMasuk += parseFloat(group.dataset.calcMasuk) || 0;
        dayKeluar += parseFloat(group.dataset.calcKeluar) || 0;
        dayTrx += parseInt(group.dataset.calcTrx) || 0;
      });
    } else {
      page.querySelectorAll('.lv-row').forEach(row => {
        if (row.classList.contains('item-deleted')) return;
        dayTrx++;
        let val = parseFloat(row.dataset.val) || 0;
        let realVal = parseFloat(row.dataset.real) || 0;
        if (roundingMode) { val = Math.round(val / 1000) * 1000; realVal = Math.round(realVal / 1000) * 1000; }
        else if (ringkasMode) { val = Math.trunc(val / 1000) * 1000; realVal = Math.trunc(realVal / 1000) * 1000; }
        const parentGroup = row.closest('.lv-group');
        const isTopUp = parentGroup && (parentGroup.dataset.groupId === 'topup' || parentGroup.dataset.appKey === 'topup' || (parentGroup.dataset.groupId && parentGroup.dataset.groupId.startsWith('topup')));
        if (isTopUp) { dayMasuk += val; dayKeluar += realVal; }
        else if (row.dataset.cat === 'income') dayMasuk += val;
        else dayKeluar += val;
      });
    }
    const badge = page.querySelector('.book-page-badge');
    const elKeluar = page.querySelector('.book-metric-keluar');
    const elMasuk = page.querySelector('.book-metric-masuk');
    const elTrx = page.querySelector('.book-metric-trx');
    if (elKeluar) elKeluar.textContent = fmtAmt(dayKeluar);
    if (elMasuk) elMasuk.textContent = fmtAmt(dayMasuk);
    if (elTrx) elTrx.textContent = `${dayTrx} trx`;
    if (badge && (!elKeluar || !elMasuk)) {
      badge.innerHTML = `${dayTrx} trx · Keluar: <b style="color:var(--outcome)">${fmtAmt(dayKeluar)}</b> | Masuk: <b style="color:var(--income)">${fmtAmt(dayMasuk)}</b>`;
    }
  });

  // 4. Mode Sekat (.lv-date-subhd-row)
  document.querySelectorAll('.lv-group').forEach(grp => {
    const isTopUpGroup = (grp.dataset.groupId === 'topup' || grp.dataset.appKey === 'topup' || (grp.dataset.groupId && grp.dataset.groupId.startsWith('topup')));
    grp.querySelectorAll('.lv-table tbody').forEach(tbody => {
      let curSubhdMeta = null;
      let curIn = 0, curOut = 0, curCount = 0;
      let hasIncome = false;
      Array.from(tbody.children).forEach(tr => {
        if (tr.classList.contains('lv-date-subhd-row')) {
          if (curSubhdMeta) {
            curSubhdMeta.textContent = hasIncome
              ? `${curCount} trx • Keluar: ${fmtAmt(curOut)} | Masuk: ${fmtAmt(curIn)}`
              : `${curCount} item • Keluar: ${fmtAmt(curOut)}`;
          }
          curSubhdMeta = tr.querySelector('.lv-date-subhd-meta');
          curIn = 0; curOut = 0; curCount = 0; hasIncome = false;
        } else if (tr.classList.contains('lv-row') && !tr.classList.contains('item-deleted')) {
          curCount++;
          let val = parseFloat(tr.dataset.val) || 0;
          let realVal = parseFloat(tr.dataset.real) || 0;
          if (roundingMode) {
            val = Math.round(val / 1000) * 1000;
            realVal = Math.round(realVal / 1000) * 1000;
          } else if (ringkasMode) {
            val = Math.trunc(val / 1000) * 1000;
            realVal = Math.trunc(realVal / 1000) * 1000;
          }
          if (isTopUpGroup) {
            curIn += val;
            curOut += realVal;
            hasIncome = true;
          } else if (tr.dataset.cat === 'income') {
            curIn += val;
            hasIncome = true;
          } else {
            curOut += val;
          }
        }
      });
      if (curSubhdMeta) {
        curSubhdMeta.textContent = hasIncome
          ? `${curCount} trx • Keluar: ${fmtAmt(curOut)} | Masuk: ${fmtAmt(curIn)}`
          : `${curCount} item • Keluar: ${fmtAmt(curOut)}`;
      }
    });
  });
}

function getRekapDateLabel(dateStr) {
  if (!dateStr || dateStr === 'other') return 'Lainnya';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
  } catch(e) {
    return dateStr;
  }
}
window.getRekapDateLabel = getRekapDateLabel;

if (typeof formatDisplayDate !== 'function') {
  window.formatDisplayDate = function(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch(e) { return dateStr; }
  };
}

function toggleRekapDateRows(dKey) {
  if (!window._expandedRekapDates) window._expandedRekapDates = new Set();
  const rows = document.querySelectorAll('.rekap-subrow-' + dKey);
  const icon = document.getElementById('rekap-date-icon-' + dKey);
  if (!rows || rows.length === 0) return;
  const isCurrentlyHidden = (rows[0].style.display === 'none');
  rows.forEach(r => {
    r.style.display = isCurrentlyHidden ? '' : 'none';
  });
  if (isCurrentlyHidden) {
    window._expandedRekapDates.add(dKey);
    if (icon) icon.textContent = '▼';
  } else {
    window._expandedRekapDates.delete(dKey);
    if (icon) icon.textContent = '▶';
  }
}
window.toggleRekapDateRows = toggleRekapDateRows;

function toggleRekapCollapse() {
  window._rekapUserToggled = true;
  const body = document.getElementById('rekap-body');
  const icon = document.getElementById('rekap-toggle-icon');
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (icon) icon.textContent = '▼';
  } else {
    body.style.display = 'none';
    if (icon) icon.textContent = '▶';
  }
}
window.toggleRekapCollapse = toggleRekapCollapse;

function getCalcValueForCopy(rawNum) {
  const val = parseFloat(rawNum) || 0;
  if (roundingMode) {
    return Math.round(val / 1000);
  } else if (ringkasMode) {
    return Math.trunc(val / 1000);
  }
  return Math.round(val);
}

function copyRekapFormula(el, event) {
  if (event) event.stopPropagation();
  const target = (el && el.dataset && el.dataset.formula) ? el : ((el && el.querySelector && el.querySelector('[data-formula]')) || el);
  let formula = target && target.dataset ? (target.dataset.formula || '') : '';
  if (event && event.shiftKey && target && target.dataset && target.dataset.formulaAlt) {
    formula = target.dataset.formulaAlt;
  }
  if (!formula && target && target.textContent) {
    formula = target.textContent.trim();
  }
  if (!formula || formula === '0') {
    showToast('Tidak ada nilai untuk disalin');
    return;
  }
  const done = () => showToast('📋 Disalin untuk kalkulator: ' + formula);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(formula).then(done).catch(() => fallbackCopy(formula, done));
  } else {
    fallbackCopy(formula, done);
  }
}
window.copyRekapFormula = copyRekapFormula;

function renderRekapSummaryTable() {
  const container = document.getElementById('rekap-summary-container');
  const tbody = document.getElementById('rekap-tbody');
  const tfoot = document.getElementById('rekap-tfoot');
  if (!container || !tbody || !tfoot) return;

  const groups = document.querySelectorAll('#groups-container .lv-group');
  if (!groups || groups.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Detect Multi-Day report
  let allDates = [];
  if (window.REPORT_DATA && Array.isArray(window.REPORT_DATA.dates) && window.REPORT_DATA.dates.length > 1) {
    allDates = window.REPORT_DATA.dates.slice();
  } else {
    const dateSet = new Set();
    groups.forEach(group => {
      if (group.dataset.date) dateSet.add(group.dataset.date);
      group.querySelectorAll('.lv-row').forEach(row => {
        const d = row.dataset.date || group.dataset.date || row.closest('[data-date]')?.dataset?.date;
        if (d) dateSet.add(d);
      });
    });
    allDates = Array.from(dateSet).sort();
  }

  const isMultiDay = (allDates.length > 1);

  if (!isMultiDay) {
    // SINGLE DAY: Render standard flat table
    const appAggregates = {};
    const appOrder = [];

    groups.forEach(group => {
      let grpTrx = parseInt(group.dataset.calcTrx, 10);
      let grpMasuk = parseFloat(group.dataset.calcMasuk);
      let grpKeluar = parseFloat(group.dataset.calcKeluar);

      if (isNaN(grpTrx) || isNaN(grpMasuk) || isNaN(grpKeluar)) {
        grpTrx = 0;
        grpMasuk = 0;
        grpKeluar = 0;
        const isTopUpGroup = (group.dataset.groupId === 'topup' || group.dataset.appKey === 'topup');
        group.querySelectorAll('.lv-row').forEach(row => {
          if (row.classList.contains('item-deleted')) return;
          grpTrx++;
          let val = parseFloat(row.dataset.val) || 0;
          let realVal = parseFloat(row.dataset.real) || 0;
          if (roundingMode) {
            val = Math.round(val / 1000) * 1000;
            realVal = Math.round(realVal / 1000) * 1000;
          } else if (ringkasMode) {
            val = Math.trunc(val / 1000) * 1000;
            realVal = Math.trunc(realVal / 1000) * 1000;
          }
          if (isTopUpGroup) {
            grpMasuk += val;
            grpKeluar += realVal;
          } else if (row.dataset.cat === 'income') {
            grpMasuk += val;
          } else {
            grpKeluar += val;
          }
        });
        group.dataset.calcTrx = grpTrx;
        group.dataset.calcMasuk = grpMasuk;
        group.dataset.calcKeluar = grpKeluar;
      }

      const appKey = group.dataset.appKey || (group.dataset.groupId ? group.dataset.groupId.split('-')[0] : '') || 'other';
      const label = group.dataset.rekapLabel || (group.querySelector('.lv-group-icon')?.textContent ? (group.querySelector('.lv-group-icon').textContent + ' ' + (group.querySelector('.lv-group-name')?.childNodes[0]?.textContent?.trim() || '')) : (group.querySelector('.lv-group-name')?.textContent || 'Grup'));

      if (!appAggregates[appKey]) {
        appAggregates[appKey] = {
          label: label,
          trx: 0,
          masuk: 0,
          keluar: 0
        };
        appOrder.push(appKey);
      }

      appAggregates[appKey].trx += grpTrx;
      appAggregates[appKey].masuk += grpMasuk;
      appAggregates[appKey].keluar += grpKeluar;
    });

    let totalRekapTrx = 0;
    let totalRekapMasuk = 0;
    let totalRekapKeluar = 0;
    let rowsHtml = '';
    let count = 0;
    const keluarList = [];
    const masukList = [];

    appOrder.forEach(appKey => {
      const item = appAggregates[appKey];
      const diff = item.keluar - item.masuk;

      totalRekapTrx += item.trx;
      totalRekapMasuk += item.masuk;
      totalRekapKeluar += item.keluar;
      count++;

      const kVal = getCalcValueForCopy(item.keluar);
      const mVal = getCalcValueForCopy(item.masuk);
      if (kVal > 0) keluarList.push(kVal);
      if (mVal > 0) masukList.push(mVal);

      const kHtml = item.keluar > 0
        ? `<span class="rekap-copy-val c-out" onclick="copyRekapFormula(this, event)" data-formula="${kVal}" title="Klik untuk salin ${kVal} ke kalkulator">${fmtAmt(item.keluar)}</span>`
        : fmtAmt(item.keluar);

      const mHtml = item.masuk > 0
        ? `<span class="rekap-copy-val c-in" onclick="copyRekapFormula(this, event)" data-formula="${mVal}" title="Klik untuk salin ${mVal} ke kalkulator">${fmtAmt(item.masuk)}</span>`
        : fmtAmt(item.masuk);

      rowsHtml += `<tr>
        <td class="lv-td l"><b>${escapeHtml(item.label)}</b></td>
        <td class="lv-td c">${item.trx}</td>
        <td class="lv-td r" style="color:var(--outcome);">${kHtml}</td>
        <td class="lv-td r" style="color:${item.masuk > 0 ? 'var(--income)' : 'var(--muted)'};">${mHtml}</td>
        <td class="lv-td r" style="font-weight:700; color:${diff >= 0 ? 'var(--income)' : 'var(--outcome)'};">${(diff > 0 ? '+' : '') + fmtAmt(diff)}</td>
      </tr>`;
    });

    if (count === 0) {
      container.style.display = 'none';
      return;
    }

    const grandDiff = totalRekapKeluar - totalRekapMasuk;
    const formulaKeluar = keluarList.length > 0 ? keluarList.join('+') : String(getCalcValueForCopy(totalRekapKeluar) || 0);
    const formulaMasuk = masukList.length > 0 ? masukList.join('+') : String(getCalcValueForCopy(totalRekapMasuk) || 0);

    tbody.innerHTML = rowsHtml;
    tfoot.innerHTML = `<tr>
      <td class="lv-td l" style="font-weight:800; font-size:0.85rem;">TOTAL GABUNGAN</td>
      <td class="lv-td c" style="font-weight:800;">${totalRekapTrx}</td>
      <td class="lv-td r" style="font-weight:800; color:var(--outcome); cursor:pointer;" onclick="copyRekapFormula(this, event)" data-formula="${escapeHtml(formulaKeluar)}" title="Klik untuk salin penjumlahan kalkulator (${escapeHtml(formulaKeluar)})">
        <span class="rekap-copy-val c-out">${fmtAmt(totalRekapKeluar)}</span>
      </td>
      <td class="lv-td r" style="font-weight:800; color:var(--income); cursor:pointer;" onclick="copyRekapFormula(this, event)" data-formula="${escapeHtml(formulaMasuk)}" title="Klik untuk salin penjumlahan kalkulator (${escapeHtml(formulaMasuk)})">
        <span class="rekap-copy-val c-in">${fmtAmt(totalRekapMasuk)}</span>
      </td>
      <td class="lv-td r" style="font-weight:800; color:${grandDiff >= 0 ? 'var(--income)' : 'var(--outcome)'};">${(grandDiff > 0 ? '+' : '') + fmtAmt(grandDiff)}</td>
    </tr>`;
    container.style.display = 'block';
    return;
  }

  // MULTI-DAY: Separate by date with date header rows and collapsible module breakdown
  const dateData = {};
  allDates.forEach(dKey => {
    dateData[dKey] = {
      date: dKey,
      trx: 0,
      masuk: 0,
      keluar: 0,
      modules: {},
      appOrder: []
    };
  });

  groups.forEach(group => {
    const isTopUpGroup = (group.dataset.groupId === 'topup' || group.dataset.appKey === 'topup');
    const appKey = group.dataset.appKey || (group.dataset.groupId ? group.dataset.groupId.split('-')[0] : '') || 'other';
    const label = group.dataset.rekapLabel || (group.querySelector('.lv-group-icon')?.textContent ? (group.querySelector('.lv-group-icon').textContent + ' ' + (group.querySelector('.lv-group-name')?.childNodes[0]?.textContent?.trim() || '')) : (group.querySelector('.lv-group-name')?.textContent || 'Grup'));

    const groupDate = group.dataset.date || group.closest('[data-date]')?.dataset?.date;
    const rows = group.querySelectorAll('.lv-row');

    let rowsHaveDates = false;
    rows.forEach(r => {
      if (r.dataset.date && r.dataset.date !== groupDate) rowsHaveDates = true;
    });

    if (groupDate && !rowsHaveDates) {
      let grpTrx = parseInt(group.dataset.calcTrx, 10);
      let grpMasuk = parseFloat(group.dataset.calcMasuk);
      let grpKeluar = parseFloat(group.dataset.calcKeluar);
      if (isNaN(grpTrx) || isNaN(grpMasuk) || isNaN(grpKeluar)) {
        grpTrx = 0; grpMasuk = 0; grpKeluar = 0;
        rows.forEach(row => {
          if (row.classList.contains('item-deleted')) return;
          grpTrx++;
          let val = parseFloat(row.dataset.val) || 0;
          let realVal = parseFloat(row.dataset.real) || 0;
          if (roundingMode) {
            val = Math.round(val / 1000) * 1000;
            realVal = Math.round(realVal / 1000) * 1000;
          } else if (ringkasMode) {
            val = Math.trunc(val / 1000) * 1000;
            realVal = Math.trunc(realVal / 1000) * 1000;
          }
          if (isTopUpGroup) {
            grpMasuk += val; grpKeluar += realVal;
          } else if (row.dataset.cat === 'income') {
            grpMasuk += val;
          } else {
            grpKeluar += val;
          }
        });
      }

      if (!dateData[groupDate]) {
        dateData[groupDate] = { date: groupDate, trx: 0, masuk: 0, keluar: 0, modules: {}, appOrder: [] };
      }
      const dObj = dateData[groupDate];
      if (!dObj.modules[appKey]) {
        dObj.modules[appKey] = { label: label, trx: 0, masuk: 0, keluar: 0 };
        dObj.appOrder.push(appKey);
      }
      dObj.modules[appKey].trx += grpTrx;
      dObj.modules[appKey].masuk += grpMasuk;
      dObj.modules[appKey].keluar += grpKeluar;
      dObj.trx += grpTrx;
      dObj.masuk += grpMasuk;
      dObj.keluar += grpKeluar;
    } else {
      let currentSubhdDate = groupDate || '';
      const tableRows = group.querySelectorAll('tr');
      tableRows.forEach(tr => {
        if (tr.classList.contains('lv-date-subhd-row')) {
          if (tr.dataset.date) {
            currentSubhdDate = tr.dataset.date;
          } else {
            const titleEl = tr.querySelector('.lv-date-subhd-title');
            if (titleEl) {
              const txt = titleEl.textContent;
              for (const ad of allDates) {
                if (txt.includes(ad) || txt.includes(getRekapDateLabel(ad))) {
                  currentSubhdDate = ad;
                  break;
                }
              }
            }
          }
          return;
        }
        if (!tr.classList.contains('lv-row') || tr.classList.contains('item-deleted')) return;

        const rowDate = tr.dataset.date || currentSubhdDate || groupDate || (allDates.length > 0 ? allDates[0] : 'other');
        let val = parseFloat(tr.dataset.val) || 0;
        let realVal = parseFloat(tr.dataset.real) || 0;
        if (roundingMode) {
          val = Math.round(val / 1000) * 1000;
          realVal = Math.round(realVal / 1000) * 1000;
        } else if (ringkasMode) {
          val = Math.trunc(val / 1000) * 1000;
          realVal = Math.trunc(realVal / 1000) * 1000;
        }

        let rMasuk = 0, rKeluar = 0;
        if (isTopUpGroup) {
          rMasuk = val;
          rKeluar = realVal;
        } else if (tr.dataset.cat === 'income') {
          rMasuk = val;
        } else {
          rKeluar = val;
        }

        if (!dateData[rowDate]) {
          dateData[rowDate] = { date: rowDate, trx: 0, masuk: 0, keluar: 0, modules: {}, appOrder: [] };
        }
        const dObj = dateData[rowDate];
        if (!dObj.modules[appKey]) {
          dObj.modules[appKey] = { label: label, trx: 0, masuk: 0, keluar: 0 };
          dObj.appOrder.push(appKey);
        }
        dObj.modules[appKey].trx += 1;
        dObj.modules[appKey].masuk += rMasuk;
        dObj.modules[appKey].keluar += rKeluar;
        dObj.trx += 1;
        dObj.masuk += rMasuk;
        dObj.keluar += rKeluar;
      });
    }
  });

  let totalRekapTrx = 0;
  let totalRekapMasuk = 0;
  let totalRekapKeluar = 0;
  let rowsHtml = '';
  let count = 0;

  const dateKeluarList = [];
  const dateMasukList = [];
  const appTotals = {};
  const appOrderAll = [];

  const sortedDateKeys = Object.keys(dateData).sort();
  sortedDateKeys.forEach(dKey => {
    const dObj = dateData[dKey];
    if (dObj.trx === 0) return;

    const dayDiff = dObj.keluar - dObj.masuk;
    totalRekapTrx += dObj.trx;
    totalRekapMasuk += dObj.masuk;
    totalRekapKeluar += dObj.keluar;
    count++;

    const dKVal = getCalcValueForCopy(dObj.keluar);
    const dMVal = getCalcValueForCopy(dObj.masuk);
    if (dKVal > 0) dateKeluarList.push(dKVal);
    if (dMVal > 0) dateMasukList.push(dMVal);

    // Collect module values for this date
    const dayModuleKeluarList = [];
    const dayModuleMasukList = [];
    dObj.appOrder.forEach(appKey => {
      const item = dObj.modules[appKey];
      const mKVal = getCalcValueForCopy(item.keluar);
      const mMVal = getCalcValueForCopy(item.masuk);
      if (mKVal > 0) dayModuleKeluarList.push(mKVal);
      if (mMVal > 0) dayModuleMasukList.push(mMVal);

      if (!appTotals[appKey]) {
        appTotals[appKey] = { label: item.label, keluar: 0, masuk: 0 };
        appOrderAll.push(appKey);
      }
      appTotals[appKey].keluar += item.keluar;
      appTotals[appKey].masuk += item.masuk;
    });

    const dayKFormula = dayModuleKeluarList.length > 0 ? dayModuleKeluarList.join('+') : String(dKVal || 0);
    const dayMFormula = dayModuleMasukList.length > 0 ? dayModuleMasukList.join('+') : String(dMVal || 0);

    const isExpanded = window._expandedRekapDates.has(dKey);
    const iconChar = isExpanded ? '▼' : '▶';
    const subDisplay = isExpanded ? '' : 'none';
    const dateLabel = getRekapDateLabel(dKey);

    const dateKHtml = dObj.keluar > 0
      ? `<span class="rekap-copy-val c-out" onclick="copyRekapFormula(this, event)" data-formula="${escapeHtml(dayKFormula)}" title="Klik untuk salin rincian modul ${escapeHtml(dateLabel)} (${escapeHtml(dayKFormula)})">${fmtAmt(dObj.keluar)}</span>`
      : fmtAmt(dObj.keluar);

    const dateMHtml = dObj.masuk > 0
      ? `<span class="rekap-copy-val c-in" onclick="copyRekapFormula(this, event)" data-formula="${escapeHtml(dayMFormula)}" title="Klik untuk salin rincian modul ${escapeHtml(dateLabel)} (${escapeHtml(dayMFormula)})">${fmtAmt(dObj.masuk)}</span>`
      : fmtAmt(dObj.masuk);

    rowsHtml += `
      <tr class="rekap-date-hd" onclick="toggleRekapDateRows('${escapeHtml(dKey)}')" title="Klik untuk lihat / sembunyikan rincian modul ${escapeHtml(dateLabel)}" style="cursor:pointer; background:var(--surface2); font-weight:700; user-select:none;">
        <td class="lv-td l" style="padding:8px 12px; font-weight:700;">
          <span id="rekap-date-icon-${escapeHtml(dKey)}" style="display:inline-block; width:16px; font-size:0.75rem; color:var(--accent);">${iconChar}</span>
          <span style="color:var(--text);">📅 ${escapeHtml(dateLabel)}</span>
        </td>
        <td class="lv-td c" style="font-weight:700;">${dObj.trx}</td>
        <td class="lv-td r" style="font-weight:700; color:var(--outcome);">${dateKHtml}</td>
        <td class="lv-td r" style="font-weight:700; color:${dObj.masuk > 0 ? 'var(--income)' : 'var(--muted)'};">${dateMHtml}</td>
        <td class="lv-td r" style="font-weight:700; color:${dayDiff >= 0 ? 'var(--income)' : 'var(--outcome)'};">${(dayDiff > 0 ? '+' : '') + fmtAmt(dayDiff)}</td>
      </tr>`;

    dObj.appOrder.forEach(appKey => {
      const item = dObj.modules[appKey];
      const diff = item.keluar - item.masuk;
      const subKVal = getCalcValueForCopy(item.keluar);
      const subMVal = getCalcValueForCopy(item.masuk);

      const subKHtml = item.keluar > 0
        ? `<span class="rekap-copy-val c-out" onclick="copyRekapFormula(this, event)" data-formula="${subKVal}" title="Klik untuk salin nilai ${subKVal}">${fmtAmt(item.keluar)}</span>`
        : fmtAmt(item.keluar);

      const subMHtml = item.masuk > 0
        ? `<span class="rekap-copy-val c-in" onclick="copyRekapFormula(this, event)" data-formula="${subMVal}" title="Klik untuk salin nilai ${subMVal}">${fmtAmt(item.masuk)}</span>`
        : fmtAmt(item.masuk);

      rowsHtml += `
        <tr class="rekap-subrow rekap-subrow-${escapeHtml(dKey)}" style="display:${subDisplay};">
          <td class="lv-td l" style="padding-left:32px;">${escapeHtml(item.label)}</td>
          <td class="lv-td c">${item.trx}</td>
          <td class="lv-td r" style="color:var(--outcome);">${subKHtml}</td>
          <td class="lv-td r" style="color:${item.masuk > 0 ? 'var(--income)' : 'var(--muted)'};">${subMHtml}</td>
          <td class="lv-td r" style="font-weight:700; color:${diff >= 0 ? 'var(--income)' : 'var(--outcome)'};">${(diff > 0 ? '+' : '') + fmtAmt(diff)}</td>
        </tr>`;
    });
  });

  if (count === 0) {
    container.style.display = 'none';
    return;
  }

  const grandDiff = totalRekapKeluar - totalRekapMasuk;

  // Module aggregates across all dates in multi-day
  const appKeluarList = appOrderAll.map(k => getCalcValueForCopy(appTotals[k].keluar)).filter(v => v > 0);
  const appMasukList = appOrderAll.map(k => getCalcValueForCopy(appTotals[k].masuk)).filter(v => v > 0);

  const multiFormulaKeluar = dateKeluarList.length > 1
    ? dateKeluarList.join('+')
    : (appKeluarList.length > 0 ? appKeluarList.join('+') : String(getCalcValueForCopy(totalRekapKeluar) || 0));

  const multiFormulaMasuk = dateMasukList.length > 1
    ? dateMasukList.join('+')
    : (appMasukList.length > 0 ? appMasukList.join('+') : String(getCalcValueForCopy(totalRekapMasuk) || 0));

  const altFormulaKeluar = appKeluarList.length > 0 ? appKeluarList.join('+') : multiFormulaKeluar;
  const altFormulaMasuk = appMasukList.length > 0 ? appMasukList.join('+') : multiFormulaMasuk;

  tbody.innerHTML = rowsHtml;
  tfoot.innerHTML = `<tr>
    <td class="lv-td l" style="font-weight:800; font-size:0.85rem;">TOTAL GABUNGAN</td>
    <td class="lv-td c" style="font-weight:800;">${totalRekapTrx}</td>
    <td class="lv-td r" style="font-weight:800; color:var(--outcome); cursor:pointer;" onclick="copyRekapFormula(this, event)" data-formula="${escapeHtml(multiFormulaKeluar)}" data-formula-alt="${escapeHtml(altFormulaKeluar)}" title="Klik untuk salin kalkulator (${escapeHtml(multiFormulaKeluar)})${dateKeluarList.length > 1 ? '. Shift+Klik untuk rincian modul (' + escapeHtml(altFormulaKeluar) + ').' : ''}">
      <span class="rekap-copy-val c-out">${fmtAmt(totalRekapKeluar)}</span>
    </td>
    <td class="lv-td r" style="font-weight:800; color:var(--income); cursor:pointer;" onclick="copyRekapFormula(this, event)" data-formula="${escapeHtml(multiFormulaMasuk)}" data-formula-alt="${escapeHtml(altFormulaMasuk)}" title="Klik untuk salin kalkulator (${escapeHtml(multiFormulaMasuk)})${dateMasukList.length > 1 ? '. Shift+Klik untuk rincian modul (' + escapeHtml(altFormulaMasuk) + ').' : ''}">
      <span class="rekap-copy-val c-in">${fmtAmt(totalRekapMasuk)}</span>
    </td>
    <td class="lv-td r" style="font-weight:800; color:${grandDiff >= 0 ? 'var(--income)' : 'var(--outcome)'};">${(grandDiff > 0 ? '+' : '') + fmtAmt(grandDiff)}</td>
  </tr>`;

  if (isMultiDay && !window._rekapUserToggled) {
    const body = document.getElementById('rekap-body');
    const icon = document.getElementById('rekap-toggle-icon');
    if (body) body.style.display = 'none';
    if (icon) icon.textContent = '▶';
  }

  container.style.display = 'block';
}
window.renderRekapSummaryTable = renderRekapSummaryTable;

function showToast(msg) {
  let toast = document.getElementById('ksp-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ksp-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// --- AUTO-SAVE LOCAL EDITS & RESTORE ---
let autoSaveDebounceTimer = null;

function syncRowEditToReportData(row, val, desc, deleted, read) {
  if (!row || !window.REPORT_DATA) return;
  const d = window.REPORT_DATA;
  const rowId = row.dataset.rowId;
  const rowDate = row.dataset.date || row.closest('[data-date]')?.dataset?.date;
  const timeCell = row.querySelector('.lv-time-text');
  const time = timeCell ? timeCell.textContent.trim() : '';
  const orig = parseFloat(row.dataset.orig) || 0;

  const modules = ['tarik', 'voucher', 'notif', 'topup'];
  let found = false;

  for (const m of modules) {
    if (!Array.isArray(d[m])) continue;
    for (const item of d[m]) {
      const matchesId = Boolean(rowId && (item.rowId === rowId || item.id === rowId));
      const matchesSemantic = !matchesId && (!rowId) &&
        (item.time === time) &&
        (!rowDate || !item.date || item.date === rowDate) &&
        (item.orig === orig || item.amount === orig);

      if (matchesId || matchesSemantic) {
        if (val !== undefined && val !== null) {
          item.amount = val;
          if (item.jumtar !== undefined) item.jumtar = val;
          item.isEdited = (item.orig !== undefined ? item.amount !== item.orig : false);
        }
        if (desc !== undefined && desc !== null) {
          if (item.name !== undefined) item.name = desc;
          if (item.desc !== undefined) item.desc = desc;
          if (item.productName !== undefined) item.productName = desc;
        }
        if (deleted !== undefined) {
          item.deleted = Boolean(deleted);
        }
        if (read !== undefined) {
          item.read = Boolean(read);
        }
        found = true;
        break;
      }
    }
    if (found) break;
  }
}

function getReportStorageKey() {
  const d = window.REPORT_DATA;
  if (!d) return 'ksp_report_edits_default';
  const dateKey = d.dateDb || d.startDate || 'report';
  const shiftKey = (d.shift !== undefined && d.shift !== null) ? d.shift : 'all';
  return `ksp_edits_${dateKey}_shift_${shiftKey}`;
}

function getRowStorageKey(row) {
  if (!row) return null;
  if (row.dataset.rowKey) return row.dataset.rowKey;

  // 1. Primary stable identifier: rowId (UUID / ID stabil dari database atau saat baris baru dibuat)
  if (row.dataset.rowId) {
    const key = `row_${row.dataset.rowId}`;
    row.dataset.rowKey = key;
    return key;
  }

  // 2. Fallback kunci semantik: independen dari DOM group ID / struktur layout tampilan
  const group = row.closest('.lv-group');
  const appKey = (group && (group.dataset.appKey || (group.dataset.groupId ? group.dataset.groupId.split('-')[0] : ''))) || 'grp';
  const rowDate = row.dataset.date || (group && group.dataset.date) || (row.closest('[data-date]')?.dataset?.date) || '';
  const timeCell = row.querySelector('.lv-time-text');
  const time = timeCell ? timeCell.textContent.trim() : '';
  const cat = row.dataset.cat || '';
  const orig = row.dataset.orig || '0';
  const desc = (row.dataset.desc || '').trim();

  const key = `sem_${appKey}_${rowDate}_${time}_${cat}_${orig}_${desc}`;
  row.dataset.rowKey = key;
  return key;
}

function getLegacyRowKey(row) {
  if (!row) return null;
  const group = row.closest('.lv-group');
  const grpId = group ? (group.dataset.groupId || group.dataset.appKey || 'grp') : 'grp';
  const grpDate = group ? (group.dataset.date || '') : '';

  let rowIdxInGroup = 0;
  if (group) {
    const groupRows = Array.from(group.querySelectorAll('.lv-row'));
    rowIdxInGroup = groupRows.indexOf(row) + 1;
  }

  const timeCell = row.querySelector('.lv-time-text');
  const time = timeCell ? timeCell.textContent.trim() : '';
  const cat = row.dataset.cat || '';
  const orig = row.dataset.orig || '0';

  return `${grpId}_${grpDate}_r${rowIdxInGroup}_${time}_${cat}_${orig}`;
}

function saveReportEdits() {
  if (typeof clearTimeout === 'function') {
    clearTimeout(autoSaveDebounceTimer);
  }
  if (typeof setTimeout === 'function') {
    autoSaveDebounceTimer = setTimeout(doSaveReportEdits, 250);
  } else if (typeof doSaveReportEdits === 'function') {
    doSaveReportEdits();
  }
}

let isSyncingEditsToSupabase = false;
let pendingEditsToSync = false;

function doSaveReportEdits() {
  try {
    const key = getReportStorageKey();
    const rows = document.querySelectorAll('.lv-row');
    const items = {};
    let hasEdits = false;

    rows.forEach(row => {
      const rowKey = getRowStorageKey(row);
      if (!rowKey) return;

      const currentVal = parseFloat(row.dataset.val) || 0;
      const origVal = parseFloat(row.dataset.orig) || 0;
      const currentDesc = (row.dataset.desc || '').trim();
      const isDel = row.classList.contains('item-deleted');
      const isRead = row.classList.contains('item-read');
      const isNew = row.dataset.isNew === 'true';
      const isChanged = (currentVal !== origVal);

      if (isChanged || isDel || isRead || isNew) {
        hasEdits = true;
        items[rowKey] = {
          rowId: row.dataset.rowId || null,
          val: currentVal,
          desc: currentDesc,
          deleted: isDel,
          read: isRead,
          isNew: isNew
        };
      }
    });

    if (hasEdits) {
      const payload = {
        updatedAt: Date.now(),
        items: items
      };
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(key, JSON.stringify(payload));
      }
      updateLocalEditsBadge(true, false);
      // Pushing changes directly to Supabase Cloud
      syncEditsToSupabase();
    } else {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(key);
      }
      updateLocalEditsBadge(false, false);
    }
  } catch (err) {
    console.warn('Auto-save edits failed:', err);
  }
}

async function syncEditsToSupabase() {
  const client = getSupabaseClient();
  const cfg = window.KSP_SYNC_CONFIG || {};
  if (!client && (!cfg.url || !cfg.key)) return;

  const storeId = window.ACTIVE_STORE_ID || (window.REPORT_DATA && window.REPORT_DATA.storeId);
  if (!storeId) return;

  if (isSyncingEditsToSupabase) {
    pendingEditsToSync = true;
    return;
  }
  isSyncingEditsToSupabase = true;
  pendingEditsToSync = false;

  window._isSavingWebEdits = true;
  clearTimeout(window._savingEditsTimer);
  window._savingEditsTimer = setTimeout(() => {
    window._isSavingWebEdits = false;
  }, 2500);

  try {
    const rows = document.querySelectorAll('.lv-row');
    const updatePromises = [];

    rows.forEach(row => {
      let rowId = row.dataset.rowId;
      const currentVal = parseFloat(row.dataset.val) || 0;
      const origVal = parseFloat(row.dataset.orig) || 0;
      const currentDesc = (row.dataset.desc || '').trim();
      const isDel = row.classList.contains('item-deleted');
      const isRead = row.classList.contains('item-read');
      const isNew = row.dataset.isNew === 'true';
      const isChanged = (currentVal !== origVal);

      if (isChanged || isDel || isRead || isNew) {
        if (!rowId && isNew) {
          rowId = 'web_' + storeId + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
          row.dataset.rowId = rowId;
        }

        if (rowId) {
          updatePromises.push(saveRowToSupabase(rowId, currentVal, origVal, currentDesc, isDel, isRead, isNew, isChanged, row, storeId));
        }
      }
    });

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      updateLocalEditsBadge(true, true);
    }
  } catch (err) {
    console.warn('[KspHistoriku] Gagal sync editan ke Supabase:', err);
    updateLocalEditsBadge(true, false);
  } finally {
    isSyncingEditsToSupabase = false;
    if (pendingEditsToSync) {
      setTimeout(syncEditsToSupabase, 200);
    }
  }
}

async function saveRowToSupabase(rowId, currentVal, origVal, currentDesc, isDel, isRead, isNew, isChanged, rowEl, storeId) {
  const client = getSupabaseClient();
  const cfg = window.KSP_SYNC_CONFIG || {};
  const baseUrl = (cfg.url || '').replace(/\/+$/, '');
  const headers = {
    'apikey': cfg.key,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
  if (cfg.key && !cfg.key.startsWith('sb_')) headers['Authorization'] = 'Bearer ' + cfg.key;

  const extra = {
    is_edited: true,
    is_deleted_by_web: isDel,
    web_edited_at: new Date().toISOString(),
    orig_amount: origVal,
    web_read: isRead,
    web_modified: isChanged
  };

  const group = rowEl ? rowEl.closest('.lv-group') : null;
  const rawMod = group ? (group.dataset.groupId || group.dataset.appKey || 'tarik').split('-')[0] : 'tarik';
  let supabaseModType = 'notif';
  if (rawMod === 'tarik') supabaseModType = 'tarik';
  else if (rawMod === 'voucher') supabaseModType = 'voucher';

  const trxDate = (rowEl && rowEl.dataset.date) || (group && group.dataset.date) || 
                  (window.REPORT_DATA && window.REPORT_DATA.dateDb && window.REPORT_DATA.dateDb.indexOf(' s/d ') === -1 ? window.REPORT_DATA.dateDb : '') || 
                  (window.REPORT_DATA && window.REPORT_DATA.startDate) || getTodayDbDate();
  const timeCell = rowEl ? rowEl.querySelector('.lv-time-text') : null;
  const timeStr = (rowEl && rowEl.dataset.time) || (timeCell ? timeCell.textContent.trim() : '00:00');
  const cat = (rowEl && rowEl.dataset.cat) || 'outcome';
  const appLabel = (group && group.dataset.rekapLabel) ? group.dataset.rekapLabel.replace(/^[^\w\s]+\s*/, '') : 'Input Web';

  if (isNew) {
    const newRecord = {
      id: rowId,
      store_id: storeId,
      device_id: 'web_client',
      device_name: 'Web Dashboard',
      module_type: supabaseModType,
      local_id: rowId,
      trx_date: trxDate.indexOf(' s/d ') > -1 ? getTodayDbDate() : trxDate,
      trx_time: timeStr.length === 5 ? timeStr + ':00' : timeStr,
      timestamp: Date.now(),
      shift: (rowEl && rowEl.dataset.shift) ? parseInt(rowEl.dataset.shift, 10) : ((window.REPORT_DATA && window.REPORT_DATA.shift) || 0),
      category: cat,
      amount: currentVal,
      real_amount: currentVal,
      fee: 0,
      cost: 0,
      quantity: 1,
      app_package: 'com.kspcheck.' + rawMod,
      app_name: appLabel,
      title: appLabel,
      item_name: currentDesc || 'Item Baru',
      customer_name: currentDesc || 'Item Baru',
      is_edited: true,
      is_deleted_by_web: isDel,
      web_edited_at: new Date().toISOString(),
      extra_data: extra
    };

    if (client) {
      let res = await client.from('ksp_history_transactions').upsert([newRecord], { onConflict: 'id' });
      if (res.error) {
        console.warn('[KspHistoriku] Upsert dengan web flags gagal, coba tanpa flags:', res.error);
        delete newRecord.is_edited;
        delete newRecord.is_deleted_by_web;
        delete newRecord.web_edited_at;
        let resRetry = await client.from('ksp_history_transactions').upsert([newRecord], { onConflict: 'id' });
        if (resRetry.error) {
          console.error('[KspHistoriku] Gagal upsert newRecord ke Supabase:', resRetry.error);
        }
      }
    } else {
      headers['Prefer'] = 'resolution=merge-duplicates,return=minimal';
      await fetch(`${baseUrl}/rest/v1/ksp_history_transactions`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(newRecord)
      });
    }
    return;
  }

  // Update row yang sudah ada di Supabase
  const updatePayload = {
    amount: currentVal,
    item_name: currentDesc || undefined,
    customer_name: currentDesc || undefined,
    is_edited: true,
    is_deleted_by_web: isDel,
    web_edited_at: new Date().toISOString(),
    extra_data: extra
  };

  if (client) {
    let res = await client.from('ksp_history_transactions').update(updatePayload).eq('id', rowId);
    if (res.error) {
      // Fallback jika kolom is_edited belum ditambahkan di Supabase
      const fallbackPayload = {
        amount: currentVal,
        item_name: currentDesc || undefined,
        customer_name: currentDesc || undefined,
        extra_data: extra
      };
      await client.from('ksp_history_transactions').update(fallbackPayload).eq('id', rowId);
    }
  } else {
    await fetch(`${baseUrl}/rest/v1/ksp_history_transactions?id=eq.${encodeURIComponent(rowId)}`, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(updatePayload)
    });
  }
}

function hasUserEdits() {
  try {
    const key = getReportStorageKey();
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return false;
    return localStorage.getItem(key) !== null;
  } catch (e) {
    return false;
  }
}

function updateLocalEditsBadge(hasEdits, isCloudSaved) {
  const chip = document.getElementById('chip-local-edits');
  if (chip) {
    chip.style.display = hasEdits ? 'inline-flex' : 'none';
    if (hasEdits) {
      if (isCloudSaved) {
        chip.innerHTML = '☁️ Tersimpan di Cloud';
        chip.title = 'Perubahan tersimpan permanen di Supabase Cloud & write-protected dari Android. Klik untuk opsi reset.';
        chip.style.background = 'rgba(16,185,129,0.18)';
        chip.style.color = '#10b981';
        chip.style.borderColor = 'rgba(16,185,129,0.4)';
      } else {
        chip.innerHTML = '💾 Tersimpan (Lokal)';
        chip.title = 'Perubahan tersimpan otomatis di perangkat ini. Klik untuk opsi reset data asli.';
        chip.style.background = '';
        chip.style.color = '';
        chip.style.borderColor = '';
      }
    }
  }
  const badge = document.getElementById('local-edits-badge');
  const btnReset = document.getElementById('btn-reset-edits');
  if (badge) {
    if (hasEdits) {
      badge.textContent = isCloudSaved ? 'Ada Perubahan (Tersimpan di Cloud)' : 'Ada Perubahan (Tersimpan Lokal)';
      badge.style.background = 'rgba(16,185,129,0.15)';
      badge.style.color = '#10b981';
    } else {
      badge.textContent = 'Tidak Ada Perubahan';
      badge.style.background = 'var(--border)';
      badge.style.color = 'var(--muted)';
    }
  }
  if (btnReset) {
    btnReset.style.display = hasEdits ? 'inline-block' : 'none';
  }
}

function showLocalEditsAction() {
  if (confirm('Perubahan Anda tersimpan di Cloud Supabase & terlindungi dari sinkronisasi kasir.\n\nApakah Anda ingin me-reset semua perubahan dan mengembalikan ke data asli laporan?')) {
    resetReportEdits();
  }
}

async function resetReportEdits() {
  const key = getReportStorageKey();
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(key);
    }
  } catch(e) {}

  const client = getSupabaseClient();
  const rows = document.querySelectorAll('.lv-row');
  const resetPromises = [];

  rows.forEach(row => {
    const rowId = row.dataset.rowId;
    const origVal = parseFloat(row.dataset.orig) || 0;
    const isNew = row.dataset.isNew === 'true';

    if (rowId) {
      if (isNew) {
        if (client) resetPromises.push(client.from('ksp_history_transactions').delete().eq('id', rowId));
      } else {
        const resetPayload = {
          amount: origVal,
          is_edited: false,
          is_deleted_by_web: false,
          extra_data: { reset_to_original: true }
        };
        if (client) resetPromises.push(client.from('ksp_history_transactions').update(resetPayload).eq('id', rowId));
      }
    }
  });

  try {
    if (resetPromises.length > 0) {
      await Promise.all(resetPromises);
    }
  } catch (err) {
    console.warn('[KspHistoriku] Gagal reset di cloud:', err);
  }

  updateLocalEditsBadge(false, false);
  showToast('Semua perubahan di-reset ke data asli');
  if (typeof renderReport === 'function' && window.REPORT_DATA) {
    if (window.ACTIVE_PERIOD_MODE === 'multiday') {
      loadMultiDayForStore(window.ACTIVE_STORE_ID, window.ACTIVE_STORE_NAME, window.REPORT_DATA.startDate, window.REPORT_DATA.endDate);
    } else {
      window.KspHistoriku.loadForStore(window.ACTIVE_STORE_ID, window.ACTIVE_STORE_NAME, window.REPORT_DATA.dateDb);
    }
  }
}

function loadAndApplyReportEdits() {
  try {
    const key = getReportStorageKey();
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      updateLocalEditsBadge(false);
      return false;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      updateLocalEditsBadge(false);
      return false;
    }
    const payload = JSON.parse(raw);
    if (!payload || !payload.items) {
      updateLocalEditsBadge(false);
      return false;
    }

    const rows = document.querySelectorAll('.lv-row');
    let appliedCount = 0;

    rows.forEach(row => {
      const primaryKey = getRowStorageKey(row);
      const legacyKey = getLegacyRowKey(row);
      let edit = null;

      if (primaryKey && payload.items[primaryKey]) {
        edit = payload.items[primaryKey];
      } else if (legacyKey && payload.items[legacyKey]) {
        edit = payload.items[legacyKey];
      } else if (row.dataset.rowId) {
        for (const k in payload.items) {
          const item = payload.items[k];
          if (item && item.rowId === row.dataset.rowId) {
            edit = item;
            break;
          }
        }
      }

      if (!edit) return;

      let valChanged = false;
      let descChanged = false;
      let delChanged = false;
      let readChanged = false;

      if (edit.val !== undefined && edit.val !== null) {
        const val = parseFloat(edit.val) || 0;
        row.dataset.val = val;
        valChanged = true;
        const amtSpan = row.querySelector('.lv-amt');
        if (amtSpan) {
          amtSpan.textContent = fmtAmt(val);
          const orig = parseFloat(row.dataset.orig) || 0;
          if (val !== orig) {
            amtSpan.classList.add('changed');
            const delta = val - orig;
            amtSpan.title = 'Asli: Rp ' + formatRupiah(orig) + ' (' + (delta > 0 ? '+' : '') + formatRupiah(delta) + ')';
          } else {
            amtSpan.classList.remove('changed');
            amtSpan.title = 'Klik untuk ubah langsung';
          }
        }
      }
      if (edit.desc !== undefined && edit.desc !== null && edit.desc !== '') {
        row.dataset.desc = edit.desc;
        descChanged = true;
        const nameCell = row.querySelector('.lv-td-itemname');
        if (nameCell) {
          nameCell.textContent = edit.desc;
          nameCell.title = 'Klik untuk dengar / ubah: ' + edit.desc;
        }
      }
      if (edit.deleted !== undefined) {
        row.classList.toggle('item-deleted', Boolean(edit.deleted));
        delChanged = true;
      }
      if (edit.read !== undefined) {
        row.classList.toggle('item-read', Boolean(edit.read));
        readChanged = true;
      }

      // Sync to in-memory REPORT_DATA so switching views preserves edits
      if (typeof syncRowEditToReportData === 'function') {
        syncRowEditToReportData(
          row,
          valChanged ? parseFloat(row.dataset.val) : undefined,
          descChanged ? row.dataset.desc : undefined,
          delChanged ? row.classList.contains('item-deleted') : undefined,
          readChanged ? row.classList.contains('item-read') : undefined
        );
      }

      updateRowMarkTags(row);
      appliedCount++;
    });

    if (appliedCount > 0) {
      recalcAll();
      updateLocalEditsBadge(true);
      return true;
    } else {
      updateLocalEditsBadge(false);
    }
  } catch (err) {
    console.warn('Gagal memuat editan lokal:', err);
    updateLocalEditsBadge(false);
  }
  return false;
}

// --- DOUBLE BACK TO EXIT INTERCEPTOR ---
let backTrapActive = false;
let lastBackPressTime = 0;

function handlePopState(e) {
  // 0a. If App Margin Modal is open -> close modal
  const marginModal = document.getElementById('app-margin-modal');
  if (marginModal && marginModal.classList.contains('open')) {
    if (typeof closeAppMarginDialog === 'function') closeAppMarginDialog();
    if (window.history && window.history.pushState) {
      window.history.pushState({ kspBackTrap: true }, '', window.location.href);
    }
    return;
  }

  // 0b. If Item Detail Modal is open -> close modal
  const dtlModal = document.getElementById('item-detail-modal');
  if (dtlModal && dtlModal.classList.contains('open')) {
    if (typeof closeItemDetailDialog === 'function') closeItemDetailDialog();
    if (window.history && window.history.pushState) {
      window.history.pushState({ kspBackTrap: true }, '', window.location.href);
    }
    return;
  }

  // 1. If TTS Settings Modal is open -> close modal
  const ttsModal = document.getElementById('tts-settings-modal');
  if (ttsModal && ttsModal.classList.contains('open')) {
    if (typeof closeTtsSettingsModal === 'function') closeTtsSettingsModal();
    if (window.history && window.history.pushState) {
      window.history.pushState({ kspBackTrap: true }, '', window.location.href);
    }
    return;
  }

  // 2. If Item Nav Bar is open -> close bar
  const navBar = document.getElementById('item-nav-bar');
  if (navBar && navBar.classList.contains('show')) {
    if (typeof closeItemNavBar === 'function') closeItemNavBar();
    if (window.history && window.history.pushState) {
      window.history.pushState({ kspBackTrap: true }, '', window.location.href);
    }
    return;
  }

  // 3. If inline edit input is open -> blur to finish editing
  const activeInput = document.querySelector('.edit-input, .edit-name-input');
  if (activeInput) {
    activeInput.blur();
    if (window.history && window.history.pushState) {
      window.history.pushState({ kspBackTrap: true }, '', window.location.href);
    }
    return;
  }

  // 4. Double Back to Exit
  const now = Date.now();
  if (now - lastBackPressTime < 2000) {
    showToast('Keluar dari laporan...');
    window.removeEventListener('popstate', handlePopState);
    window.history.back();
  } else {
    lastBackPressTime = now;
    if (window.history && window.history.pushState) {
      window.history.pushState({ kspBackTrap: true }, '', window.location.href);
    }
    showToast('⚠️ Tekan sekali lagi untuk keluar ke WhatsApp');
  }
}

function initBackInterceptor() {
  if (window.history && window.history.pushState) {
    window.history.pushState({ kspBackTrap: true }, '', window.location.href);
    backTrapActive = true;
    window.addEventListener('popstate', handlePopState);

    const reEnsure = () => {
      if (!backTrapActive && window.history && window.history.pushState) {
        window.history.pushState({ kspBackTrap: true }, '', window.location.href);
        backTrapActive = true;
      }
    };
    window.addEventListener('pointerdown', reEnsure, { passive: true });
    window.addEventListener('touchstart', reEnsure, { passive: true });
    window.addEventListener('click', reEnsure, { passive: true });
  }

  window.addEventListener('beforeunload', (e) => {
    if (hasUserEdits()) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });
}

function getGroupValues(group, category) {
  const vals = [];
  group.querySelectorAll('.lv-row').forEach(row => {
    if (row.classList.contains('item-deleted')) return;
    if (category && row.dataset.cat !== category) return;
    const val = parseFloat(row.dataset.val) || 0;
    if (roundingMode) {
      vals.push(Math.round(val / 1000));
    } else if (ringkasMode) {
      vals.push(Math.trunc(val / 1000));
    } else {
      vals.push(val);
    }
  });
  return vals;
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); if (cb) cb(); } catch (e) {}
  document.body.removeChild(ta);
}

function copyGroupValues(el, category, event) {
  if (event) event.stopPropagation();
  const group = el.closest('.lv-group');
  if (!group) return;
  const vals = getGroupValues(group, category);
  if (vals.length === 0) { showToast('Tidak ada nilai untuk disalin'); return; }
  const text = vals.join('+');
  const done = () => showToast('Disalin: ' + text);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

// --- GROUP COLLAPSE & AUTO-HIDE LOGIC ---
let autoHideCompleted = false;
try {
  const savedAutoHide = localStorage.getItem('ksp_auto_hide_completed');
  if (savedAutoHide === '1' || savedAutoHide === 'true') {
    autoHideCompleted = true;
  }
} catch(e) {}

function updateAutoHideBadge() {
  const badge = document.getElementById('auto-hide-status-badge');
  if (badge) {
    badge.textContent = autoHideCompleted ? 'Aktif (ON)' : 'Nonaktif (OFF)';
    badge.style.background = autoHideCompleted ? 'var(--accent-lt)' : 'var(--border)';
    badge.style.color = autoHideCompleted ? 'var(--accent)' : 'var(--muted)';
  }
}

function setAutoHideCompleted(enabled) {
  autoHideCompleted = !!enabled;
  try {
    localStorage.setItem('ksp_auto_hide_completed', autoHideCompleted ? '1' : '0');
  } catch(e) {}
  updateAutoHideBadge();
  showToast(autoHideCompleted ? 'Auto-hidden grup diaktifkan (ON)' : 'Auto-hidden grup dinonaktifkan (OFF)');
  if (autoHideCompleted) {
    checkAllGroupsCompletion(true);
  }
}

// Default hidden group setting (default: true)
let defaultHiddenGroup = true;
try {
  const savedDefaultHidden = localStorage.getItem('ksp_default_hidden_group');
  if (savedDefaultHidden === '0' || savedDefaultHidden === 'false') {
    defaultHiddenGroup = false;
  } else if (savedDefaultHidden === '1' || savedDefaultHidden === 'true') {
    defaultHiddenGroup = true;
  }
} catch(e) {}

function applyHiddenGroupState(btn) {
  if (!btn) btn = document.getElementById('btn-hidden-group');
  if (btn) {
    btn.classList.toggle('active', defaultHiddenGroup);
    const iconEl = document.getElementById('btn-hidden-group-icon');
    if (iconEl) iconEl.textContent = defaultHiddenGroup ? '📁' : '📂';
    btn.title = defaultHiddenGroup
      ? 'Hidden Group AKTIF (Semua grup dilipat). Klik untuk membuka semua grup.'
      : 'Hidden Group NONAKTIF (Semua grup terbuka). Klik untuk melipat semua grup.';
  }
}

function toggleHiddenGroup(btn) {
  defaultHiddenGroup = !defaultHiddenGroup;
  try {
    localStorage.setItem('ksp_default_hidden_group', defaultHiddenGroup ? '1' : '0');
  } catch(e) {}
  applyHiddenGroupState(btn);
  if (defaultHiddenGroup) {
    document.querySelectorAll('.lv-group').forEach(g => g.classList.add('collapsed'));
    showToast('Hidden Group aktif (Semua grup dilipat)');
  } else {
    document.querySelectorAll('.lv-group.collapsed').forEach(g => g.classList.remove('collapsed'));
    showToast('Hidden Group nonaktif (Semua grup dibuka)');
  }
}

function setDefaultHiddenGroup(enabled) {
  defaultHiddenGroup = !!enabled;
  try {
    localStorage.setItem('ksp_default_hidden_group', defaultHiddenGroup ? '1' : '0');
  } catch(e) {}
  applyHiddenGroupState();
  if (defaultHiddenGroup) {
    document.querySelectorAll('.lv-group').forEach(g => g.classList.add('collapsed'));
    showToast('Hidden Group aktif (Semua grup dilipat)');
  } else {
    document.querySelectorAll('.lv-group.collapsed').forEach(g => g.classList.remove('collapsed'));
    showToast('Hidden Group nonaktif (Semua grup dibuka)');
  }
}

function applyInitialGroupCollapse() {
  applyHiddenGroupState();
  if (defaultHiddenGroup) {
    document.querySelectorAll('.lv-group').forEach(g => g.classList.add('collapsed'));
  }
}

// Sambung multi date setting (default: true)
let sambungMultiDate = true;
try {
  const savedSambung = localStorage.getItem('ksp_sambung_multi_date');
  if (savedSambung === '0' || savedSambung === 'false') {
    sambungMultiDate = false;
  } else if (savedSambung === '1' || savedSambung === 'true') {
    sambungMultiDate = true;
  }
} catch(e) {}

function updateSambungMultiDateBadge() {
  const badge = document.getElementById('sambung-multidate-badge');
  const toggle = document.getElementById('sambung-multidate-toggle');
  if (badge) {
    badge.textContent = sambungMultiDate ? 'Aktif (ON)' : 'Nonaktif (OFF)';
    badge.style.background = sambungMultiDate ? 'var(--accent-lt)' : 'var(--border)';
    badge.style.color = sambungMultiDate ? 'var(--accent)' : 'var(--muted)';
  }
  if (toggle) {
    toggle.checked = sambungMultiDate;
  }
}

function setSambungMultiDate(enabled) {
  sambungMultiDate = !!enabled;
  try {
    localStorage.setItem('ksp_sambung_multi_date', sambungMultiDate ? '1' : '0');
  } catch(e) {}
  updateSambungMultiDateBadge();
  if (currentNavRow) {
    const allRows = getAllReportRows();
    updateNavBarUI(currentNavRow, allRows.indexOf(currentNavRow), allRows.length);
  }
  showToast(sambungMultiDate
    ? 'Sambung Multi Date aktif (Lanjut antar tanggal per aplikasi)'
    : 'Sambung Multi Date nonaktif (Lanjut urut per tanggal)');
}

window.defaultHiddenGroup = defaultHiddenGroup;
window.setDefaultHiddenGroup = setDefaultHiddenGroup;
window.toggleHiddenGroup = toggleHiddenGroup;
window.applyHiddenGroupState = applyHiddenGroupState;
window.applyInitialGroupCollapse = applyInitialGroupCollapse;
window.sambungMultiDate = sambungMultiDate;
window.setSambungMultiDate = setSambungMultiDate;
window.updateSambungMultiDateBadge = updateSambungMultiDateBadge;

function toggleGroupCollapse(el, event) {
  if (event) {
    if (event.target.closest('.g-act-btn') || 
        event.target.closest('.grp-meta-masuk') || 
        event.target.closest('.grp-meta-keluar') ||
        event.target.closest('.lv-group-name')) {
      return;
    }
    event.stopPropagation();
  }
  const group = el.closest('.lv-group');
  if (!group) return;
  const isCollapsed = group.classList.toggle('collapsed');
  showToast(isCollapsed ? 'Grup dilipat' : 'Grup dibuka');
  requestSideStickyUpdate();
}

function expandAllGroups() {
  document.querySelectorAll('.lv-group.collapsed').forEach(g => g.classList.remove('collapsed'));
  showToast('Semua grup dibuka');
  requestSideStickyUpdate();
}

function collapseAllGroups() {
  document.querySelectorAll('.lv-group').forEach(g => g.classList.add('collapsed'));
  showToast('Semua grup dilipat');
  requestSideStickyUpdate();
}

function isGroupAllRead(group) {
  if (!group) return false;
  const rows = Array.from(group.querySelectorAll('.lv-row')).filter(r => !r.classList.contains('item-deleted'));
  if (rows.length === 0) return false;
  return rows.every(r => r.classList.contains('item-read'));
}

function checkGroupCompletion(group, allowCollapse) {
  if (!group) return;
  const allRead = isGroupAllRead(group);
  group.classList.toggle('all-read', allRead);
  if (allRead && autoHideCompleted && allowCollapse) {
    if (currentNavRow && group.contains(currentNavRow)) {
      return;
    }
    group.classList.add('collapsed');
    requestSideStickyUpdate();
  }
}

function checkAllGroupsCompletion(allowCollapse) {
  document.querySelectorAll('.lv-group').forEach(g => {
    checkGroupCompletion(g, allowCollapse);
  });
}


// --- TTS STATE & SETTINGS ---
let ttsSpeed = 0.9;
let ttsDelay = 500;
let selectedVoiceURI = '';
try {
  const s = localStorage.getItem('ksp_tts_speed');
  if (s) ttsSpeed = parseFloat(s) || 0.9;
  const d = localStorage.getItem('ksp_tts_delay');
  if (d) ttsDelay = parseInt(d, 10) || 500;
  selectedVoiceURI = localStorage.getItem('ksp_tts_voice_uri') || '';
} catch(e) {}

let availableVoices = [];

function populateVoiceList() {
  if (!('speechSynthesis' in window)) return;
  availableVoices = window.speechSynthesis.getVoices() || [];

  const voiceSelect = document.getElementById('tts-voice-select');
  const countBadge = document.getElementById('tts-voice-count');
  if (!voiceSelect) return;

  if (countBadge) {
    countBadge.textContent = availableVoices.length > 0 ? (availableVoices.length + ' Suara') : 'Otomatis';
  }

  const currentVal = selectedVoiceURI || voiceSelect.value;
  voiceSelect.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Otomatis (Default id-ID)';
  voiceSelect.appendChild(defaultOpt);

  if (availableVoices.length === 0) return;

  const idVoices = [];
  const otherVoices = [];

  availableVoices.forEach(v => {
    const lang = (v.lang || '').toLowerCase();
    if (lang.startsWith('id') || lang.startsWith('in') || lang.includes('indonesia')) {
      idVoices.push(v);
    } else {
      otherVoices.push(v);
    }
  });

  if (idVoices.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Bahasa Indonesia';
    idVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI || v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      grp.appendChild(opt);
    });
    voiceSelect.appendChild(grp);
  }

  if (otherVoices.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Bahasa Lainnya';
    otherVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI || v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      grp.appendChild(opt);
    });
    voiceSelect.appendChild(grp);
  }

  if (currentVal) {
    voiceSelect.value = currentVal;
  }
}

function getSelectedVoice() {
  if (!selectedVoiceURI || availableVoices.length === 0) return null;
  return availableVoices.find(v => (v.voiceURI === selectedVoiceURI || v.name === selectedVoiceURI)) || null;
}

function onTtsVoiceChange(val) {
  selectedVoiceURI = val;
  try {
    localStorage.setItem('ksp_tts_voice_uri', val);
  } catch(e) {}
  const v = getSelectedVoice();
  if (v) {
    showToast('Suara: ' + v.name);
  } else {
    showToast('Suara: Otomatis');
  }
}

function configureUtterance(utterance) {
  const v = getSelectedVoice();
  if (v) {
    utterance.voice = v;
    utterance.lang = v.lang;
  } else {
    utterance.lang = 'id-ID';
  }
  utterance.rate = ttsSpeed;
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = populateVoiceList;
}

// --- SCREEN WAKE LOCK MANAGER ---
let ttsWakeLockEnabled = true;
try {
  const savedWakeLock = localStorage.getItem('ksp_tts_wakelock');
  if (savedWakeLock === '0' || savedWakeLock === 'false') {
    ttsWakeLockEnabled = false;
  }
} catch (e) {}

let wakeLockSentinel = null;

async function acquireScreenWakeLock() {
  if (!ttsWakeLockEnabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (wakeLockSentinel !== null) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
      updateTtsWakeLockBadge();
    });
    updateTtsWakeLockBadge();
  } catch (err) {
    console.warn('Screen Wake Lock request failed:', err.name, err.message);
  }
}

function releaseScreenWakeLock() {
  if (wakeLockSentinel !== null) {
    try {
      wakeLockSentinel.release();
    } catch (e) {}
    wakeLockSentinel = null;
    updateTtsWakeLockBadge();
  }
}

function setTtsWakeLock(enabled) {
  ttsWakeLockEnabled = !!enabled;
  try {
    localStorage.setItem('ksp_tts_wakelock', ttsWakeLockEnabled ? '1' : '0');
  } catch (e) {}
  updateTtsWakeLockBadge();
  if (ttsWakeLockEnabled && isSpeaking) {
    acquireScreenWakeLock();
  } else if (!ttsWakeLockEnabled) {
    releaseScreenWakeLock();
  }
  showToast(ttsWakeLockEnabled ? 'Cegah Layar Mati: Aktif (ON)' : 'Cegah Layar Mati: Nonaktif (OFF)');
}

function updateTtsWakeLockBadge() {
  const badge = document.getElementById('tts-wakelock-badge');
  const toggle = document.getElementById('tts-wakelock-toggle');
  const isSupported = typeof navigator !== 'undefined' && ('wakeLock' in navigator);
  if (toggle) {
    toggle.checked = ttsWakeLockEnabled && isSupported;
    if (!isSupported) toggle.disabled = true;
  }
  if (badge) {
    if (!isSupported) {
      badge.textContent = 'Tidak Didukung';
      badge.style.background = 'var(--border)';
      badge.style.color = 'var(--muted)';
    } else if (wakeLockSentinel !== null) {
      badge.textContent = 'Terjaga (ON) ☀️';
      badge.style.background = 'var(--accent-lt)';
      badge.style.color = 'var(--accent)';
    } else if (ttsWakeLockEnabled) {
      badge.textContent = 'Aktif (ON)';
      badge.style.background = 'var(--accent-lt)';
      badge.style.color = 'var(--accent)';
    } else {
      badge.textContent = 'Nonaktif (OFF)';
      badge.style.background = 'var(--border)';
      badge.style.color = 'var(--muted)';
    }
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && isSpeaking && ttsWakeLockEnabled) {
    await acquireScreenWakeLock();
  }
});

window.addEventListener('beforeunload', () => {
  releaseScreenWakeLock();
});

let currentSpeechRows = [];
let currentSpeechIndex = 0;
let speechDelayTimer = null;
let testSpeechTimeout = null;
let isSpeaking = false;
let activeSpeakTarget = null;
let activeTriggerBtn = null;

function clearRowHighlights() {
  document.querySelectorAll('.lv-row.tts-speaking').forEach(r => r.classList.remove('tts-speaking'));
}

function updateSpeakButtonUI(active) {
  const btn = document.getElementById('btn-speak-all');
  if (btn) {
    btn.classList.toggle('active', active);
    const icon = btn.querySelector('.btn-icon') || btn.firstElementChild;
    const lbl = btn.querySelector('.btn-lbl');
    if (active) {
      if (icon) icon.textContent = '⏹️';
      if (lbl) lbl.textContent = ' Berhenti';
      btn.title = 'Hentikan pembacaan suara (Tahan lama untuk pengaturan)';
    } else {
      if (icon) icon.textContent = '🔊';
      if (lbl) lbl.textContent = ' Baca Semua';
      btn.title = 'Bacakan semua nilai (Tahan lama untuk pengaturan)';
    }
  }
}

function stopSpeaking() {
  isSpeaking = false;
  releaseScreenWakeLock();
  if (speechDelayTimer) {
    clearTimeout(speechDelayTimer);
    speechDelayTimer = null;
  }
  if (testSpeechTimeout) {
    clearTimeout(testSpeechTimeout);
    testSpeechTimeout = null;
  }
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
  clearRowHighlights();
  currentSpeechRows = [];
  currentSpeechIndex = 0;
  activeSpeakTarget = null;
  updateSpeakButtonUI(false);
  if (activeTriggerBtn && activeTriggerBtn.id !== 'btn-speak-all') {
    activeTriggerBtn.textContent = '🔊';
    activeTriggerBtn.classList.remove('active');
  }
  activeTriggerBtn = null;
}

function ensureRowVisible(row) {
  if (!row) return;
  const curGroup = row.closest('.lv-group');
  if (curGroup && curGroup.classList.contains('collapsed')) {
    curGroup.classList.remove('collapsed');
  }
  const bookPage = row.closest('.book-page');
  if (bookPage && typeof goToBookPage === 'function') {
    const pages = Array.from(document.querySelectorAll('.book-page'));
    const pIdx = pages.indexOf(bookPage);
    if (pIdx !== -1 && typeof currentBookPage !== 'undefined' && pIdx !== currentBookPage) {
      goToBookPage(pIdx);
    }
  }
  const sheet = row.closest('.side-day-sheet');
  const spreadCont = document.getElementById('side-spread-container');
  if (sheet && spreadCont) {
    try {
      const sRect = sheet.getBoundingClientRect();
      const cRect = spreadCont.getBoundingClientRect();
      if (sRect.left < cRect.left + 10 || sRect.right > cRect.right - 10) {
        const targetLeft = sheet.offsetLeft - (spreadCont.clientWidth - sheet.offsetWidth) / 2;
        spreadCont.scrollTo({ left: Math.max(0, Math.round(targetLeft)), behavior: 'smooth' });
      }
    } catch(e) {}
  }
}

function scrollRowToCenter(row) {
  if (!row) return;
  ensureRowVisible(row);
  try {
    const rect = row.getBoundingClientRect();
    const header = document.querySelector('header');
    const headerHeight = header ? header.offsetHeight : 56;

    const navBar = document.getElementById('item-nav-bar');
    const isNavOpen = navBar && navBar.classList.contains('show');
    const bottomBarHeight = isNavOpen ? (navBar.offsetHeight + 20) : 0;
    const windowHeight = window.innerHeight || document.documentElement.clientHeight || 600;

    // Check if row is already in safe view between top headers and bottom controller bar
    const topSafe = headerHeight + 52;
    const bottomSafe = windowHeight - bottomBarHeight - 12;

    if (rect.top >= topSafe && rect.bottom <= bottomSafe) {
      // Row is already comfortably visible! Keep screen completely still (DIAM).
      return;
    }

    const rowHeight = rect.height || 40;
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const rowAbsoluteTop = currentScrollY + rect.top;
    const availableHeight = windowHeight - headerHeight - bottomBarHeight;

    const targetScrollY = rowAbsoluteTop - headerHeight - (availableHeight / 2) + (rowHeight / 2);

    window.scrollTo({
      top: Math.max(0, Math.round(targetScrollY)),
      behavior: 'smooth'
    });
  } catch (err) {
    try {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch (e) {}
  }
}

function getTextToSpeak(val) {
  if (roundingMode) return String(Math.round(val / 1000));
  if (ringkasMode) return String(Math.trunc(val / 1000));
  return String(Math.trunc(val / 1000));
}

function speakRowsSequence(rows, triggerBtn, targetKey, startIndex = 0) {
  if (!('speechSynthesis' in window)) {
    showToast('TTS tidak didukung browser ini');
    return;
  }

  stopSpeaking();

  currentSpeechRows = Array.from(rows || []).filter(r => !r.classList.contains('item-deleted'));
  if (currentSpeechRows.length === 0) {
    showToast('Tidak ada data transaksi untuk dibaca');
    return;
  }

  isSpeaking = true;
  activeSpeakTarget = targetKey;
  activeTriggerBtn = triggerBtn;

  acquireScreenWakeLock();

  const startIdx = Math.max(0, Math.min(startIndex, currentSpeechRows.length - 1));

  if (targetKey === 'all') {
    updateSpeakButtonUI(true);
    const wakeLockMsg = ttsWakeLockEnabled && typeof navigator !== 'undefined' && ('wakeLock' in navigator)
      ? ' (Layar tetap menyala ☀️)'
      : '';
    if (startIdx > 0) {
      showToast(`Membaca mulai item #${startIdx + 1} dari ${currentSpeechRows.length}${wakeLockMsg}`);
    } else {
      showToast(ttsWakeLockEnabled && typeof navigator !== 'undefined' && ('wakeLock' in navigator)
        ? 'Membaca semua transaksi (Layar tetap menyala ☀️)'
        : 'Membaca semua transaksi');
    }
  } else if (triggerBtn) {
    triggerBtn.textContent = '⏹️';
    triggerBtn.classList.add('active');
  }

  function speakCurrentItem() {
    if (!isSpeaking) return;

    if (currentSpeechIndex >= currentSpeechRows.length) {
      const count = currentSpeechRows.length;
      stopSpeaking();
      showToast('Selesai membaca ' + count + ' transaksi');
      return;
    }

    clearRowHighlights();
    const row = currentSpeechRows[currentSpeechIndex];
    if (!row) {
      currentSpeechIndex++;
      speakCurrentItem();
      return;
    }

    const curGroup = row.closest('.lv-group');
    if (curGroup && curGroup.classList.contains('collapsed')) {
      curGroup.classList.remove('collapsed');
    }

    row.classList.add('tts-speaking');
    row.classList.add('item-read');
    if (curGroup) {
      checkGroupCompletion(curGroup, false);
    }
    scrollRowToCenter(row);

    const val = parseFloat(row.dataset.val) || 0;
    const textToSpeak = getTextToSpeak(val);

    let utterance;
    try {
      utterance = new SpeechSynthesisUtterance(textToSpeak);
      configureUtterance(utterance);
    } catch (err) {
      stopSpeaking();
      showToast('Gagal memulai TTS: ' + err.message);
      return;
    }

    let itemHandled = false;
    function finishAndNext() {
      if (itemHandled) return;
      itemHandled = true;
      if (!isSpeaking) return;

      const finishedRow = currentSpeechRows[currentSpeechIndex];
      const prevGroup = finishedRow ? finishedRow.closest('.lv-group') : null;

      currentSpeechIndex++;
      if (currentSpeechIndex < currentSpeechRows.length) {
        const nextRow = currentSpeechRows[currentSpeechIndex];
        const nextGroup = nextRow ? nextRow.closest('.lv-group') : null;

        if (prevGroup && prevGroup !== nextGroup) {
          checkGroupCompletion(prevGroup, true);
        }

        speechDelayTimer = setTimeout(() => {
          speakCurrentItem();
        }, ttsDelay);
      } else {
        if (prevGroup) {
          checkGroupCompletion(prevGroup, true);
        }
        checkAllGroupsCompletion(true);
        const count = currentSpeechRows.length;
        stopSpeaking();
        showToast('Selesai membaca ' + count + ' transaksi');
      }
    }

    utterance.onend = () => {
      finishAndNext();
    };

    utterance.onerror = () => {
      finishAndNext();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      finishAndNext();
    }
  }

  currentSpeechIndex = startIdx;
  speakCurrentItem();
}

function speakValues(vals) {
  if (!vals || vals.length === 0) { showToast('Tidak ada nilai untuk dibaca'); return; }
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(vals.join(', '));
    configureUtterance(utter);
    window.speechSynthesis.speak(utter);
  } catch (e) { showToast('TTS tidak didukung browser ini'); }
}

function speakGroup(btn, event) {
  if (event) event.stopPropagation();
  const group = btn.closest('.lv-group');
  if (!group) return;
  if (group.classList.contains('collapsed')) {
    group.classList.remove('collapsed');
  }
  const rows = group.querySelectorAll('.lv-row');
  if (!rows || rows.length === 0) {
    showToast('Tidak ada transaksi di grup ini');
    return;
  }
  if (isSpeaking && activeSpeakTarget === group) {
    stopSpeaking();
    return;
  }
  const selectedRow = currentNavRow && group.contains(currentNavRow) ? currentNavRow : null;
  closeItemNavBar();

  let startIndex = 0;
  if (selectedRow) {
    const nonDeleted = Array.from(rows).filter(r => !r.classList.contains('item-deleted'));
    const idx = nonDeleted.indexOf(selectedRow);
    if (idx !== -1) startIndex = idx;
  }

  speakRowsSequence(rows, btn, group, startIndex);
}

function speakAll() {
  if (isSpeaking && activeSpeakTarget === 'all') {
    stopSpeaking();
    return;
  }

  const selectedRow = currentNavRow || document.querySelector('.lv-row.selected') || document.querySelector('.lv-row.tts-speaking');
  closeItemNavBar();

  const rows = getAllReportRows();
  if (!rows || rows.length === 0) {
    showToast('Tidak ada data transaksi untuk dibaca');
    return;
  }

  let startIndex = 0;
  if (selectedRow) {
    const nonDeleted = rows.filter(r => !r.classList.contains('item-deleted'));
    const idx = nonDeleted.indexOf(selectedRow);
    if (idx !== -1) {
      startIndex = idx;
    } else {
      const allIdx = rows.indexOf(selectedRow);
      if (allIdx !== -1) {
        for (let i = allIdx; i < rows.length; i++) {
          const nextIdx = nonDeleted.indexOf(rows[i]);
          if (nextIdx !== -1) {
            startIndex = nextIdx;
            break;
          }
        }
      }
    }
  }

  speakRowsSequence(rows, document.getElementById('btn-speak-all'), 'all', startIndex);
}

// --- TTS SETTINGS MODAL & CONTROLS ---
function openTtsSettingsModal() {
  stopSpeaking();
  closeItemNavBar();
  populateVoiceList();
  const modal = document.getElementById('tts-settings-modal');
  if (!modal) return;
  const speedSlider = document.getElementById('tts-speed-slider');
  const delaySlider = document.getElementById('tts-delay-slider');
  const speedVal = document.getElementById('tts-speed-val');
  const delayVal = document.getElementById('tts-delay-val');
  if (speedSlider) speedSlider.value = ttsSpeed;
  if (delaySlider) delaySlider.value = ttsDelay;
  if (speedVal) speedVal.textContent = ttsSpeed.toFixed(1) + 'x';
  if (delayVal) delayVal.textContent = ttsDelay + ' ms (' + (ttsDelay / 1000).toFixed(1) + 's)';

  const autoHideToggle = document.getElementById('auto-hide-toggle');
  if (autoHideToggle) autoHideToggle.checked = autoHideCompleted;
  updateAutoHideBadge();

  const sambungToggle = document.getElementById('sambung-multidate-toggle');
  if (sambungToggle) sambungToggle.checked = sambungMultiDate;
  updateSambungMultiDateBadge();

  updateTtsWakeLockBadge();
  updateRingkasModeBadge();
  updateRoundingModeBadge();
  updateStepperModeBadge();
  updateThemeModeBadge();
  updateStickyAppHeadersBadge();
  updateTextSizeUI();

  modal.classList.add('open');
  try { document.body.style.overflow = 'hidden'; } catch(e){}
}

function closeTtsSettingsModal() {
  if (testSpeechTimeout) {
    clearTimeout(testSpeechTimeout);
    testSpeechTimeout = null;
  }
  try { window.speechSynthesis.cancel(); } catch(e){}
  const modal = document.getElementById('tts-settings-modal');
  if (modal) modal.classList.remove('open');
  try { document.body.style.overflow = ''; } catch(e){}
}

function onModalOverlayClick(e) {
  if (e.target && e.target.id === 'tts-settings-modal') {
    closeTtsSettingsModal();
  }
}

function updateTtsSpeed(val) {
  ttsSpeed = parseFloat(val) || 0.9;
  const lbl = document.getElementById('tts-speed-val');
  if (lbl) lbl.textContent = ttsSpeed.toFixed(1) + 'x';
  try { localStorage.setItem('ksp_tts_speed', ttsSpeed); } catch(e){}
}

function updateTtsDelay(val) {
  ttsDelay = parseInt(val, 10) || 500;
  const lbl = document.getElementById('tts-delay-val');
  if (lbl) lbl.textContent = ttsDelay + ' ms (' + (ttsDelay / 1000).toFixed(1) + 's)';
  try { localStorage.setItem('ksp_tts_delay', ttsDelay); } catch(e){}
}

function testTtsSample() {
  if (!('speechSynthesis' in window)) {
    showToast('TTS tidak didukung browser ini');
    return;
  }
  stopSpeaking();
  const samples = ['100', '250', '500'];
  let idx = 0;
  showToast('Uji coba: speed ' + ttsSpeed.toFixed(1) + 'x, jeda ' + ttsDelay + 'ms');

  function nextSample() {
    if (idx >= samples.length) {
      showToast('Uji suara selesai');
      return;
    }
    const u = new SpeechSynthesisUtterance(samples[idx]);
    configureUtterance(u);
    u.onend = () => {
      idx++;
      if (idx < samples.length) {
        testSpeechTimeout = setTimeout(nextSample, ttsDelay);
      } else {
        showToast('Uji suara selesai');
      }
    };
    u.onerror = () => {
      idx++;
      if (idx < samples.length) {
        testSpeechTimeout = setTimeout(nextSample, ttsDelay);
      }
    };
    window.speechSynthesis.speak(u);
  }
  nextSample();
}

// --- ITEM NAVIGATION & BOTTOM CONTROLLER BAR ---
let currentNavRow = null;

function getAllReportRows() {
  const rawRows = Array.from(document.querySelectorAll('.lv-row'));
  if (!sambungMultiDate || rawRows.length <= 1) {
    return rawRows;
  }

  const groups = Array.from(document.querySelectorAll('.lv-group'));
  if (groups.length <= 1) {
    return rawRows;
  }

  // Determine base app key for each group
  // Order of app keys is determined by first appearance in report:
  // e.g.: tarik -> notif-com.bca -> notif-id.dana -> voucher
  const appKeysOrder = [];
  const groupsByAppKey = new Map();

  groups.forEach(group => {
    const rawId = group.dataset.groupId || '';
    let baseKey = group.dataset.appKey || rawId.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    if (!baseKey) {
      baseKey = group.querySelector('.lv-group-name')?.textContent?.trim() || 'group';
    }

    if (!groupsByAppKey.has(baseKey)) {
      groupsByAppKey.set(baseKey, []);
      appKeysOrder.push(baseKey);
    }
    groupsByAppKey.get(baseKey).push(group);
  });

  const sortedRows = [];
  appKeysOrder.forEach(appKey => {
    const appGroups = groupsByAppKey.get(appKey);
    appGroups.forEach(grp => {
      grp.querySelectorAll('.lv-row').forEach(r => sortedRows.push(r));
    });
  });

  return sortedRows.length === rawRows.length ? sortedRows : rawRows;
}

function selectAndSpeakRow(row) {
  if (!row) return;

  // Stop sequential speaking if active
  if (isSpeaking) {
    stopSpeaking();
  }

  const prevRow = currentNavRow;
  currentNavRow = row;
  const allRows = getAllReportRows();
  const index = allRows.indexOf(row);
  const total = allRows.length;

  // Auto-expand group of selected row
  const curGroup = row.closest('.lv-group');
  if (curGroup) {
    curGroup.classList.remove('collapsed');
  }

  // If navigating from another group, check if previous group is completed and collapse it
  if (prevRow && prevRow !== row) {
    const prevGroup = prevRow.closest('.lv-group');
    if (prevGroup && prevGroup !== curGroup) {
      checkGroupCompletion(prevGroup, true);
    }
  }

  clearRowHighlights();
  row.classList.add('tts-speaking');
  row.classList.add('item-read');
  if (curGroup) {
    checkGroupCompletion(curGroup, false);
  }
  scrollRowToCenter(row);

  updateNavBarUI(row, index, total);
  speakRowValue(row);
}

function updateNavBarUI(row, index, total) {
  const bar = document.getElementById('item-nav-bar');
  if (!bar) return;

  bar.classList.add('show');
  document.body.classList.add('has-nav-bar');

  const posBadge = document.getElementById('nav-pos-badge');
  const groupPill = document.getElementById('nav-group-pill');
  const timeEl = document.getElementById('nav-time');
  const amtVal = document.getElementById('nav-amt-val');
  const typeTag = document.getElementById('nav-type-tag');
  const readBadge = document.getElementById('nav-read-badge');
  const btnPrev = document.getElementById('nav-btn-prev');
  const btnNext = document.getElementById('nav-btn-next');

  if (posBadge) posBadge.textContent = `${index + 1} dari ${total}`;

  const isRead = row.classList.contains('item-read');
  if (readBadge) {
    readBadge.textContent = isRead ? '✓ Dibaca' : 'Belum Dibaca';
    readBadge.classList.toggle('unread', !isRead);
  }

  const group = row.closest('.lv-group');
  let groupName = 'Transaksi';
  let groupIcon = '📱';
  if (group) {
    const iconEl = group.querySelector('.lv-group-icon');
    const nameEl = group.querySelector('.lv-group-name');
    if (iconEl && iconEl.textContent) groupIcon = iconEl.textContent.trim();
    if (nameEl && nameEl.textContent) groupName = nameEl.textContent.trim();
  }
  if (row.dataset.provider) {
    groupName = `Voucher · ${row.dataset.provider}`;
  }

  let rowDate = row.dataset.date || '';
  if (!rowDate && group) {
    rowDate = group.dataset.date || '';
    if (!rowDate && group.dataset.groupId) {
      const match = group.dataset.groupId.match(/\d{4}-\d{2}-\d{2}/);
      if (match) rowDate = match[0];
    }
  }
  if (!rowDate) {
    const pageEl = row.closest('[data-date]');
    if (pageEl) rowDate = pageEl.dataset.date || '';
  }

  let dateSuffix = '';
  if (rowDate && typeof formatDisplayDate === 'function') {
    dateSuffix = ' · ' + formatDisplayDate(rowDate);
  }
  if (groupPill) groupPill.textContent = `${groupIcon} ${groupName}${dateSuffix}`;

  const timeTextEl = row.querySelector('.lv-time-text');
  const rowTime = timeTextEl ? timeTextEl.textContent.trim() : (row.querySelector('.lv-td-time')?.childNodes[0]?.textContent?.trim() || '');
  const rowDesc = row.dataset.desc || '';
  if (timeEl) {
    timeEl.textContent = rowDesc ? `${rowTime} (${rowDesc})` : rowTime;
    timeEl.title = rowDesc || rowTime;
  }

  const val = parseFloat(row.dataset.val) || 0;
  const isIncome = row.dataset.cat === 'income';
  const isDel = row.classList.contains('item-deleted');

  const isItemNew = row.classList.contains('item-new') || row.dataset.isNew === 'true';
  const origVal = parseFloat(row.dataset.orig) || 0;
  const isChangedVal = !isItemNew && (val !== origVal);
  const deltaVal = val - origVal;

  const statusBadge = document.getElementById('nav-meta-status');
  if (statusBadge) {
    if (isItemNew) {
      statusBadge.textContent = '🆕 Baru';
      statusBadge.className = 'nav-meta-status tag-item-new';
      statusBadge.style.display = 'inline-flex';
    } else if (isChangedVal) {
      statusBadge.textContent = '✎ Diubah';
      statusBadge.className = 'nav-meta-status tag-item-mod';
      statusBadge.style.display = 'inline-flex';
    } else {
      statusBadge.style.display = 'none';
    }
  }

  const amtSub = document.getElementById('nav-amt-sub');
  if (amtSub) {
    if (isChangedVal) {
      const deltaStr = (deltaVal > 0 ? '+' : '') + fmtAmt(deltaVal);
      amtSub.textContent = `Asli: ${fmtAmt(origVal)} (${deltaStr})`;
      amtSub.style.display = 'block';
    } else if (isItemNew) {
      amtSub.textContent = 'Item Tambahan Baru';
      amtSub.style.display = 'block';
    } else {
      amtSub.style.display = 'none';
    }
  }

  const btnDel = document.getElementById('nav-btn-del');
  if (btnDel) {
    btnDel.textContent = isDel ? '↩️' : '🗑️';
    btnDel.title = isDel ? 'Pulihkan transaksi ini (hitung kembali)' : 'Coret transaksi ini (abaikan dari total)';
    btnDel.classList.toggle('is-deleted', isDel);
  }

  if (amtVal) {
    amtVal.textContent = fmtAmt(val);
    amtVal.className = 'nav-amt-val ' + (isIncome ? 'c-in' : 'c-out') + (isDel ? ' deleted' : '');
  }

  if (typeTag) {
    if (isDel) {
      typeTag.textContent = 'Dicoret';
      typeTag.className = 'nav-type-tag c-del';
    } else {
      typeTag.textContent = isIncome ? 'Masuk' : 'Keluar';
      typeTag.className = 'nav-type-tag ' + (isIncome ? 'c-in' : 'c-out');
    }
  }

  if (btnPrev) btnPrev.disabled = (index <= 0);
  if (btnNext) btnNext.disabled = (index >= total - 1);
}

function toggleCurrentItemRead() {
  if (!currentNavRow) return;
  const isRead = currentNavRow.classList.toggle('item-read');
  if (typeof syncRowEditToReportData === 'function') {
    syncRowEditToReportData(currentNavRow, undefined, undefined, undefined, isRead);
  }
  const readBadge = document.getElementById('nav-read-badge');
  if (readBadge) {
    readBadge.textContent = isRead ? '✓ Dibaca' : 'Belum Dibaca';
    readBadge.classList.toggle('unread', !isRead);
  }
  const group = currentNavRow.closest('.lv-group');
  if (group) {
    checkGroupCompletion(group, false);
  }
  if (typeof saveReportEdits === 'function') saveReportEdits();
  showToast(isRead ? 'Ditandai sudah dibaca' : 'Ditandai belum dibaca');
}

function clearAllReadStatus() {
  document.querySelectorAll('.lv-row.item-read').forEach(r => {
    r.classList.remove('item-read');
    if (typeof syncRowEditToReportData === 'function') {
      syncRowEditToReportData(r, undefined, undefined, undefined, false);
    }
  });
  document.querySelectorAll('.lv-group').forEach(g => {
    g.classList.remove('all-read');
  });
  if (currentNavRow) {
    const allRows = getAllReportRows();
    updateNavBarUI(currentNavRow, allRows.indexOf(currentNavRow), allRows.length);
  }
  if (typeof saveReportEdits === 'function') saveReportEdits();
  showToast('Semua tanda baca di-reset');
}

function toggleCurrentItemDeleted() {
  if (!currentNavRow) return;
  const isDel = currentNavRow.classList.toggle('item-deleted');
  if (typeof syncRowEditToReportData === 'function') {
    syncRowEditToReportData(currentNavRow, undefined, undefined, isDel);
  }
  if (typeof recalcAll === 'function') recalcAll();
  if (typeof saveReportEdits === 'function') saveReportEdits();
  const group = currentNavRow.closest('.lv-group');
  if (group) {
    checkGroupCompletion(group, false);
  }
  const allRows = getAllReportRows();
  const index = allRows.indexOf(currentNavRow);
  updateNavBarUI(currentNavRow, index, allRows.length);
  showToast(isDel ? 'Transaksi dicoret (diabaikan dari total)' : 'Transaksi dipulihkan');
}

function renumberAllRows() {
  let totalTrx = 0;
  document.querySelectorAll('.lv-group').forEach(group => {
    let grpIdx = 1;
    let grpCount = 0;

    group.querySelectorAll('.lv-row').forEach(row => {
      grpCount++;
      totalTrx++;
      const idxCell = row.querySelector('.lv-td-idx');
      if (idxCell) {
        idxCell.textContent = grpIdx;
      }
      grpIdx++;
    });

    const metaCount = group.querySelector('.grp-meta-count');
    if (metaCount) metaCount.textContent = grpCount;
  });

  const elTrx = document.getElementById('sb-total-trx');
  if (elTrx) elTrx.textContent = totalTrx;
}

function calculateIncrementedTime(prevTimeStr) {
  if (prevTimeStr && typeof prevTimeStr === 'string') {
    const match = prevTimeStr.trim().match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      let hh = parseInt(match[1], 10);
      let mm = parseInt(match[2], 10);
      mm += 1;
      if (mm >= 60) {
        mm = 0;
        hh = (hh + 1) % 24;
      }
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function addNewItemBelowCurrent() {
  if (!currentNavRow) {
    const all = getAllReportRows();
    if (all.length > 0) currentNavRow = all[0];
    else return;
  }

  const group = currentNavRow.closest('.lv-group');
  if (!group) return;

  const isVoucher = group.dataset.groupId === 'voucher' || (group.dataset.groupId && group.dataset.groupId.startsWith('voucher'));
  const isOutcomeOnly = isVoucher || !!group.querySelector('.lv-th.l') || !!currentNavRow.querySelector('.lv-td-itemname');

  // 1. Ambil waktu dari baris aktif di atasnya lalu increment 1 menit
  const prevTime = currentNavRow.dataset.time ||
                   (currentNavRow.querySelector('.lv-time-text') ? currentNavRow.querySelector('.lv-time-text').textContent.trim() : '');
  const timeStr = calculateIncrementedTime(prevTime);

  // 2. Dapatkan tanggal baris yang konsisten
  const rowDate = currentNavRow.dataset.date || (group && group.dataset.date) ||
                  (window.REPORT_DATA && window.REPORT_DATA.dateDb && window.REPORT_DATA.dateDb.indexOf(' s/d ') === -1 ? window.REPORT_DATA.dateDb : '') ||
                  (window.REPORT_DATA && window.REPORT_DATA.startDate) || getTodayDbDate();

  // 3. ID Unik Baru
  const sId = window.ACTIVE_STORE_ID || (window.REPORT_DATA && window.REPORT_DATA.storeId) || (typeof currentStoreId !== 'undefined' ? currentStoreId : 'store');
  const newRowId = 'web_' + sId + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  const provider = currentNavRow.dataset.provider || '';
  const defaultDesc = isVoucher ? (provider ? `${provider} Baru` : 'Voucher Baru') : 'Transaksi Baru';
  const isIncome = !isOutcomeOnly && currentNavRow.dataset.cat === 'income';

  // 4. Render HTML dengan menyertakan isNew=true, dateVal, dan rowId
  let newRowHtml = '';
  if (isVoucher) {
    newRowHtml = renderVoucherRowHtml(0, timeStr, defaultDesc, 0, provider || 'VOUCHER', 0, false, false, true, 0, rowDate, newRowId);
  } else {
    newRowHtml = renderRowHtml(0, timeStr, 0, isIncome, defaultDesc, isOutcomeOnly, 0, false, false, true, 0, 0, rowDate, newRowId);
  }

  currentNavRow.insertAdjacentHTML('afterend', newRowHtml);
  const newRow = currentNavRow.nextElementSibling;
  if (!newRow) return;

  newRow.classList.add('item-new');
  newRow.dataset.isNew = 'true';
  newRow.dataset.rowId = newRowId;
  newRow.dataset.date = rowDate;
  newRow.dataset.time = timeStr;
  newRow.dataset.cat = isIncome ? 'income' : 'outcome';
  newRow.dataset.val = '0';
  newRow.dataset.orig = '0';
  newRow.dataset.desc = defaultDesc;
  if (isVoucher) newRow.dataset.provider = provider || 'VOUCHER';
  updateRowMarkTags(newRow);

  // 5. Sync item baru ke window.REPORT_DATA agar tetap muncul saat berganti mode tampilan layout
  if (window.REPORT_DATA) {
    const modType = (group.dataset.appKey || (group.dataset.groupId ? group.dataset.groupId.split('-')[0] : 'tarik')) || 'tarik';

    const newItemObj = {
      id: newRowId,
      rowId: newRowId,
      date: rowDate,
      time: timeStr,
      amount: 0,
      orig: 0,
      jumtar: 0,
      real: 0,
      cost: 0,
      fee: 0,
      adm: 0,
      name: defaultDesc,
      desc: defaultDesc,
      productName: isVoucher ? defaultDesc : undefined,
      provider: isVoucher ? (provider || 'VOUCHER') : undefined,
      type: isIncome ? 'income' : 'outcome',
      category: isIncome ? 'income' : 'outcome',
      app: currentNavRow.dataset.app || modType,
      appName: currentNavRow.dataset.appName || (modType === 'tarik' ? 'Tarik Tunai' : defaultDesc),
      isNew: true,
      isEdited: true,
      deleted: false,
      read: false
    };

    if (Array.isArray(window.REPORT_DATA[modType])) {
      const parentRowId = currentNavRow.dataset.rowId;
      const idx = window.REPORT_DATA[modType].findIndex(x => (x.rowId && x.rowId === parentRowId) || (x.id && x.id === parentRowId));
      if (idx !== -1) {
        window.REPORT_DATA[modType].splice(idx + 1, 0, newItemObj);
      } else {
        window.REPORT_DATA[modType].push(newItemObj);
      }
    }
  }

  renumberAllRows();
  recalcAll();
  selectAndSpeakRow(newRow);
  if (typeof saveReportEdits === 'function') saveReportEdits();

  // Auto trigger edit nominal for instant input
  const amtSpan = newRow.querySelector('.lv-amt');
  if (amtSpan) {
    setTimeout(() => editAmt(amtSpan), 100);
  }
  showToast(`Item baru (${timeStr}) disisipkan di bawah`);
}

function onNameClick(td, event) {
  if (event) event.stopPropagation();
  const tr = td.closest('tr');
  if (!tr) return;

  const bar = document.getElementById('item-nav-bar');
  const isBarOpen = bar && bar.classList.contains('show');

  // If this item is already active in controller bar, second click opens direct edit
  if (tr === currentNavRow && isBarOpen) {
    startEditItemName(td);
  } else {
    // First click selects item, opens controller bar, and reads value aloud (identical to onAmtClick)
    selectAndSpeakRow(tr);
  }
}

function editItemName(td, event) {
  if (event) {
    onNameClick(td, event);
    return;
  }
  startEditItemName(td);
}

function startEditItemName(td) {
  if (!td || td.querySelector('input')) return;
  const tr = td.closest('tr');
  const currentText = tr?.dataset.desc || td.textContent.trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-name-input';
  input.value = currentText === '—' ? '' : currentText;

  const finish = (save) => {
    if (input._done) return;
    input._done = true;
    let text = currentText;
    if (save && input.value.trim() !== '') {
      text = input.value.trim();
    }
    td.textContent = text;
    td.title = text;
    if (tr) {
      tr.dataset.desc = text;
      if (typeof syncRowEditToReportData === 'function') {
        syncRowEditToReportData(tr, undefined, text);
      }
      if (currentNavRow === tr) {
        const timeEl = document.getElementById('nav-time');
        const rowTime = tr.querySelector('.lv-td-time')?.textContent || '';
        if (timeEl) {
          timeEl.textContent = text ? `${rowTime} (${text})` : rowTime;
          timeEl.title = text || rowTime;
        }
      }
      if (typeof updateRowMarkTags === 'function') updateRowMarkTags(tr);
      if (typeof saveReportEdits === 'function') saveReportEdits();
    }
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });

  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();
}

// --- ITEM DETAIL DIALOG CONTROLLER (Minimal & Jelas) ---
function openItemDetailDialog(row) {
  if (!row) row = currentNavRow;
  if (!row) {
    const all = getAllReportRows();
    if (all.length > 0) row = all[0];
    else return;
  }
  if (row !== currentNavRow && typeof selectAndSpeakRow === 'function') {
    selectAndSpeakRow(row);
  }

  populateItemDetailDialog(row);

  const modal = document.getElementById('item-detail-modal');
  if (modal) modal.classList.add('open');

  if (window.history && window.history.pushState) {
    window.history.pushState({ kspModal: 'itemDetail' }, '', window.location.href);
  }
}

function closeItemDetailDialog() {
  const modal = document.getElementById('item-detail-modal');
  if (modal) modal.classList.remove('open');
}

function dtlNav(delta) {
  navigateItem(delta);
  if (currentNavRow) {
    populateItemDetailDialog(currentNavRow);
  }
}

function populateItemDetailDialog(row) {
  if (!row) return;

  const allRows = getAllReportRows();
  const idx = allRows.indexOf(row);
  const total = allRows.length;

  const btnPrev = document.getElementById('dtl-btn-prev');
  if (btnPrev) btnPrev.disabled = (idx <= 0);
  const btnNext = document.getElementById('dtl-btn-next');
  if (btnNext) btnNext.disabled = (idx >= total - 1);

  const badgeIdx = document.getElementById('dtl-badge-idx');
  if (badgeIdx) badgeIdx.textContent = `${idx + 1} / ${total}`;

  const val = parseFloat(row.dataset.val) || 0;
  const orig = parseFloat(row.dataset.orig) || 0;
  const isIncome = row.dataset.cat === 'income';
  const isDel = row.classList.contains('item-deleted');
  const isRead = row.classList.contains('item-read');
  const isNew = row.classList.contains('item-new') || row.dataset.isNew === 'true';
  const isChanged = !isNew && (val !== orig);
  const delta = val - orig;

  const timeText = row.querySelector('.lv-time-text')?.textContent.trim() || row.querySelector('.lv-td-time')?.childNodes[0]?.textContent.trim() || '00:00';
  const desc = row.dataset.desc || row.querySelector('.lv-td-itemname')?.textContent.trim() || '—';

  const group = row.closest('.lv-group');
  const groupIcon = group?.querySelector('.lv-group-icon')?.textContent || '📱';
  const groupName = group?.querySelector('.lv-group-name')?.textContent || 'Transaksi';

  let rowDate = '';
  const dateSection = row.closest('.date-section-block, [data-date]');
  if (dateSection) rowDate = dateSection.dataset.date || '';
  if (!rowDate) {
    const pageEl = row.closest('[data-date]');
    if (pageEl) rowDate = pageEl.dataset.date || '';
  }
  const dateText = rowDate && typeof formatDisplayDate === 'function' ? formatDisplayDate(rowDate) : '';

  const color = isDel ? 'var(--muted)' : (isIncome ? 'var(--income)' : 'var(--outcome)');
  const typeLabel = isDel ? 'Dicoret (Ditiadakan)' : (isIncome ? 'Masuk (Income)' : 'Keluar (Outcome)');
  const readLabel = isRead ? '✓ Sudah Dibaca' : 'Belum Dibaca';
  const readColor = isRead ? '#10b981' : 'var(--muted)';

  let subHtml = '';
  if (isNew) {
    subHtml = '<div style="font-size:0.75rem;color:var(--accent);font-weight:700;margin-top:2px;">🆕 Item Tambahan Baru</div>';
  } else if (isChanged) {
    const deltaStr = (delta > 0 ? '+' : '') + formatRupiah(delta);
    subHtml = `<div style="font-size:0.75rem;color:var(--accent);font-weight:600;margin-top:2px;">Asli: Rp ${formatRupiah(orig)} (${deltaStr})</div>`;
  }

  const content = document.getElementById('dtl-modal-content');
  if (content) {
    content.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center;">
        <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">Nominal Transaksi</div>
        <div style="font-size:1.75rem;font-weight:800;color:${color};font-variant-numeric:tabular-nums;line-height:1.2;margin:4px 0;${isDel ? 'text-decoration:line-through;opacity:0.6;' : ''}">
          ${fmtAmt(val)}
        </div>
        ${subHtml}
      </div>
      <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="color:var(--muted);padding:7px 0;width:95px;">Aplikasi</td><td style="font-weight:700;text-align:right;color:var(--text);">${groupIcon} ${escapeHtml(groupName)}</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="color:var(--muted);padding:7px 0;">Waktu</td><td style="font-weight:700;text-align:right;color:var(--text);font-variant-numeric:tabular-nums;">${escapeHtml(timeText)}</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="color:var(--muted);padding:7px 0;">Keterangan</td><td style="font-weight:700;text-align:right;color:var(--text);word-break:break-word;">${escapeHtml(desc)}</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="color:var(--muted);padding:7px 0;">Tipe</td><td style="font-weight:800;text-align:right;color:${color};">${typeLabel}</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="color:var(--muted);padding:7px 0;">Status</td><td style="font-weight:700;text-align:right;color:${readColor};">${readLabel}</td></tr>
          ${dateText ? `<tr style="border-bottom:1px solid var(--border);"><td style="color:var(--muted);padding:7px 0;">Tanggal</td><td style="font-weight:700;text-align:right;color:var(--text);">${escapeHtml(dateText)}</td></tr>` : ''}
          <tr><td style="color:var(--muted);padding:7px 0;">Urutan</td><td style="font-weight:700;text-align:right;color:var(--text);">Item #${idx + 1} dari ${total}</td></tr>
        </tbody>
      </table>
    `;
  }
}

function navEditName() {
  openItemDetailDialog(currentNavRow);
}

// --- APP MARGIN SUMMARY DIALOG (Minimal & Jelas) ---
function openAppMarginDialog(el, event) {
  if (event) {
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }
  const group = el ? el.closest('.lv-group') : null;
  if (!group) return;

  const icon = group.querySelector('.lv-group-icon')?.textContent?.trim() || '📱';
  const nameEl = group.querySelector('.lv-group-name');
  let name = '';
  if (nameEl) {
    const clone = nameEl.cloneNode(true);
    clone.querySelectorAll('.lv-group-date-badge').forEach(b => b.remove());
    name = clone.textContent.trim();
  }
  if (!name) name = 'Transaksi';

  const metrics = calcGroupMetrics(group);
  if (!metrics) return;

  const titleEl = document.getElementById('app-margin-title');
  if (titleEl) titleEl.textContent = `${icon} ${name}`;

  const badgeEl = document.getElementById('app-margin-badge');
  if (badgeEl) badgeEl.textContent = `${metrics.count} Trx`;

  populateAppMarginContent(metrics, name);

  const modal = document.getElementById('app-margin-modal');
  if (modal) modal.classList.add('open');

  if (window.history && window.history.pushState) {
    window.history.pushState({ kspModal: 'appMargin' }, '', window.location.href);
  }
}

function closeAppMarginDialog() {
  const modal = document.getElementById('app-margin-modal');
  if (modal) modal.classList.remove('open');
}

function calcGroupMetrics(group) {
  if (!group) return null;
  const rows = Array.from(group.querySelectorAll('.lv-row')).filter(r => !r.classList.contains('item-deleted'));
  let totalJual = 0;
  let totalModal = 0;
  let totalMargin = 0;
  let hasItemCostOrReal = false;
  let grpMasuk = 0;
  let grpKeluar = 0;

  rows.forEach(r => {
    const val = parseFloat(r.dataset.val) || 0;
    const cat = r.dataset.cat;
    if (cat === 'income') grpMasuk += val;
    else grpKeluar += val;

    const cost = parseFloat(r.dataset.cost);
    const real = parseFloat(r.dataset.real);
    const fee = parseFloat(r.dataset.fee);
    const adm = parseFloat(r.dataset.adm);

    if (!isNaN(cost) && cost > 0) {
      hasItemCostOrReal = true;
      totalJual += val;
      totalModal += cost;
      totalMargin += (val - cost);
    } else if (!isNaN(real) && real > 0) {
      hasItemCostOrReal = true;
      if (cat === 'income') {
        totalJual += real;
        totalModal += val;
        totalMargin += (real - val);
      } else {
        totalJual += val;
        totalModal += real;
        totalMargin += (val - real);
      }
    } else if (!isNaN(fee) && fee > 0) {
      hasItemCostOrReal = true;
      if (cat === 'income') {
        totalJual += (val + fee);
        totalModal += val;
        totalMargin += fee;
      } else {
        totalJual += val;
        totalModal += Math.max(0, val - fee);
        totalMargin += fee;
      }
    } else if (!isNaN(adm) && adm > 0) {
      hasItemCostOrReal = true;
      if (cat === 'income') {
        totalJual += (val + adm);
        totalModal += val;
        totalMargin += adm;
      } else {
        totalJual += val;
        totalModal += Math.max(0, val - adm);
        totalMargin += adm;
      }
    } else {
      totalJual += val;
      totalModal += val;
    }
  });

  if (!hasItemCostOrReal) {
    if (grpMasuk > 0 && grpKeluar > 0) {
      if (grpMasuk >= grpKeluar) {
        totalJual = grpMasuk;
        totalModal = grpKeluar;
        totalMargin = grpMasuk - grpKeluar;
      } else {
        totalJual = grpKeluar;
        totalModal = grpMasuk;
        totalMargin = grpKeluar - grpMasuk;
      }
    } else if (grpMasuk > 0) {
      totalJual = grpMasuk;
      totalModal = 0;
      totalMargin = grpMasuk;
    } else {
      totalJual = grpKeluar;
      totalModal = grpKeluar;
      totalMargin = 0;
    }
  }

  const pct = totalModal > 0 ? Math.round((totalMargin / totalModal) * 100) : (totalJual > 0 && totalMargin > 0 ? 100 : 0);
  return {
    count: rows.length,
    jual: totalJual,
    modal: totalModal,
    margin: totalMargin,
    pct: pct,
    grpMasuk: grpMasuk,
    grpKeluar: grpKeluar
  };
}

function populateAppMarginContent(metrics, name) {
  const content = document.getElementById('app-margin-content');
  if (!content) return;

  const isPos = metrics.margin > 0;
  const isNeg = metrics.margin < 0;
  const marginColor = isPos ? 'var(--income)' : (isNeg ? 'var(--outcome)' : 'var(--muted)');
  const marginSign = isPos ? '+' : (isNeg ? '-' : '');
  const marginText = `${marginSign}Rp ${formatRupiah(Math.abs(metrics.margin))}`;
  const pctText = metrics.pct !== 0 ? `${(metrics.pct > 0 ? '+' : '')}${metrics.pct}% dari modal` : '0% keuntungan';

  content.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center;">
      <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">Margin Keuntungan</div>
      <div style="font-size:1.75rem;font-weight:800;color:${marginColor};font-variant-numeric:tabular-nums;line-height:1.2;margin:4px 0;">
        ${marginText}
      </div>
      <div style="font-size:0.75rem;font-weight:700;color:${marginColor};">
        ${pctText}
      </div>
    </div>
    <table style="width:100%;font-size:0.82rem;border-collapse:collapse;margin-top:4px;">
      <tbody>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="color:var(--muted);padding:8px 0;width:120px;">Total Penjualan</td>
          <td style="font-weight:800;text-align:right;color:var(--text);font-variant-numeric:tabular-nums;">
            Rp ${formatRupiah(metrics.jual)}
            ${ringkasMode ? `<span style="font-size:0.7rem;color:var(--muted);font-weight:600;display:block;">(Ringkas: ${fmtAmt(metrics.jual)})</span>` : ''}
          </td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="color:var(--muted);padding:8px 0;">Total Modal</td>
          <td style="font-weight:800;text-align:right;color:var(--text);font-variant-numeric:tabular-nums;">
            Rp ${formatRupiah(metrics.modal)}
            ${ringkasMode ? `<span style="font-size:0.7rem;color:var(--muted);font-weight:600;display:block;">(Ringkas: ${fmtAmt(metrics.modal)})</span>` : ''}
          </td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="color:var(--muted);padding:8px 0;">Margin Keuntungan</td>
          <td style="font-weight:800;text-align:right;color:${marginColor};font-variant-numeric:tabular-nums;">
            ${marginText}
            ${ringkasMode ? `<span style="font-size:0.7rem;color:${marginColor};font-weight:600;display:block;">(Ringkas: ${(isPos ? '+' : (isNeg ? '-' : '')) + fmtAmt(Math.abs(metrics.margin))})</span>` : ''}
          </td>
        </tr>
        <tr>
          <td style="color:var(--muted);padding:8px 0;">Total Transaksi</td>
          <td style="font-weight:700;text-align:right;color:var(--text);">${metrics.count} transaksi</td>
        </tr>
      </tbody>
    </table>
  `;
}

function speakRowValue(row) {
  if (!row) return;
  if (row.classList.contains('item-deleted')) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('Dicoret');
      configureUtterance(utter);
      window.speechSynthesis.speak(utter);
    } catch (e) {}
    return;
  }
  const val = parseFloat(row.dataset.val) || 0;
  const textToSpeak = getTextToSpeak(val);

  if (!('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(textToSpeak);
    configureUtterance(utter);
    window.speechSynthesis.speak(utter);
  } catch (e) {}
}

function speakCurrentNavigatedItem() {
  if (currentNavRow) {
    speakRowValue(currentNavRow);
  }
}

function navigateItem(delta) {
  const allRows = getAllReportRows();
  if (allRows.length === 0) return;

  let index = currentNavRow ? allRows.indexOf(currentNavRow) : -1;
  if (index === -1) {
    index = delta > 0 ? 0 : allRows.length - 1;
  } else {
    index += delta;
  }

  if (index < 0) index = 0;
  if (index >= allRows.length) index = allRows.length - 1;

  selectAndSpeakRow(allRows[index]);
}

function closeItemNavBar() {
  const bar = document.getElementById('item-nav-bar');
  if (bar) bar.classList.remove('show');
  document.body.classList.remove('has-nav-bar');
  clearRowHighlights();
  currentNavRow = null;
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
  checkAllGroupsCompletion(true);
}

function navAdjustAmt(step, event) {
  if (event && event.shiftKey) step *= 5;
  if (!currentNavRow) return;

  let val = parseFloat(currentNavRow.dataset.val) || 0;
  const orig = parseFloat(currentNavRow.dataset.orig) || 0;
  val = Math.max(0, val + step);
  currentNavRow.dataset.val = val;
  if (typeof syncRowEditToReportData === 'function') syncRowEditToReportData(currentNavRow, val);

  const amtEl = currentNavRow.querySelector('.lv-amt');
  if (amtEl) {
    amtEl.textContent = fmtAmt(val);
    if (val !== orig) {
      amtEl.classList.add('changed');
      const delta = val - orig;
      amtEl.title = 'Asli: Rp ' + formatRupiah(orig) + ' (' + (delta > 0 ? '+' : '') + formatRupiah(delta) + ')';
    } else {
      amtEl.classList.remove('changed');
      amtEl.title = 'Klik untuk ubah langsung';
    }
  }

  const navAmt = document.getElementById('nav-amt-val');
  if (navAmt) navAmt.textContent = fmtAmt(val);

  updateRowMarkTags(currentNavRow);
  recalcAll();
  if (typeof saveReportEdits === 'function') saveReportEdits();
}

function navEditAmt() {
  if (!currentNavRow) return;
  const amtSpan = currentNavRow.querySelector('.lv-amt');
  if (amtSpan) {
    editAmt(amtSpan);
  }
}

function onAmtClick(span, event) {
  if (event) event.stopPropagation();
  const tr = span.closest('tr');
  if (!tr) return;

  const bar = document.getElementById('item-nav-bar');
  const isBarOpen = bar && bar.classList.contains('show');

  // If this item is already active in controller bar, second click opens direct edit
  if (tr === currentNavRow && isBarOpen) {
    editAmt(span);
  } else {
    // First click selects item, opens controller bar, and reads value aloud
    selectAndSpeakRow(tr);
  }
}

function upgradeGroupToDualColumns(group, targetRow, newCat) {
  if (!group) return;

  const thead = group.querySelector('.lv-thead');
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th class="lv-th c" style="width:36px;">#</th>
        <th class="lv-th c" style="width:65px;">Waktu</th>
        <th class="lv-th r">Keluar</th>
        <th class="lv-th r">Masuk</th>
      </tr>`;
  }

  group.querySelectorAll('.lv-row').forEach(r => {
    const idxText = r.querySelector('.lv-td-idx')?.textContent || '1';
    const timeTd = r.querySelector('.lv-td-time');
    const timeInnerHtml = timeTd ? timeTd.innerHTML : '00:00';
    const timeTitle = timeTd ? (timeTd.getAttribute('title') || '') : '';

    const isTarget = (r === targetRow);
    const cat = isTarget ? newCat : (r.dataset.cat || 'outcome');
    r.dataset.cat = cat;

    const val = parseFloat(r.dataset.val) || 0;
    const orig = parseFloat(r.dataset.orig) || 0;
    const isChanged = (val !== orig);
    const delta = val - orig;
    const changedClass = isChanged ? ' changed' : '';
    const titleAttr = isChanged
      ? `Asli: Rp ${formatRupiah(orig)} (${delta > 0 ? '+' : ''}${formatRupiah(delta)})`
      : 'Klik untuk dengar / ubah';

    const ctrlHtml = `
      <div class="amt-ctrl">
        <button class="step-btn dec" onclick="adjustAmt(this, -1000, event)" title="Kurang 1.000 (Shift: 5.000)">−</button>
        <span class="lv-amt ${cat}${changedClass}" onclick="onAmtClick(this, event)" title="${titleAttr}">${fmtAmt(val)}</span>
        <button class="step-btn inc" onclick="adjustAmt(this, 1000, event)" title="Tambah 1.000 (Shift: 5.000)">+</button>
      </div>`;

    const inCell = (cat === 'income')
      ? `<td class="lv-td lv-td-in">${ctrlHtml}</td>`
      : `<td class="lv-td lv-td-in"><span class="lv-empty-cell">—</span></td>`;

    const outCell = (cat === 'outcome')
      ? `<td class="lv-td lv-td-out">${ctrlHtml}</td>`
      : `<td class="lv-td lv-td-out"><span class="lv-empty-cell">—</span></td>`;

    r.innerHTML = `
      <td class="lv-td lv-td-idx">${idxText}</td>
      <td class="lv-td lv-td-time" title="${escapeHtml(timeTitle)}">${timeInnerHtml}</td>
      ${outCell}
      ${inCell}
    `;
  });

  const metaContainer = group.querySelector('.lv-group-meta');
  if (metaContainer) {
    metaContainer.innerHTML = `
      <span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" title="Klik untuk salin Keluar" style="color:var(--outcome)">Rp 0</span> / 
      <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" title="Klik untuk salin Masuk" style="color:var(--income)">Rp 0</span>
    `;
  }
}

function toggleRowCategory(row) {
  if (!row) return;

  const curCat = row.dataset.cat || 'outcome';
  const newCat = (curCat === 'income') ? 'outcome' : 'income';
  row.dataset.cat = newCat;

  const inTd = row.querySelector('.lv-td-in');
  const outTd = row.querySelector('.lv-td-out');

  if (!inTd || !outTd) {
    const group = row.closest('.lv-group');
    upgradeGroupToDualColumns(group, row, newCat);
  } else {
    const val = parseFloat(row.dataset.val) || 0;
    const orig = parseFloat(row.dataset.orig) || 0;
    const isChanged = (val !== orig);
    const delta = val - orig;
    const changedClass = isChanged ? ' changed' : '';
    const titleAttr = isChanged
      ? `Asli: Rp ${formatRupiah(orig)} (${delta > 0 ? '+' : ''}${formatRupiah(delta)})`
      : 'Klik untuk dengar / ubah';

    const ctrlHtml = `
      <div class="amt-ctrl">
        <button class="step-btn dec" onclick="adjustAmt(this, -1000, event)" title="Kurang 1.000 (Shift: 5.000)">−</button>
        <span class="lv-amt ${newCat}${changedClass}" onclick="onAmtClick(this, event)" title="${titleAttr}">${fmtAmt(val)}</span>
        <button class="step-btn inc" onclick="adjustAmt(this, 1000, event)" title="Tambah 1.000 (Shift: 5.000)">+</button>
      </div>`;

    if (newCat === 'income') {
      inTd.innerHTML = ctrlHtml;
      outTd.innerHTML = '<span class="lv-empty-cell">—</span>';
    } else {
      inTd.innerHTML = '<span class="lv-empty-cell">—</span>';
      outTd.innerHTML = ctrlHtml;
    }
  }

  // Animation & Haptic Feedback
  row.classList.remove('switched-income', 'switched-outcome');
  void row.offsetWidth; // trigger reflow
  row.classList.add(newCat === 'income' ? 'switched-income' : 'switched-outcome');
  setTimeout(() => {
    row.classList.remove('switched-income', 'switched-outcome');
  }, 600);

  if (navigator.vibrate) {
    try { navigator.vibrate([40, 30, 40]); } catch(e){}
  }

  // Sync Bottom Nav Controller Bar if active for this row
  if (currentNavRow === row) {
    const isDel = row.classList.contains('item-deleted');
    const typeTag = document.getElementById('nav-type-tag');
    if (typeTag) {
      if (isDel) {
        typeTag.textContent = 'Dicoret';
        typeTag.className = 'nav-type-tag c-del';
      } else {
        typeTag.textContent = (newCat === 'income') ? 'Masuk' : 'Keluar';
        typeTag.className = 'nav-type-tag ' + (newCat === 'income' ? 'c-in' : 'c-out');
      }
    }
    const amtVal = document.getElementById('nav-amt-val');
    if (amtVal) {
      amtVal.className = 'nav-amt-val ' + (newCat === 'income' ? 'c-in' : 'c-out') + (isDel ? ' deleted' : '');
    }
  }

  // Recalculate totals
  recalcAll();

  // Toast
  showToast(newCat === 'income' ? '🟢 Tipe dipindahkan ke: MASUK' : '🔴 Tipe dipindahkan ke: KELUAR');
}

function toggleCurrentItemCategory() {
  if (!currentNavRow) return;
  toggleRowCategory(currentNavRow);
}

function initRowClickNavigation() {
  const container = document.getElementById('groups-container');
  if (!container) return;

  // Prevent default context menu on transaction rows (e.g. accidental long tap on mobile)
  container.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.lv-row')) {
      e.preventDefault();
    }
  });

  container.addEventListener('click', (e) => {
    // Ignore steppers, active inputs, and group header actions
    if (e.target.closest('.step-btn')) return;
    if (e.target.closest('.edit-input')) return;
    if (e.target.closest('.edit-name-input')) return;
    if (e.target.closest('.lv-group-hd')) return;
    if (e.target.closest('.lv-amt')) return;
    if (e.target.closest('.lv-td-itemname')) return;

    const row = e.target.closest('.lv-row');
    if (!row) return;

    selectAndSpeakRow(row);
  });
}

function initTtsControls() {
  const btnSpeakAll = document.getElementById('btn-speak-all');
  if (btnSpeakAll) {
    let pressTimer = null;
    let isLongPress = false;
    let startX = 0;
    let startY = 0;

    // Touch handlers (Mobile)
    btnSpeakAll.addEventListener('touchstart', (e) => {
      isLongPress = false;
      if (e.touches && e.touches.length > 0) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
      pressTimer = setTimeout(() => {
        isLongPress = true;
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch(err) {}
        }
        openTtsSettingsModal();
        setTimeout(() => { isLongPress = false; }, 400);
      }, 500);
    }, { passive: true });

    btnSpeakAll.addEventListener('touchmove', (e) => {
      if (pressTimer && e.touches && e.touches.length > 0) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 10 || dy > 10) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }
    }, { passive: true });

    btnSpeakAll.addEventListener('touchend', (e) => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (isLongPress) {
        e.preventDefault();
      }
    });

    btnSpeakAll.addEventListener('touchcancel', () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });

    // Mouse handlers (Desktop)
    btnSpeakAll.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;
          openTtsSettingsModal();
          setTimeout(() => { isLongPress = false; }, 400);
        }, 500);
      }
    });

    btnSpeakAll.addEventListener('mouseup', () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });

    btnSpeakAll.addEventListener('mouseleave', () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });

    btnSpeakAll.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTtsSettingsModal();
    });

    // Short Click: Toggle speak all / stop
    btnSpeakAll.addEventListener('click', (e) => {
      if (isLongPress) {
        e.preventDefault();
        e.stopPropagation();
        isLongPress = false;
        return;
      }
      speakAll();
    });
  }

  // Row click & keyboard navigation initialization
  initRowClickNavigation();

  // Keyboard navigation & global escape key
  document.addEventListener('keydown', (e) => {
    const marginModal = document.getElementById('app-margin-modal');
    if (marginModal && marginModal.classList.contains('open')) {
      if (e.key === 'Escape') {
        closeAppMarginDialog();
        return;
      }
    }

    const dtlModal = document.getElementById('item-detail-modal');
    if (dtlModal && dtlModal.classList.contains('open')) {
      if (e.key === 'Escape') {
        closeItemDetailDialog();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        dtlNav(-1);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        dtlNav(1);
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        speakCurrentNavigatedItem();
        return;
      }
      return;
    }

    const ttsModal = document.getElementById('tts-settings-modal');
    if (ttsModal && ttsModal.classList.contains('open')) {
      if (e.key === 'Escape') closeTtsSettingsModal();
      return;
    }

    const bar = document.getElementById('item-nav-bar');
    if (bar && bar.classList.contains('show')) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateItem(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateItem(1);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        speakCurrentNavigatedItem();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        toggleCurrentItemDeleted();
      } else if (e.key === 'Insert') {
        e.preventDefault();
        addNewItemBelowCurrent();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleCurrentItemCategory();
      } else if (e.key === 'Escape') {
        closeItemNavBar();
      }
    }
  });

  // Delegated capture listener for clicking app name in group headers
  document.addEventListener('click', (e) => {
    const nameEl = e.target.closest('.lv-group-name');
    if (nameEl) {
      e.stopPropagation();
      openAppMarginDialog(nameEl, e);
    }
  }, true);

  updateTtsWakeLockBadge();
}

function updateThemeModeBadge() {
  const isDark = (document.documentElement && document.documentElement.getAttribute) ? document.documentElement.getAttribute('data-theme') === 'dark' : false;
  const badge = document.getElementById('theme-mode-badge');
  const toggle = document.getElementById('theme-mode-toggle');
  if (toggle) toggle.checked = isDark;
  if (badge) {
    badge.textContent = isDark ? 'Gelap (Dark)' : 'Terang (Light)';
    badge.style.background = isDark ? 'var(--accent-lt)' : 'var(--border)';
    badge.style.color = isDark ? 'var(--accent)' : 'var(--muted)';
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const cur = html.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  if (document.body) {
    document.body.classList.toggle('light-theme', next === 'light');
  }
  try {
    localStorage.setItem('ksp_theme', next);
    localStorage.setItem('kspcheck_theme', next);
  } catch(e){}
  updateThemeModeBadge();
}
try {
  const saved = localStorage.getItem('kspcheck_theme') || localStorage.getItem('ksp_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    if (document.body) {
      document.body.classList.toggle('light-theme', saved === 'light');
    }
  }
  updateThemeModeBadge();
} catch(e){}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getAppIcon(appPackage) {
  if (!appPackage) return '📱';
  const p = appPackage.toLowerCase();
  if (p.includes('okaxls') || p.includes('excel')) return '📊';
  if (p.includes('gopay') || p.includes('gojek')) return '🟢';
  if (p.includes('dana')) return '🔵';
  if (p.includes('ovo')) return '🟣';
  if (p.includes('shopee') || p.includes('spay')) return '🟠';
  if (p.includes('bca') || p.includes('bri') || p.includes('mandiri') || p.includes('livin') || p.includes('bni')) return '🏦';
  if (p.includes('linkaja')) return '🔴';
  if (p.includes('manual')) return '📝';
  return '📱';
}

function renderRowHtml(idx, time, amount, isIncome, desc, isOutcomeOnly, origAmount, isDeleted, isRead, isNew, realVal, feeVal, dateVal, rowId) {
  const cat = isIncome ? 'income' : 'outcome';
  const descAttr = desc ? ` data-desc="${escapeHtml(desc)}"` : '';
  const timeTitle = desc ? `${escapeHtml(time)} · ${escapeHtml(desc)}` : escapeHtml(time);
  const orig = (origAmount !== undefined && origAmount !== null) ? origAmount : amount;
  const isItemNew = (isNew === true || isNew === 'true');
  const isChanged = !isItemNew && (amount !== orig);
  const delta = amount - orig;
  const changedClass = isChanged ? ' changed' : '';
  const titleAttr = isChanged
    ? `Asli: Rp ${formatRupiah(orig)} (${delta > 0 ? '+' : ''}${formatRupiah(delta)})`
    : (isItemNew ? 'Item baru ditambahkan' : 'Klik untuk dengar / ubah');
  const rowExtraClass = (isDeleted ? ' item-deleted' : '') + (isRead ? ' item-read' : '') + (isItemNew ? ' item-new' : (isChanged ? ' item-modified' : ''));
  const newAttr = isItemNew ? ' data-is-new="true"' : '';
  const realAttr = (realVal !== undefined && realVal !== null && realVal > 0) ? ` data-real="${realVal}"` : '';
  const feeAttr = (feeVal !== undefined && feeVal !== null && feeVal > 0) ? ` data-fee="${feeVal}"` : '';
  const dateAttr = dateVal ? ` data-date="${escapeHtml(dateVal)}"` : '';
  const rowIdAttr = rowId ? ` data-row-id="${escapeHtml(rowId)}"` : '';

  let statusTagHtml = '';
  if (isItemNew) {
    statusTagHtml = '<span class="tag-item-status tag-item-new">Baru</span>';
  } else if (isChanged) {
    const deltaStr = (delta > 0 ? '+' : '') + formatRupiah(delta);
    statusTagHtml = `<span class="tag-item-status tag-item-mod" title="Asli: Rp ${formatRupiah(orig)} (${deltaStr})">Diubah</span>`;
  }

  const outCell = !isIncome
    ? `<td class="lv-td lv-td-out">
         <div class="amt-ctrl">
           <button class="step-btn dec" onclick="adjustAmt(this, -1000, event)" title="Kurang 1.000 (Shift: 5.000)">−</button>
           <span class="lv-amt outcome" onclick="onAmtClick(this, event)" title="Klik untuk dengar / ubah">${fmtAmt(amount)}</span>
           <button class="step-btn inc" onclick="adjustAmt(this, 1000, event)" title="Tambah 1.000 (Shift: 5.000)">+</button>
         </div>
       </td>`
    : `<td class="lv-td lv-td-out"><span class="lv-empty-cell">—</span></td>`;

  if (isOutcomeOnly) {
    return `
      <tr class="lv-row${rowExtraClass}" data-cat="${cat}" data-orig="${orig}" data-val="${amount}"${descAttr}${newAttr}${realAttr}${feeAttr}${dateAttr}${rowIdAttr}>
        <td class="lv-td lv-td-idx">${idx}</td>
        <td class="lv-td lv-td-time" title="${timeTitle}"><span class="lv-time-text">${escapeHtml(time)}</span>${statusTagHtml}</td>
        <td class="lv-td lv-td-itemname" onclick="onNameClick(this, event)" title="Klik untuk dengar / ubah: ${escapeHtml(desc || '—')}">${escapeHtml(desc || '—')}</td>
        ${outCell}
      </tr>`;
  }

  const inCell = isIncome
    ? `<td class="lv-td lv-td-in">
         <div class="amt-ctrl">
           <button class="step-btn dec" onclick="adjustAmt(this, -1000, event)" title="Kurang 1.000 (Shift: 5.000)">−</button>
           <span class="lv-amt income" onclick="onAmtClick(this, event)" title="Klik untuk dengar / ubah">${fmtAmt(amount)}</span>
           <button class="step-btn inc" onclick="adjustAmt(this, 1000, event)" title="Tambah 1.000 (Shift: 5.000)">+</button>
         </div>
       </td>`
    : `<td class="lv-td lv-td-in"><span class="lv-empty-cell">—</span></td>`;

  return `
    <tr class="lv-row${rowExtraClass}" data-cat="${cat}" data-orig="${orig}" data-val="${amount}"${descAttr}${newAttr}${realAttr}${feeAttr}${dateAttr}${rowIdAttr}>
      <td class="lv-td lv-td-idx">${idx}</td>
      <td class="lv-td lv-td-time" title="${timeTitle}"><span class="lv-time-text">${escapeHtml(time)}</span>${statusTagHtml}</td>
      ${outCell}
      ${inCell}
    </tr>`;
}

function renderVoucherRowHtml(idx, time, prodName, amount, provider, origAmount, isDeleted, isRead, isNew, costVal, dateVal, rowId) {
  const timeTitle = `${escapeHtml(time)} · ${escapeHtml(provider)} - ${escapeHtml(prodName)}`;
  const orig = (origAmount !== undefined && origAmount !== null) ? origAmount : amount;
  const isItemNew = (isNew === true || isNew === 'true');
  const isChanged = !isItemNew && (amount !== orig);
  const delta = amount - orig;
  const changedClass = isChanged ? ' changed' : '';
  const titleAttr = isChanged
    ? `Asli: Rp ${formatRupiah(orig)} (${delta > 0 ? '+' : ''}${formatRupiah(delta)})`
    : (isItemNew ? 'Item baru ditambahkan' : 'Klik untuk dengar / ubah');
  const rowExtraClass = (isDeleted ? ' item-deleted' : '') + (isRead ? ' item-read' : '') + (isItemNew ? ' item-new' : (isChanged ? ' item-modified' : ''));
  const newAttr = isItemNew ? ' data-is-new="true"' : '';
  const costAttr = (costVal !== undefined && costVal !== null && costVal > 0) ? ` data-cost="${costVal}"` : '';
  const dateAttr = dateVal ? ` data-date="${escapeHtml(dateVal)}"` : '';
  const rowIdAttr = rowId ? ` data-row-id="${escapeHtml(rowId)}"` : '';

  let statusTagHtml = '';
  if (isItemNew) {
    statusTagHtml = '<span class="tag-item-status tag-item-new">Baru</span>';
  } else if (isChanged) {
    const deltaStr = (delta > 0 ? '+' : '') + formatRupiah(delta);
    statusTagHtml = `<span class="tag-item-status tag-item-mod" title="Asli: Rp ${formatRupiah(orig)} (${deltaStr})">Diubah</span>`;
  }
  const outCell = `
    <td class="lv-td lv-td-out">
      <div class="amt-ctrl">
        <button class="step-btn dec" onclick="adjustAmt(this, -1000, event)" title="Kurang 1.000 (Shift: 5.000)">−</button>
        <span class="lv-amt outcome" onclick="onAmtClick(this, event)" title="Klik untuk dengar / ubah">${fmtAmt(amount)}</span>
        <button class="step-btn inc" onclick="adjustAmt(this, 1000, event)" title="Tambah 1.000 (Shift: 5.000)">+</button>
      </div>
    </td>`;

  return `
    <tr class="lv-row${rowExtraClass}" data-cat="outcome" data-orig="${orig}" data-val="${amount}" data-desc="${escapeHtml(prodName)}" data-provider="${escapeHtml(provider)}"${newAttr}${costAttr}${dateAttr}${rowIdAttr}>
      <td class="lv-td lv-td-idx">${idx}</td>
      <td class="lv-td lv-td-time" title="${timeTitle}"><span class="lv-time-text">${escapeHtml(time)}</span>${statusTagHtml}</td>
      <td class="lv-td lv-td-itemname" onclick="onNameClick(this, event)" title="Klik untuk dengar / ubah: ${escapeHtml(prodName)}">${escapeHtml(prodName)}</td>
      ${outCell}
    </tr>`;
}

// --- DYNAMIC REPORT RENDERER ---
function renderReport(data) {
  if (!data) return;
  window._rekapUserToggled = false;
  window._expandedRekapDates = new Set();
  closeItemNavBar();

  const dateDisplay = data.dateDisplay || data.dateDb || '';
  const shiftLabel = data.shiftLabel || (data.shift === 1 ? 'Shift 1' : (data.shift === 2 ? 'Shift 2' : 'Semua Shift'));

  document.title = 'HistoriKu - ' + dateDisplay;
  const chipShift = document.getElementById('chip-shift');
  const chipDate = document.getElementById('chip-date');
  if (chipShift) chipShift.textContent = shiftLabel;
  if (chipDate) chipDate.textContent = dateDisplay;

  const chipShiftM = document.getElementById('chip-shift-m');
  const chipDateM = document.getElementById('chip-date-m');
  if (chipShiftM) chipShiftM.textContent = shiftLabel;
  if (chipDateM) chipDateM.textContent = dateDisplay;

  let totalMasuk = 0;
  let totalKeluar = 0;
  let totalTrx = 0;

  const container = document.getElementById('groups-container');
  if (!container) return;
  container.innerHTML = '';

  const isMultiDay = Boolean(data.isMultiDay || (data.dates && data.dates.length > 1) || (window.ACTIVE_PERIOD_MODE === 'multiday'));

  if (isMultiDay && window.KspMultiDayLayouts && typeof window.KspMultiDayLayouts.render === 'function') {
    const currentLayout = window.CURRENT_LAYOUT_MODE || (function() {
      try { return localStorage.getItem('ksp_multiday_layout'); } catch(e){ return null; }
    })() || 'side_spread';
    const opt = {
      renderRowHtml: renderRowHtml,
      renderVoucherRowHtml: renderVoucherRowHtml,
      ringkasMode: ringkasMode,
      roundingMode: roundingMode,
      fmtAmt: fmtAmt,
      getAppIcon: getAppIcon,
      escapeHtml: escapeHtml
    };
    const res = window.KspMultiDayLayouts.render(container, data, currentLayout, opt);
    totalMasuk = res.totalMasuk || 0;
    totalKeluar = res.totalKeluar || 0;
    totalTrx = res.totalTrx || 0;
  } else {
    // Modular group renderers respecting moduleOrder
    const moduleRenderers = {
      tarik: function() {
        // 1. Tarik Group
        if (!data.tarik || data.tarik.length === 0) return;
        let tarikMasuk = 0;
        let tarikKeluar = 0;
        const isOutcomeOnly = data.tarik.every(item => String(item.type || '').toLowerCase() !== 'income');
        let rowsHtml = '';

        data.tarik.forEach((item, idx) => {
          totalTrx++;
          const amt = Math.round(item.amount || item.jumtar || 0);
          const isIncome = String(item.type || '').toLowerCase() === 'income';
          if (isIncome) {
            tarikMasuk += amt;
            totalMasuk += amt;
          } else {
            tarikKeluar += amt;
            totalKeluar += amt;
          }
          const desc = item.name || item.desc || item.app || 'Tarik Tunai';
          const jumtar = item.jumtar || amt;
          const adm = item.adm || 0;
          rowsHtml += renderRowHtml(idx + 1, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, jumtar, adm, item.date, item.rowId || item.id);
        });

        const theadHtml = isOutcomeOnly
          ? `<thead class="lv-thead"><tr>
              <th class="lv-th c" style="width:36px;">#</th>
              <th class="lv-th c" style="width:65px;">Waktu</th>
              <th class="lv-th l">Nama</th>
              <th class="lv-th r" style="width:140px;">Keluar</th>
            </tr></thead>`
          : `<thead class="lv-thead"><tr>
              <th class="lv-th c">#</th>
              <th class="lv-th c">Waktu</th>
              <th class="lv-th r">Keluar</th>
              <th class="lv-th r">Masuk</th>
            </tr></thead>`;

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" title="Klik untuk salin Keluar" style="color:var(--outcome)">${ringkasMode ? '' : 'Keluar: '}${fmtAmt(tarikKeluar)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" title="Klik untuk salin Keluar" style="color:var(--outcome)">${fmtAmt(tarikKeluar)}</span> / 
             <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" title="Klik untuk salin Masuk" style="color:var(--income)">${fmtAmt(tarikMasuk)}</span>`;

        const tarikGroupHtml = `
          <div class="lv-group" data-group-id="tarik" data-rekap-label="💸 Tarik Tunai">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn" title="Lipat / Buka grup" onclick="toggleGroupCollapse(this, event)">▼</button>
              <span class="lv-group-icon">💸</span>
              <span class="lv-group-name" onclick="openAppMarginDialog(this, event)" title="Klik untuk lihat total harga jual, modal & margin">Tarik</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">
                ${metaHtml}
              </span>
              <button class="g-act-btn" onclick="speakGroup(this, event)" title="Bacakan nilai grup ini">🔊</button>
            </div>
            <div class="lv-group-body">
              <table class="lv-table">
                ${theadHtml}
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>`;
        container.innerHTML += tarikGroupHtml;
      },

      notif: function() {
        // 2. Notification Groups (group by app)
        if (!data.notif || data.notif.length === 0) return;
        const notifByApp = {};
        data.notif.forEach(item => {
          const appKey = item.app || 'other';
          if (!notifByApp[appKey]) notifByApp[appKey] = [];
          notifByApp[appKey].push(item);
        });

        const savedNotifOrder = data.notifAppOrder || (window.REPORT_CONFIG && window.REPORT_CONFIG.notifAppOrder) || [];
        const orderedAppKeys = [];
        savedNotifOrder.forEach(k => {
          const key = String(k).trim();
          if (notifByApp[key] && !orderedAppKeys.includes(key)) {
            orderedAppKeys.push(key);
          }
        });
        Object.keys(notifByApp).forEach(key => {
          if (!orderedAppKeys.includes(key)) {
            orderedAppKeys.push(key);
          }
        });

        orderedAppKeys.forEach(appKey => {
          const items = notifByApp[appKey];
          const displayName = items[0].appName || appKey;
          const icon = getAppIcon(appKey);
          let appMasuk = 0;
          let appKeluar = 0;
          const isOutcomeOnly = items.every(item => String(item.category || '').toLowerCase() !== 'income');
          let rowsHtml = '';

          items.forEach((item, idx) => {
            totalTrx++;
            const amt = Math.round(item.amount || 0);
            const isIncome = String(item.category || '').toLowerCase() === 'income';
            if (isIncome) {
              appMasuk += amt;
              totalMasuk += amt;
            } else {
              appKeluar += amt;
              totalKeluar += amt;
            }
            const desc = item.name || item.title || displayName;
            rowsHtml += renderRowHtml(idx + 1, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, item.real, item.fee, item.date, item.rowId || item.id);
          });

          const theadHtml = isOutcomeOnly
            ? `<thead class="lv-thead"><tr>
                <th class="lv-th c" style="width:36px;">#</th>
                <th class="lv-th c" style="width:65px;">Waktu</th>
                <th class="lv-th l">Nama</th>
                <th class="lv-th r" style="width:140px;">Keluar</th>
              </tr></thead>`
            : `<thead class="lv-thead"><tr>
                <th class="lv-th c">#</th>
                <th class="lv-th c">Waktu</th>
                <th class="lv-th r">Keluar</th>
                <th class="lv-th r">Masuk</th>
              </tr></thead>`;

          const metaHtml = isOutcomeOnly
            ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" title="Klik untuk salin Keluar" style="color:var(--outcome)">${ringkasMode ? '' : 'Keluar: '}${fmtAmt(appKeluar)}</span>`
            : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" title="Klik untuk salin Keluar" style="color:var(--outcome)">${fmtAmt(appKeluar)}</span> / 
               <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" title="Klik untuk salin Masuk" style="color:var(--income)">${fmtAmt(appMasuk)}</span>`;

          const appGroupHtml = `
            <div class="lv-group" data-group-id="${escapeHtml(appKey)}" data-app-key="${escapeHtml(appKey)}" data-rekap-label="${icon} ${escapeHtml(displayName)}">
              <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
                <button class="grp-toggle-btn" title="Lipat / Buka grup" onclick="toggleGroupCollapse(this, event)">▼</button>
                <span class="lv-group-icon">${icon}</span>
                <span class="lv-group-name" onclick="openAppMarginDialog(this, event)" title="Klik untuk lihat total harga jual, modal & margin">${escapeHtml(displayName)}</span>
                <span class="grp-done-badge">✓ Selesai</span>
                <span class="lv-group-meta">
                  ${metaHtml}
                </span>
                <button class="g-act-btn" onclick="speakGroup(this, event)" title="Bacakan nilai grup ini">🔊</button>
              </div>
              <div class="lv-group-body">
                <table class="lv-table">
                  ${theadHtml}
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </div>`;
          container.innerHTML += appGroupHtml;
        });
      },

      topup: function() {
        // 3. TopUp Group (Jika data topup tersedia)
        if (!data.topup || data.topup.length === 0) return;
        let topUpMasuk = 0;
        let topUpKeluar = 0;
        let topUpRowsHtml = '';

        data.topup.forEach((item, idx) => {
          totalTrx++;
          const amtCharged = Math.round(item.amount || (item.nominal + item.fee) || 0);
          const amtNominal = Math.round(item.nominal || 0);
          topUpMasuk += amtCharged;
          topUpKeluar += amtNominal;
          totalMasuk += amtCharged;
          totalKeluar += amtNominal;

          const desc = (item.customerName ? item.customerName + ' - ' : '') + (item.category || 'TopUp') + (item.destination ? ' (' + item.destination + ')' : '');
          topUpRowsHtml += renderRowHtml(idx + 1, item.time || '00:00', amtCharged, true, desc, false, item.orig, item.deleted, item.read, item.isNew, amtNominal, item.fee, item.date, item.rowId || item.id);
        });

        const topUpTheadHtml = `<thead class="lv-thead"><tr>
            <th class="lv-th c">#</th>
            <th class="lv-th c">Waktu</th>
            <th class="lv-th r">Modal (Keluar)</th>
            <th class="lv-th r">Tagihan (Masuk)</th>
          </tr></thead>`;

        const topUpMetaHtml = `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" title="Klik untuk salin Keluar" style="color:var(--outcome)">${fmtAmt(topUpKeluar)}</span> / 
           <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" title="Klik untuk salin Masuk" style="color:var(--income)">${fmtAmt(topUpMasuk)}</span>`;

        const topUpGroupHtml = `
          <div class="lv-group" data-group-id="topup" data-rekap-label="📱 Modul TopUp">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn" title="Lipat / Buka grup" onclick="toggleGroupCollapse(this, event)">▼</button>
              <span class="lv-group-icon">📱</span>
              <span class="lv-group-name" onclick="openAppMarginDialog(this, event)" title="Klik untuk lihat total harga jual, modal & margin">TopUp</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${topUpMetaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)" title="Bacakan semua topup">🔊</button>
            </div>
            <div class="lv-group-body">
              <table class="lv-table">
                ${topUpTheadHtml}
                <tbody>${topUpRowsHtml}</tbody>
              </table>
            </div>
          </div>`;
        container.innerHTML += topUpGroupHtml;
      },

      voucher: function() {
        // 4. Voucher Group (Satu header utama, dibagi per provider, nomor urut kontinu)
        if (!data.voucher || data.voucher.length === 0) return;
        const voucherByProv = {};
        data.voucher.forEach(item => {
          let provKey = (item.provider || 'VOUCHER').trim().toUpperCase();
          if (!voucherByProv[provKey]) voucherByProv[provKey] = [];
          voucherByProv[provKey].push(item);
        });

        let voucherTotalKeluar = 0;
        let voucherTotalTrx = 0;
        let voucherRowsHtml = '';
        let voucherSeqIdx = 1;

        for (const provKey in voucherByProv) {
          const items = voucherByProv[provKey];
          const provLabel = (provKey === 'VOUCHER') ? 'Umum' : provKey;
          let provKeluar = 0;
          let provRowsHtml = '';

          items.forEach((item) => {
            totalTrx++;
            voucherTotalTrx++;
            const amt = Math.round(item.amount || 0);
            provKeluar += amt;
            voucherTotalKeluar += amt;
            totalKeluar += amt;

            const prodName = item.productName || provKey;
            const time = item.time || '00:00';
            provRowsHtml += renderVoucherRowHtml(voucherSeqIdx++, time, prodName, amt, provKey, item.orig, item.deleted, item.read, item.isNew, item.cost, item.date, item.rowId || item.id);
          });

          const subHeaderHtml = `
            <tr class="lv-subhd-row">
              <td colspan="4" class="lv-subhd">
                <div class="lv-subhd-inner">
                  <span class="lv-subhd-title">📶 ${escapeHtml(provLabel)}</span>
                  <span class="lv-subhd-meta">${items.length} item · ${fmtAmt(provKeluar)}</span>
                </div>
              </td>
            </tr>`;

          voucherRowsHtml += subHeaderHtml + provRowsHtml;
        }

        const voucherGroupHtml = `
          <div class="lv-group" data-group-id="voucher" data-rekap-label="🎫 Voucher Fisik / Game">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn" title="Lipat / Buka grup" onclick="toggleGroupCollapse(this, event)">▼</button>
              <span class="lv-group-icon">🎫</span>
              <span class="lv-group-name" onclick="openAppMarginDialog(this, event)" title="Klik untuk lihat total harga jual, modal & margin">Voucher</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">
                <span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" title="Klik untuk salin Keluar" style="color:var(--outcome)">${ringkasMode ? '' : 'Keluar: '}${fmtAmt(voucherTotalKeluar)}</span>
              </span>
              <button class="g-act-btn" onclick="speakGroup(this, event)" title="Bacakan semua voucher">🔊</button>
            </div>
            <div class="lv-group-body">
              <table class="lv-table lv-table-voucher">
                <thead class="lv-thead"><tr>
                  <th class="lv-th c" style="width:36px;">#</th>
                  <th class="lv-th c" style="width:65px;">Waktu</th>
                  <th class="lv-th l">Nama</th>
                  <th class="lv-th r" style="width:140px;">Keluar</th>
                </tr></thead>
                <tbody>${voucherRowsHtml}</tbody>
              </table>
            </div>
          </div>`;
        container.innerHTML += voucherGroupHtml;
      }
    };

    const moduleOrder = data.moduleOrder || (window.REPORT_CONFIG && window.REPORT_CONFIG.moduleOrder) || ['tarik', 'notif', 'voucher', 'topup'];
    moduleOrder.forEach(modKey => {
      const fn = moduleRenderers[String(modKey).toLowerCase().trim()];
      if (typeof fn === 'function') {
        fn();
      }
    });
  }

  // Summary Card values
  const totalBersih = totalKeluar - totalMasuk;
  const elMasuk = document.getElementById('sb-total-masuk');
  const elKeluar = document.getElementById('sb-total-keluar');
  const elSelisih = document.getElementById('sb-selisih');
  const elTrx = document.getElementById('sb-total-trx');
  if (elMasuk) elMasuk.textContent = fmtAmt(totalMasuk);
  if (elKeluar) elKeluar.textContent = fmtAmt(totalKeluar);
  if (elSelisih) {
    if (totalBersih > 0) {
      elSelisih.textContent = '+' + fmtAmt(totalBersih);
      elSelisih.className = 'sb-v c-in';
    } else if (totalBersih < 0) {
      elSelisih.textContent = fmtAmt(totalBersih);
      elSelisih.className = 'sb-v c-out';
    } else {
      elSelisih.textContent = fmtAmt(0);
      elSelisih.className = 'sb-v';
    }
  }
  if (elTrx) elTrx.textContent = totalTrx;

  if (totalTrx === 0) {
    const storeLabel = (data.storeName && data.storeName !== 'Cabang') ? data.storeName : (data.storeId || 'Cabang ini');
    container.innerHTML = `
      <div class="empty-history-card" style="text-align: center; padding: 46px 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--r); margin: 16px 0; box-shadow: var(--shadow);">
        <div style="font-size: 42px; margin-bottom: 12px; line-height: 1;">📭</div>
        <div style="font-size: 16px; font-weight: 800; color: var(--text); margin-bottom: 6px;">
          Belum Ada Transaksi Tercatat
        </div>
        <div style="font-size: 13px; color: var(--muted); max-width: 440px; margin: 0 auto; line-height: 1.6;">
          Transaksi pada tanggal <strong>${escapeHtml(dateDisplay)}</strong> untuk cabang <strong>${escapeHtml(storeLabel)}</strong> belum tercatat.
        </div>
        <div style="margin-top: 20px; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;">
          <button type="button" class="date-nav-btn prev" onclick="KspHistoriku.navigateDate(-1)" style="background: var(--surface2); border: 1px solid var(--border); padding: 8px 16px; font-size: 12px; font-weight: 700; border-radius: 50px; cursor: pointer; color: var(--text); display: inline-flex; align-items: center; gap: 4px;">
            ◀ Hari Sebelumnya
          </button>
          <button type="button" class="date-chip-trigger" onclick="KspHistoriku.openDateRangePickerModal()" style="background: var(--accent-lt); border: 1px solid var(--accent); padding: 8px 16px; font-size: 12px; font-weight: 700; border-radius: 50px; cursor: pointer; color: var(--accent); display: inline-flex; align-items: center; gap: 4px;">
            📅 Pilih Tanggal Lain
          </button>
          <button type="button" class="date-nav-btn next" onclick="KspHistoriku.navigateDate(1)" style="background: var(--surface2); border: 1px solid var(--border); padding: 8px 16px; font-size: 12px; font-weight: 700; border-radius: 50px; cursor: pointer; color: var(--text); display: inline-flex; align-items: center; gap: 4px;">
            Hari Berikutnya ▶
          </button>
        </div>
      </div>
    `;
  }

  checkAllGroupsCompletion(false);
  applyRingkasState(null, true);
  applyRoundingState(null, true);
  applyInitialGroupCollapse();
  syncHeaderHeight();
  loadAndApplyReportEdits();
  renderRekapSummaryTable();
}
// --- END DYNAMIC REPORT RENDERER ---

// Initial render call
function applyInjectedReportConfig() {
  const cfg = window.REPORT_CONFIG || (window.REPORT_DATA && window.REPORT_DATA.config) || null;
  if (!cfg || typeof cfg !== 'object') return;

  if (typeof cfg.ringkasMode === 'boolean') {
    ringkasMode = cfg.ringkasMode;
    try { localStorage.setItem('ksp_ringkas_mode', ringkasMode ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.roundingMode === 'boolean') {
    roundingMode = cfg.roundingMode;
    try { localStorage.setItem('ksp_rounding_mode', roundingMode ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.showSteppers === 'boolean') {
    showSteppers = cfg.showSteppers;
    try { localStorage.setItem('ksp_show_steppers', showSteppers ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.stickyAppHeaders === 'boolean') {
    stickyAppHeaders = cfg.stickyAppHeaders;
    try { localStorage.setItem('ksp_sticky_app_headers', stickyAppHeaders ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.autoHideCompleted === 'boolean') {
    autoHideCompleted = cfg.autoHideCompleted;
    try { localStorage.setItem('ksp_tts_autohide', autoHideCompleted ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.hiddenGroupsActive === 'boolean') {
    hiddenGroupsActive = cfg.hiddenGroupsActive;
    try { localStorage.setItem('ksp_hidden_groups_active', hiddenGroupsActive ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.sambungMultiDate === 'boolean') {
    sambungMultiDate = cfg.sambungMultiDate;
    try { localStorage.setItem('ksp_sambung_multidate', sambungMultiDate ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.ttsWakeLock === 'boolean') {
    ttsWakeLockEnabled = cfg.ttsWakeLock;
    try { localStorage.setItem('ksp_tts_wakelock', ttsWakeLockEnabled ? '1' : '0'); } catch(e){}
  }
  if (typeof cfg.ttsSpeed === 'number' && cfg.ttsSpeed > 0) {
    ttsSpeed = cfg.ttsSpeed;
    try { localStorage.setItem('ksp_tts_speed', ttsSpeed); } catch(e){}
  }
  if (typeof cfg.ttsDelay === 'number' && cfg.ttsDelay >= 0) {
    ttsDelay = cfg.ttsDelay;
    try { localStorage.setItem('ksp_tts_delay', ttsDelay); } catch(e){}
  }
  if (typeof cfg.textSize === 'number' && cfg.textSize >= 70 && cfg.textSize <= 160) {
    setTextSize(cfg.textSize, true);
  }
  if (typeof cfg.theme === 'string' && (cfg.theme === 'dark' || cfg.theme === 'light')) {
    document.documentElement.setAttribute('data-theme', cfg.theme);
    try { localStorage.setItem('ksp_theme', cfg.theme); } catch(e){}
  }
}
function initHistorikuApp() {
  applyInjectedReportConfig();
  setTextSize(currentTextSize, true);
  const autoHideToggle = document.getElementById('auto-hide-toggle');
  if (autoHideToggle) autoHideToggle.checked = autoHideCompleted;
  updateAutoHideBadge();
  const sambungToggle = document.getElementById('sambung-multidate-toggle');
  if (sambungToggle) sambungToggle.checked = sambungMultiDate;
  updateSambungMultiDateBadge();
  applyRingkasState();
  applyRoundingState();
  applySteppersState();
  applyHiddenGroupState();
  applyStickyAppHeadersState();
  updateThemeModeBadge();
  if (window.REPORT_DATA && document.getElementById('groups-container')) {
    renderReport(window.REPORT_DATA);
    applyInitialGroupCollapse();
  }
  initTtsControls();
  initSideSpreadStickyHeaders();
  syncHeaderHeight();
  loadAndApplyReportEdits();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHistorikuApp);
} else {
  initHistorikuApp();
}

// ============================================================================
// KSP HISTORIKU - BRIDGE FOR STORE MANAGER
// ============================================================================
window.ACTIVE_STORE_ID = null;
window.ACTIVE_STORE_NAME = '';

// Override getReportStorageKey to include store ID
const _originalGetReportStorageKey = getReportStorageKey;
getReportStorageKey = function() {
  const storePrefix = window.ACTIVE_STORE_ID ? (window.ACTIVE_STORE_ID + '_') : '';
  const d = (window.REPORT_DATA && (window.REPORT_DATA.dateDb || window.REPORT_DATA.dateDisplay)) || 'today';
  const s = (window.REPORT_DATA && window.REPORT_DATA.shift !== undefined) ? window.REPORT_DATA.shift : 0;
  return 'ksp_report_edits_' + storePrefix + d + '_s' + s;
};

function openImportReportDialog() {
  const modal = document.getElementById('import-report-modal');
  if (modal) modal.classList.add('open');
}

function closeImportReportDialog() {
  const modal = document.getElementById('import-report-modal');
  if (modal) modal.classList.remove('open');
}

function handleReportFileImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    parseAndLoadImportContent(e.target.result, file.name);
  };
  reader.readAsText(file);
}

function parseAndLoadImportContent(text, fileName) {
  try {
    let parsedData = null;
    if (text.includes('/* KSPCHECK_REPORT_DATA_JSON */') || text.includes('REPORT_DATA')) {
      const m1 = text.match(/window\.REPORT_DATA\s*=\s*(\{[\s\S]*?\});/);
      if (m1) {
        parsedData = JSON.parse(m1[1]);
      } else {
        const m2 = text.match(/<textarea[^>]*id="raw-json-data"[^>]*>([\s\S]*?)<\/textarea>/);
        if (m2) {
          parsedData = JSON.parse(m2[1]);
        }
      }
    }
    if (!parsedData) {
      try { parsedData = JSON.parse(text); } catch(e) {}
    }

    if (parsedData && (parsedData.tarik || parsedData.topup || parsedData.voucher || parsedData.notif)) {
      window.REPORT_DATA = parsedData;
      if (window.ACTIVE_STORE_ID && parsedData.dateDb) {
        try {
          localStorage.setItem('ksp_historiku_data_' + window.ACTIVE_STORE_ID + '_' + parsedData.dateDb, JSON.stringify(parsedData));
        } catch(e) {}
      }
      closeImportReportDialog();
      renderReport(window.REPORT_DATA);
      applyInitialGroupCollapse();
      loadAndApplyReportEdits();
      showToast('✓ Berhasil memuat laporan (' + (fileName || 'File') + ')');
    } else {
      alert('Format file tidak valid. Pastikan memilih file laporan HTML atau JSON dari aplikasi Android KSP Check.');
    }
  } catch(err) {
    alert('Gagal membaca file: ' + err.message);
  }
}

window.ACTIVE_PERIOD_MODE = 'singleday';
window.CURRENT_LAYOUT_MODE = (function() {
  try { return localStorage.getItem('ksp_multiday_layout'); } catch(e){ return null; }
})() || 'side_spread';

function getTodayDbDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatDateDisplayShort(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  } catch(e) { return dateStr; }
}

function formatDateDisplayLong(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch(e) { return dateStr; }
}

function getDatesInRange(startStr, endStr) {
  const dates = [];
  let curr = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (curr <= end) {
    dates.push(curr.getFullYear() + '-' + String(curr.getMonth() + 1).padStart(2, '0') + '-' + String(curr.getDate()).padStart(2, '0'));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

function generateMockMultiDayData(storeId, storeName, dateList) {
  const tarik = [];
  const notif = [];
  const voucher = [];
  const topup = [];

  const apps = [
    { app: 'com.bca', name: 'BCA' },
    { app: 'com.bri', name: 'BRImo' },
    { app: 'id.dana', name: 'DANA' },
    { app: 'com.mandiri.livin', name: 'Livin Mandiri' }
  ];

  const providers = ['TELKOMSEL', 'AXIS', 'INDOSAT', 'XL'];

  dateList.forEach((d, dayIdx) => {
    tarik.push({ id: 1000 + dayIdx * 10 + 1, date: d, time: '08:30', amount: 100000 + (dayIdx * 25000), type: 'outcome', desc: 'Tarik Tunai Bank' });
    tarik.push({ id: 1000 + dayIdx * 10 + 2, date: d, time: '11:15', amount: 250000, type: 'outcome', desc: 'Tarik E-Wallet' });
    if (dayIdx % 2 === 0) {
      tarik.push({ id: 1000 + dayIdx * 10 + 3, date: d, time: '14:40', amount: 50000, type: 'income', desc: 'Setor Tunai' });
    }

    apps.forEach((a, aIdx) => {
      const isInc = (aIdx !== 2);
      notif.push({
        id: 2000 + dayIdx * 20 + aIdx,
        date: d,
        app: a.app,
        appName: a.name,
        time: String(8 + aIdx * 2).padStart(2, '0') + ':25',
        amount: 50000 * (aIdx + 1) + (dayIdx * 15000),
        category: isInc ? 'income' : 'outcome',
        name: isInc ? ('Transfer Masuk (' + a.name + ')') : ('Kirim Saldo (' + a.name + ')')
      });
    });

    const prov = providers[dayIdx % providers.length];
    voucher.push({
      id: 3000 + dayIdx * 10 + 1,
      date: d,
      provider: prov,
      productName: prov + ' 2.5GB',
      time: '09:45',
      amount: 15000,
      cost: 13500,
      category: 'outcome'
    });
    voucher.push({
      id: 3000 + dayIdx * 10 + 2,
      date: d,
      provider: prov,
      productName: prov + ' 5GB',
      time: '15:20',
      amount: 25000,
      cost: 23000,
      category: 'outcome'
    });

    topup.push({
      id: 4000 + dayIdx * 10 + 1,
      date: d,
      time: '10:05',
      customerName: 'Pelanggan ' + (dayIdx + 1),
      category: 'DANA 50k',
      destination: '081234567' + dayIdx,
      nominal: 50000,
      fee: 2000,
      amount: 52000
    });
  });

  return { tarik, notif, voucher, topup };
}

function loadSampleReportForCurrentStore() {
  window.REPORT_DATA = getSampleDataForStore(window.ACTIVE_STORE_ID, window.ACTIVE_STORE_NAME);
  renderReport(window.REPORT_DATA);
  applyInitialGroupCollapse();
  loadAndApplyReportEdits();
  showToast('✓ Contoh data riwayat transaksi dimuat');
}

function getSampleDataForStore(storeId, storeName) {
  return createEmptyReportData(storeId, storeName, getTodayDbDate(), 0);
}

// ============================================================================
// SUPABASE HISTORY SYNC & REALTIME INTEGRATION
// ============================================================================
let supabaseHistoryClient = null;
let realtimeHistoryChannel = null;

function getSupabaseClient() {
  if (supabaseHistoryClient) return supabaseHistoryClient;
  const cfg = window.KSP_SYNC_CONFIG || {};
  if (cfg.url && cfg.key && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseHistoryClient = window.supabase.createClient(cfg.url, cfg.key);
  }
  return supabaseHistoryClient;
}

function fetchSupabaseHistory(storeId, startDate, endDate) {
  const cfg = window.KSP_SYNC_CONFIG || {};
  if (!storeId) return Promise.resolve(null);

  const client = getSupabaseClient();
  if (client) {
    try {
      let query = client.from('ksp_history_transactions')
        .select('*')
        .eq('store_id', storeId);

      if (startDate === endDate) {
        query = query.eq('trx_date', startDate);
      } else {
        query = query.gte('trx_date', startDate).lte('trx_date', endDate);
      }

      return query
        .order('trx_date', { ascending: true })
        .order('trx_time', { ascending: true })
        .order('created_at', { ascending: true })
        .then(res => {
          if (res.error) throw res.error;
          return res.data;
        })
        .catch(err => {
          console.warn('[KspHistoriku] Supabase client query error, fallback direct fetch:', err);
          return fallbackDirectFetchHistory(storeId, startDate, endDate);
        });
    } catch (e) {
      console.warn('[KspHistoriku] Supabase client error:', e);
    }
  }

  return fallbackDirectFetchHistory(storeId, startDate, endDate);
}

function fallbackDirectFetchHistory(storeId, startDate, endDate) {
  const cfg = window.KSP_SYNC_CONFIG || {};
  if (!cfg.url || !cfg.key || !storeId) return Promise.resolve(null);

  const baseUrl = cfg.url.replace(/\/+$/, '');
  const headers = { 'apikey': cfg.key };
  if (String(cfg.key).indexOf('sb_') !== 0) {
    headers['Authorization'] = 'Bearer ' + cfg.key;
  }

  let endpoint = `${baseUrl}/rest/v1/ksp_history_transactions?store_id=eq.${encodeURIComponent(storeId)}`;
  if (startDate === endDate) {
    endpoint += `&trx_date=eq.${startDate}`;
  } else {
    endpoint += `&trx_date=gte.${startDate}&trx_date=lte.${endDate}`;
  }
  endpoint += `&order=trx_date.asc,trx_time.asc,created_at.asc`;

  return fetch(endpoint, { headers: headers })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .catch(err => {
      console.warn('[KspHistoriku] Gagal direct fetch Supabase history:', err);
      return null;
    });
}

function transformSupabaseRowsToReportData(rows, dateDb, shift, isMultiDay, startDate, endDate, dateList, storeId, storeName) {
  const tarik = [];
  const voucher = [];
  const notif = [];
  let totalMasuk = 0;
  let totalKeluar = 0;

  rows.forEach(r => {
    const isEdited = Boolean(r.is_edited) || Boolean(r.extra_data && r.extra_data.is_edited);
    const isDeleted = Boolean(r.is_deleted_by_web) || Boolean(r.extra_data && r.extra_data.is_deleted_by_web);
    const isRead = Boolean(r.extra_data && r.extra_data.web_read);
    const cat = (r.category || 'outcome').toLowerCase();
    const amt = Number(r.amount) || 0;
    const realAmt = Number(r.real_amount) || 0;
    const feeAmt = Number(r.fee) || 0;
    const costAmt = Number(r.cost) || 0;
    const timeStr = r.trx_time ? String(r.trx_time).substring(0, 5) : '00:00';
    const dateStr = r.trx_date || dateDb;

    const origAmt = (r.extra_data && typeof r.extra_data.orig_amount === 'number')
      ? r.extra_data.orig_amount
      : (isEdited && realAmt > 0 && realAmt !== amt ? realAmt : amt);

    if (r.module_type === 'tarik') {
      tarik.push({
        id: r.local_id || r.id,
        rowId: r.id,
        date: dateStr,
        time: timeStr,
        amount: amt,
        jumtar: realAmt > 0 ? realAmt : amt,
        adm: feeAmt,
        type: cat,
        name: r.customer_name || r.item_name || '',
        app: r.app_name || 'Tarik Tunai',
        orig: origAmt,
        deleted: isDeleted,
        read: isRead,
        isEdited: isEdited,
        extraData: r.extra_data
      });
      if (!isDeleted) {
        if (cat === 'income') totalMasuk += amt;
        else totalKeluar += amt;
      }
    } else if (r.module_type === 'voucher') {
      voucher.push({
        id: r.local_id || r.id,
        rowId: r.id,
        date: dateStr,
        time: timeStr,
        provider: r.provider || r.app_name || 'VOUCHER',
        productName: r.item_name || '',
        amount: amt,
        cost: costAmt,
        category: 'outcome',
        orig: origAmt,
        deleted: isDeleted,
        read: isRead,
        isEdited: isEdited,
        extraData: r.extra_data
      });
      if (!isDeleted) {
        totalKeluar += amt;
      }
    } else { // 'notif' atau modul aplikasi lainnya (bca, dana, dll)
      notif.push({
        id: r.local_id || r.id,
        rowId: r.id,
        date: dateStr,
        time: timeStr,
        app: r.app_package || 'other',
        appName: r.app_name || 'Notifikasi',
        amount: amt,
        real: realAmt,
        fee: feeAmt,
        category: cat,
        title: r.title || '',
        name: r.customer_name || r.item_name || '',
        orig: origAmt,
        deleted: isDeleted,
        read: isRead,
        isEdited: isEdited,
        extraData: r.extra_data
      });
      if (!isDeleted) {
        if (cat === 'income') totalMasuk += amt;
        else totalKeluar += amt;
      }
    }
  });

  const shiftLabel = shift === 1 ? 'Shift 1 (Pagi)' : (shift === 2 ? 'Shift 2 (Malam)' : 'Semua Shift');
  const summary = {
    totalMasuk: totalMasuk,
    totalKeluar: totalKeluar,
    totalBersih: totalKeluar - totalMasuk,
    totalTrx: tarik.length + voucher.length + notif.length
  };

  if (isMultiDay) {
    return {
      isMultiDay: true,
      dates: dateList,
      startDate: startDate,
      endDate: endDate,
      dateDb: `${startDate} s/d ${endDate}`,
      dateDisplay: `${formatDateDisplayShort(startDate)} - ${formatDateDisplayShort(endDate)}`,
      shiftLabel: shiftLabel,
      storeId: storeId,
      storeName: storeName,
      tarik: tarik,
      notif: notif,
      voucher: voucher,
      topup: [],
      summary: summary
    };
  } else {
    return {
      dateDb: dateDb,
      dateDisplay: formatDateDisplayLong(dateDb),
      shift: shift || 0,
      shiftLabel: shiftLabel,
      storeId: storeId,
      storeName: storeName,
      tarik: tarik,
      notif: notif,
      voucher: voucher,
      topup: [],
      summary: summary
    };
  }
}

function initSupabaseRealtime(storeId) {
  const client = getSupabaseClient();
  if (!client || !storeId) return;

  if (realtimeHistoryChannel) {
    try { client.removeChannel(realtimeHistoryChannel); } catch(e) {}
    realtimeHistoryChannel = null;
  }

  try {
    realtimeHistoryChannel = client
      .channel('public:ksp_history_transactions:' + storeId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ksp_history_transactions',
        filter: 'store_id=eq.' + storeId
      }, function(payload) {
        console.log('[KspHistoriku Realtime] Event:', payload);
        handleRealtimeTransactionEvent(payload);
      })
      .subscribe();
  } catch (err) {
    console.warn('[KspHistoriku] Gagal inisialisasi Realtime:', err);
  }
}

function handleRealtimeTransactionEvent(payload) {
  if (window._isSavingWebEdits) {
    // Abaikan event realtime yang dipicu oleh aktivitas simpan dari browser ini sendiri
    return;
  }
  const ev = payload.eventType;
  const row = payload.new || payload.old;
  if (!row) return;

  const rowDate = row.trx_date;
  const isMulti = window.ACTIVE_PERIOD_MODE === 'multiday';
  let isRelevant = false;

  if (isMulti && window.REPORT_DATA && window.REPORT_DATA.startDate && window.REPORT_DATA.endDate) {
    isRelevant = rowDate >= window.REPORT_DATA.startDate && rowDate <= window.REPORT_DATA.endDate;
  } else if (window.REPORT_DATA && window.REPORT_DATA.dateDb) {
    isRelevant = rowDate === window.REPORT_DATA.dateDb;
  }

  if (isRelevant) {
    const sId = window.ACTIVE_STORE_ID;
    const sName = window.ACTIVE_STORE_NAME;
    if (isMulti) {
      loadMultiDayForStore(sId, sName, window.REPORT_DATA.startDate, window.REPORT_DATA.endDate);
    } else {
      window.KspHistoriku.loadForStore(sId, sName, window.REPORT_DATA.dateDb);
    }

    if (ev === 'INSERT') {
      showToast('⚡ Transaksi Baru: ' + (row.app_name || row.module_type) + ' Rp ' + (Number(row.amount) || 0).toLocaleString('id-ID'));
    } else if (ev === 'UPDATE') {
      showToast('✏️ Transaksi Diperbarui: ' + (row.app_name || row.module_type));
    } else if (ev === 'DELETE') {
      showToast('🗑️ Transaksi Dihapus / Dibatalkan');
    }
  }
}

function loadMultiDayForStore(storeId, storeName, startDate, endDate) {
  window.ACTIVE_STORE_ID = storeId;
  window.ACTIVE_STORE_NAME = storeName || 'Cabang';
  window.ACTIVE_PERIOD_MODE = 'multiday';
  setPeriodMode('multiday');

  const dateList = getDatesInRange(startDate, endDate);

  let mergedTarik = [];
  let mergedNotif = [];
  let mergedVoucher = [];
  let foundAny = false;

  dateList.forEach(dKey => {
    try {
      const raw = localStorage.getItem('ksp_historiku_data_' + storeId + '_' + dKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          foundAny = true;
          if (parsed.tarik) parsed.tarik.forEach(item => { item.date = dKey; mergedTarik.push(item); });
          if (parsed.notif) parsed.notif.forEach(item => { item.date = dKey; mergedNotif.push(item); });
          if (parsed.voucher) parsed.voucher.forEach(item => { item.date = dKey; mergedVoucher.push(item); });
        }
      }
    } catch(e) {}
  });

  // Data kosong awal tanpa mock data jika belum ada di cache
  const multiData = {
    isMultiDay: true,
    dates: dateList,
    startDate: startDate,
    endDate: endDate,
    dateDb: `${startDate} s/d ${endDate}`,
    dateDisplay: `${formatDateDisplayShort(startDate)} - ${formatDateDisplayShort(endDate)}`,
    shiftLabel: 'Semua Shift',
    storeId: storeId,
    storeName: storeName,
    tarik: mergedTarik,
    notif: mergedNotif,
    voucher: mergedVoucher,
    topup: []
  };

  window.REPORT_DATA = multiData;
  updateDateDisplayUI(multiData.dateDisplay);
  renderReport(window.REPORT_DATA);
  applyInitialGroupCollapse();
  loadAndApplyReportEdits();

  // Ambil data asli dari Supabase Cloud
  fetchSupabaseHistory(storeId, startDate, endDate).then(rows => {
    if (rows && Array.isArray(rows) && rows.length > 0) {
      const remoteData = transformSupabaseRowsToReportData(
        rows, `${startDate} s/d ${endDate}`, 0, true, startDate, endDate, dateList, storeId, storeName
      );
      window.REPORT_DATA = remoteData;
      renderReport(window.REPORT_DATA);
      applyInitialGroupCollapse();
      loadAndApplyReportEdits();
      showToast('☁️ Cloud: ' + rows.length + ' transaksi termuat');
    } else {
      const emptyData = {
        isMultiDay: true,
        dates: dateList,
        startDate: startDate,
        endDate: endDate,
        dateDb: `${startDate} s/d ${endDate}`,
        dateDisplay: `${formatDateDisplayShort(startDate)} - ${formatDateDisplayShort(endDate)}`,
        shiftLabel: 'Semua Shift',
        storeId: storeId,
        storeName: storeName,
        tarik: [],
        notif: [],
        voucher: [],
        topup: []
      };
      window.REPORT_DATA = emptyData;
      renderReport(window.REPORT_DATA);
    }
  });

  initSupabaseRealtime(storeId);
}

function updateDateDisplayUI(text) {
  const el = document.getElementById('currentDateDisplay');
  if (el) el.textContent = text;
  const chipDate = document.getElementById('chip-date');
  if (chipDate) chipDate.textContent = text;
}

function setPeriodMode(mode) {
  window.ACTIVE_PERIOD_MODE = mode;
  const btnSingle = document.getElementById('modalTabSingle');
  const btnMulti = document.getElementById('modalTabMulti');
  const btnFormat = document.getElementById('btnFormatLayout');
  const layoutWrap = document.getElementById('modalLayoutSelectWrapper');
  const endWrap = document.getElementById('rangeEndFieldWrapper');
  const presetsWrap = document.getElementById('modalPresetsRow');
  if (btnSingle) btnSingle.classList.toggle('active', mode === 'singleday');
  if (btnMulti) btnMulti.classList.toggle('active', mode === 'multiday');
  if (btnFormat) btnFormat.style.display = (mode === 'multiday') ? 'inline-flex' : 'none';
  if (layoutWrap) layoutWrap.style.display = (mode === 'multiday') ? 'block' : 'none';
  if (endWrap) endWrap.style.display = (mode === 'multiday') ? 'flex' : 'none';
  if (presetsWrap) presetsWrap.style.display = (mode === 'multiday') ? 'flex' : 'none';
}

function openFormatLayoutModal() {
  const modal = document.getElementById('formatLayoutModal');
  if (!modal) return;
  const list = document.getElementById('formatLayoutOptionsList');
  if (list && window.KspMultiDayLayouts) {
    list.innerHTML = window.KspMultiDayLayouts.MODES.map(m => `
      <div class="format-option-card ${m.id === window.CURRENT_LAYOUT_MODE ? 'active' : ''}" data-mode="${m.id}" onclick="KspHistoriku.selectFormatLayoutMode('${m.id}')">
        <div class="format-opt-icon">${m.icon}</div>
        <div class="format-opt-info">
          <div class="format-opt-title">${escapeHtml(m.name)} <span class="format-opt-badge">${escapeHtml(m.badge)}</span></div>
          <div class="format-opt-desc">${escapeHtml(m.desc)}</div>
        </div>
      </div>
    `).join('');
  }
  modal.classList.add('open');
}

function closeFormatLayoutModal() {
  const modal = document.getElementById('formatLayoutModal');
  if (modal) modal.classList.remove('open');
}

function selectFormatLayoutMode(modeId) {
  if (autoSaveDebounceTimer) {
    clearTimeout(autoSaveDebounceTimer);
    autoSaveDebounceTimer = null;
    doSaveReportEdits();
  }

  window.CURRENT_LAYOUT_MODE = modeId;
  try { localStorage.setItem('ksp_multiday_layout', modeId); } catch(e){}
  updateLayoutModeUI();
  closeFormatLayoutModal();

  // Jika date range modal aktif dan user sedang memilih rentang tanggal
  const startInput = document.getElementById('rangeStartDate');
  const endInput = document.getElementById('rangeEndDate');
  if (window.ACTIVE_PERIOD_MODE === 'multiday' && startInput && endInput && startInput.value && endInput.value && startInput.value !== endInput.value) {
    if (!window.REPORT_DATA || !window.REPORT_DATA.isMultiDay || window.REPORT_DATA.startDate !== startInput.value || window.REPORT_DATA.endDate !== endInput.value) {
      loadMultiDayForStore(window.ACTIVE_STORE_ID, window.ACTIVE_STORE_NAME, startInput.value, endInput.value);
    } else {
      renderReport(window.REPORT_DATA);
    }
  } else if (window.REPORT_DATA) {
    renderReport(window.REPORT_DATA);
  }

  let modeName = modeId;
  if (window.KspMultiDayLayouts) {
    const m = window.KspMultiDayLayouts.MODES.find(x => x.id === modeId);
    if (m) modeName = m.name;
  }
  showToast('✓ Format tampilan: ' + modeName);
}

function updateLayoutModeUI() {
  const btn = document.getElementById('btnFormatLayout');
  const label = document.getElementById('formatLayoutCurrentLabel');
  if (window.KspMultiDayLayouts) {
    const m = window.KspMultiDayLayouts.MODES.find(x => x.id === window.CURRENT_LAYOUT_MODE);
    if (label && m) label.textContent = m.name;
    if (btn && m) btn.title = 'Format Tampilan: ' + m.name;
  }
  // Juga update kartu active di semua modal
  document.querySelectorAll('.format-option-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-mode') === window.CURRENT_LAYOUT_MODE);
  });
}

function renderModalFormatOptions() {
  const list = document.getElementById('modalFormatOptionsList');
  if (list && window.KspMultiDayLayouts) {
    list.innerHTML = window.KspMultiDayLayouts.MODES.map(m => `
      <div class="format-option-card ${m.id === window.CURRENT_LAYOUT_MODE ? 'active' : ''}" data-mode="${m.id}" onclick="KspHistoriku.selectFormatLayoutMode('${m.id}')">
        <div class="format-opt-icon">${m.icon}</div>
        <div class="format-opt-info">
          <div class="format-opt-title">${escapeHtml(m.name)} <span class="format-opt-badge">${escapeHtml(m.badge)}</span></div>
          <div class="format-opt-desc">${escapeHtml(m.desc)}</div>
        </div>
      </div>
    `).join('');
  }
}

function openDateRangePickerModal() {
  const modal = document.getElementById('dateRangePickerModal');
  if (!modal) return;
  const startInput = document.getElementById('rangeStartDate');
  const endInput = document.getElementById('rangeEndDate');
  const todayStr = getTodayDbDate();
  if (startInput && !startInput.value) startInput.value = todayStr;
  if (endInput && !endInput.value) endInput.value = todayStr;
  renderModalFormatOptions();
  setPeriodMode(window.ACTIVE_PERIOD_MODE || 'singleday');
  modal.classList.add('open');
}

function closeDateRangePickerModal() {
  const modal = document.getElementById('dateRangePickerModal');
  if (modal) modal.classList.remove('open');
}

function selectRangePreset(presetKey) {
  const today = new Date();
  const formatD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let start = formatD(today);
  let end = formatD(today);

  if (presetKey === 'yesterday') {
    const y = new Date(); y.setDate(y.getDate() - 1);
    start = formatD(y); end = formatD(y);
  } else if (presetKey === 'last7') {
    const d7 = new Date(); d7.setDate(d7.getDate() - 6);
    start = formatD(d7); end = formatD(today);
  } else if (presetKey === 'last30') {
    const d30 = new Date(); d30.setDate(d30.getDate() - 29);
    start = formatD(d30); end = formatD(today);
  } else if (presetKey === 'thisMonth') {
    const m1 = new Date(today.getFullYear(), today.getMonth(), 1);
    start = formatD(m1); end = formatD(today);
  }

  const startInput = document.getElementById('rangeStartDate');
  const endInput = document.getElementById('rangeEndDate');
  if (startInput) startInput.value = start;
  if (endInput) endInput.value = end;

  document.querySelectorAll('#dateRangePickerModal .range-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === presetKey);
  });
}

function applyDateRange() {
  const startInput = document.getElementById('rangeStartDate');
  const endInput = document.getElementById('rangeEndDate');
  if (!startInput || !endInput) return;
  const startDate = startInput.value;
  const endDate = (window.ACTIVE_PERIOD_MODE === 'multiday') ? endInput.value : startDate;
  if (!startDate) {
    alert('Pilih tanggal!');
    return;
  }
  if (window.ACTIVE_PERIOD_MODE === 'multiday' && startDate > endDate) {
    alert('Tanggal awal tidak boleh lebih besar dari tanggal akhir!');
    return;
  }
  closeDateRangePickerModal();

  if (window.ACTIVE_PERIOD_MODE === 'multiday' && startDate !== endDate) {
    loadMultiDayForStore(window.ACTIVE_STORE_ID, window.ACTIVE_STORE_NAME, startDate, endDate);
  } else {
    setPeriodMode('singleday');
    window.KspHistoriku.loadForStore(window.ACTIVE_STORE_ID, window.ACTIVE_STORE_NAME, startDate);
  }
}

function navigateDate(direction) {
  const dir = (direction < 0) ? -1 : 1;
  const storeId = window.ACTIVE_STORE_ID || (typeof currentStoreId !== 'undefined' ? currentStoreId : '');
  const storeName = window.ACTIVE_STORE_NAME || (typeof currentStoreName !== 'undefined' ? currentStoreName : 'Cabang');

  if (!storeId) {
    if (typeof showToast === 'function') showToast('⚠️ Silakan pilih cabang terlebih dahulu');
    return;
  }

  const formatYmd = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Multi-day mode: geser jendela rentang tanggal
  if (window.ACTIVE_PERIOD_MODE === 'multiday' && window.REPORT_DATA && window.REPORT_DATA.isMultiDay && window.REPORT_DATA.startDate && window.REPORT_DATA.endDate) {
    const sDate = new Date(window.REPORT_DATA.startDate + 'T00:00:00');
    const eDate = new Date(window.REPORT_DATA.endDate + 'T00:00:00');
    const diffDays = Math.max(1, Math.round((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1);

    sDate.setDate(sDate.getDate() + (dir * diffDays));
    eDate.setDate(eDate.getDate() + (dir * diffDays));

    const newStart = formatYmd(sDate);
    const newEnd = formatYmd(eDate);

    const startInput = document.getElementById('rangeStartDate');
    const endInput = document.getElementById('rangeEndDate');
    if (startInput) startInput.value = newStart;
    if (endInput) endInput.value = newEnd;

    loadMultiDayForStore(storeId, storeName, newStart, newEnd);
    return;
  }

  // Single-day mode: geser 1 hari (+1 atau -1)
  let curDateStr = '';
  if (window.REPORT_DATA && window.REPORT_DATA.dateDb && !window.REPORT_DATA.isMultiDay && /^\d{4}-\d{2}-\d{2}$/.test(window.REPORT_DATA.dateDb)) {
    curDateStr = window.REPORT_DATA.dateDb;
  } else {
    const startInput = document.getElementById('rangeStartDate');
    curDateStr = (startInput && startInput.value) ? startInput.value : getTodayDbDate();
  }

  const curDate = new Date(curDateStr + 'T00:00:00');
  curDate.setDate(curDate.getDate() + dir);
  const newDateStr = formatYmd(curDate);

  const startInput = document.getElementById('rangeStartDate');
  const endInput = document.getElementById('rangeEndDate');
  if (startInput) startInput.value = newDateStr;
  if (endInput) endInput.value = newDateStr;

  const currentShift = (window.REPORT_DATA && typeof window.REPORT_DATA.shift === 'number') ? window.REPORT_DATA.shift : 0;
  window.KspHistoriku.loadForStore(storeId, storeName, newDateStr, currentShift);
}

window.KspHistoriku = {
  loadForStore: function(storeId, storeName, dateKey, shiftNum) {
    window.ACTIVE_STORE_ID = storeId;
    window.ACTIVE_STORE_NAME = storeName || 'Cabang';
    setPeriodMode('singleday');

    let storeData = null;
    const nowKey = dateKey || getTodayDbDate();

    try {
      const cached = localStorage.getItem('ksp_historiku_data_' + storeId + '_' + nowKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.dateDb === nowKey) {
          storeData = parsed;
        }
      }
    } catch(e) {}

    if (!storeData) {
      storeData = createEmptyReportData(storeId, storeName, nowKey, shiftNum);
    }

    window.REPORT_DATA = storeData;
    updateDateDisplayUI(storeData.dateDisplay || formatDateDisplayLong(nowKey) || nowKey);
    renderReport(window.REPORT_DATA);
    applyInitialGroupCollapse();
    loadAndApplyReportEdits();

    // Ambil data asli dari Supabase Cloud
    fetchSupabaseHistory(storeId, nowKey, nowKey).then(rows => {
      if (rows && Array.isArray(rows) && rows.length > 0) {
        const remoteData = transformSupabaseRowsToReportData(
          rows, nowKey, shiftNum || 0, false, nowKey, nowKey, [nowKey], storeId, storeName
        );
        window.REPORT_DATA = remoteData;
        try {
          localStorage.setItem('ksp_historiku_data_' + storeId + '_' + nowKey, JSON.stringify(remoteData));
        } catch(e) {}
        renderReport(window.REPORT_DATA);
        applyInitialGroupCollapse();
        loadAndApplyReportEdits();
        showToast('☁️ Cloud: ' + rows.length + ' transaksi termuat');
      } else {
        try {
          localStorage.removeItem('ksp_historiku_data_' + storeId + '_' + nowKey);
        } catch(e) {}
        const emptyData = createEmptyReportData(storeId, storeName, nowKey, shiftNum);
        window.REPORT_DATA = emptyData;
        renderReport(window.REPORT_DATA);
      }
    });

    initSupabaseRealtime(storeId);
  },
  loadMultiDayForStore: loadMultiDayForStore,
  setPeriodMode: setPeriodMode,
  openFormatLayoutModal: openFormatLayoutModal,
  closeFormatLayoutModal: closeFormatLayoutModal,
  selectFormatLayoutMode: selectFormatLayoutMode,
  updateLayoutModeUI: updateLayoutModeUI,
  openDateRangePickerModal: openDateRangePickerModal,
  closeDateRangePickerModal: closeDateRangePickerModal,
  selectRangePreset: selectRangePreset,
  applyDateRange: applyDateRange,
  navigateDate: navigateDate,
  closeItemNavBar: function() {
    if (typeof closeItemNavBar === 'function') closeItemNavBar();
  },
  stopSpeaking: function() {
    if (typeof stopSpeaking === 'function') stopSpeaking();
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch(e) {}
    }
  },
  openImportModal: openImportReportDialog,
  closeImportModal: closeImportReportDialog,
  handleFileImport: handleReportFileImport,
  copyRekapFormula: copyRekapFormula,
  setTextSize: setTextSize
};
