"""
prepare_anggaran.py — Ringkas data monitoring anggaran Surabaya (Excel) menjadi dua CSV.

Penggunaan:
    python3 api/prepare_anggaran.py
Output:
    api/data/ANGGARAN_PER_PD.csv
    api/data/ANGGARAN_PER_SUBKEGIATAN.csv
"""

import csv
import re
import sys
from pathlib import Path

import openpyxl

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "data_laporan_monitoring_semua_pd_fix.xlsx"
OUT_DIR = Path(__file__).resolve().parent / "data"
PERIODE = "sampai dengan Nopember 2026"
DATA_START_ROW = 6  # 1-based

COL_PD, COL_ID, COL_NAMA = 0, 1, 2
COL_ALOKASI, COL_PENGGUNAAN_UNUSED, COL_PROGRESS, COL_TOTAL_REAL, COL_SP2D = 10, 11, 13, 16, 17

PPKM_RE = re.compile(r"\s*\(PPKm:[^)]*\)")

HDR_PD = ["Perangkat Daerah", "Jenis", "Jumlah Pekerjaan", "Total Alokasi (Rp)",
          "Total Progress Realisasi (Rp)", "Total Realisasi UP/GU/TU & LS (Rp)",
          "Total SP2D (Rp)", "Persentase Progress Realisasi (%)", "Periode"]
HDR_SUB = ["Perangkat Daerah", "Jenis", "Id Sub Kegiatan", "Nama Sub Kegiatan", "Jumlah Pekerjaan",
           "Total Alokasi (Rp)", "Total Progress Realisasi (Rp)",
           "Total Realisasi UP/GU/TU & LS (Rp)", "Total SP2D (Rp)",
           "Persentase Progress Realisasi (%)", "Periode"]


def num(v):
    if v is None or v == "":
        return 0
    if isinstance(v, (int, float)):
        return v
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return 0


def jenis(name):
    return "Kecamatan" if name.startswith("Kec.") else "Perangkat Daerah"


def pct(progress, alokasi):
    return round(progress / alokasi * 100, 2) if alokasi else 0


def read_rows():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = []
    for idx, r in enumerate(ws.iter_rows(values_only=True), start=1):
        if idx < DATA_START_ROW:
            continue
        r = list(r) + [None] * (18 - len(r))
        pd_name = str(r[COL_PD] or "").strip()
        if not pd_name or pd_name == "Jumlah":
            continue
        rows.append({
            "pd": pd_name,
            "id": str(r[COL_ID] or "").strip(),
            "nama": PPKM_RE.sub("", str(r[COL_NAMA] or "")).strip(),
            "alokasi": num(r[COL_ALOKASI]),
            "progress": num(r[COL_PROGRESS]),
            "realisasi": num(r[COL_TOTAL_REAL]),
            "sp2d": num(r[COL_SP2D]),
        })
    wb.close()
    return rows


def aggregate(rows, key_fn):
    groups = {}
    for r in rows:
        k = key_fn(r)
        g = groups.get(k)
        if g is None:
            g = groups[k] = {"first": r, "n": 0, "alokasi": 0, "progress": 0, "realisasi": 0, "sp2d": 0}
        g["n"] += 1
        for f in ("alokasi", "progress", "realisasi", "sp2d"):
            g[f] += r[f]
    return groups


def write_csv(path, header, data_rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(data_rows)


def main():
    rows = read_rows()
    print(f"Baris data terbaca (tanpa 'Jumlah'): {len(rows)}")

    # Ringkasan per PD
    pd_groups = aggregate(rows, lambda r: r["pd"])
    pd_out = []
    for name in sorted(pd_groups):
        g = pd_groups[name]
        pd_out.append([name, jenis(name), g["n"], int(g["alokasi"]), int(g["progress"]),
                       int(g["realisasi"]), int(g["sp2d"]),
                       pct(g["progress"], g["alokasi"]), PERIODE])
    write_csv(OUT_DIR / "ANGGARAN_PER_PD.csv", HDR_PD, pd_out)

    # Ringkasan per (PD, Id Sub Kegiatan)
    sub_groups = aggregate(rows, lambda r: (r["pd"], r["id"]))
    sub_out = []
    for (pd_name, sid) in sorted(sub_groups):
        g = sub_groups[(pd_name, sid)]
        sub_out.append([pd_name, jenis(pd_name), sid, g["first"]["nama"], g["n"],
                        int(g["alokasi"]), int(g["progress"]), int(g["realisasi"]), int(g["sp2d"]),
                        pct(g["progress"], g["alokasi"]), PERIODE])
    write_csv(OUT_DIR / "ANGGARAN_PER_SUBKEGIATAN.csv", HDR_SUB, sub_out)

    print(f"ANGGARAN_PER_PD.csv: {len(pd_out)} baris")
    print(f"ANGGARAN_PER_SUBKEGIATAN.csv: {len(sub_out)} baris")

    # CHECKS
    ok = True
    if len(pd_out) != 62:
        print(f"CHECK (a) GAGAL: baris PD = {len(pd_out)}, harus 62"); ok = False
    else:
        print("CHECK (a) OK: 62 baris PD")
    sum_alok_pd = sum(r[3] for r in pd_out)
    sum_alok_sub = sum(r[5] for r in sub_out)
    sum_prog_pd = sum(r[4] for r in pd_out)
    print(f"Sum Alokasi PD = {sum_alok_pd}, Sum Alokasi SUB = {sum_alok_sub}")
    if sum_alok_pd != sum_alok_sub:
        print("CHECK (b) GAGAL: sum alokasi PD != SUB"); ok = False
    elif sum_alok_pd != 9557286067899:
        print("CHECK (b) GAGAL: sum alokasi != 9557286067899 (cek baris Jumlah)"); ok = False
    else:
        print("CHECK (b) OK")
    print(f"Sum Progress PD = {sum_prog_pd}")
    if abs(sum_prog_pd - 6133148902518) > 1e6:
        print("CHECK (c) GAGAL: sum progress jauh dari 6133148902518"); ok = False
    else:
        print("CHECK (c) OK")
    if not ok:
        raise SystemExit("Salah satu cek gagal. Berhenti.")


if __name__ == "__main__":
    main()
