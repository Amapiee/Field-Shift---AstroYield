# 🛰️ FarmShift (Node.js)

NASA Space Apps Challenge 2026 — *Field Shift: Adapting Farms with NASA Data*

## Chạy
```bash
npm install
npm start                 # http://localhost:3000
PORT=3001 npm start       # đổi cổng nếu 3000 bị chiếm
DEBUG=1 npm start         # bật log thời gian từng bước
npm run dev               # DEBUG + tự khởi động lại khi sửa code
npm test                  # chạy test các module
```
Yêu cầu Node.js >= 18.

## Cấu trúc & "lỗi thì xem file nào"

```
server.js                  Khởi động Express, gắn route + file tĩnh
src/
  routes/api.js            Endpoint /api/analyze, /api/random_coords
  services/nasa.js         Gọi NASA POWER, dữ liệu mock, NDVI/ESI, tóm tắt vệ tinh
  services/scoring.js      Chấm điểm đất / nước / lợi nhuận, xếp hạng S-A-B-C
  services/alerts.js       Cảnh báo nhiệt / mưa / hạn
  quantum/statevector.js   Bộ mô phỏng qubit (H, RZ, CX, RX, đo mẫu)
  quantum/qaoa.js          Ma trận chi phí + mạch QAOA + giải mã kết quả
  config/crops.js          Dữ liệu cây trồng, mùa vụ
  utils/helpers.js         clamp, round, mean...
  utils/logger.js          Log DEBUG
public/
  index.html               Khung HTML
  css/style.css            Toàn bộ CSS
  js/state.js              Biến trạng thái toàn cục
  js/map.js                Bản đồ Leaflet
  js/geocoder.js           Tìm kiếm địa điểm
  js/ui-helpers.js         Random toạ độ, tab, thanh HP, tag cây trồng
  js/charts.js             Cấu hình + vẽ biểu đồ Chart.js
  js/render.js             updateUI: đổ dữ liệu API lên giao diện
  js/analysis.js           Loading + gọi /api/analyze
tests/                     Test cho helpers, nasa/scoring, quantum
```

## Gỡ lỗi nhanh
| Triệu chứng | Xem |
|---|---|
| Dữ liệu NASA sai / luôn là mock | `DEBUG=1 npm start` → dòng `1. NASA fetch` ghi rõ lý do |
| Điểm số lạ | `src/services/scoring.js` |
| Kết quả lượng tử lạ / chậm | `src/quantum/qaoa.js` · dòng `3. quantum QAOA` |
| Bản đồ / tìm địa điểm lỗi | `public/js/map.js`, `public/js/geocoder.js` |
| Biểu đồ không hiện | `public/js/charts.js` + Console (F12) |
| Giao diện không cập nhật sau phân tích | `public/js/render.js` |

Các file JS trong `public/js/` là script thường (không phải module), nạp theo đúng thứ tự trong `index.html` và dùng chung biến toàn cục.

## API
- `POST /api/analyze` — `{lat, lon, w_water, w_soil, w_profit, user_crops}`
- `GET  /api/random_coords`
