"""
Sinh lưới khí hậu MÔ PHỎNG (demo) -> public/data/climate-grid.json
Chỉ để giao diện chạy được khi chưa có dữ liệu NASA thật.
Dữ liệu thật: `npm run build:grid` (scripts/build-climate-grid.js) sẽ ghi đè file này.

Yêu cầu: numpy, scipy, global-land-mask
"""
import json, datetime
import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter
from global_land_mask import globe

STEP = 5.0
N_LAT, N_LON = int(180 / STEP), int(360 / STEP)
lats = 90 - STEP * (np.arange(N_LAT) + 0.5)     # từ Bắc xuống Nam
lons = -180 + STEP * (np.arange(N_LON) + 0.5)

# phần trăm đất liền mỗi ô (lấy mẫu 1 độ)
sub = 5
fl = np.zeros((N_LAT, N_LON))
for j, la in enumerate(lats):
    for i, lo in enumerate(lons):
        oy = (np.arange(sub) + 0.5) / sub * STEP - STEP / 2
        la_s, lo_s = np.meshgrid(la + oy, lo + oy, indexing="ij")
        fl[j, i] = globe.is_land(np.clip(la_s, -89.9, 89.9), ((lo_s + 180) % 360) - 180).mean()
land = fl > 0.2
dist = distance_transform_edt(fl > 0.5)         # khoảng cách tới biển (đơn vị ô)

LAT, LON = np.meshgrid(lats, lons, indexing="ij")
absl = np.abs(LAT)
sinl = np.abs(np.sin(np.radians(LAT)))

def seasonal(m, amp, phase_n=6.5):
    peak = np.where(LAT >= 0, phase_n, (phase_n + 6) % 12)
    return amp * np.cos(2 * np.pi * (m + 0.5 - peak) / 12)

t_mean = 27.5 - 38 * sinl ** 2.2
t_mean = np.where(land & (LAT < -65), t_mean - 25, t_mean)
amp = (0.6 + 15 * sinl ** 1.3) * (0.45 + 0.55 * fl)

zonal = 0.33 + 0.32 * np.exp(-(LAT / 12) ** 2) + 0.25 * np.exp(-((absl - 52) / 14) ** 2)
arid = np.exp(-((absl - 25) ** 2) / 150) * (1 - np.exp(-dist / 1.6)) * 0.65
w_mean = zonal * (1 - arid)

layers = {"T2M": [], "RH2M": [], "GWETROOT": []}
for m in range(12):
    T = gaussian_filter(t_mean + seasonal(m, amp), 0.6, mode=("nearest", "wrap"))
    W = w_mean + 0.10 * seasonal(m, 1.0, 7.5) * np.exp(-(LAT / 30) ** 2)
    W = np.clip(gaussian_filter(W, 0.6, mode=("nearest", "wrap")), 0.05, 0.95)
    RH = np.where(fl > 0.5, 28 + 62 * W + np.clip(-T, 0, 25) * 0.4, 80 - 8 * np.exp(-((absl - 25) / 10) ** 2))
    RH = np.clip(gaussian_filter(RH, 0.5, mode=("nearest", "wrap")), 15, 98)
    layers["T2M"].append(np.round(T * 10).astype(int))
    layers["RH2M"].append(np.round(RH * 10).astype(int))
    layers["GWETROOT"].append(np.where(land, np.round(W * 1000), -32768).astype(int))

def pack(key, unit, scale):
    return {"unit": unit, "scale": scale, "months": [a.flatten().tolist() for a in layers[key]]}

out = {
    "version": 1, "source": "synthetic", "step": STEP,
    "lat0": float(lats[0]), "lon0": float(lons[0]), "nLat": N_LAT, "nLon": N_LON, "missing": -32768,
    "generated": datetime.date.today().isoformat(),
    "layers": {"T2M": pack("T2M", "°C", 10), "RH2M": pack("RH2M", "%", 10), "GWETROOT": pack("GWETROOT", "", 1000)},
}
with open("public/data/climate-grid.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("ok", N_LAT, "x", N_LON, "land cells:", int(land.sum()))
