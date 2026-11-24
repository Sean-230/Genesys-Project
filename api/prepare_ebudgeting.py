"""Tabel eBudgeting.xlsx -> 3 CSV di api/data/ (ringkasan kecil untuk Pinecone + rincian lengkap).

Pakai: python3 api/prepare_ebudgeting.py "/path/Tabel eBudgeting.xlsx"
"""
import sys
from pathlib import Path

import pandas as pd

src = sys.argv[1]
out = Path(__file__).resolve().parent / "data"
df = pd.read_excel(src)
assert len(df) and df["hasil"].notna().all(), "kolom 'hasil' kosong"

FLAGS = {  # kolom bendera 1.0/NaN -> label tematik
    "is_pendidikan": "Pendidikan", "is_kesehatan": "Kesehatan", "is_infrastruktur": "Infrastruktur",
    "is_stunting": "Stunting", "is_miskin": "Kemiskinan", "is_inflasi": "Inflasi",
}
for c in FLAGS:
    df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0) == 1
df["nama_sub_kegiatan"] = df["nama_sub_kegiatan"].str.strip()


def tematik(g):  # total anggaran (Rp) per tema untuk satu kelompok baris
    return {f"Anggaran {lbl} (Rp)": int(g.loc[g[c], "hasil"].sum()) for c, lbl in FLAGS.items()}


# 1) satu baris per SKPD
rows = [{"Perangkat Daerah": n, "Jumlah Item Anggaran": len(g), "Jumlah Sub Kegiatan": g["kegiatan_id"].nunique(),
         "Total Anggaran (Rp)": int(g["hasil"].sum()), **tematik(g), "Sumber Data": "Tabel eBudgeting"}
        for n, g in df.groupby("nama_skpd")]
pd.DataFrame(rows).to_csv(out / "EBUDGETING_PER_SKPD.csv", index=False)

# 2) per sumber dana
rows = [{"Perangkat Daerah": n, "Sumber Dana": s, "Jumlah Item Anggaran": len(g),
         "Total Anggaran (Rp)": int(g["hasil"].sum()), "Sumber Data": "Tabel eBudgeting"}
        for (n, s), g in df.groupby(["nama_skpd", "sumber_dana"])]
pd.DataFrame(rows).sort_values("Total Anggaran (Rp)", ascending=False).to_csv(out / "EBUDGETING_PER_SUMBER_DANA.csv", index=False)

# 3) per sub kegiatan
rows = [{"Perangkat Daerah": n, "Kode Sub Kegiatan": k, "Nama Sub Kegiatan": g["nama_sub_kegiatan"].iloc[0],
         "Jumlah Item Anggaran": len(g), "Total Anggaran (Rp)": int(g["hasil"].sum()),
         "Sumber Dana Terbesar": g.assign(sumber_dana=g["sumber_dana"].fillna("-")).groupby("sumber_dana")["hasil"].sum().idxmax(), **tematik(g),
         "Sumber Data": "Tabel eBudgeting"}
        for (n, k), g in df.groupby(["nama_skpd", "kegiatan_id"])]
pd.DataFrame(rows).sort_values("Total Anggaran (Rp)", ascending=False).to_csv(out / "EBUDGETING_PER_SUBKEGIATAN.csv", index=False)

# 4) rincian lengkap (tidak dimasukkan ke Pinecone dulu: 1 baris = 1 embedding)
det = df.rename(columns={
    "nama_skpd": "Perangkat Daerah", "kegiatan_id": "Kode Sub Kegiatan", "nama_sub_kegiatan": "Nama Sub Kegiatan",
    "nama_subtitle": "Subtitle", "nama_komponen": "Komponen", "nama_detil": "Detil", "satuan": "Satuan",
    "volume": "Volume", "harga_satuan": "Harga Satuan (Rp)", "hasil": "Total Anggaran (Rp)",
    "sumber_dana": "Sumber Dana", "rekening": "Kode Rekening", "nama_rekening": "Nama Rekening", "tahap": "Tahap"})
keep = ["Perangkat Daerah", "Kode Sub Kegiatan", "Nama Sub Kegiatan", "Subtitle", "Komponen", "Detil", "Satuan",
        "Volume", "Harga Satuan (Rp)", "Total Anggaran (Rp)", "Sumber Dana", "Kode Rekening", "Nama Rekening", "Tahap"]
det[keep].to_csv(out / "EBUDGETING_RINCIAN.csv", index=False)

# cek: total ringkasan == total sumber
tot = int(df["hasil"].sum())
for f in ("PER_SKPD", "PER_SUMBER_DANA", "PER_SUBKEGIATAN"):
    s = int(pd.read_csv(out / f"EBUDGETING_{f}.csv")["Total Anggaran (Rp)"].sum())
    assert s == tot, (f, s, tot)
print("OK", len(df), "baris; total Rp", tot)
