# Sửa lỗi biển, vùng băng và đồng bộ frontend/backend

Các thay đổi được lưu trực tiếp trong `E:\FarmShiftRemake`. Không giải nén đè từ `src.zip` hoặc `public/js.zip` cũ lên bản hiện tại.

## Nguyên nhân đã kiểm chứng

1. Điểm trong ảnh `74.2174, 7.5411` thuộc Greenland Sea. Bộ phân loại cũ bỏ sót vì dùng một số khung biển và đa giác tự vẽ; nó đi tiếp tới NASA rồi báo thiếu dữ liệu đất. Đã thay bằng hình học đất liền, hồ và băng dùng chung cho mọi luồng.
2. Server ở cổng 3000 vẫn chạy module Node cũ, dù đang phục vụ file JS mới từ đúng workspace. `/api/runtime` và `/api/location` khi đó đều trả 404. Đã xác định đúng tiến trình, kiểm tra file JS phục vụ khớp workspace, khởi động lại và xác nhận contract `terrain-v2-objective-v5`, objective `planning_rotation_v5`.
3. QC dùng MAD trên cả 12 tháng làm đỉnh nóng / bức xạ mùa khô ở Cần Thơ bị coi là ngoại lai và chặn toàn bộ phân tích. Kiểm tra lại bằng chuỗi NASA thật: thêm yêu cầu ngoại lai trong cửa sổ Hampel 5 tháng theo chu kỳ cho climatology. Giữ nguyên số NASA, bộ lọc sentinel/giới hạn vật lý, nội suy có nhãn và chặn dữ liệu lỗi. Đây là phép sàng lọc thống kê của ứng dụng, chưa được hiệu chuẩn độc lập; không tuyên bố xác nhận chất lượng tại ruộng.
4. `alert()` được gọi trước `finally` khiến lớp loading còn trên màn hình trong lúc hộp thoại chặn trình duyệt. Lỗi API/mạng nay hiển thị ngay dưới nút Run; loading luôn đóng.
5. Chuỗi nguồn và metadata dài được đưa vào header. Đã chuyển vào mục thu gọn “Nguồn dữ liệu và trạng thái phân tích”; thời kỳ dữ liệu hiển thị dạng ngày/tháng dễ đọc thay cho JSON.

## Phạm vi thay đổi

- `src/utils/geoClassifier.js`, `src/data/*`: hình học dùng offline, phân biệt biển / hồ / vùng băng / đất / điểm cần kiểm tra đường bờ.
- `src/routes/api.js`, `src/services/nasa.js`: kiểm tra vị trí trước khi gọi NASA; trả riêng nguyên nhân thiếu biến, chất lượng thấp hoặc lỗi kết nối. Vẫn giữ thông tin độ cao và rét khi thiếu dữ liệu nông nghiệp.
- `src/algorithms/03_quality_control_preprocessing.js`: kiểm tra ngoại lai climatology có xét các tháng lân cận; không sửa số đo để làm dữ liệu đẹp hơn.
- `public/js/location.js`, `map.js`, `geocoder.js`, `analysis.js`, `render.js`, `ui-helpers.js`: click, nhập tọa độ và tìm địa danh dùng cùng bộ phân loại; bỏ suy đoán nước từ việc reverse geocoder không tìm thấy quốc gia. Bỏ phản hồi cũ khi đổi điểm. Giữ cảnh báo biển và băng khi bấm Run.
- `public/index.html`, `public/css/style.css`, `server.js`: đặt nguồn vào mục thu gọn, thông báo lỗi không chặn, tránh cache JS/HTML/API cũ.
- Không đổi hàm mục tiêu chấm điểm, thuật toán exact/QAOA, SPI, biểu đồ nhiệt độ âm hay quy tắc rủi ro cây theo mùa đã có.

## Kiểm tra

- `npm test`: 141/141 đạt, gồm toàn bộ 103 kiểm thử trước và 38 kiểm thử hồi quy mới. Các ca địa lý gồm đúng điểm biển trong ảnh, Vịnh Bắc Bộ, Vịnh Thái Lan, đại dương, hồ, các đảo, hai cực, nhiều đỉnh Alps, Himalaya, Andes và thung lũng không có băng trên bản đồ.
- `npm run check`: kiểm tra cú pháp JavaScript đạt.
- `node src/validation/check-terrain-live.js`: kiểm tra trực tiếp NASA POWER climatology, lịch sử nhiệt độ tối thiểu 2021–2025 và SRTM tại Thái Lan trong ảnh, Cần Thơ, Zermatt. Kết quả và chuỗi climatology thật lưu ở `terrain-live-check.json`. Cần mạng; tệp này không làm fallback ở runtime.
- `node src/validation/check-browser-terrain.js`: Chrome headless, Leaflet thật, thao tác chọn điểm biển trong ảnh và Mont Blanc / Matterhorn / Jungfrau, sau đó phân tích NASA thật tại điểm Thái Lan. Không có lỗi JavaScript; lớp loading đóng; nguồn không nằm trên header. Kết quả ở `browser-terrain-check.json` và ảnh `browser-*.png`.
- Kiểm thử offline mô phỏng NASA lỗi vẫn nhận diện đúng biển/băng, thiếu dữ liệu vẫn giữ độ cao / nguy cơ rét; phản hồi chọn điểm tới không đúng thứ tự không ghi đè cảnh báo mới; backend cũ được báo rõ cách khởi động lại.

## Giới hạn dữ liệu

[NASA POWER climatology](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/) là số liệu khí hậu lưới, không phải dự báo hoặc nhiệt độ đo tại ruộng. [NIST về tính mùa vụ](https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc443.htm) giải thích cần đưa mùa vụ vào mô hình chuỗi thời gian; cửa sổ QC 5 tháng ở đây là lựa chọn sàng lọc của ứng dụng.

[Natural Earth glaciated areas](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-glaciated-areas/) có cả vùng từng có băng. Cảnh báo không xác nhận tuyết theo thời gian thực. Bản đồ chưa đủ để kết luận mọi điểm sát bờ, đảo rất nhỏ, rìa sông băng hoặc tuyết theo mùa. Đã ghi rõ giới hạn trong giao diện thay vì bịa số liệu hoặc gán mọi vùng núi thành băng.

Tại Zermatt, kiểm tra trực tiếp cho SRTM khoảng 1609 m, ô POWER khoảng 2251 m. Vì chênh trên 500 m, vẫn giữ chặn khuyến nghị tại điểm và cảnh báo ô khí hậu có thể không đại diện thung lũng. Không suy ra cả thung lũng là sông băng từ nhiệt độ ô lưới.

Mở `http://localhost:3000`, nhấn `Ctrl+F5` để tải giao diện mới. Nếu tự chạy lại sau này: dừng server cũ bằng `Ctrl+C`, chạy `npm start` trong đúng thư mục dự án.
