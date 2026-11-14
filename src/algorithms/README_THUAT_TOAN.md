# Các module thuật toán FarmShift

Trạng thái hiện tại mô tả phần mềm thử nghiệm, không phải chứng nhận khoa học. Kiến trúc, API và giới hạn chi tiết nằm trong [README chính](../../README.md); đối chiếu từng mục đánh giá nằm trong [báo cáo sửa lỗi](../../docs/BAO_CAO_SUA_LOI.md).

| Module | Phạm vi thực tế | Giới hạn |
|---|---|---|
| 01 NASA provider | Climatology và lịch sử tháng tách biệt; metadata và đổi đơn vị theo phản hồi | Đã smoke-check online một điểm; T2M_MIN tùy chọn và daily Tmin 5 năm; chưa kiểm định tại ruộng |
| 02 Demo simulation | Dữ liệu mô phỏng gắn mock/DEMO, chỉ phục vụ thử nghiệm | Không hiệu chuẩn địa phương, không dùng khi NASA lỗi |
| 03 QC | Kiểm tra hữu hạn, sentinel, giới hạn; giữ zero; nội suy khoảng thiếu tuyến tính/cyclic | Giới hạn vật lý heuristic; outlier chỉ gắn cờ nghi ngờ |
| 04 DOS | Tiện ích DOS thử nghiệm, từ chối hiệu chỉnh lại surface reflectance | Không nằm trong /api/analyze; chưa kiểm định bức xạ với ảnh chuẩn |
| 05 QA | Bộ giải mã riêng Landsat C2, MOD09GA StateQA, MOD13Q1 SummaryQA, Sentinel-2 SCL | Không tự đoán sản phẩm; spectral heuristic không phải toàn bộ Fmask |
| 06 Indices | Công thức NDVI/EVI/NDMI/SAVI; scene gate cần reflectance + QA; climate proxies riêng | API chưa tải ảnh thực; NDVI/ESI trên dashboard là proxy |
| 07 SG | Làm mượt chuỗi và trích phenology | Dữ liệu từ proxy vẫn là proxy sau làm mượt |
| 08 SPI | Dữ liệu tháng liên tục tối thiểu 31 năm; SPI-1/3/6; fixture 372 tháng NASA so với gamma CDF/normal inverse jStat | Không tính từ climatology; thiếu/suy biến trả unavailable; chưa kiểm định dự báo ngoài mẫu |
| 09 Clustering | K-Means++ có seed; phân nhóm 12 tháng tại một điểm hoặc các điểm đầu vào | Không phải bản đồ FAO GAEZ đầy đủ |
| 10 RF | Phân loại thử nghiệm với synthetic dataset có seed | Không có dữ liệu nhãn thực địa/GAEZ; chưa có accuracy ngoài mẫu; không dùng trong API |
| 11 Fuzzy | Ngưỡng heuristic hiện có, công khai nguồn gốc từng nhóm tham số và đơn vị | verified=false; chưa có xác minh chính xác theo giống/vùng/vụ; is_lethal là ràng buộc mô hình |
| 12 MCDA | Chuẩn hóa trực tiếp slider, hàm AHP pairwise riêng, TOPSIS | Slider không phải AHP elicitation; TOPSIS phụ thuộc ứng viên/điểm proxy |
| 13 Optimization | Objective planning_rotation_v5 chung cho UI, QUBO và exhaustive 216 phương án; QAOA mô phỏng có benchmark nhiều seed | Điểm 0–100 là heuristic lập kế hoạch, không phải đất/nước/lợi nhuận đo được; không có tuyên bố lợi thế lượng tử |
| 14 Validation | Kiểm tra logic fixture, RMSE/MAE chỉ nhận số hữu hạn, benchmark phần mềm riêng | Không phải ground truth thực địa hay nghiệm thu nông nghiệp |

Chạy `npm test`, `npm run check`, `npm run benchmark` từ thư mục gốc. Bộ test offline không cần kết nối NASA; kết quả không được diễn giải thành tỷ lệ chính xác nông nghiệp.

Xem thêm [rét và độ cao SRTM/NASA POWER](../../docs/RET_VA_DO_CAO_NASA.md).
