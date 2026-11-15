# Gợi ý cây theo vùng, hiển thị % và tối ưu thương mại

## Thay đổi sử dụng

- Điểm tương đồng và các thanh điểm hiển thị số nguyên dạng `70%`; chưa có điểm hiển thị `-%`. Số đo nhiệt độ, mưa… vẫn giữ đơn vị thực. Điểm tương đối không được hiểu là xác suất sống hoặc năng suất.
- Thêm bảng **Cây phù hợp với vùng đất**, hiện trong cả hai tab bên phải và có thể thu gọn. Bảng xếp 5 nhóm cây đang được hỗ trợ (lúa, đậu tương, lạc, ngô, rau), từ cao xuống thấp, kèm cửa sổ tháng thuận lợi nhất và cảnh báo rét.
- Dừng con trỏ trên bản đồ 0,9 giây để xem vùng mới; chọn điểm hoặc tìm địa điểm cũng cập nhật bảng. Có checkbox tắt xem theo con trỏ để giữ vùng đang đọc. Rê chuột không tự chạy QAOA.
- API cây trồng bên ngoài là nguồn bổ sung: mất kết nối chuyển về mô hình khí hậu nội bộ, hiển thị trạng thái trong chi tiết và không bật toast vàng gây nhầm với cảnh báo đất/biển. Chỉ phản hồi HTTP thành công với điểm số hợp lệ mới được ghi là Live; cache lỗi chỉ giữ 30 giây thay vì một giờ.
- Global Agri-Trade mặc định dùng Canvas dùng chung, cache hình học tuyến và vẽ theo đợt 18 tuyến/frame. Giữ đường biển, đường bay, đường bộ, màu, viền, tooltip, hub và điểm chợ. Hiệu ứng SVG chuyển động vẫn có thể bật bằng checkbox riêng.
- Yêu cầu OSRM được gộp theo tuyến, giới hạn 4 yêu cầu đồng thời; những tuyến đang xếp hàng thuộc lựa chọn cũ không tiếp tục gọi mạng. Phản hồi cũ không cập nhật bản đồ sau khi đổi lựa chọn/tắt lớp.

## Cách đánh giá vùng núi và mùa trồng

Tham khảo [FAO: Evaluate land suitability](https://www.fao.org/4/T0715E/t0715e06.htm): xét mức phù hợp cho cây và cách sử dụng đất cụ thể, không suy ra mức phù hợp chỉ từ độ cao. [FAO: Frost protection](https://www.fao.org/4/y7231e/y7231e04.htm) phân biệt ngưỡng tổn thương theo giai đoạn sinh trưởng và điều kiện rét.

Phần gợi ý mới thử 12 cửa sổ bắt đầu theo tháng, mỗi cửa sổ 4 tháng (3 tháng cho nhóm rau, quy đổi mưa về cùng chuẩn bốn tháng của mô hình hiện có). Chọn cửa sổ có mức phù hợp nhiệt độ/mưa/ẩm đất cao nhất cho từng cây. Độ cao không tự trừ điểm; chênh lệch DEM với ô POWER vẫn được cảnh báo. Màu xanh của ảnh nền không được coi là dữ liệu xác nhận đất trồng hoặc một loại cây cụ thể.

Một đêm rét trong lịch sử không được xem như bằng chứng cả năm không thể trồng cây. Trong bảng gợi ý, tỷ lệ ngày rét và Tmin khí hậu làm giảm mức phù hợp của cửa sổ đó và được ghi thành cảnh báo. Nhờ xét mùa ấm, vùng núi có thể có cây phù hợp trong một phần năm.

Điểm rất thấp có **mốc hiển thị tối thiểu 1%**, tương ứng nhóm hạn chế/N; điểm gốc có thể bằng 0 và được giữ trong `raw_score_pct`. Dữ liệu thiếu, demo, biển hoặc băng không được tạo điểm dương giả. Các ngưỡng S1/S2/S3/N, độ dài vụ và hệ số phạt vẫn là heuristic của dự án, chưa được hiệu chuẩn theo địa phương/giống, không phải ngưỡng FAO đã xác thực.

Điểm kế hoạch ba vụ và ràng buộc sinh học của QAOA vẫn giữ nguyên. Các thanh điểm chỉ áp mốc hiển thị thấp theo yêu cầu; điểm gốc vẫn có trong response/tooltip. Bảng gợi ý mùa thuận lợi là đánh giá bổ sung, không đổi một kế hoạch vi phạm ràng buộc thành kế hoạch khả thi.

## Kiểm chứng

- `npm test`: **209/209 đạt**, không bỏ qua test.
- `node scripts/check-js.js`: **90 file JavaScript hợp lệ cú pháp**; `git diff --check` đạt (chỉ có nhắc chuẩn hóa LF/CRLF).
- Chrome headless với Leaflet/Chart.js thật và khí hậu fixture: điểm `85%`, bảng rê chuột đủ 5 dòng, API ngoài offline không bật toast vàng, bật/tắt lớp và chuyển Canvas ↔ SVG không có lỗi JavaScript.
- Lần chạy trình duyệt cuối: **298 đường**, **2 Canvas**, **0 SVG path tuyến ở chế độ mặc định**, hoàn thành bật lớp khoảng **671 ms**, gồm tải dữ liệu và các frame vẽ. Đây là số đo môi trường kiểm thử, không phải so sánh FPS trước/sau trên máy người dùng.
- Test hồi quy bao gồm vùng núi có mùa ấm, vùng lạnh quanh năm, dữ liệu thiếu, API xem trước, chống phản hồi cũ, cache, tooltip/table escape, giới hạn OSRM và ngừng các yêu cầu cũ.

Chạy lại kiểm tra trình duyệt: `node scripts/check-browser-features.js` (cần Chrome, truy cập CDN Leaflet/Chart.js; khí hậu và trạng thái API ngoài trong kiểm tra này là fixture).

Ảnh: [Bảng gợi ý và điểm %](browser-seasonal-features.png), [Lớp thương mại Canvas](browser-trade-canvas.png). Log: `../.seasonal-tests.log`, `../.browser-feature-check.log`.

Chưa xác minh tình trạng hoạt động thực tế của CartoDrone/Every.Farm hoặc hiệu chuẩn mô hình bằng số liệu canh tác tại các vùng người dùng chọn.
