#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generator Web App Manifest KSP Check (satu sumber kebenaran).

Menghasilkan semua manifest dari SATU definisi di bawah, sehingga menambah tab
baru cukup dengan menambah satu entri di TABS lalu menjalankan skrip ini.

Output:
  manifest.json                         (root; dipakai index/karyawan/store_manager)
  assets/manifests/manifest.json        (default aplikasi interactive_stock.html)
  assets/manifests/manifest-<tab>.json  (satu per tab yang punya app_name)

Pemakaian (dari folder stock/):
  python scripts/generate_manifests.py            # tulis semua manifest
  python scripts/generate_manifests.py --check    # hanya cek; exit 1 bila ada yang usang
  python scripts/generate_manifests.py --root DIR # pakai folder lain (untuk uji)

Catatan:
  * Ukuran ikon PNG dibaca dari header file, bukan ditebak dari nama file,
    jadi klaim "sizes" di manifest selalu sesuai kenyataan. Ikon yang ukurannya
    tidak sesuai namanya (mis. icon-512.png yang sebenarnya 192x192) diberi
    peringatan, dan entri duplikat (ukuran+tipe sama) dibuang otomatis.
  * Field "id" sengaja TIDAK dibuat untuk manifest default (root dan
    assets/manifests/manifest.json) agar identitas aplikasi yang sudah terpasang
    di perangkat pengguna tidak berubah. Manifest per tab sudah punya id sendiri.
  * Hanya memakai pustaka standar Python 3.8+.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# --------------------------------------------------------------------------
# DEFINISI (ubah di sini saja)
# --------------------------------------------------------------------------
APP_PAGE = "interactive_stock.html"
THEME_COLOR = "#0F1117"
FALLBACK_ICON = "icon-192.png"   # dipakai bila ikon khusus tab/halaman belum ada
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

DEFAULT_APP = {
    "name": "KSP Check - Voucher & Stok",
    "short_name": "KSP Check",
    "description": "Interactive Stock, Restock Order & Laporan Harian KSP Check",
}


@dataclass(frozen=True)
class Tab:
    key: str                    # nilai ?tab=<key> dan nama file icon-<key>-*.png
    emoji: str
    title: str
    short: str
    shortcut_desc: str
    app_name: Optional[str] = None   # None -> tab tidak punya manifest PWA sendiri
    app_desc: str = ""


@dataclass(frozen=True)
class Page:
    key: str                    # nama file ikon (icon-<key>-*.png)
    emoji: str
    title: str
    short: str
    desc: str
    url: str                    # relatif terhadap root situs
    app_name: Optional[str] = None
    app_desc: str = ""


# Urutan = urutan shortcut. Android Chrome hanya menampilkan 4 shortcut
# pertama, jadi taruh yang paling sering dipakai di depan.
TABS: Tuple[Tab, ...] = (
    Tab("balance", "💳", "Saldo Realtime", "Saldo", "Buka tab Saldo Realtime",
        "Saldo Realtime - KSP Check", "Pantau Saldo Realtime Aplikasi KSP Check"),
    Tab("produk", "🛍️", "Stok Produk", "Produk", "Buka tab Stok Produk & Aksesoris",
        "Stok Produk - KSP Check", "Katalog & Stok Fisik Produk Retail KSP Check"),
    Tab("order", "🌅", "Order Restok", "Order", "Buka tab Order Restok",
        "Order Restok - KSP Check", "Tab Order Restok KSP Check"),
    Tab("history", "📊", "Riwayat Order", "Riwayat", "Buka tab Riwayat & Rekonsiliasi Order",
        "Riwayat Order - KSP Check", "Tab Riwayat & Rekonsiliasi Order KSP Check"),
    Tab("daily", "🌙", "Laporan Harian", "Laporan", "Buka tab Laporan Stok Harian",
        "Laporan Harian - KSP Check", "Tab Laporan Stok Harian KSP Check"),
    Tab("margin", "💹", "Margin Voucher", "Margin", "Buka tab Margin Voucher",
        "Margin Voucher - KSP Check", "Tab Margin Voucher & Simulasi Harga KSP Check"),
    Tab("feerule", "⚖️", "Fee Rule", "Fee Rule", "Buka tab Fee Rule (aturan biaya admin)"),
)

# Halaman non-tab: memiliki manifest mandiri dan muncul sebagai shortcut.
PAGES: Tuple[Page, ...] = (
    Page("store", "🏢", "Kelola Cabang", "Store Manager", "Kelola cabang, shift, dan transaksi harian", "store_manager.html",
         "Store Manager - KSP Check", "Kelola Cabang Toko, Shift Kasir & Rekap Transaksi"),
    Page("karyawan", "👤", "Portal Kasir", "Portal Kasir", "Login kasir & personel toko", "karyawan.html",
         "Portal Kasir - KSP Check", "Portal Login & Pencatatan Transaksi Kasir Toko"),
    Page("print", "🖨️", "Cetak & Display", "Cetak Stok", "Cetak daftar harga & display etalase", "stock_print.html",
         "Cetak & Display Stok - KSP Check", "Cetak Daftar Harga & Display Katalog Voucher Internet"),
)


@dataclass(frozen=True)
class Ctx:
    """Posisi manifest relatif terhadap root situs."""
    root_prefix: str    # dari manifest ke root situs
    icons_prefix: str   # dari manifest ke assets/icons/
    scope: str


ROOT_CTX = Ctx(root_prefix="", icons_prefix="assets/icons/", scope="./")
ASSETS_CTX = Ctx(root_prefix="../../", icons_prefix="../icons/", scope="../../")


# --------------------------------------------------------------------------
# PEMBANGUN
# --------------------------------------------------------------------------
class Builder:
    def __init__(self, root: Path):
        self.root = root
        self.icons_dir = root / "assets" / "icons"
        self.warnings: List[str] = []

    def _warn(self, msg: str) -> None:
        if msg not in self.warnings:
            self.warnings.append(msg)

    # ---- ikon ----
    def png_size(self, name: str) -> Optional[Tuple[int, int]]:
        path = self.icons_dir / name
        try:
            with open(path, "rb") as fh:
                head = fh.read(24)
        except OSError:
            return None
        if len(head) < 24 or head[:8] != PNG_SIGNATURE:
            self._warn(f"{name}: bukan file PNG yang valid")
            return None
        return struct.unpack(">II", head[16:24])

    def has(self, name: str) -> bool:
        return (self.icons_dir / name).is_file()

    def png_entry(self, ctx: Ctx, name: str) -> Optional[Dict[str, str]]:
        size = self.png_size(name)
        if size is None:
            self._warn(f"{name}: file tidak ditemukan / tidak terbaca")
            return None
        w, h = size
        if w != h:
            self._warn(f"{name}: tidak persegi ({w}x{h})")
        declared = [p for p in name.replace(".png", "").split("-") if p.isdigit()]
        if declared and int(declared[-1]) != w:
            self._warn(f"{name}: namanya {declared[-1]}px tetapi ukuran asli {w}x{h} "
                       f"-> buat ulang ikonnya (scripts/generate_tab_icons.py)")
        return {"src": ctx.icons_prefix + name, "sizes": f"{w}x{h}", "type": "image/png"}

    def svg_entry(self, ctx: Ctx, name: str) -> Optional[Dict[str, str]]:
        if not self.has(name):
            self._warn(f"{name}: file tidak ditemukan")
            return None
        return {"src": ctx.icons_prefix + name, "sizes": "any",
                "type": "image/svg+xml", "purpose": "any maskable"}

    @staticmethod
    def dedupe(entries: List[Optional[Dict[str, str]]]) -> List[Dict[str, str]]:
        seen, out = set(), []
        for e in entries:
            if not e:
                continue
            key = (e["sizes"], e["type"])
            if key in seen:
                continue
            seen.add(key)
            out.append(e)
        return out

    def shortcut_icon(self, ctx: Ctx, key: Optional[str]) -> List[Dict[str, str]]:
        name = f"icon-{key}-192.png" if key and self.has(f"icon-{key}-192.png") else FALLBACK_ICON
        entry = self.png_entry(ctx, name)
        return [{"src": entry["src"], "sizes": entry["sizes"]}] if entry else []

    # ---- shortcut ----
    def tab_shortcut(self, ctx: Ctx, tab: Tab) -> dict:
        return {
            "name": f"{tab.emoji} {tab.title}",
            "short_name": tab.short,
            "description": tab.shortcut_desc,
            "url": f"{ctx.root_prefix}{APP_PAGE}?tab={tab.key}",
            "icons": self.shortcut_icon(ctx, tab.key),
        }

    def page_shortcut(self, ctx: Ctx, page: Page) -> dict:
        return {
            "name": f"{page.emoji} {page.title}",
            "short_name": page.short,
            "description": page.desc,
            "url": ctx.root_prefix + page.url,
            "icons": self.shortcut_icon(ctx, page.key),
        }

    # ---- manifest ----
    def default_manifest(self, ctx: Ctx) -> dict:
        icons = self.dedupe([
            self.png_entry(ctx, "icon-192.png"),
            self.png_entry(ctx, "icon-512.png"),
            self.svg_entry(ctx, "icon.svg"),
        ])
        return {
            **DEFAULT_APP,
            "start_url": ctx.root_prefix + APP_PAGE,
            "scope": ctx.scope,
            "display": "standalone",
            "background_color": THEME_COLOR,
            "theme_color": THEME_COLOR,
            "orientation": "any",
            "icons": icons,
            "shortcuts": [self.tab_shortcut(ctx, t) for t in TABS]
                         + [self.page_shortcut(ctx, p) for p in PAGES],
        }

    def tab_manifest(self, ctx: Ctx, tab: Tab) -> dict:
        icons = self.dedupe([
            self.svg_entry(ctx, f"icon-{tab.key}.svg"),
            self.png_entry(ctx, f"icon-{tab.key}-192.png"),
            self.png_entry(ctx, f"icon-{tab.key}-512.png"),
        ])
        return {
            "id": f"kspcheck-{tab.key}-app",
            "name": tab.app_name,
            "short_name": tab.short,
            "description": tab.app_desc,
            "start_url": f"{ctx.root_prefix}{APP_PAGE}?tab={tab.key}",
            "scope": ctx.scope,
            "display": "standalone",
            "background_color": THEME_COLOR,
            "theme_color": THEME_COLOR,
            "orientation": "any",
            "icons": icons,
            "shortcuts": [self.tab_shortcut(ctx, t) for t in TABS if t.key != tab.key],
        }

    def page_manifest(self, ctx: Ctx, page: Page) -> dict:
        icons = self.dedupe([
            self.svg_entry(ctx, f"icon-{page.key}.svg"),
            self.png_entry(ctx, f"icon-{page.key}-192.png"),
            self.png_entry(ctx, f"icon-{page.key}-512.png"),
        ])
        return {
            "id": f"kspcheck-{page.key}-app",
            "name": page.app_name or f"{page.title} - KSP Check",
            "short_name": page.short,
            "description": page.app_desc or page.desc,
            "start_url": f"{ctx.root_prefix}{page.url}",
            "scope": ctx.scope,
            "display": "standalone",
            "background_color": THEME_COLOR,
            "theme_color": THEME_COLOR,
            "orientation": "any",
            "icons": icons,
            "shortcuts": [self.tab_shortcut(ctx, t) for t in TABS[:3]],
        }

    def build_all(self) -> Dict[Path, dict]:
        out: Dict[Path, dict] = {
            self.root / "manifest.json": self.default_manifest(ROOT_CTX),
            self.root / "assets" / "manifests" / "manifest.json": self.default_manifest(ASSETS_CTX),
        }
        for tab in TABS:
            if tab.app_name:
                out[self.root / "assets" / "manifests" / f"manifest-{tab.key}.json"] = \
                    self.tab_manifest(ASSETS_CTX, tab)
        for page in PAGES:
            if page.app_name:
                out[self.root / "assets" / "manifests" / f"manifest-{page.key}.json"] = \
                    self.page_manifest(ASSETS_CTX, page)
        return out


# Ringkas array ikon shortcut (hanya src+sizes) jadi satu baris, sama seperti
# gaya manifest tulisan tangan sebelumnya -> diff Git kecil & mudah dibaca.
_SHORTCUT_ICON = re.compile(
    r'"icons": \[\n\s+\{\n\s+"src": ("[^"]*"),\n\s+"sizes": ("[^"]*")\n\s+\}\n\s+\]'
)


def render(data: dict) -> str:
    text = json.dumps(data, indent=2, ensure_ascii=False)
    text = _SHORTCUT_ICON.sub(r'"icons": [{ "src": \1, "sizes": \2 }]', text)
    return text + "\n"


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Generate manifest PWA KSP Check")
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent,
                    help="folder situs (default: folder induk scripts/)")
    ap.add_argument("--check", action="store_true",
                    help="jangan menulis; exit 1 bila ada manifest yang usang")
    args = ap.parse_args(argv)

    builder = Builder(args.root.resolve())
    outputs = builder.build_all()

    stale = 0
    for path, data in outputs.items():
        text = render(data)
        rel = path.relative_to(builder.root)
        current = path.read_text(encoding="utf-8") if path.is_file() else None
        if current == text:
            print(f"  = {rel}")
            continue
        stale += 1
        if args.check:
            print(f"  ! {rel} (usang)")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"  + {rel}")

    for w in builder.warnings:
        print(f"PERINGATAN: {w}", file=sys.stderr)

    if args.check:
        print("Semua manifest up-to-date." if not stale else f"{stale} manifest usang.")
        return 1 if stale else 0
    print(f"Selesai: {len(outputs)} manifest ({stale} berubah).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
