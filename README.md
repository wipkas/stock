# KSP Check — Stock & Store Management (GitHub Pages)

Aplikasi web statis (PWA) berbasis cloud untuk manajemen stok voucher, order restok, laporan harian, saldo realtime, stok produk, margin, aturan fee, serta pengelolaan toko dan karyawan KSP Check. Data disimpan di Supabase; halaman disajikan lewat GitHub Pages tanpa build step.

🌐 **Live URL**: [https://wipkas.github.io/stock/](https://wipkas.github.io/stock/)

---

## 🗂️ Struktur Proyek

```
stock/
├── index.html                    # Menu utama + gerbang PIN/password (launcher)
├── interactive_stock.html        # Aplikasi stok multi-tab (Order, Riwayat, Laporan, Saldo, Produk, Margin, Fee Rule)
├── store_manager.html            # Admin: kelola cabang, jam shift, karyawan, usulan karyawan
├── store_transactions.html       # Analitik & input transaksi per toko (dibuka dari store_manager / karyawan)
├── karyawan.html                 # Portal kasir/karyawan (login password, profil, usulan)
├── stock_print.html              # Cetak A4 1 lembar & display katalog voucher (Supabase & JSON manual)
├── prototype_store_analytics.html# Prototipe analitik toko (tidak ditaut dari menu)
├── stock_margin.html             # Kalkulator margin mandiri versi lama (tidak ditaut dari menu)
├── config.enc                    # Kredensial Supabase (stok) terenkripsi AES-256-CBC
├── manifest.json                 # Web App Manifest (dihasilkan skrip, jangan edit manual)
├── js/                           # Modul JavaScript bersama (lihat bagian "Modul Bersama")
│   ├── ksp_sync_config.js        #   URL & kunci publishable Supabase untuk sinkronisasi toko
│   ├── ksp_sync.js               #   Klien sinkronisasi cloud (RPC Supabase) + cache offline
│   ├── ksp_auth.js               #   Sesi, PIN admin, login karyawan, logout aman
│   ├── ksp_theme.js              #   Tema gelap/terang
│   └── ksp_ui.js                 #   Utilitas UI (escapeHtml)
├── assets/
│   ├── icons/                    # Ikon PWA (png 192/512 + svg) per tab
│   ├── iconapp/                  # Logo e-wallet (webp)
│   └── manifests/                # Manifest per tab (dihasilkan skrip)
├── scripts/
│   ├── generate_manifests.py     # Pembuat semua manifest dari satu definisi
│   └── generate_tab_icons.py     # Pembuat ikon PNG per tab (Pillow)
└── archive/                      # Versi lama interactive_stock (lihat archive/README.md)
```

---

## 📄 Halaman

| Halaman | Akses | Fungsi |
|---|---|---|
| `index.html` | PIN admin **atau** password karyawan | Menu 9 kartu. Admin melihat semua modul; karyawan langsung diarahkan ke `karyawan.html` |
| `interactive_stock.html` | Lewat menu | Aplikasi stok multi-tab (tabel di bawah) |
| `stock_print.html` | Lewat menu | Cetak daftar harga voucher 1 lembar A4 & katalog display etalase |
| `store_manager.html` | PIN admin | Cabang, shift, karyawan, persetujuan usulan, mutasi/nonaktif karyawan |
| `store_transactions.html` | Admin atau karyawan | Analitik dan transaksi per toko |
| `karyawan.html` | Password karyawan | Portal kasir: profil, foto, usulan ke admin |

### Tab di `interactive_stock.html`

| Tab | Param | Deskripsi |
|---|---|---|
| 🌅 Order Restok | `?tab=order` | Hitung stok menipis/habis dan buat order restok |
| 📊 Riwayat Order | `?tab=history` | Riwayat order dan rekonsiliasi stok masuk |
| 🌙 Laporan Harian | `?tab=daily` | Rekap pergeseran stok, penjualan, dan modal harian |
| 💳 Saldo Realtime | `?tab=balance` | Saldo e-wallet, rekening bank, dan server pulsa |
| 🛍️ Stok Produk | `?tab=produk` | Stok produk fisik, kartu perdana, aksesoris |
| 💹 Margin Voucher | `?tab=margin` | Margin harga modal vs harga jual per provider |
| ⚖️ Fee Rule | `?tab=feerule` | Aturan fee dinamis |

---

## 🔐 Alur Login & Penyimpanan Sesi

`index.html` menerima satu input dan memeriksanya berurutan:

1. **PIN admin** — mendekripsi `config.enc` di browser. Berhasil → sesi admin.
2. **Password karyawan** — dicek ke cloud (RPC `ksp_emp_login`); bila cloud gagal, fallback ke cache lokal. Berhasil → sesi karyawan, redirect ke `karyawan.html`.

| Storage | Kunci | Isi |
|---|---|---|
| localStorage | `kspcheck_viewer_pin` | PIN admin (bila "ingat PIN") |
| localStorage | `kspcheck_stores_data` | Cache data cabang & karyawan |
| localStorage | `kspcheck_sync_dirty` | Penanda ada perubahan lokal belum terkirim |
| localStorage | `kspcheck_theme` | `light` / `dark` |
| sessionStorage | `kspcheck_auth_mode` | `admin` / `employee` |
| sessionStorage | `kspcheck_emp_cred` | Password karyawan sesi aktif |
| sessionStorage | `kspcheck_active_emp` | `{storeId, empId}` karyawan aktif |

**Logout** memakai `KspAuth.clearSession()`. Cache `kspcheck_stores_data` (berisi data karyawan) ikut dihapus **hanya bila** sinkronisasi cloud aktif, tidak ada perubahan yang belum terkirim, dan tidak ada sesi admin lain di perangkat itu — sehingga tidak ada data yang hilang.

> Gerbang di `index.html` hanya mengatur tampilan. Semua halaman adalah file statis; perlindungan data sebenarnya harus ada di sisi server (RLS dan fungsi RPC Supabase).

---

## 🧩 Modul Bersama (`js/`)

Dimuat berurutan, **sebelum** skrip halaman:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js"></script> <!-- hanya bila perlu dekripsi config.enc -->
<script src="js/ksp_sync_config.js?v=20261004"></script>
<script src="js/ksp_sync.js?v=20261004"></script>
<script src="js/ksp_ui.js?v=20261004"></script>
<script src="js/ksp_theme.js?v=20261004"></script>
<script src="js/ksp_auth.js?v=20261004"></script>
```

| Modul | API utama |
|---|---|
| `ksp_ui.js` | `KspUI.escapeHtml(teks)` (alias global `escapeHtml`) |
| `ksp_theme.js` | `KspTheme.apply()`, `toggle()`, `onChange(fn(isLight, reason))`, `registerButtons(ids)`. Alias global `applySavedTheme()` / `toggleTheme()` |
| `ksp_auth.js` | `KspAuth.getAdminPin()`, `setAdminSession(pin)`, `setEmployeeSession(cred, storeId, empId)`, `hasEmployeeSession()`, `decryptConfig(pin)` (melempar Error berpesan jelas), `verifyAdminPin(pin)` (→ config / `null`), `checkEmployeePassword(pass)`, `clearSession({scope, wipeCache})` |
| `ksp_sync.js` | `KspSync.enabled()`, `init(...)`, `adminPull()`, `adminPush()`, `empLogin()`, dll. (membungkus RPC di bawah) |

**Cache-busting:** GitHub Pages meng-cache JS. Setiap kali isi `js/*.js` berubah, naikkan angka `?v=` di semua tag `<script>` yang memuatnya (cari `?v=` di seluruh `*.html`).

**Mengambil contoh pemakaian hook tema** (`store_transactions.html` me-refresh chart hanya saat toggle):

```js
KspTheme.onChange(function (isLight, reason) {
    if (reason !== 'toggle') return;
    // render ulang chart ...
});
```

### Sinkronisasi cloud (RPC Supabase)

`ksp_sync.js` memanggil fungsi berikut di project Supabase yang diatur di `ksp_sync_config.js`:

`ksp_admin_get_stores`, `ksp_admin_save_stores`, `ksp_admin_delete_store`, `ksp_admin_transfer_employee`, `ksp_admin_deactivate_employee`, `ksp_admin_get_all_employees`, `ksp_emp_login`, `ksp_emp_submit_proposal`, `ksp_emp_update_profile`.

Admin: `adminPull`/`adminPush` (seluruh dokumen cabang, ditunda 700 ms, perubahan lokal belum terkirim ditandai *dirty* dan tidak ditimpa saat pull). Karyawan hanya mengirim usulan, tidak menimpa data admin.

---

## 🛠️ Pengembangan

Tidak ada build step — edit file lalu push. Skrip utilitas (dijalankan dari folder `stock/`):

```bash
# Manifest PWA (satu sumber kebenaran: daftar TABS di skrip)
python scripts/generate_manifests.py          # tulis ulang semua manifest
python scripts/generate_manifests.py --check  # cek saja; exit 1 bila ada yang usang

# Ikon PNG per tab (butuh Pillow)
python scripts/generate_tab_icons.py
```

**Menambah tab baru:** (1) tambah entri `Tab(...)` di `scripts/generate_manifests.py`, (2) jalankan skrip tersebut, (3) bila ingin ikon sendiri, tambahkan ke `generate_tab_icons.py` lalu jalankan. Ikon yang belum ada otomatis memakai `icon-192.png`. Skrip manifest membaca ukuran PNG dari header file dan memberi **peringatan** bila ikon tidak sesuai namanya.

**Format `config.enc`:** `base64( IV[16 byte] + AES-256-CBC(JSON{supabase_url, supabase_anon_key}) )`, kunci = `SHA-256(PIN)`.

---

## ⚠️ Batasan yang Diketahui

- **Belum ada service worker**, jadi aplikasi **tidak** berjalan offline. Data hanya di-cache di localStorage; manifest sebatas membuat aplikasi bisa dipasang.
- **`config.enc` memakai `SHA-256(PIN)` tanpa KDF.** File ini publik, sehingga PIN pendek dapat ditebak offline. Gunakan PIN panjang, atau migrasikan ke PBKDF2/Argon2. PIN yang sama dipakai untuk RPC admin.
- **Keamanan RPC ada di server.** `ksp_admin_*` dan `ksp_emp_login` menerima PIN/password sebagai parameter lewat kunci publishable: pastikan di SQL ada pembatasan percobaan, perbandingan hash, dan RLS yang menolak akses langsung ke tabel.
- **Password karyawan** saat ini ikut tersimpan di dokumen cabang (cache lokal dan cloud). Sebaiknya disimpan sebagai hash di server saja.
- **Sinkronisasi admin = last-write-wins** untuk seluruh dokumen; dua admin yang mengedit bersamaan dapat saling menimpa.
- **`icon-512.png` (ikon default) sebenarnya 192×192**, identik dengan `icon-192.png`. Manifest sudah tidak mengklaim 512 palsu (ikon SVG `any` dipakai), tetapi sebaiknya dibuat ulang sebagai PNG 512 asli.
- `interactive_stock.html` masih satu file besar (~700 KB) dan belum memakai modul `js/`.
- CryptoJS dimuat dari CDN tanpa SRI.

Untuk detail versi lama lihat [`archive/README.md`](archive/README.md).
