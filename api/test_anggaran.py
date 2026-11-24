"""Cek cepat query_anggaran. Jalankan: python3 api/test_anggaran.py"""
import json
import os
import sys

os.environ.setdefault("GEMINI_API_KEY", "x")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.tools import TOOL_DECLARATIONS, query_anggaran  # noqa: E402

q = lambda **k: json.loads(query_anggaran(**k))

# total semua PD harus sama dengan total Excel yang diringkas
r = q(sumber="per_pd", maks=50)
assert r["jumlah_baris_cocok"] == 62
assert r["total_semua_baris_cocok"]["Total Alokasi (Rp)"] == 9_557_286_067_899

# 31 kecamatan; urut persentase naik = terendah dulu
k = q(sumber="per_pd", kata_kunci="kecamatan", urutkan_berdasarkan="persentase", arah="asc", maks=3)
assert k["jumlah_baris_cocok"] == 31
p = [float(x["Persentase Progress Realisasi (%)"]) for x in k["baris"]]
assert p == sorted(p)

assert q(sumber="per_pd", kata_kunci="tidakadanamaini")["jumlah_baris_cocok"] == 0
assert "error" in q(sumber="salah")
assert q(sumber="ebudgeting_skpd")["total_semua_baris_cocok"]["Total Anggaran (Rp)"] == 2_198_043_570_840
assert any(f.name == "query_anggaran" for f in TOOL_DECLARATIONS.function_declarations)

# Harga Satuan (Rp) tidak boleh ikut dijumlahkan di ebudgeting_rincian
rincian = q(sumber="ebudgeting_rincian", kata_kunci="PAUD", maks=2)
assert "Harga Satuan (Rp)" not in rincian["total_semua_baris_cocok"]
assert rincian["total_semua_baris_cocok"]["Total Anggaran (Rp)"] > 0

# Argumen opsional None dan batas maks=0 tidak boleh crash atau salah default
assert q(sumber="per_pd", kata_kunci=None, maks=None)["jumlah_baris_cocok"] == 62
assert q(sumber="per_pd", maks=0)["ditampilkan"] == 1

# Urut kolom teks harus benar-benar mengurutkan alfabetis
desc_pd = q(sumber="per_pd", urutkan_berdasarkan="Perangkat Daerah", arah="desc", maks=3)
names = [x["Perangkat Daerah"] for x in desc_pd["baris"]]
assert names == sorted(names, key=str.lower, reverse=True)

# Urut kolom dengan underscore (seperti yang sering dikirim Gemini) harus cocok dengan kolom berspasi
k_us = q(sumber="per_pd", kata_kunci="kecamatan", urutkan_berdasarkan="persentase_progress_realisasi", arah="asc", maks=3)
p_us = [float(x["Persentase Progress Realisasi (%)"]) for x in k_us["baris"]]
assert p_us == sorted(p_us) and p_us[0] < 60

# Teks RKA harus dipotong maks 700 karakter
rka = q(sumber="rka", maks=2)
assert all(len(x.get("Teks", "")) <= 700 for x in rka["baris"])

print("semua cek lulus")
