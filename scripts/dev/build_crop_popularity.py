# scripts/build_crop_popularity.py
import rioxarray
import numpy as np
import json
import os
from rasterio.enums import Resampling

# ── CẤU HÌNH (Không dùng Magic Number) ──
OUTPUT_GRID_RESOLUTION_DEGREES = 2.0  # Độ phân giải lưới đầu ra (2 độ ~ 220km)
TARGET_CROPS = {
    "RICE": "Rice",
    "MAIZE": "Maize",
    "SOYBEAN": "Soybean",
    "GROUNDNUT": "Peanut",
    "VEGETABLES": "Veggies"
}
BASE_URL = "https://storage.googleapis.com/fao-gismgr-faostat-data/DATA/FAOSTAT/MAPSET/CG-HA/FAOSTAT.CG-HA.2020.{crop}.tif"

# Lưới toàn cầu
LON_MIN, LON_MAX = -180.0, 180.0
LAT_MIN, LAT_MAX = -90.0, 90.0

def build_crop_grid():
    n_lon = int((LON_MAX - LON_MIN) / OUTPUT_GRID_RESOLUTION_DEGREES)
    n_lat = int((LAT_MAX - LAT_MIN) / OUTPUT_GRID_RESOLUTION_DEGREES)
    
    grid_layers = {}
    
    for fao_code, crop_name in TARGET_CROPS.items():
        print(f"Đang tải và xử lý {crop_name} ({fao_code})... (Vui lòng đợi)")
        url = BASE_URL.format(crop=fao_code)
        
        try:
            # Đọc dữ liệu từ COG
            da = rioxarray.open_rasterio(url, masked=True)
            
            # Tái lấy mẫu (resample) về lưới 2 độ bằng phương pháp tính tổng (sum)
            # Mỗi ô 2 độ chứa tổng diện tích thu hoạch (ha) của các ô nhỏ bên trong
            resampled = da.rio.reproject(
                da.rio.crs,
                shape=(n_lat, n_lon),
                resampling=Resampling.sum
            )
            
            # Chuyển đổi sang mảng 1 chiều, thay thế NaN bằng 0
            data_flat = resampled.values.flatten()
            data_flat = np.nan_to_num(data_flat, nan=0.0)
            
            grid_layers[crop_name] = {
                "unit": "ha (hectares)",
                "scale": 1.0,
                "data": data_flat.astype(int).tolist()
            }
            print(f"  -> Đã xử lý xong. Tổng diện tích: {int(np.sum(data_flat))} ha")
            
        except Exception as e:
            print(f"  -> Lỗi khi xử lý {crop_name}: {e}")
            grid_layers[crop_name] = {
                "unit": "ha (hectares)",
                "scale": 1.0,
                "data": [0] * (n_lat * n_lon)
            }
    
    # Đóng gói metadata
    output = {
        "step": OUTPUT_GRID_RESOLUTION_DEGREES,
        "lat0": LAT_MAX - (OUTPUT_GRID_RESOLUTION_DEGREES / 2),
        "lon0": LON_MIN + (OUTPUT_GRID_RESOLUTION_DEGREES / 2),
        "nLat": n_lat,
        "nLon": n_lon,
        "missing": -1,
        "layers": grid_layers
    }
    
    # Ghi ra file JSON (Lùi 1 cấp thư mục để vào public/data)
    output_dir = "../public/data"
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "crop-popularity-grid.json")
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(',', ':'))
    
    print(f"\nHoàn tất! File đã lưu tại: {output_file}")

if __name__ == "__main__":
    build_crop_grid()