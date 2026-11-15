# Sửa đồng bộ và kiểm chứng — 15/11/2026

Đã sửa trực tiếp các điểm không khớp giữa API, QAOA, chấm điểm và giao diện. Không xóa các luồng phân tích, bộ mô phỏng cũ, bản đồ khí hậu, bản đồ cây trồng, tuyến thương mại, tooltip hoặc thiết lập giao diện.

## API, QAOA và chấm điểm

- API dùng cùng mục tiêu planning_rotation_v5 cho phương án người dùng, baseline, Classical Exact và QAOA; không còn đọc baseline bị thiếu từ nhánh mô phỏng cũ.
- Suitability bên ngoài vẫn tác động tới điểm kế hoạch, nhưng không được bỏ qua ràng buộc sinh học/rét. Fallback/static của API ngoài không bị hiểu thành số đo trực tiếp.
- Suitability và hệ số thị trường đi qua cùng ma trận chấm điểm và Hamiltonian, giúp điểm UI và optimizer nhất quán. Điểm thành phần được giới hạn trong thang 0–100.
- Giữ `buildCostMatrix`, nhánh statevector legacy, cách gọi bằng map cũ và chấm điểm legacy riêng. Adapter nhận cả options cấu trúc mới lẫn cách truyền options cũ, có trường baseline/trạng thái fallback rõ ràng.
- `quantumOptions.disabled` từ API được chuyển đúng tới optimizer.
- Từ chối tọa độ sai kiểu và danh sách cây sai định dạng bằng HTTP 400. Giá trị số 0 và việc không gửi trường cây để dùng mặc định vẫn hợp lệ.

## Render và giao diện

- Thêm `renderColdRisk`: độ cao tại điểm so với ô POWER, kỳ lịch sử, Tmin theo tháng, ngày lạnh nhất, số ngày dưới 0°C, tháng chưa đủ dữ liệu và lý do rủi ro theo từng vụ.
- Giữ các đường nhiệt độ cũ, thêm Tmin khí hậu, Tmin lịch sử và mốc 0°C. Không nối qua giá trị Tmin bị thiếu.
- Thêm render chi tiết nguồn, SPI, trạng thái solver và thứ hạng TOPSIS. Nguồn được giữ trong phần details có thể mở/đóng.
- Dữ liệu thiếu hiển thị N/A; số 0 thật vẫn hiển thị 0. Điểm tương đồng dùng thang điểm /100 và giữ lý do backend gửi, không biến null thành 0%.
- Tôn trọng các cờ cho phép hiển thị phương án; dữ liệu khí hậu và bằng chứng rét vẫn có thể xem khi chưa đủ cơ sở hiển thị kế hoạch tại điểm.
- Dọn cả nhãn và thanh rủi ro cũ sau response thiếu RISK hoặc khi reset. Khối API ngoài cũng được ẩn/xóa trạng thái cũ khi không có dữ liệu.
- Alert dùng textContent để không diễn giải thông báo thành HTML. Giữ toast khi API ngoài mất kết nối.
- Giữ thanh HP, crop tags, radar, chuyển tab lần đầu và tooltip. Radar hỗ trợ thêm mốc Classical Exact và ghi đúng tên khi dùng fallback.
- Thanh điểm dùng đơn vị /100; thanh DRI/FRI giữ cách biểu diễn phần trăm của chỉ số tương đối. Lịch vụ dùng các khoảng tháng thay vì áp mùa địa phương lên mọi tọa độ.
- Đổi ngôn ngữ giữ icon tooltip và nhắm đúng tiêu đề từng chart; không ghi nhầm tên biểu đồ lên khối độ cao/rét.

## Bản đồ và chạy ứng dụng

- Heatmap khí hậu chỉ tải crop grid khi có lớp cây trồng yêu cầu; giữ logic giải mã lớp cây trồng và xác thực metadata riêng.
- Chuẩn hóa mã quốc gia hai/ba ký tự khi tìm hub và waypoint đường bộ. Giữ đường biển, đường bay, đường bộ và marker hub; marker và tuyến bộ dùng chung endpoint.
- `npm run dev` gọi script Node đa nền tảng để bật DEBUG và chế độ watch, không cần thêm dependency.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | **197/197 đạt**, 0 thất bại, 0 bỏ qua |
| `node scripts/check-js.js` | **83 file JavaScript hợp lệ về cú pháp** |
| `git diff --check` | Đạt; Git chỉ nhắc chuẩn hóa LF/CRLF ở một số file |
| `npm run dev` trên Windows | Khởi động thành công, DEBUG bật và `/health` trả `ok: true`; tiến trình kiểm thử đã được dừng |
| Ma trận heatmap | 39/39 trạng thái: 3 lớp × 12 tháng và cả năm; không gọi crop grid không dùng |
| Suitability và optimizer | Duyệt 216 tổ hợp để đối chiếu điểm UI với Classical Exact; QAOA dùng cùng mục tiêu và giữ ràng buộc rét |

Bổ sung 7 ca hồi quy trong `tests/integration-regressions.test.js`, gồm API có suitability live, fallback, tính nhất quán mục tiêu, dữ liệu thiếu/cũ, an toàn alert, tải heatmap, tuyến bộ và đổi ngôn ngữ.

Ba assertion trade cũ được cập nhật theo hành vi hiện có: độ dày tối thiểu mặc định 1.6, kiểm tra luồng gạo lớn nhất theo dữ liệu thay vì cố định quốc gia, và giữ hub nội địa của đường bộ. Không bỏ test hoặc bỏ phương thức vận tải để đạt kết quả.

Log: `../.fix-test-output.log`, `../.fix-regression-output.log`. Kiểm thử UI dùng DOM giả lập và HTTP fixture cục bộ; chưa xác minh tương tác trong trình duyệt thật hoặc tình trạng dịch vụ bên ngoài.

Git index vẫn giữ nguyên trạng thái merge có sẵn; chưa stage hoặc tạo commit.
