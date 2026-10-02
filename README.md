# KSP Check — Stock & Restock Management (GitHub Pages)

Aplikasi web Progressive Web App (PWA) berbasis cloud untuk manajemen stok voucher, pemesanan restok, laporan harian, monitoring saldo realtime, stok produk, dan audit trail KSP Check.

🌐 **Live URL**: [https://wipkas.github.io/stock/](https://wipkas.github.io/stock/)

---

## 🗂️ Struktur Proyek (Web Development Standards)

```
stock/
├── assets/                    # Static Assets
│   ├── icons/                 # PWA Icons & Vector Favicons (192px, 512px, SVG)
│   │   ├── icon-*.png
│   │   └── icon-*.svg
│   ├── iconapp/               # Logo Brand Payment / E-Wallet (WebP)
│   │   ├── dana.webp
│   │   ├── gopay.webp
│   │   ├── orderkuota.webp
│   │   ├── shopeepay.webp
│   │   └── tekmo.webp
│   └── manifests/             # PWA Web App Manifests per tab
│       ├── manifest.json
│       ├── manifest-order.json
│       ├── manifest-history.json
│       ├── manifest-daily.json
│       ├── manifest-balance.json
│       ├── manifest-produk.json
│       └── manifest-margin.json
├── scripts/                   # Utility & Build Automation
│   └── generate_tab_icons.py  # Python script generator icon & badge PWA
├── archive/                   # Arsip Riwayat Versi Rilis Terdahulu
│   ├── README.md
│   ├── interactive_stockold.html
│   ├── interactive_stockv2.html
│   └── interactive_stockv3.html
├── config.enc                 # Kredensial Supabase terenkripsi (AES-256-CBC)
├── index.html                 # Root entrypoint (auto-redirect ke interactive_stock.html)
├── interactive_stock.html     # Aplikasi utama multi-tab PWA & offline support
├── manifest.json              # Root fallback Web App Manifest
├── stock_margin.html          # Modul kalkulator & analisis margin
└── README.md                  # Dokumentasi repo
```

---

## 📱 Fitur & Tab Navigasi

| Tab | URL Param | Deskripsi |
|---|---|---|
| 🌅 **Order Restok** | `?tab=order` | Perhitungan otomatis stok menipis/habis dan pembuatan order restok |
| 📊 **Riwayat Order** | `?tab=history` | Riwayat pesanan restok & pencatatan rekonsiliasi stok masuk |
| 🌙 **Laporan Harian** | `?tab=daily` | Rekapitulasi pergeseran stok, penjualan, dan modal harian |
| 💳 **Saldo Realtime** | `?tab=balance` | Monitoring saldo e-wallet, rekening bank, & server pulsa kasir |
| 🛍️ **Stok Produk** | `?tab=produk` | Manajemen stok produk fisik, kartu perdana, & aksesoris |
| 💹 **Margin Voucher** | `?tab=margin` | Analisis margin profit harga modal vs harga jual per provider |

---

## 🔐 Keamanan & Konfigurasi

- Kredensial Supabase (`supabase_url` & `supabase_anon_key`) disimpan dalam file `config.enc` terenkripsi AES-256-CBC + random IV.
- Dekripsi dilakukan di sisi klien pada runtime browser menggunakan **PIN Toko** (key derivasi SHA-256).
- Tidak ada kredensial atau API key plain-text yang tersimpan di dalam source code publik.
