# 🛰️ FarmShift

NASA Space Apps Challenge 2026 — *Field Shift: Adapting Farms with NASA Data*

Ứng dụng nông nghiệp chính xác tích hợp dữ liệu vệ tinh NASA, mô phỏng tính toán Lượng tử (Quantum QAOA), trực quan hóa bản đồ nhiệt khí hậu (Global Climate Heatmap), bản đồ bong bóng vùng trồng trọng điểm (Crop Bubble Map) và phân tích tuyến đường thương mại (Trade Routes) nhằm tối ưu hóa chu kỳ luân canh, dự báo rủi ro thiên tai và tối đa hóa lợi nhuận nông sản.

---

## 🚀 Khởi Chạy Nhanh

```bash
npm install
npm start                 # Khởi chạy server tại http://localhost:3000
PORT=3001 npm start       # Đổi cổng nếu cổng 3000 bị chiếm
DEBUG=1 npm start         # Bật log thời gian chi tiết từng bước xử lý
npm run dev               # Chạy chế độ phát triển (nodemon)
npm test                  # Chạy bộ unit test tự động

# Tạo dữ liệu bản đồ vùng trồng (Yêu cầu Python + thư viện rioxarray)
python scripts/build_crop_popularity.py

# Tạo dữ liệu tuyến thương mại mẫu (nếu không có API key Comtrade)
npm run build:trade:sample 
Yêu cầu hệ thống: Node.js >= 18, Python >= 3.8 (nếu chạy script bản đồ cây trồng).

🏗️ Kiến Trúc Hệ Thống & Cấu Trúc Mã Nguồn
text
server.js                  Cấu hình Express, xử lý EADDRINUSE tự động, nạp API & Static files
src/
  routes/api.js            Endpoints (/api/analyze, /api/trade_routes, /api/random_coords)
  services/
    nasa.js                Fetch NASA POWER (SMAP, GPM, ECOSTRESS), Cache 1h, tính NDVI/DRI/FRI
    scoring.js             Chấm điểm Đất / Nước / Lợi nhuận (tính đến stress sinh học)
    alerts.js              Chẩn đoán rủi ro thiên tai (Hạn hán & Lũ lụt)
    trade.js               Tính toán tuyến thương mại, cước phí đa phương thức, hao hụt & ngoại cảnh
  quantum/
    statevector.js         Bộ mô phỏng trạng thái Qubit (Hadamard, RZ, CX, RX)
    qaoa.js                Ma trận chi phí QUBO + Thuật toán QAOA 18-qubit (phạt độc canh)
  config/
    crops.js               Thông số sinh học cây trồng, mùa vụ
    transport.js           Cấu hình logistics (cước/km, hệ số địa hình, tốc độ, hao hụt)
  data/
    markets.js             Danh sách các trạm thu mua, nhà máy, cảng xuất khẩu toàn cầu
  utils/                   Hàm tiện ích (clamp, round, mean) & Logger
public/
  index.html               Giao diện chính, Sidebar Accordion, Settings Modal
  css/style.css            UI Glassmorphism, Theme động, Responsive
  js/
    state.js, map.js       Quản lý trạng thái, Bản đồ Leaflet (Esri/Google)
    geocoder.js            Tìm kiếm địa điểm (ArcGIS -> Photon -> Nominatim) + Water Guard
    charts.js, render.js   Vẽ biểu đồ Chart.js & Đổ dữ liệu UI
    analysis.js            Logic gọi API /api/analyze
    heatmap-core.js        Nội suy toán học & bảng màu Heatmap
    heatmap.js             Tích hợp Canvas Heatmap khí hậu lên Leaflet
    crop-bubbles.js        Vẽ bản đồ bong bóng (CircleMarker) vùng trồng trọng điểm
    trade.js               Vẽ modal phân tích kinh tế & tuyến đường (animation)
    settings.js            Xử lý Theme, Layout, Ngôn ngữ
  data/
    climate-grid.json      Dữ liệu lưới khí hậu toàn cầu 5°
    crop-points.json       Dữ liệu tọa độ vùng trồng (Từ FAO CROPGRIDS)
    trade-flows.json       Dữ liệu luồng thương mại nông sản
scripts/
  build-climate-grid.js    Script cào dữ liệu tạo climate-grid.json
  build_crop_popularity.py Script Python tải FAO CROPGRIDS & xuất crop-points.json
  build-trade-flows.js     Script tải dữ liệu UN Comtrade & tính tuyến (searoute-js)
🌟 Các Tính Năng Nổi Bật
1. Dữ Liệu Vệ Tinh NASA & Chỉ Số Phái Sinh
Đa nguồn: NASA POWER, SMAP (độ ẩm đất), GPM IMERG (lượng mưa), ECOSTRESS, MODIS.

Chẩn đoán Thiên tai: DRI (Hạn hán) và FRI (Lũ lụt) tính toán dựa trên độ khô đất, mưa cực đoan và sốc nhiệt.

Mock Deterministic: Tự động dùng dữ liệu giả lập nhất quán theo tọa độ nếu API lỗi.

2. Thuật Toán Lượng Tử QAOA (18-Qubit Optimization)
Tối ưu hóa chiến lược luân canh dựa trên QUBO (Trọng số Nước, Đất, Lợi nhuận).

Hình phạt Độc canh: Ngăn chặn AI chọn trồng 1 loại cây liên tiếp 3 vụ để bảo vệ đất.

Chạy mô phỏng Statevector với 1024 shots tìm ra tổ hợp tối ưu.

3. Trực Quan Hóa Đa Lớp (Global Heatmap & Bubble Map)
Heatmap Khí hậu: Canvas nhẹ (~0.4MB RAM) hiển thị Nhiệt độ, Độ ẩm không khí/đất theo 12 tháng.

Bản đồ Vùng trồng (Bubble Map): Trực quan hóa diện tích thu hoạch thực tế của FAO. Bong bóng lớn nhỏ tương ứng với quy mô vùng trồng, đặt chính xác tọa độ (khắc phục lỗi offset của Raster).

4. Tuyến Đường Thương Mại & Kinh Tế (Trade Routes)
Lấy giá thực tế từ NextFarm API và khoảng cách đường bộ từ OpenRouteService.

Tính toán Ngoại cảnh:

Chi phí vận chuyển đa phương thức (Đường bộ, Đường sắt, Đường biển, Hàng không).

Hệ số địa hình (Đồng bằng, Đồi núi).

Biến động giá nhiên liệu.

Tỷ lệ hao hụt sinh học (Perishability) đối với rau củ tươi.

Trực quan hóa bằng bản đồ đường đi có hiệu ứng chuyển động (Marching Ants) và Modal so sánh lợi nhuận.

5. Giao Diện Người Dùng Hiện Đại (UI/UX)
Cấu hình linh hoạt (Settings Modal): Thay đổi Theme màu, Bố cục (Trái/Phải), Kích thước (Chuẩn/Thu gọn), Phong cách (Glass/Sci-Fi HUD).

Sidebar Accordion: Các thẻ gấp gọn, tích hợp thanh cuộn, không lo tràn màn hình.

Cố định Footer: Nút "Chạy phân tích" và "Tuyến đường thu mua" luôn ghim ở đáy.

📡 Chi Tiết API Endpoints
1. POST /api/analyze
Thực hiện phân tích nông học và chạy thuật toán lượng tử QAOA.
Request Body:

json
{
  "lat": 10.04, "lon": 105.78,
  "w_water": 0.33, "w_soil": 0.33, "w_profit": 0.34,
  "user_crops": ["Rice", "Soybean", "Maize"]
}
Response: Dữ liệu vệ tinh, rủi ro, biểu đồ 12 tháng, kịch bản (baseline, user, quantum).

2. POST /api/trade_routes
Tính toán lợi nhuận thương mại và tuyến đường logistics tối ưu.
Request Body:

json
{
  "lat": 10.04, "lon": 105.78,
  "crops": ["Rice", "Soybean", "Maize", "Peanut", "Veggies"]
}
Response: Trả về danh sách các trạm thu mua tốt nhất, khoảng cách, chi phí vận chuyển, tỷ lệ hao hụt và lợi nhuận ròng.

3. GET /api/random_coords
Trả về tọa độ ngẫu nhiên của các nông trại hợp lệ (tránh đại dương).

🛠️ Hướng Dẫn Gỡ Lỗi Nhanh (Troubleshooting)
Triệu chứng	Cách xử lý
Lỗi Port 3000 bị chiếm	Server tự đổi port. Để kill: Get-NetTCPConnection -LocalPort 3000 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force } (PowerShell)
Bản đồ bong bóng cây trồng không hiện	Chạy lại python scripts/build_crop_popularity.py. Đảm bảo file public/data/crop-points.json tồn tại. Nhấn Ctrl + F5 để xóa cache.
Lỗi không tải được Tuyến thương mại (500)	Thiếu API Key trong file .env. Hoặc khoảng cách quá xa. Hệ thống sẽ tự động fallback về giá ước tính và khoảng cách chim bay.
Bản đồ bị lệch màu (Offset)	Tính năng Heatmap khí hậu đôi khi bị ảnh hưởng bởi phép chiếu Web Mercator ở vĩ độ cao. Sử dụng tính năng Bubble Map (Mục 5) để có tọa độ chính xác tuyệt đối.
Biểu đồ không hiển thị	Mở F12 Console kiểm tra lỗi Chart.js. Đảm bảo API /api/analyze trả về ok: true.