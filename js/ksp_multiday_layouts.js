/**
 * KSP Check - Multi-Day Layout Engine Module
 * Mengelola 6 format layout tampilan multi-day yang dapat dikembangkan secara modular:
 * 1. CONTINUOUS   : Mode Kontinu (Hemat ruang, tanggal di kolom waktu)
 * 2. DATE_SECTION : Mode Sekat Tanggal (Sub-header pemisah tanggal dalam tabel)
 * 3. BOOK_SWIPE   : Mode Lembar Buku (Swipe/klik pill tanggal per hari)
 * 4. STACK_DOWN   : Mode Susun ke Bawah (Blok vertikal per hari)
 * 5. APP_DATE     : Mode App & Tanggal Terpisah (Grup per App-Tanggal)
 * 6. SIDE_SPREAD  : Mode Lembar Berdampingan (Kolom berdampingan geser samping)
 */

(function(window) {
  'use strict';

  // Helper tanggal
  function formatDayFull(dateStr) {
    if (!dateStr) return 'Hari Ini';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    } catch(e) { return dateStr; }
  }

  function formatDayShort(dateStr) {
    if (!dateStr) return 'Hari';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    } catch(e) { return dateStr; }
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch(e) { return dateStr; }
  }

  function formatDisplayTime(dateStr, timeStr) {
    if (!dateStr) return timeStr || '00:00';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]} ${timeStr || '00:00'}`;
    }
    return timeStr || '00:00';
  }

  // Registry Konfigurasi 6 Mode Layout
  const MODES = [
    {
      id: 'continuous',
      name: 'Mode Kontinu',
      icon: '📌',
      desc: 'Hemat ruang, tanggal ditampilkan di kolom waktu (01/09 14:30)',
      badge: 'Paling Padat'
    },
    {
      id: 'date_section',
      name: 'Mode Sekat Tanggal',
      icon: '📅',
      desc: 'Sub-header pembatas tanggal rapi di dalam tabel setiap modul',
      badge: 'Kronologis'
    },
    {
      id: 'book_swipe',
      name: 'Mode Lembar Buku',
      icon: '📖',
      desc: 'Pindah halaman per hari dengan baris chip tanggal atau geser layar',
      badge: 'Direkomendasikan'
    },
    {
      id: 'stack_down',
      name: 'Mode Susun ke Bawah',
      icon: '🧱',
      desc: 'Kartu blok bertingkat per hari ditumpuk vertikal dari atas ke bawah',
      badge: 'Blok Vertikal'
    },
    {
      id: 'app_date',
      name: 'Mode App & Tanggal Terpisah',
      icon: '📋',
      desc: 'Kartu modul dikelompokkan per App + Tanggal (BCA 01 Sep, BCA 02 Sep...)',
      badge: 'Audit Bank'
    },
    {
      id: 'side_spread',
      name: 'Mode Lembar Berdampingan',
      icon: '✨',
      desc: 'Kolom per hari berjajar ke samping dengan geser horizontal',
      badge: 'Multi Kolom'
    }
  ];

  const customRenderers = {};

  // ==========================================================================
  // SHARED MODULAR SUB-RENDERERS (TOPUP & VOUCHER)
  // ==========================================================================
  function renderTopupGroupHtml(items, groupTitle, dateAttr, opt, globalSeqRef, totalsRef, timeColFmt) {
    if (!items || items.length === 0) return '';
    let topUpMasuk = 0, topUpKeluar = 0, rowsHtml = '';
    items.forEach(item => {
      totalsRef.totalTrx++;
      const amtCharged = Math.round(item.amount || (item.nominal + (item.fee || 0)) || 0);
      const amtNominal = Math.round(item.nominal || 0);
      topUpMasuk += amtCharged; topUpKeluar += amtNominal;
      totalsRef.totalMasuk += amtCharged; totalsRef.totalKeluar += amtNominal;
      const desc = (item.customerName ? item.customerName + ' - ' : '') + (item.category || 'TopUp') + (item.destination ? ' (' + item.destination + ')' : '');
      const timeVal = timeColFmt ? formatDisplayTime(item.date, item.time) : (item.time || '00:00');
      rowsHtml += opt.renderRowHtml(globalSeqRef.val++, timeVal, amtCharged, true, desc, false, item.orig, item.deleted, item.read, item.isNew, amtNominal, item.fee || 0, item.date || dateAttr);
    });
    const thead = `<thead class="lv-thead"><tr>
      <th class="lv-th c" style="width:36px;">#</th>
      <th class="lv-th c" style="width:${timeColFmt ? '92px' : '65px'};">Waktu</th>
      <th class="lv-th r">Modal (Keluar)</th>
      <th class="lv-th r">Tagihan (Masuk)</th>
    </tr></thead>`;
    const meta = `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(topUpKeluar)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(topUpMasuk)}</span>`;
    const dateDataAttr = dateAttr ? ` data-date="${dateAttr}"` : '';
    const dateLabelSuffix = dateAttr ? ` (${formatDisplayDate(dateAttr)})` : '';
    return `
      <div class="lv-group"${dateDataAttr} data-group-id="topup${dateAttr ? '-' + dateAttr : ''}" data-app-key="topup" data-rekap-label="📱 Modul TopUp${dateLabelSuffix}">
        <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
          <button class="grp-toggle-btn">▼</button>
          <span class="lv-group-icon">📱</span>
          <span class="lv-group-name">${groupTitle || 'TopUp'}</span>
          <span class="grp-done-badge">✓ Selesai</span>
          <span class="lv-group-meta">${meta}</span>
          <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
        </div>
        <div class="lv-group-body"><table class="lv-table">${thead}<tbody>${rowsHtml}</tbody></table></div>
      </div>`;
  }

  function renderVoucherGroupHtml(items, groupTitle, dateAttr, opt, globalSeqRef, totalsRef, timeColFmt) {
    if (!items || items.length === 0) return '';
    let vTotalKeluar = 0, rowsHtml = '';
    items.forEach(item => {
      totalsRef.totalTrx++;
      const amt = Math.round(item.amount || 0);
      vTotalKeluar += amt; totalsRef.totalKeluar += amt;
      const prodName = item.productName || item.provider || 'Voucher';
      const timeVal = timeColFmt ? formatDisplayTime(item.date, item.time) : (item.time || '00:00');
      if (typeof opt.renderVoucherRowHtml === 'function') {
        rowsHtml += opt.renderVoucherRowHtml(globalSeqRef.val++, timeVal, prodName, amt, item.provider || 'VOUCHER', item.orig, item.deleted, item.read, item.isNew, item.cost, item.date || dateAttr);
      } else {
        rowsHtml += opt.renderRowHtml(globalSeqRef.val++, timeVal, amt, false, prodName, true, item.orig, item.deleted, item.read, item.isNew, item.cost || 0, 0, item.date || dateAttr);
      }
    });
    const thead = `<thead class="lv-thead"><tr>
      <th class="lv-th c" style="width:36px;">#</th>
      <th class="lv-th c" style="width:${timeColFmt ? '92px' : '65px'};">Waktu</th>
      <th class="lv-th l">Nama</th>
      <th class="lv-th r" style="width:140px;">Keluar</th>
    </tr></thead>`;
    const meta = `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(vTotalKeluar)}</span>`;
    const dateDataAttr = dateAttr ? ` data-date="${dateAttr}"` : '';
    const dateLabelSuffix = dateAttr ? ` (${formatDisplayDate(dateAttr)})` : '';
    return `
      <div class="lv-group"${dateDataAttr} data-group-id="voucher${dateAttr ? '-' + dateAttr : ''}" data-app-key="voucher" data-rekap-label="🎫 Voucher Fisik${dateLabelSuffix}">
        <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
          <button class="grp-toggle-btn">▼</button>
          <span class="lv-group-icon">🎫</span>
          <span class="lv-group-name">${groupTitle || 'Voucher'}</span>
          <span class="grp-done-badge">✓ Selesai</span>
          <span class="lv-group-meta">${meta}</span>
          <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
        </div>
        <div class="lv-group-body"><table class="lv-table lv-table-voucher">${thead}<tbody>${rowsHtml}</tbody></table></div>
      </div>`;
  }

  // ==========================================================================
  // RENDERER 1: CONTINUOUS MODE (Hemat Ruang)
  // ==========================================================================
  function renderContinuous(container, data, opt) {
    container.classList.add('layout-continuous');
    let totalMasuk = 0, totalKeluar = 0, totalTrx = 0;
    const globalSeqObj = { val: 1 };
    const totalsObj = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };

    // 1. Tarik Tunai
    if (data.tarik && data.tarik.length > 0) {
      let tarikMasuk = 0, tarikKeluar = 0;
      const isOutcomeOnly = data.tarik.every(item => String(item.type || '').toLowerCase() !== 'income');
      let rowsHtml = '';

      data.tarik.forEach(item => {
        totalTrx++;
        const amt = Math.round(item.amount || item.jumtar || 0);
        const isIncome = String(item.type || '').toLowerCase() === 'income';
        if (isIncome) { tarikMasuk += amt; totalMasuk += amt; } else { tarikKeluar += amt; totalKeluar += amt; }
        const desc = item.name || item.desc || item.app || 'Tarik Tunai';
        const timeFmt = formatDisplayTime(item.date, item.time);
        const jumtar = item.jumtar || amt;
        const adm = item.adm || 0;
        rowsHtml += opt.renderRowHtml(globalSeqObj.val++, timeFmt, amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, jumtar, adm, item.date);
      });

      const theadHtml = isOutcomeOnly
        ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c time-col" style="width:92px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
        : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c time-col" style="width:92px;">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

      const metaHtml = isOutcomeOnly
        ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(tarikKeluar)}</span>`
        : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(tarikKeluar)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(tarikMasuk)}</span>`;

      container.innerHTML += `
        <div class="lv-group" data-group-id="tarik" data-app-key="tarik" data-rekap-label="💸 Tarik Tunai">
          <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
            <button class="grp-toggle-btn">▼</button>
            <span class="lv-group-icon">💸</span>
            <span class="lv-group-name">Tarik</span>
            <span class="grp-done-badge">✓ Selesai</span>
            <span class="lv-group-meta">${metaHtml}</span>
            <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
          </div>
          <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
        </div>`;
    }

    // 2. Notifikasi Bank / E-Wallet
    if (data.notif && data.notif.length > 0) {
      const notifByApp = {};
      data.notif.forEach(n => {
        const app = n.app || 'other';
        if (!notifByApp[app]) notifByApp[app] = [];
        notifByApp[app].push(n);
      });

      for (const appKey of Object.keys(notifByApp).sort()) {
        const items = notifByApp[appKey];
        const displayName = items[0].appName || appKey;
        const icon = opt.getAppIcon(appKey);
        const isOutcomeOnly = items.every(item => String(item.category || '').toLowerCase() !== 'income');
        let aIn = 0, aOut = 0, rowsHtml = '';

        items.forEach(item => {
          totalTrx++;
          const amt = Math.round(item.amount || 0);
          const isIncome = String(item.category || '').toLowerCase() === 'income';
          if (isIncome) { aIn += amt; totalMasuk += amt; } else { aOut += amt; totalKeluar += amt; }
          const desc = item.desc || item.name || displayName;
          const timeFmt = formatDisplayTime(item.date, item.time);
          rowsHtml += opt.renderRowHtml(globalSeqObj.val++, timeFmt, amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, amt, 0, item.date);
        });

        const theadHtml = isOutcomeOnly
          ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c time-col" style="width:92px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
          : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c time-col" style="width:92px;">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(aOut)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(aOut)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(aIn)}</span>`;

        container.innerHTML += `
          <div class="lv-group" data-group-id="notif-${appKey}" data-app-key="${appKey}" data-rekap-label="${icon} ${displayName}">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn">▼</button>
              <span class="lv-group-icon">${icon}</span>
              <span class="lv-group-name">${displayName}</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${metaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
            </div>
            <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }
    }

    // 3. TopUp
    if (data.topup && data.topup.length > 0) {
      container.innerHTML += renderTopupGroupHtml(data.topup, 'TopUp', null, opt, globalSeqObj, totalsObj, true);
      totalMasuk += totalsObj.totalMasuk;
      totalKeluar += totalsObj.totalKeluar;
      totalTrx += totalsObj.totalTrx;
    }

    // 4. Voucher
    if (data.voucher && data.voucher.length > 0) {
      const vTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
      container.innerHTML += renderVoucherGroupHtml(data.voucher, 'Voucher', null, opt, globalSeqObj, vTotals, true);
      totalKeluar += vTotals.totalKeluar;
      totalTrx += vTotals.totalTrx;
    }

    return { totalMasuk, totalKeluar, totalTrx };
  }

  // ==========================================================================
  // RENDERER 2: DATE SECTION MODE (Sub-Header Tanggal dalam Tabel)
  // ==========================================================================
  function renderDateSection(container, data, opt) {
    let totalMasuk = 0, totalKeluar = 0, totalTrx = 0;
    const globalSeqObj = { val: 1 };

    // 1. Tarik Tunai
    if (data.tarik && data.tarik.length > 0) {
      const byDate = {};
      data.tarik.forEach(item => {
        const d = item.date || '0000-00-00';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(item);
      });

      let tarikMasuk = 0, tarikKeluar = 0;
      const isOutcomeOnly = data.tarik.every(item => String(item.type || '').toLowerCase() !== 'income');
      let rowsHtml = '';

      for (const dKey of Object.keys(byDate).sort()) {
        const items = byDate[dKey];
        let dayIn = 0, dayOut = 0, dayRows = '';

        items.forEach(item => {
          totalTrx++;
          const amt = Math.round(item.amount || item.jumtar || 0);
          const isIncome = String(item.type || '').toLowerCase() === 'income';
          if (isIncome) { dayIn += amt; tarikMasuk += amt; totalMasuk += amt; } else { dayOut += amt; tarikKeluar += amt; totalKeluar += amt; }
          const desc = item.name || item.desc || item.app || 'Tarik Tunai';
          const jumtar = item.jumtar || amt;
          const adm = item.adm || 0;
          dayRows += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, jumtar, adm, dKey);
        });

        const dayMetaStr = isOutcomeOnly
          ? `${items.length} trx · Keluar: ${opt.fmtAmt(dayOut)}`
          : `${items.length} trx · Keluar: ${opt.fmtAmt(dayOut)} | Masuk: ${opt.fmtAmt(dayIn)}`;

        rowsHtml += `
          <tr class="lv-date-subhd-row" data-date="${dKey}">
            <td colspan="4" class="lv-date-subhd">
              <div class="lv-date-subhd-inner">
                <span class="lv-date-subhd-title">📅 ${formatDisplayDate(dKey)}</span>
                <span class="lv-date-subhd-meta">${dayMetaStr}</span>
              </div>
            </td>
          </tr>` + dayRows;
      }

      const theadHtml = isOutcomeOnly
        ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
        : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

      const metaHtml = isOutcomeOnly
        ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(tarikKeluar)}</span>`
        : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(tarikKeluar)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(tarikMasuk)}</span>`;

      container.innerHTML += `
        <div class="lv-group" data-group-id="tarik" data-app-key="tarik" data-rekap-label="💸 Tarik Tunai">
          <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
            <button class="grp-toggle-btn">▼</button>
            <span class="lv-group-icon">💸</span>
            <span class="lv-group-name">Tarik</span>
            <span class="grp-done-badge">✓ Selesai</span>
            <span class="lv-group-meta">${metaHtml}</span>
            <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
          </div>
          <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
        </div>`;
    }

    // 2. Notifikasi Bank
    if (data.notif && data.notif.length > 0) {
      const notifByApp = {};
      data.notif.forEach(n => {
        const app = n.app || 'other';
        if (!notifByApp[app]) notifByApp[app] = [];
        notifByApp[app].push(n);
      });

      for (const appKey of Object.keys(notifByApp).sort()) {
        const appItems = notifByApp[appKey];
        const displayName = appItems[0].appName || appKey;
        const icon = opt.getAppIcon(appKey);
        const isOutcomeOnly = appItems.every(item => String(item.category || '').toLowerCase() !== 'income');
        let aIn = 0, aOut = 0;

        const byDate = {};
        appItems.forEach(item => {
          const d = item.date || '0000-00-00';
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(item);
        });

        let rowsHtml = '';
        for (const dKey of Object.keys(byDate).sort()) {
          const items = byDate[dKey];
          let dayIn = 0, dayOut = 0, dayRows = '';

          items.forEach(item => {
            totalTrx++;
            const amt = Math.round(item.amount || 0);
            const isIncome = String(item.category || '').toLowerCase() === 'income';
            if (isIncome) { dayIn += amt; aIn += amt; totalMasuk += amt; } else { dayOut += amt; aOut += amt; totalKeluar += amt; }
            const desc = item.desc || item.name || displayName;
            dayRows += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, amt, 0, dKey);
          });

          const dayMetaStr = isOutcomeOnly
            ? `${items.length} trx · Keluar: ${opt.fmtAmt(dayOut)}`
            : `${items.length} trx · Keluar: ${opt.fmtAmt(dayOut)} | Masuk: ${opt.fmtAmt(dayIn)}`;

          rowsHtml += `
            <tr class="lv-date-subhd-row" data-date="${dKey}">
              <td colspan="4" class="lv-date-subhd">
                <div class="lv-date-subhd-inner">
                  <span class="lv-date-subhd-title">📅 ${formatDisplayDate(dKey)}</span>
                  <span class="lv-date-subhd-meta">${dayMetaStr}</span>
                </div>
              </td>
            </tr>` + dayRows;
        }

        const theadHtml = isOutcomeOnly
          ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
          : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(aOut)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(aOut)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(aIn)}</span>`;

        container.innerHTML += `
          <div class="lv-group" data-group-id="notif-${appKey}" data-app-key="${appKey}" data-rekap-label="${icon} ${displayName}">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn">▼</button>
              <span class="lv-group-icon">${icon}</span>
              <span class="lv-group-name">${displayName}</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${metaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
            </div>
            <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }
    }

    // 3. TopUp
    if (data.topup && data.topup.length > 0) {
      const byDate = {};
      data.topup.forEach(item => {
        const d = item.date || '0000-00-00';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(item);
      });
      let tMasuk = 0, tKeluar = 0, rowsHtml = '';
      for (const dKey of Object.keys(byDate).sort()) {
        const items = byDate[dKey];
        let dayIn = 0, dayOut = 0, dayRows = '';
        items.forEach(item => {
          totalTrx++;
          const amtCharged = Math.round(item.amount || (item.nominal + (item.fee || 0)) || 0);
          const amtNominal = Math.round(item.nominal || 0);
          dayIn += amtCharged; dayOut += amtNominal;
          tMasuk += amtCharged; tKeluar += amtNominal;
          totalMasuk += amtCharged; totalKeluar += amtNominal;
          const desc = (item.customerName ? item.customerName + ' - ' : '') + (item.category || 'TopUp') + (item.destination ? ' (' + item.destination + ')' : '');
          dayRows += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amtCharged, true, desc, false, item.orig, item.deleted, item.read, item.isNew, amtNominal, item.fee || 0, dKey);
        });
        rowsHtml += `
          <tr class="lv-date-subhd-row" data-date="${dKey}">
            <td colspan="4" class="lv-date-subhd">
              <div class="lv-date-subhd-inner">
                <span class="lv-date-subhd-title">📅 ${formatDisplayDate(dKey)}</span>
                <span class="lv-date-subhd-meta">${items.length} trx · Modal: ${opt.fmtAmt(dayOut)} | Tagihan: ${opt.fmtAmt(dayIn)}</span>
              </div>
            </td>
          </tr>` + dayRows;
      }
      container.innerHTML += `
        <div class="lv-group" data-group-id="topup" data-app-key="topup" data-rekap-label="📱 Modul TopUp">
          <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
            <button class="grp-toggle-btn">▼</button>
            <span class="lv-group-icon">📱</span>
            <span class="lv-group-name">TopUp</span>
            <span class="grp-done-badge">✓ Selesai</span>
            <span class="lv-group-meta"><span class="grp-meta-keluar" style="color:var(--outcome)">${opt.fmtAmt(tKeluar)}</span> / <span class="grp-meta-masuk" style="color:var(--income)">${opt.fmtAmt(tMasuk)}</span></span>
            <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
          </div>
          <div class="lv-group-body"><table class="lv-table"><thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th r">Modal</th><th class="lv-th r">Tagihan</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        </div>`;
    }

    // 4. Voucher
    if (data.voucher && data.voucher.length > 0) {
      const byDate = {};
      data.voucher.forEach(item => {
        const d = item.date || '0000-00-00';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(item);
      });
      let vTotalKeluar = 0, rowsHtml = '';
      for (const dKey of Object.keys(byDate).sort()) {
        const items = byDate[dKey];
        let dayOut = 0, dayRows = '';
        items.forEach(item => {
          totalTrx++;
          const amt = Math.round(item.amount || 0);
          dayOut += amt; vTotalKeluar += amt; totalKeluar += amt;
          const prodName = item.productName || item.provider || 'Voucher';
          if (typeof opt.renderVoucherRowHtml === 'function') {
            dayRows += opt.renderVoucherRowHtml(globalSeqObj.val++, item.time || '00:00', prodName, amt, item.provider || 'VOUCHER', item.orig, item.deleted, item.read, item.isNew, item.cost, dKey);
          } else {
            dayRows += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, false, prodName, true, item.orig, item.deleted, item.read, item.isNew, item.cost || 0, 0, dKey);
          }
        });
        rowsHtml += `
          <tr class="lv-date-subhd-row" data-date="${dKey}">
            <td colspan="4" class="lv-date-subhd">
              <div class="lv-date-subhd-inner">
                <span class="lv-date-subhd-title">📅 ${formatDisplayDate(dKey)}</span>
                <span class="lv-date-subhd-meta">${items.length} item · Keluar: ${opt.fmtAmt(dayOut)}</span>
              </div>
            </td>
          </tr>` + dayRows;
      }
      container.innerHTML += `
        <div class="lv-group" data-group-id="voucher" data-app-key="voucher" data-rekap-label="🎫 Voucher Fisik">
          <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
            <button class="grp-toggle-btn">▼</button>
            <span class="lv-group-icon">🎫</span>
            <span class="lv-group-name">Voucher</span>
            <span class="grp-done-badge">✓ Selesai</span>
            <span class="lv-group-meta"><span class="grp-meta-keluar" style="color:var(--outcome)">${opt.fmtAmt(vTotalKeluar)}</span></span>
            <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
          </div>
          <div class="lv-group-body"><table class="lv-table lv-table-voucher"><thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        </div>`;
    }

    return { totalMasuk, totalKeluar, totalTrx };
  }

  // ==========================================================================
  // RENDERER 3: BOOK SWIPE MODE (Lembar Buku Per Hari)
  // ==========================================================================
  function renderBookSwipe(container, data, opt) {
    let totalMasuk = 0, totalKeluar = 0, totalTrx = 0;
    const globalSeqObj = { val: 1 };

    // Kumpulkan seluruh tanggal yang ada transaksi
    const dateSet = new Set();
    if (data.tarik) data.tarik.forEach(t => { if (t.date) dateSet.add(t.date); });
    if (data.notif) data.notif.forEach(n => { if (n.date) dateSet.add(n.date); });
    if (data.topup) data.topup.forEach(u => { if (u.date) dateSet.add(u.date); });
    if (data.voucher) data.voucher.forEach(v => { if (v.date) dateSet.add(v.date); });
    const dates = Array.from(dateSet).sort();

    if (dates.length === 0) {
      dates.push(data.startDate || 'Hari Ini');
    }

    // Buat Nav Pills di atas
    let pillsHtml = dates.map((d, idx) => `
      <button class="book-pill-btn ${idx === 0 ? 'active' : ''}" data-date="${d}" onclick="window.KspMultiDayLayouts.goToBookDate('${d}')">
        ${formatDayShort(d)}
      </button>
    `).join('');

    const navBarHtml = `
      <div class="book-nav-bar" id="bookNavBar">
        <button class="book-nav-arrow" onclick="window.KspMultiDayLayouts.prevBookDate()" title="Hari Sebelumnya">◀</button>
        <div class="book-nav-pills" id="bookNavPills">${pillsHtml}</div>
        <button class="book-nav-arrow" onclick="window.KspMultiDayLayouts.nextBookDate()" title="Hari Berikutnya">▶</button>
      </div>`;

    container.innerHTML = navBarHtml;

    // Carousel container
    const carousel = document.createElement('div');
    carousel.className = 'book-carousel';
    carousel.id = 'bookCarousel';

    dates.forEach(dKey => {
      const pageEl = document.createElement('div');
      pageEl.className = 'book-page';
      pageEl.dataset.date = dKey;

      let dayIn = 0, dayOut = 0, dayTrx = 0;
      let dayGroupsHtml = '';

      // Tarik untuk hari ini
      const dayTarik = (data.tarik || []).filter(item => (item.date || '') === dKey);
      if (dayTarik.length > 0) {
        let tMasuk = 0, tKeluar = 0;
        const isOutcomeOnly = dayTarik.every(item => String(item.type || '').toLowerCase() !== 'income');
        let rowsHtml = '';

        dayTarik.forEach(item => {
          totalTrx++; dayTrx++;
          const amt = Math.round(item.amount || item.jumtar || 0);
          const isIncome = String(item.type || '').toLowerCase() === 'income';
          if (isIncome) { tMasuk += amt; dayIn += amt; totalMasuk += amt; } else { tKeluar += amt; dayOut += amt; totalKeluar += amt; }
          const desc = item.name || item.desc || item.app || 'Tarik Tunai';
          const jumtar = item.jumtar || amt;
          const adm = item.adm || 0;
          rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, jumtar, adm, dKey);
        });

        const theadHtml = isOutcomeOnly
          ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
          : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(tKeluar)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(tKeluar)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(tMasuk)}</span>`;

        dayGroupsHtml += `
          <div class="lv-group" data-date="${dKey}" data-group-id="tarik-${dKey}" data-app-key="tarik" data-rekap-label="💸 Tarik Tunai">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn">▼</button>
              <span class="lv-group-icon">💸</span>
              <span class="lv-group-name">Tarik</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${metaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
            </div>
            <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }

      // Notif untuk hari ini
      const dayNotif = (data.notif || []).filter(item => (item.date || '') === dKey);
      if (dayNotif.length > 0) {
        const notifByApp = {};
        dayNotif.forEach(n => {
          const app = n.app || 'other';
          if (!notifByApp[app]) notifByApp[app] = [];
          notifByApp[app].push(n);
        });

        for (const appKey of Object.keys(notifByApp).sort()) {
          const items = notifByApp[appKey];
          const displayName = items[0].appName || appKey;
          const icon = opt.getAppIcon(appKey);
          const isOutcomeOnly = items.every(item => String(item.category || '').toLowerCase() !== 'income');
          let aIn = 0, aOut = 0, rowsHtml = '';

          items.forEach(item => {
            totalTrx++; dayTrx++;
            const amt = Math.round(item.amount || 0);
            const isIncome = String(item.category || '').toLowerCase() === 'income';
            if (isIncome) { aIn += amt; dayIn += amt; totalMasuk += amt; } else { aOut += amt; dayOut += amt; totalKeluar += amt; }
            const desc = item.desc || item.name || displayName;
            rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, amt, 0, dKey);
          });

          const theadHtml = isOutcomeOnly
            ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
            : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

          const metaHtml = isOutcomeOnly
            ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(aOut)}</span>`
            : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(aOut)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(aIn)}</span>`;

          dayGroupsHtml += `
            <div class="lv-group" data-date="${dKey}" data-group-id="notif-${appKey}-${dKey}" data-app-key="${appKey}" data-rekap-label="${icon} ${displayName}">
              <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
                <button class="grp-toggle-btn">▼</button>
                <span class="lv-group-icon">${icon}</span>
                <span class="lv-group-name">${displayName}</span>
                <span class="grp-done-badge">✓ Selesai</span>
                <span class="lv-group-meta">${metaHtml}</span>
                <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
              </div>
              <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
            </div>`;
        }
      }

      // TopUp untuk hari ini
      const dayTopup = (data.topup || []).filter(item => (item.date || '') === dKey);
      if (dayTopup.length > 0) {
        const tTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        dayGroupsHtml += renderTopupGroupHtml(dayTopup, 'TopUp', dKey, opt, globalSeqObj, tTotals, false);
        dayIn += tTotals.totalMasuk; dayOut += tTotals.totalKeluar; dayTrx += tTotals.totalTrx;
        totalMasuk += tTotals.totalMasuk; totalKeluar += tTotals.totalKeluar; totalTrx += tTotals.totalTrx;
      }

      // Voucher untuk hari ini
      const dayVoucher = (data.voucher || []).filter(item => (item.date || '') === dKey);
      if (dayVoucher.length > 0) {
        const vTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        dayGroupsHtml += renderVoucherGroupHtml(dayVoucher, 'Voucher', dKey, opt, globalSeqObj, vTotals, false);
        dayOut += vTotals.totalKeluar; dayTrx += vTotals.totalTrx;
        totalKeluar += vTotals.totalKeluar; totalTrx += vTotals.totalTrx;
      }

      const dayHeaderHtml = `
        <div class="book-page-hd">
          <div class="book-page-hd-title">📅 ${formatDayFull(dKey)}</div>
          <div class="book-page-hd-meta">
            ${dayTrx} trx · Keluar: <b style="color:var(--outcome)">${opt.fmtAmt(dayOut)}</b> | Masuk: <b style="color:var(--income)">${opt.fmtAmt(dayIn)}</b>
          </div>
        </div>`;

      pageEl.innerHTML = dayHeaderHtml + dayGroupsHtml;
      carousel.appendChild(pageEl);
    });

    container.appendChild(carousel);

    // Observer pill scroll sync
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const date = entry.target.dataset.date;
            document.querySelectorAll('#bookNavPills .book-pill-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.date === date);
            });
          }
        });
      }, { root: carousel, threshold: 0.5 });

      carousel.querySelectorAll('.book-page').forEach(page => observer.observe(page));
    }

    return { totalMasuk, totalKeluar, totalTrx };
  }

  // ==========================================================================
  // RENDERER 4: STACK DOWN MODE (Susun ke Bawah Per Hari)
  // ==========================================================================
  function renderStackDown(container, data, opt) {
    let totalMasuk = 0, totalKeluar = 0, totalTrx = 0;
    const globalSeqObj = { val: 1 };

    const dateSet = new Set();
    if (data.tarik) data.tarik.forEach(t => { if (t.date) dateSet.add(t.date); });
    if (data.notif) data.notif.forEach(n => { if (n.date) dateSet.add(n.date); });
    if (data.topup) data.topup.forEach(u => { if (u.date) dateSet.add(u.date); });
    if (data.voucher) data.voucher.forEach(v => { if (v.date) dateSet.add(v.date); });
    const dates = Array.from(dateSet).sort();

    dates.forEach(dKey => {
      let dayIn = 0, dayOut = 0, dayTrx = 0;
      let dayGroupsHtml = '';

      // Tarik hari ini
      const dayTarik = (data.tarik || []).filter(item => (item.date || '') === dKey);
      if (dayTarik.length > 0) {
        let tMasuk = 0, tKeluar = 0;
        const isOutcomeOnly = dayTarik.every(item => String(item.type || '').toLowerCase() !== 'income');
        let rowsHtml = '';

        dayTarik.forEach(item => {
          totalTrx++; dayTrx++;
          const amt = Math.round(item.amount || item.jumtar || 0);
          const isIncome = String(item.type || '').toLowerCase() === 'income';
          if (isIncome) { tMasuk += amt; dayIn += amt; totalMasuk += amt; } else { tKeluar += amt; dayOut += amt; totalKeluar += amt; }
          const desc = item.name || item.desc || item.app || 'Tarik Tunai';
          const jumtar = item.jumtar || amt;
          const adm = item.adm || 0;
          rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, jumtar, adm, dKey);
        });

        const theadHtml = isOutcomeOnly
          ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
          : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(tKeluar)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(tKeluar)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(tMasuk)}</span>`;

        dayGroupsHtml += `
          <div class="lv-group" data-date="${dKey}" data-group-id="tarik-${dKey}" data-app-key="tarik" data-rekap-label="💸 Tarik Tunai">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn">▼</button>
              <span class="lv-group-icon">💸</span>
              <span class="lv-group-name">Tarik</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${metaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
            </div>
            <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }

      // Notif hari ini
      const dayNotif = (data.notif || []).filter(item => (item.date || '') === dKey);
      if (dayNotif.length > 0) {
        const notifByApp = {};
        dayNotif.forEach(n => {
          const app = n.app || 'other';
          if (!notifByApp[app]) notifByApp[app] = [];
          notifByApp[app].push(n);
        });

        for (const appKey of Object.keys(notifByApp).sort()) {
          const items = notifByApp[appKey];
          const displayName = items[0].appName || appKey;
          const icon = opt.getAppIcon(appKey);
          const isOutcomeOnly = items.every(item => String(item.category || '').toLowerCase() !== 'income');
          let aIn = 0, aOut = 0, rowsHtml = '';

          items.forEach(item => {
            totalTrx++; dayTrx++;
            const amt = Math.round(item.amount || 0);
            const isIncome = String(item.category || '').toLowerCase() === 'income';
            if (isIncome) { aIn += amt; dayIn += amt; totalMasuk += amt; } else { aOut += amt; dayOut += amt; totalKeluar += amt; }
            const desc = item.desc || item.name || displayName;
            rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, amt, 0, dKey);
          });

          const theadHtml = isOutcomeOnly
            ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
            : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

          const metaHtml = isOutcomeOnly
            ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(aOut)}</span>`
            : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(aOut)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(aIn)}</span>`;

          dayGroupsHtml += `
            <div class="lv-group" data-date="${dKey}" data-group-id="notif-${appKey}-${dKey}" data-app-key="${appKey}" data-rekap-label="${icon} ${displayName}">
              <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
                <button class="grp-toggle-btn">▼</button>
                <span class="lv-group-icon">${icon}</span>
                <span class="lv-group-name">${displayName}</span>
                <span class="grp-done-badge">✓ Selesai</span>
                <span class="lv-group-meta">${metaHtml}</span>
                <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
              </div>
              <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
            </div>`;
        }
      }

      // TopUp hari ini
      const dayTopup = (data.topup || []).filter(item => (item.date || '') === dKey);
      if (dayTopup.length > 0) {
        const tTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        dayGroupsHtml += renderTopupGroupHtml(dayTopup, 'TopUp', dKey, opt, globalSeqObj, tTotals, false);
        dayIn += tTotals.totalMasuk; dayOut += tTotals.totalKeluar; dayTrx += tTotals.totalTrx;
        totalMasuk += tTotals.totalMasuk; totalKeluar += tTotals.totalKeluar; totalTrx += tTotals.totalTrx;
      }

      // Voucher hari ini
      const dayVoucher = (data.voucher || []).filter(item => (item.date || '') === dKey);
      if (dayVoucher.length > 0) {
        const vTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        dayGroupsHtml += renderVoucherGroupHtml(dayVoucher, 'Voucher', dKey, opt, globalSeqObj, vTotals, false);
        dayOut += vTotals.totalKeluar; dayTrx += vTotals.totalTrx;
        totalKeluar += vTotals.totalKeluar; totalTrx += vTotals.totalTrx;
      }

      container.innerHTML += `
        <div class="stack-day-card" data-date="${dKey}">
          <div class="stack-day-hd" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="stack-day-title">📅 ${formatDayFull(dKey)}</span>
            <span class="stack-day-meta">
              ${dayTrx} trx · Keluar: <b style="color:var(--outcome)">${opt.fmtAmt(dayOut)}</b> | Masuk: <b style="color:var(--income)">${opt.fmtAmt(dayIn)}</b>
            </span>
          </div>
          <div class="stack-day-content">${dayGroupsHtml}</div>
        </div>`;
    });

    return { totalMasuk, totalKeluar, totalTrx };
  }

  // ==========================================================================
  // RENDERER 5: APP DATE MODE (Grup Per App + Tanggal Terpisah)
  // ==========================================================================
  function renderAppDate(container, data, opt) {
    let totalMasuk = 0, totalKeluar = 0, totalTrx = 0;
    const globalSeqObj = { val: 1 };

    // 1. Tarik per Tanggal
    if (data.tarik && data.tarik.length > 0) {
      const byDate = {};
      data.tarik.forEach(item => {
        const d = item.date || '0000-00-00';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(item);
      });

      for (const dKey of Object.keys(byDate).sort()) {
        const items = byDate[dKey];
        let dayIn = 0, dayOut = 0, rowsHtml = '';
        const isOutcomeOnly = items.every(item => String(item.type || '').toLowerCase() !== 'income');

        items.forEach(item => {
          totalTrx++;
          const amt = Math.round(item.amount || item.jumtar || 0);
          const isIncome = String(item.type || '').toLowerCase() === 'income';
          if (isIncome) { dayIn += amt; totalMasuk += amt; } else { dayOut += amt; totalKeluar += amt; }
          const desc = item.name || item.desc || item.app || 'Tarik Tunai';
          const jumtar = item.jumtar || amt;
          const adm = item.adm || 0;
          rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, jumtar, adm, dKey);
        });

        const theadHtml = isOutcomeOnly
          ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
          : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(dayOut)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(dayOut)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(dayIn)}</span>`;

        container.innerHTML += `
          <div class="lv-group" data-date="${dKey}" data-group-id="tarik-${dKey}" data-app-key="tarik" data-rekap-label="💸 Tarik (${formatDisplayDate(dKey)})">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn">▼</button>
              <span class="lv-group-icon">💸</span>
              <span class="lv-group-name">Tarik <span class="lv-group-date-badge">${formatDayShort(dKey)}</span></span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${metaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
            </div>
            <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }
    }

    // 2. Notif per App + Tanggal
    if (data.notif && data.notif.length > 0) {
      const byAppDate = {};
      data.notif.forEach(n => {
        const app = n.app || 'other';
        const d = n.date || '0000-00-00';
        const key = `${app}__${d}`;
        if (!byAppDate[key]) byAppDate[key] = { appKey: app, date: d, items: [] };
        byAppDate[key].items.push(n);
      });

      for (const k of Object.keys(byAppDate).sort()) {
        const group = byAppDate[k];
        const appKey = group.appKey;
        const dKey = group.date;
        const items = group.items;
        const displayName = items[0].appName || appKey;
        const icon = opt.getAppIcon(appKey);
        const isOutcomeOnly = items.every(item => String(item.category || '').toLowerCase() !== 'income');
        let aIn = 0, aOut = 0, rowsHtml = '';

        items.forEach(item => {
          totalTrx++;
          const amt = Math.round(item.amount || 0);
          const isIncome = String(item.category || '').toLowerCase() === 'income';
          if (isIncome) { aIn += amt; totalMasuk += amt; } else { aOut += amt; totalKeluar += amt; }
          const desc = item.desc || item.name || displayName;
          rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, amt, 0, dKey);
        });

        const theadHtml = isOutcomeOnly
          ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
          : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(aOut)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(aOut)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(aIn)}</span>`;

        container.innerHTML += `
          <div class="lv-group" data-date="${dKey}" data-group-id="notif-${appKey}-${dKey}" data-app-key="${appKey}" data-rekap-label="${icon} ${displayName} (${formatDisplayDate(dKey)})">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn">▼</button>
              <span class="lv-group-icon">${icon}</span>
              <span class="lv-group-name">${displayName} <span class="lv-group-date-badge">${formatDayShort(dKey)}</span></span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${metaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
            </div>
            <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }
    }

    // 3. TopUp per Tanggal
    if (data.topup && data.topup.length > 0) {
      const byDate = {};
      data.topup.forEach(item => {
        const d = item.date || '0000-00-00';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(item);
      });
      for (const dKey of Object.keys(byDate).sort()) {
        const items = byDate[dKey];
        const tTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        container.innerHTML += renderTopupGroupHtml(items, `TopUp <span class="lv-group-date-badge">${formatDayShort(dKey)}</span>`, dKey, opt, globalSeqObj, tTotals, false);
        totalMasuk += tTotals.totalMasuk; totalKeluar += tTotals.totalKeluar; totalTrx += tTotals.totalTrx;
      }
    }

    // 4. Voucher per Tanggal
    if (data.voucher && data.voucher.length > 0) {
      const byDate = {};
      data.voucher.forEach(item => {
        const d = item.date || '0000-00-00';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(item);
      });
      for (const dKey of Object.keys(byDate).sort()) {
        const items = byDate[dKey];
        const vTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        container.innerHTML += renderVoucherGroupHtml(items, `Voucher <span class="lv-group-date-badge">${formatDayShort(dKey)}</span>`, dKey, opt, globalSeqObj, vTotals, false);
        totalKeluar += vTotals.totalKeluar; totalTrx += vTotals.totalTrx;
      }
    }

    return { totalMasuk, totalKeluar, totalTrx };
  }

  // ==========================================================================
  // RENDERER 6: SIDE SPREAD MODE (Kolom Berdampingan Geser Samping)
  // ==========================================================================
  function renderSideSpread(container, data, opt) {
    let totalMasuk = 0, totalKeluar = 0, totalTrx = 0;
    const globalSeqObj = { val: 1 };

    const dateSet = new Set();
    if (data.tarik) data.tarik.forEach(t => { if (t.date) dateSet.add(t.date); });
    if (data.notif) data.notif.forEach(n => { if (n.date) dateSet.add(n.date); });
    if (data.topup) data.topup.forEach(u => { if (u.date) dateSet.add(u.date); });
    if (data.voucher) data.voucher.forEach(v => { if (v.date) dateSet.add(v.date); });
    const dates = Array.from(dateSet).sort();

    let sheetsHtml = '';
    dates.forEach((dKey) => {
      let dayIn = 0, dayOut = 0, dayTrx = 0;
      let dayGroupsHtml = '';

      // Tarik hari ini
      const dayTarik = (data.tarik || []).filter(item => (item.date || '') === dKey);
      if (dayTarik.length > 0) {
        let tMasuk = 0, tKeluar = 0;
        const isOutcomeOnly = dayTarik.every(item => String(item.type || '').toLowerCase() !== 'income');
        let rowsHtml = '';

        dayTarik.forEach(item => {
          totalTrx++; dayTrx++;
          const amt = Math.round(item.amount || item.jumtar || 0);
          const isIncome = String(item.type || '').toLowerCase() === 'income';
          if (isIncome) { tMasuk += amt; dayIn += amt; totalMasuk += amt; } else { tKeluar += amt; dayOut += amt; totalKeluar += amt; }
          const desc = item.name || item.desc || item.app || 'Tarik Tunai';
          const jumtar = item.jumtar || amt;
          const adm = item.adm || 0;
          rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, jumtar, adm, dKey);
        });

        const theadHtml = isOutcomeOnly
          ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
          : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

        const metaHtml = isOutcomeOnly
          ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(tKeluar)}</span>`
          : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(tKeluar)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(tMasuk)}</span>`;

        dayGroupsHtml += `
          <div class="lv-group" data-date="${dKey}" data-group-id="tarik-${dKey}" data-app-key="tarik" data-rekap-label="💸 Tarik Tunai">
            <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
              <button class="grp-toggle-btn">▼</button>
              <span class="lv-group-icon">💸</span>
              <span class="lv-group-name">Tarik</span>
              <span class="grp-done-badge">✓ Selesai</span>
              <span class="lv-group-meta">${metaHtml}</span>
              <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
            </div>
            <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }

      // Notif hari ini
      const dayNotif = (data.notif || []).filter(item => (item.date || '') === dKey);
      if (dayNotif.length > 0) {
        const notifByApp = {};
        dayNotif.forEach(n => {
          const app = n.app || 'other';
          if (!notifByApp[app]) notifByApp[app] = [];
          notifByApp[app].push(n);
        });

        for (const appKey of Object.keys(notifByApp).sort()) {
          const items = notifByApp[appKey];
          const displayName = items[0].appName || appKey;
          const icon = opt.getAppIcon(appKey);
          const isOutcomeOnly = items.every(item => String(item.category || '').toLowerCase() !== 'income');
          let aIn = 0, aOut = 0, rowsHtml = '';

          items.forEach(item => {
            totalTrx++; dayTrx++;
            const amt = Math.round(item.amount || 0);
            const isIncome = String(item.category || '').toLowerCase() === 'income';
            if (isIncome) { aIn += amt; dayIn += amt; totalMasuk += amt; } else { aOut += amt; dayOut += amt; totalKeluar += amt; }
            const desc = item.desc || item.name || displayName;
            rowsHtml += opt.renderRowHtml(globalSeqObj.val++, item.time || '00:00', amt, isIncome, desc, isOutcomeOnly, item.orig, item.deleted, item.read, item.isNew, amt, 0, dKey);
          });

          const theadHtml = isOutcomeOnly
            ? '<thead class="lv-thead"><tr><th class="lv-th c" style="width:36px;">#</th><th class="lv-th c" style="width:65px;">Waktu</th><th class="lv-th l">Nama</th><th class="lv-th r" style="width:140px;">Keluar</th></tr></thead>'
            : '<thead class="lv-thead"><tr><th class="lv-th c">#</th><th class="lv-th c">Waktu</th><th class="lv-th r">Keluar</th><th class="lv-th r">Masuk</th></tr></thead>';

          const metaHtml = isOutcomeOnly
            ? `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.ringkasMode ? '' : 'Keluar: '}${opt.fmtAmt(aOut)}</span>`
            : `<span class="grp-meta-keluar" onclick="copyGroupValues(this,'outcome',event)" style="color:var(--outcome)">${opt.fmtAmt(aOut)}</span> / <span class="grp-meta-masuk" onclick="copyGroupValues(this,'income',event)" style="color:var(--income)">${opt.fmtAmt(aIn)}</span>`;

          dayGroupsHtml += `
            <div class="lv-group" data-date="${dKey}" data-group-id="notif-${appKey}-${dKey}" data-app-key="${appKey}" data-rekap-label="${icon} ${displayName}">
              <div class="lv-group-hd" onclick="toggleGroupCollapse(this, event)">
                <button class="grp-toggle-btn">▼</button>
                <span class="lv-group-icon">${icon}</span>
                <span class="lv-group-name">${displayName}</span>
                <span class="grp-done-badge">✓ Selesai</span>
                <span class="lv-group-meta">${metaHtml}</span>
                <button class="g-act-btn" onclick="speakGroup(this, event)">🔊</button>
              </div>
              <div class="lv-group-body"><table class="lv-table">${theadHtml}<tbody>${rowsHtml}</tbody></table></div>
            </div>`;
        }
      }

      // TopUp hari ini
      const dayTopup = (data.topup || []).filter(item => (item.date || '') === dKey);
      if (dayTopup.length > 0) {
        const tTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        dayGroupsHtml += renderTopupGroupHtml(dayTopup, 'TopUp', dKey, opt, globalSeqObj, tTotals, false);
        dayIn += tTotals.totalMasuk; dayOut += tTotals.totalKeluar; dayTrx += tTotals.totalTrx;
        totalMasuk += tTotals.totalMasuk; totalKeluar += tTotals.totalKeluar; totalTrx += tTotals.totalTrx;
      }

      // Voucher hari ini
      const dayVoucher = (data.voucher || []).filter(item => (item.date || '') === dKey);
      if (dayVoucher.length > 0) {
        const vTotals = { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };
        dayGroupsHtml += renderVoucherGroupHtml(dayVoucher, 'Voucher', dKey, opt, globalSeqObj, vTotals, false);
        dayOut += vTotals.totalKeluar; dayTrx += vTotals.totalTrx;
        totalKeluar += vTotals.totalKeluar; totalTrx += vTotals.totalTrx;
      }

      sheetsHtml += `
        <div class="spread-sheet-col" data-date="${dKey}">
          <div class="spread-sheet-hd">
            <span class="spread-sheet-title">📅 ${formatDayShort(dKey)}</span>
            <span class="spread-sheet-meta">${dayTrx} trx</span>
          </div>
          <div class="spread-sheet-body">${dayGroupsHtml}</div>
        </div>`;
    });

    container.innerHTML = `
      <div class="spread-horizontal-wrapper">
        <div class="spread-sheets-container">
          ${sheetsHtml}
        </div>
      </div>`;

    return { totalMasuk, totalKeluar, totalTrx };
  }

  // ==========================================================================
  // DISPATCHER UTAMA & API PUBLIK
  // ==========================================================================
  function render(container, data, layoutMode, options) {
    if (!container || !data) return { totalMasuk: 0, totalKeluar: 0, totalTrx: 0 };

    container.className = ''; // Reset custom layout classes
    const mode = layoutMode || 'book_swipe';

    // Custom renderer jika ada pendaftaran mode baru
    if (customRenderers[mode]) {
      return customRenderers[mode](container, data, options);
    }

    switch (mode) {
      case 'continuous':
        return renderContinuous(container, data, options);
      case 'date_section':
        return renderDateSection(container, data, options);
      case 'book_swipe':
        return renderBookSwipe(container, data, options);
      case 'stack_down':
        return renderStackDown(container, data, options);
      case 'app_date':
        return renderAppDate(container, data, options);
      case 'side_spread':
        return renderSideSpread(container, data, options);
      default:
        return renderBookSwipe(container, data, options);
    }
  }

  // Navigasi Book Swipe API
  function goToBookDate(dateStr) {
    const carousel = document.getElementById('bookCarousel');
    if (!carousel) return;
    const page = carousel.querySelector(`.book-page[data-date="${dateStr}"]`);
    if (page) {
      page.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  }

  function prevBookDate() {
    const carousel = document.getElementById('bookCarousel');
    if (!carousel) return;
    carousel.scrollBy({ left: -carousel.offsetWidth, behavior: 'smooth' });
  }

  function nextBookDate() {
    const carousel = document.getElementById('bookCarousel');
    if (!carousel) return;
    carousel.scrollBy({ left: carousel.offsetWidth, behavior: 'smooth' });
  }

  // Extensibility: Memungkinkan penambahan format baru di masa depan
  function registerMode(id, config, renderFn) {
    if (!id || typeof renderFn !== 'function') return;
    MODES.push({
      id: id,
      name: config.name || id,
      icon: config.icon || '📄',
      desc: config.desc || '',
      badge: config.badge || 'Kustom'
    });
    customRenderers[id] = renderFn;
  }

  // Export ke Global Window
  window.KspMultiDayLayouts = {
    MODES: MODES,
    render: render,
    renderContinuous: renderContinuous,
    renderDateSection: renderDateSection,
    renderBookSwipe: renderBookSwipe,
    renderStackDown: renderStackDown,
    renderAppDate: renderAppDate,
    renderSideSpread: renderSideSpread,
    goToBookDate: goToBookDate,
    prevBookDate: prevBookDate,
    nextBookDate: nextBookDate,
    registerMode: registerMode,
    formatDisplayDate: formatDisplayDate,
    formatDayFull: formatDayFull,
    formatDayShort: formatDayShort,
    formatDisplayTime: formatDisplayTime
  };

})(window);
