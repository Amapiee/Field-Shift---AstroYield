import rioxarray
import numpy as np
import json
import os
from rasterio.enums import Resampling
from affine import Affine

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "public", "data")

GRID_RES = 2.0 
MIN_AREA_THRESHOLD = 2500 

TARGET_CROPS = {
    "RICE": "Rice",
    "MAIZE": "Maize",
    "SOYBEAN": "Soybean",
    "GROUNDNUT": "Peanut",
    "VEGFOR": "Veggies" 
}
BASE_URL = "https://storage.googleapis.com/fao-gismgr-faostat-data/DATA/FAOSTAT/MAPSET/CG-HA/FAOSTAT.CG-HA.2020.{crop}.tif"

def build_crop_points():
    n_lon = int(360.0 / GRID_RES)
    n_lat = int(180.0 / GRID_RES)
    
    output_data = {"crops": {}}
    
    for fao_code, crop_name in TARGET_CROPS.items():
        print(f"Đang tải và xử lý {crop_name}...")
        url = BASE_URL.format(crop=fao_code)
        
        points = []
        try:
            da = rioxarray.open_rasterio(url, masked=True)
            # BƯỚC 1: SỬA KINH ĐỘ TRƯỚC KHI REPROJECT (Cực kỳ quan trọng)
            # Cuộn dữ liệu từ 0-360 về -180-180
            if da.x.max() > 180:
                da = da.assign_coords(x=(((da.x + 180) % 360) - 180)).sortby('x')
            
            # BƯỚC 2: REPROJECT
            resampled = da.rio.reproject(
                "EPSG:4326",
                resolution=GRID_RES, 
                resampling=Resampling.sum
            )
            
            # BƯỚC 3: LẤY DỮ LIỆU VÀ TỌA ĐỘ
            xs = resampled.x.values
            ys = resampled.y.values
            data_array = resampled.values.squeeze()
            data_array = np.nan_to_num(data_array, nan=0.0)
            
            # Lấy kích thước thực tế của mảng để tránh lỗi Index
            y_size, x_size = data_array.shape
            
            for y_idx in range(y_size):
                for x_idx in range(x_size):
                    val = data_array[y_idx, x_idx]
                    if val > MIN_AREA_THRESHOLD:
                        lon = float(xs[x_idx])
                        lat = float(ys[y_idx])
                        
                        # Lúc này lon đã chuẩn -180 đến 180, không cần if nữa
                        points.append({
                            "lat": round(lat, 2),
                            "lon": round(lon, 2),
                            "val": int(val)
                        })
            
            output_data["crops"][crop_name] = points
            print(f"  -> Xong: {len(points)} điểm.")
            
        except Exception as e:
            print(f"  -> Bỏ qua {crop_name} (Lỗi: {e})")
            output_data["crops"][crop_name] = []
            
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_file = os.path.join(OUTPUT_DIR, "crop-points.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, separators=(',', ':'))
    
    print(f"\nHOÀN TẤT! File lưu tại: {output_file}")

if __name__ == "__main__":
    build_crop_points()