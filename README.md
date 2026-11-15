# 🛰️ FarmShift

NASA Space Apps Challenge 2026 — *Field Shift: Adapting Farms with NASA Data*

FarmShift là ứng dụng bản đồ hỗ trợ so sánh mức phù hợp khí hậu của cây trồng và lập kế hoạch luân canh ba vụ. Backend dùng Express; giao diện dùng JavaScript, Leaflet và Chart.js. Hệ thống có mô phỏng QAOA, nghiệm đối chiếu cổ điển, bản đồ nhiệt và công cụ tuyến thương mại.

Điểm số là chỉ số kinh nghiệm của mô hình, không phải xác suất cây sống, năng suất thực đo hay lợi nhuận được bảo đảm. QAOA chạy bằng mô phỏng trên máy tính, không phải phần cứng lượng tử.

## Khởi chạy

Yêu cầu Node.js >= 18 và npm. Chạy các lệnh trong thư mục chứa `package.json`:

```sh
npm install
npm start
```

Mở `http://localhost:3000`. Không mở trực tiếp `public/index.html`, vì giao diện cần backend `/api`.

```sh
npm run dev   # Node --watch; tự khởi động lại backend khi mã thay đổi
npm test      # Chạy bộ kiểm thử Node.js
```

Đổi cổng và bật log trên PowerShell:

```powershell
$env:PORT = '3001'
$env:DEBUG = '1'
npm start
```

Trên Bash:

```sh
PORT=3001 DEBUG=1 npm start
```

Server đọc cấu hình từ `.env` nếu có. Luồng NASA POWER hiện tại không gửi API key. Cần kết nối mạng để tải dữ liệu NASA, bản đồ nền và thư viện giao diện từ CDN. Python chỉ cần khi sử dụng các script xử lý dữ liệu Python, không cần để chạy web thông thường.

## Sử dụng

1. Chọn điểm trên bản đồ hoặc nhập vĩ độ, kinh độ.
2. Chọn cây cho ba vụ và điều chỉnh trọng số đất, nước, lợi ích.
3. Nhấn **Run Quantum Analysis** để phân tích.
4. Xem dữ liệu khí hậu và kết quả trong right panel.

### Bảng cây phù hợp với vùng đất

- Gồm Lúa, Đậu tương, Lạc, Ngô và Rau màu; sắp xếp theo điểm giảm dần.
- Tìm cửa sổ trồng thuận lợi nhất cho từng cây, có thể đi qua tháng 12 sang tháng 1.
- Điểm khí hậu dùng nhiệt độ, lượng mưa, độ ẩm đất và các điều chỉnh nóng/rét.
- Chấm điểm liên tục trong khoảng tối ưu; bỏ hệ số API ngoài từng làm nhiều cây bị đẩy lên 100%.
- Hiển thị một chữ số thập phân. Mức sàn 1% của bảng biểu thị tương thích rất thấp.
- Xem trước khi rê chuột không chạy bộ tối ưu lượng tử.

Chi tiết công thức: [CROP_RANKING_SCORING.md](docs/CROP_RANKING_SCORING.md).

### Biểu đồ theo vụ trong Quantum AI Optimal

Ba biểu đồ cột hiển thị điểm phù hợp khí hậu của năm cây:

| Biểu đồ | Tháng |
| --- | --- |
| Vụ 1 | T1–T4 |
| Vụ 2 | T5–T8 |
| Vụ 3 | T9–T12 |

Mỗi biểu đồ xếp cột giảm dần, dùng chung trục tung 0–100 điểm. Rê chuột để xem điểm chi tiết. Không có cột Bỏ hoang và không nhân điểm với API ngoài. Điểm 0 được giữ nguyên trong biểu đồ.

Các biểu đồ đánh giá đúng từng vụ cố định, khác với bảng tìm mùa thuận lợi nhất. Cây có cột cao nhất không nhất thiết được bộ tối ưu chọn: kế hoạch luân canh còn xét đất, nước, lợi ích và chuyển tiếp giữa các vụ. Lịch ba vụ là lịch minh họa của dự án, chưa hiệu chuẩn cho từng vùng hoặc giống cây.

### Điều chỉnh right panel

Kéo thanh **↕** giữa bảng cây và phần kết quả để thay đổi chiều cao hai phần. Có thể chọn thanh bằng bàn phím rồi dùng **↑ / ↓**. Nội dung từng phần cuộn độc lập.

### Khi phân tích thất bại

- Thiếu dữ liệu: popup thông báo biến bị thiếu khi backend cung cấp danh sách.
- Dữ liệu nghi ngờ: popup báo cần kiểm tra chất lượng, phân biệt với thiếu dữ liệu.
- Yêu cầu quá 60 giây: tự ngắt chờ, tắt loading và cho phép chạy lại.
- Lỗi mạng hoặc phản hồi không hợp lệ: hiển thị thông báo thất bại.

Nếu backend đã trả lỗi, popup xuất hiện ngay. Dữ liệu mô phỏng không được dùng thay dữ liệu thật để đưa ra khuyến nghị.

## Dữ liệu và giới hạn

Nguồn khí hậu chính là NASA POWER. Các biến có nguồn tái phân tích MERRA-2 hoặc sản phẩm bức xạ theo metadata của provider. Những chỉ số proxy như NDVI/ESI suy ra từ khí hậu cần được phân biệt với quan sát vệ tinh trực tiếp; không coi toàn bộ giao diện là dữ liệu trực tiếp từ SMAP, GPM, ECOSTRESS hoặc MODIS.

Bộ kiểm tra chất lượng bảo toàn lượng mưa bằng 0, lọc giá trị thiếu/sentinel và đánh dấu ngoại lai. Lịch sử mưa dùng cho SPI là dữ liệu riêng; không tạo lịch sử giả từ 12 tháng khí hậu trung bình. Kiểm tra rét và địa hình bổ sung ngữ cảnh cho điểm chọn.

API suitability bên ngoài là nguồn bổ sung tùy chọn cho kế hoạch tối ưu; không dùng để nhân điểm trong bảng và biểu đồ khí hậu. Khi không có kết quả QAOA khả dụng, giao diện phân biệt nghiệm dự phòng cổ điển.

## Cấu trúc chính

```text
server.js                         Express, /health, static files
src/routes/api.js                 Các endpoint phân tích và bản đồ
src/services/nasa.js              Tải, kiểm tra và dẫn xuất dữ liệu khí hậu
src/services/cropRanking.js       Xếp hạng cây và điểm từng vụ
src/services/coldRisk.js          Rủi ro rét và địa hình
src/services/scoring.js           Chấm điểm kế hoạch
src/services/alerts.js            Thông báo rủi ro
src/algorithms/                    QC, suitability, MCDA, tối ưu luân canh
src/quantum/                       Bộ mô phỏng và adapter QAOA
src/config/crops.js               Cây trồng, tham số, lịch vụ
public/index.html                 Giao diện
public/js/analysis.js             Gọi phân tích, timeout và popup lỗi
public/js/charts.js               Biểu đồ khí hậu, radar, cột từng vụ
public/js/crop-recommendations.js  Bảng xếp hạng và xem trước
public/js/panel-splitter.js        Thanh điều chỉnh right panel
public/js/render.js               Cập nhật kết quả lên giao diện
public/css/                       Giao diện và bố cục
public/data/                      Dữ liệu bản đồ
scripts/                          Công cụ phát triển, tạo dữ liệu
 tests/                           Kiểm thử tự động
```

## API chính

| Phương thức | Endpoint | Chức năng |
| --- | --- | --- |
| GET | `/health` | Trạng thái server |
| GET | `/api/runtime` | Phiên bản backend và objective |
| GET | `/api/location?lat=10.04&lon=105.78` | Phân loại vị trí |
| GET | `/api/crop_suitability?lat=10.04&lon=105.78` | Xem trước bảng cây |
| POST | `/api/analyze` | Phân tích và tối ưu ba vụ |
| POST | `/api/trade_routes` | Phân tích tuyến thương mại |
| GET | `/api/random_coords` | Tọa độ nông trại mẫu |

Ví dụ body `/api/analyze`:

```json
{
  "lat": 10.04,
  "lon": 105.78,
  "w_water": 0.33,
  "w_soil": 0.33,
  "w_profit": 0.34,
  "user_crops": ["Rice", "Soybean", "Maize"]
}
```

Phản hồi thành công gồm dữ liệu tháng, nguồn dữ liệu, rủi ro, các kịch bản, `crop_rankings` và `seasonal_crop_rankings`. Khi thất bại, kiểm tra `ok`, `error`, `source_status`, `missing_variables` và `suspect_variables` nếu có.

## Tạo dữ liệu bổ sung

```sh
npm run build:grid
npm run build:trade
npm run build:trade:sample
```

Các lệnh tạo dữ liệu có thể cần mạng và cấu hình riêng của script. Dữ liệu trade mẫu phục vụ phát triển, không phải dữ liệu thương mại trực tiếp. Script `scripts/build_crop_popularity.py` là công cụ xử lý vùng trồng bằng Python; kiểm tra dependency của script trước khi sử dụng.

## Gỡ lỗi

| Hiện tượng | Cách kiểm tra |
| --- | --- |
| Cổng 3000 bị chiếm | Đổi `PORT` rồi chạy lại; server hiện không tự đổi cổng. |
| Báo chất lượng `PRECTOTCORR` | Kiểm tra `suspect_variables` và metadata tháng trong phản hồi API. Mưa bằng 0 tự nó không phải dữ liệu lỗi. |
| Popup thiếu dữ liệu hoặc timeout | Kiểm tra mạng, log backend và trạng thái API; thử lại hoặc chọn điểm khác. |
| Biểu đồ chưa hiện | Chạy phân tích thành công; kiểm tra Chart.js từ CDN và Console trình duyệt. |
| Thay đổi mã chưa xuất hiện | Khởi động lại backend nếu dùng `npm start`, rồi tải lại trang bằng Ctrl+F5. |
| Backend cũ không khớp giao diện | Kiểm tra `/api/runtime`, dừng đúng server cũ và khởi động lại tại thư mục dự án. |

Các lệnh kiểm tra thường dùng:

```sh
npm test
node scripts/check-js.js
node --test tests/season-crop-charts.test.js tests/crop-ranking.test.js tests/analysis-merge.test.js
```
