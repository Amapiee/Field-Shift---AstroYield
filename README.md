# 🛰️ FarmShift

NASA Space Apps Challenge 2026 — *Field Shift: Adapting Farms with NASA Data*

Ứng dụng nông nghiệp chính xác tích hợp dữ liệu vệ tinh NASA, mô phỏng tính toán Lượng tử (Quantum QAOA) và trực quan hóa bản đồ nhiệt (Global Climate Heatmap) nhằm tối ưu hóa chu kỳ luân canh cây trồng, dự báo rủi ro thiên tai (Hạn hán & Lũ lụt) và bảo vệ tài nguyên đất.

---

## 🚀 Khởi Chạy Nhanh

```bash
npm install
npm start                 # Khởi chạy server tại http://localhost:3000
PORT=3001 npm start       # Đổi cổng nếu cổng 3000 bị chiếm
DEBUG=1 npm start         # Bật log thời gian chi tiết từng bước xử lý
npm run dev               # Chạy chế độ phát triển (tự khởi động lại khi sửa code)
npm test                  # Chạy bộ unit test tự động
Yêu cầu: Node.js >= 18.

🏗️ Kiến Trúc Hệ Thống & Cấu Trúc Mã Nguồn
server.js                  Cấu hình Express, xử lý EADDRINUSE tự động, nạp API & Static files
src/
  routes/api.js            Endpoints (/api/analyze, /api/random_coords) & Error middleware
  services/nasa.js         Fetch NASA POWER (có auto-convert mm/ngày -> mm/tháng), Caching 1h,
                           PRNG Mock deterministic theo tọa độ, tính chỉ số NDVI/ESI/DRI/FRI
  services/scoring.js      Chấm điểm Đất / Nước / Lợi nhuận (có hệ số phạt sinh tồn khi thiếu nước)
  services/alerts.js       Chẩn đoán rủi ro thiên tai chuyên biệt (Hạn hán & Lũ lụt)
  quantum/statevector.js   Bộ mô phỏng trạng thái Qubit (Hadamard, RZ, CX, RX, Đo mẫu)
  quantum/qaoa.js          Ma trận chi phí QUBO + Thuật toán Lượng tử QAOA 18-qubit
  config/crops.js          Định nghĩa thông số cây trồng, chỉ số chịu nhiệt/hạn/ngập & mùa vụ
  utils/helpers.js         Hàm tiện ích (clamp, round, mean, meanAt, maxOf, minOf, THRESHOLDS)
  utils/logger.js          Bộ ghi log thời gian & gỡ lỗi theo biến môi trường DEBUG
public/
  index.html               Giao diện người dùng (Accordion mượt, Sidebar scrollable, Settings Modal)
  css/style.css            Hệ thống kiểu dáng UI Glassmorphism & Tối ưu bố cục responsive
  js/state.js              Quản lý trạng thái toàn cục ứng dụng
  js/map.js                Bản đồ Leaflet (Quản lý đa lớp Esri/Google, pane nhãn độc lập)
  js/geocoder.js           Tìm kiếm địa điểm đa nguồn (ArcGIS -> Photon -> Nominatim + Async Water Guard)
  js/ui-helpers.js         Tạo thẻ cây trồng, thanh HP, Modal Settings, Random vị trí an toàn
  js/charts.js             Khởi tạo & Cập nhật biểu đồ Chart.js (Biểu đồ đường, cột & Radar)
  js/render.js             Đổ dữ liệu từ API lên UI, kiểm soát khối RISK (DRI/FRI) & Chuyển Tab
  js/analysis.js           Xử lý luồng tải (Loading Steps) và gọi API /api/analyze
  js/heatmap-core.js       Nội suy toán học, giải mã lưới khí hậu & bảng màu Heatmap
  js/heatmap.js            Tích hợp lớp Canvas Heatmap lên Leaflet + Điều khiển UI
  data/climate-grid.json   Dữ liệu lưới khí hậu toàn cầu 5° (T2M, RH2M, GWETROOT × 12 tháng)
scripts/
  build-climate-grid.js    Script cào dữ liệu NASA POWER thật tạo file climate-grid.json
  dev/gen_synthetic_grid.py Sinh dữ liệu MÔ PHỎNG để demo khi chưa build lưới thật
tests/                     Các kịch bản kiểm thử tự động cho helpers, nasa, scoring và quantum
🌟 Các Tính Năng Nổi Bật
1. Dữ Liệu Vệ Tinh NASA & Chỉ Số Phái Sinh Chuyên Sâu
NASA POWER, SMAP, GPM IMERG, ECOSTRESS, MODIS: Thu thập dữ liệu thực tế về Nhiệt độ (T2M, TS), Lượng mưa (PRECTOTCORR), Độ ẩm đất (GWETTOP, GWETROOT), Bức xạ mặt trời.
Chẩn đoán Thiên tai Chuyên biệt (DRI & FRI):
DRI (Drought Risk Index): Tính toán rủi ro hạn hán dựa trên độ khô của đất tầng rễ và mức độ sốc nhiệt trong năm.
FRI (Flood Risk Index): Đánh giá nguy cơ ngập úng/lũ lụt kết hợp giữa lượng mưa cực đoan và mức độ bão hòa nước của đất.
Tự động Chuẩn hóa & Cache: Tự động chuyển đổi lượng mưa từ mm/ngày sang mm/tháng đảm bảo tính chính xác với thực tế; tích hợp bộ nhớ đệm In-Memory Cache (TTL 1 giờ) giúp tăng tốc độ phản hồi.
Mock Deterministic dự phòng: Khi mất kết nối API, bộ giả lập sẽ tạo dữ liệu nhất quán theo tọa độ lat/lon (cùng vị trí luôn ra cùng một bộ dữ liệu).
2. Thuật Toán Lượng Tử QAOA (18-Qubit Optimization)
Xây dựng ma trận chi phí QUBO dựa trên trọng số ưu tiên của nông dân (Đất, Nước, Lợi nhuận) và dữ liệu thời tiết thực tế tại ô đất.
Mô phỏng mạch lượng tử QAOA trên 18 Qubits (3 mùa vụ × 6 loại cây) với các lớp Phase Separation và Entanglement, thực hiện 1024 lần đo (shots) để tìm ra chiến lược luân canh đạt lợi ích tối đa.
3. Trực Quan Hóa Bản Đồ Nhiệt Toàn Cầu (Global Heatmap)
Hiển thị lớp phủ Canvas độ phân giải cao trên toàn cầu mà không làm giảm hiệu năng (chỉ chiếm ~0.4 MB RAM).
Cho phép bật/tắt, chuyển đổi chỉ số (Nhiệt độ, Độ ẩm không khí, Độ ẩm đất), chọn tháng trong năm (tháng 1–12 hoặc TB cả năm), điều chỉnh độ đục/trong suốt và đảo màu sắc.
4. Giao Diện Người Dùng (UI/UX) Hiện Đại & Thân Thiện
Bố cục Accordion Độc lập: Thiết kế Sidebar dạng các thẻ gấp gọn, các mục tự động đẩy xuống khi mở rộng, tích hợp khung cuộn (scrollbar) mượt màng không lo bị tràn hay chèn chữ.
Nút "Chạy phân tích" cố định (Pinned Footer): Nút kích hoạt luôn ghim ở đáy panel giúp thao tác nhanh chóng.
Thanh Công Cụ Settings (⚙️): Tích hợp nút bánh răng ở góc Header mở ra Modal cài đặt trọng số ưu tiên (Bảo vệ đất, Tiết kiệm nước, Tối đa lợi nhuận), giúp màn hình chính luôn tinh gọn.
Tìm Kiếm & Bảo Vệ Tọa Độ Biển Async (Water Guard):
Tìm kiếm địa điểm thông minh 3 tầng (ArcGIS -> Photon -> Nominatim).
Tích hợp kiểm tra từ khóa nhanh và truy vấn bất đồng bộ (Reverse Geocoding) để phát hiện tọa độ ngoài đại dương mà không làm treo ứng dụng.
🛠️ Hướng Dẫn Gỡ Lỗi Nhanh (Troubleshooting)
Triệu chứng	Kiểm tra / Xử lý
Lỗi Port 3000 bị chiếm (EADDRINUSE)	Server tự động thử port tiếp theo (3001, 3002...). Để kill process cũ: <br>• PowerShell: Get-NetTCPConnection -LocalPort 3000 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }<br>• CMD: netstat -ano | findstr :3000 rồi taskkill /PID <PID> /F
Dữ liệu NASA nghi ngờ sai / dùng Mock	Chạy DEBUG=1 npm start. Xem dòng log nasa fetch để biết nguồn dữ liệu (live, hybrid, hay mock).
Bản đồ / Địa điểm không tìm thấy	Kiểm tra public/js/map.js và public/js/geocoder.js. Báo lỗi nước biển sẽ hiển thị dạng Toast thông báo.
Biểu đồ không hiển thị	Kiểm tra public/js/charts.js và mở F12 Console kiểm tra lỗi Chart.js.
Giao diện không cập nhật sau phân tích	Kiểm tra public/js/render.js (hàm updateUI và renderRiskBlock).
Heatmap không hiển thị	Kiểm tra file public/data/climate-grid.json. Chạy lệnh npm run dev:synthetic-grid nếu muốn tạo file mô phỏng nhanh.
📡 Chi Tiết API Endpoints
1. POST /api/analyze
Thực hiện phân tích tổng hợp cho ô đất nông nghiệp.

Request Body:

{
  "lat": 10.04,
  "lon": 105.78,
  "w_water": 0.33,
  "w_soil": 0.33,
  "w_profit": 0.34,
  "user_crops": ["Rice", "Soybean", "Maize"]
}
Response Structure: Trả về đối tượng JSON gồm dữ liệu vệ tinh (satellite), đánh giá rủi ro (alerts & RISK), dữ liệu 12 tháng (monthly), so sánh các kịch bản (scenarios: baseline, user, quantum) và phần trăm độ tương thích (match_pct).
2. GET /api/random_coords
Trả về ngẫu nhiên tọa độ một nông trại nằm trong danh sách vùng nông nghiệp trọng điểm đã qua kiểm duyệt (tránh khu vực đại dương).