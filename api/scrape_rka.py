"""
scrape_rka.py — Unduh PDF RKA SKPD 2026 dari surabaya.go.id lalu ekstrak teks per halaman.

Penggunaan:
    python3 api/scrape_rka.py download   # unduh PDF + manifest (satu per satu)
    python3 -I api/scrape_rka.py         # ekstrak teks -> api/data/RKA_SKPD_2026.csv
"""

import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import pymupdf
import requests

LIST_URL = "https://surabaya.go.id/id/page/0/25199/rencana-kerja-anggaran-rka-skpd-tahun-2026"
HEADERS = {"User-Agent": "Mozilla/5.0"}
PDF_DIR = Path(__file__).resolve().parent / "data" / "rka_pdf"
MANIFEST = PDF_DIR / "manifest.json"
OUT_CSV = Path(__file__).resolve().parent / "data" / "RKA_SKPD_2026.csv"
MAX_CHARS = 3500
SLEEP = 1.5
TIMEOUT = 60
RETRIES = 2

LINK_RE = re.compile(
    r'<a\b[^>]*?href="([^"]*rka_skpd_\d+_0\.pdf)"[^>]*>(.*?)</a>', re.S | re.I
)


def clean_name(raw):
    txt = re.sub(r"<[^>]+>", " ", raw).replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", txt).strip()


def get_links():
    html = requests.get(LIST_URL, headers=HEADERS, timeout=TIMEOUT).text
    seen, out = set(), []
    for href, name in LINK_RE.findall(html):
        url = urljoin(LIST_URL, href)
        if url in seen:
            continue
        seen.add(url)
        out.append({"url": url, "skpd": clean_name(name)})
    return out


def download(entry):
    fname = entry["url"].rsplit("/", 1)[-1]
    dest = PDF_DIR / fname
    for attempt in range(RETRIES + 1):
        try:
            r = requests.get(entry["url"], headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            dest.write_bytes(r.content)
            return fname
        except Exception as exc:
            print(f"  gagal ({attempt + 1}): {fname}: {exc}")
            if attempt < RETRIES:
                time.sleep(SLEEP)
    return None


def run_download():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    links = get_links()
    print(f"PDF ditemukan: {len(links)}")
    ok, failed = [], []
    for i, entry in enumerate(links, 1):
        fname = download(entry)
        print(f"[{i}/{len(links)}] {entry['skpd']} -> {fname or 'GAGAL'}")
        if fname:
            ok.append({**entry, "file": fname})
        else:
            failed.append(entry["url"])
        time.sleep(SLEEP)
    MANIFEST.write_text(json.dumps({"ok": ok, "failed": failed}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Diunduh: {len(ok)} | Gagal: {len(failed)}")


def split_text(text):
    """Pecah teks > MAX_CHARS di batas baris; baris yang masih terlalu panjang dipotong paksa."""
    chunks, cur = [], ""
    for line in text.split("\n"):
        while len(line) > MAX_CHARS:
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(line[:MAX_CHARS])
            line = line[MAX_CHARS:]
        candidate = line if not cur else cur + "\n" + line
        if len(candidate) > MAX_CHARS:
            chunks.append(cur)
            cur = line
        else:
            cur = candidate
    if cur:
        chunks.append(cur)
    return [c for c in chunks if c.strip()]


def run_extract():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows, pages_total, no_text = [], 0, []
    for entry in manifest["ok"]:
        path = PDF_DIR / entry["file"]
        doc = pymupdf.open(str(path))
        page_texts = []
        for i, page in enumerate(doc, 1):
            pages_total += 1
            text = page.get_text("text").strip()
            if not text:
                continue
            page_texts.append(text)
            for chunk in split_text(text):
                rows.append([entry["skpd"], i, entry["url"], chunk])
        doc.close()
        if not page_texts:
            no_text.append(entry["file"])

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["SKPD", "Halaman", "Sumber", "Teks"])
        w.writerows(rows)

    print(f"PDF diproses: {len(manifest['ok'])} | gagal unduh: {len(manifest['failed'])}")
    print(f"Total halaman: {pages_total} | baris ditulis: {len(rows)}")
    print(f"PDF tanpa teks sama sekali: {no_text or 'tidak ada'}")
    if rows:
        print("Contoh Teks baris pertama (600 karakter):")
        print(rows[0][3][:600])
    print(f"Output: {OUT_CSV}")
    if len(rows) > 3000:
        print(f"BATAS: {len(rows)} baris > 3000. Jangan ingest ke Pinecone.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "download":
        run_download()
    else:
        run_extract()
