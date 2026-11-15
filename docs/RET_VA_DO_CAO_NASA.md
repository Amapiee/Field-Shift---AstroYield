# Nhiệt độ âm, nguy cơ rét và địa hình cao

Đợt bổ sung theo yêu cầu ngày 15/11/2026. Hai ZIP được đối chiếu trước khi sửa: 26 file trong src.zip và 7 file trong public/js.zip trùng workspace. Giữ nguyên các ZIP người dùng gửi; sửa các file đang chạy trong dự án.

## Dữ liệu và cách đánh giá

- NASA POWER climatology yêu cầu thêm **T2M_MIN** bên cạnh 6 biến khí hậu cũ. Đây là thống kê nhiệt độ tối thiểu của sản phẩm khí hậu, không coi là một đêm có ngày cụ thể. Biến này là tùy chọn: không có thì để null; không suy ra từ T2M và không nội suy cực trị.
- Thêm provider **NASA POWER Daily T2M_MIN,T2M**, Local Solar Time. Luồng API lấy 5 năm hoàn chỉnh kết thúc năm trước (hiện là 2021–2025). Mỗi tháng báo Tmin thấp nhất, ngày tương ứng, số ngày dưới 0°C, số năm có rét, số ngày liên tiếp trong tháng, số ngày hợp lệ/thiếu. Không đo số giờ lạnh và không tính xác suất dự báo từ các số đếm này.
- Kiểm tra ngày hợp lệ, trùng ngày, phạm vi thời gian, năm nhuận, null/sentinel/giá trị vô hạn. Ngày thiếu giữ thiếu; không tự sinh lịch sử hay nội suy đêm lạnh. Cache bộ nhớ tối đa 64 điểm cho từng sản phẩm; lịch sử ngày có khóa theo vị trí và thời kỳ năm, mất khi restart.
- Nếu không tải được lịch sử ngày, dùng T2M_MIN climatology làm bằng chứng sàng lọc riêng. Nếu chỉ có T2M trung bình dương thì trạng thái rét là **unknown**, không coi là an toàn. Trung bình tháng âm vẫn là bằng chứng khí hậu lạnh dù thiếu Tmin. Thời kỳ khí hậu lấy từ header hoặc thông báo thời kỳ rõ ràng của NASA; không đoán khi thiếu metadata.
- Vụ cố định hiện tại là T1–T4, T5–T8, T9–T12. Chỉ cần một tháng có bằng chứng dưới 0°C, mô hình bảo thủ loại cây nhạy rét khỏi kế hoạch ngoài trời không bảo vệ cho toàn bộ vụ đó. Bộ giải cổ điển, QUBO/QAOA và scoreScenario dùng cùng coldExposure; mùa khác không bị loại theo tháng rét này.
- Với nhóm Veggies, không kết luận mọi loại rau đều chết: báo **variety_dependent**, yêu cầu xác định giống chịu lạnh trước khi khuyến nghị. Nhóm này bị loại khỏi kế hoạch không bảo vệ khi chưa xác định giống, nhưng is_lethal=false. Fallow không bị loại vì rét.
- is_lethal là cờ tương thích cũ của ràng buộc mô hình; cờ mới model_excluded mô tả việc loại khỏi kế hoạch, **mortality_confirmed=false**. Không coi điểm năng suất heuristic bằng 0 là thiệt hại thực địa đã được quan sát. Cần giống, giai đoạn phát triển, điều kiện tại ruộng và biện pháp bảo vệ để đánh giá tổn thương cụ thể.

Nguồn: [NASA Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), [NASA temporal processing](https://power.larc.nasa.gov/docs/methodology/data/processing/), [FAO frost protection: crop differences and adaptation](https://www.fao.org/4/y7223e/y7223e0a.htm).

## Độ cao và tính đại diện tại ruộng

Provider độc lập lấy **NASA/NGA SRTM v3 ~90 m qua Open Topo Data**. API công khai là bên phục vụ dữ liệu thứ ba; không gọi đây là endpoint NASA trực tiếp. Dữ liệu SRTM thu nhận tháng 2/2000; pixel DEM không thay thế khảo sát hiện trường và có thể không phản ánh địa hình đã thay đổi. Ngoài phạm vi danh nghĩa -56° đến 60° hoặc dữ liệu lỗi/thiếu thì trả unavailable, không đoán độ cao.

Phân biệt site_elevation_m (pixel DEM) và grid_elevation_m (geometry của NASA POWER). Chênh lệch tuyệt đối từ 500 m trở lên: climate_representativeness=limited_by_elevation_difference, recommendation_allowed=false, recommendation_status=elevation_mismatch và match_pct=null. Vẫn hiển thị phân tích theo ô khí hậu để người dùng xem, nhưng không đưa ra phần trăm khuyến nghị tại điểm chọn.

Ngưỡng 500 m là quy tắc cảnh báo bảo thủ của ứng dụng, chưa hiệu chuẩn thành sai số nhiệt độ. Nhãn “địa hình cao” từ 2000 m cũng chỉ là ngưỡng mô tả UI; không phải giới hạn canh tác chung. Không tự trừ nhiệt độ theo một lapse rate giả định, không suy ra độ dốc, sông băng, băng vĩnh cửu hay cây chết chỉ từ độ cao/nhiệt độ không khí.

Nếu thiếu dữ liệu rét ở một số tháng, recommendation_allowed=false, recommendation_status=cold_risk_incomplete. Các điểm HP khi đó chỉ phục vụ xem thử theo dữ liệu khí hậu còn có, chưa phải khuyến nghị tại ruộng. Quy tắc này không biến dữ liệu thiếu thành Rank C.

Nguồn: [NASA SRTM acquisition coverage](https://data.nasa.gov/dataset/shuttle-radar-topography-mission-dted-level-1-3-arc-second-data-dted-1), [Open Topo Data SRTM](https://www.opentopodata.org/datasets/srtm/), [Elevation API](https://www.opentopodata.org/api/).

## Bằng chứng truy cập nguồn thật

Đã kết nối NASA POWER climatology, Daily và Open Topo Data tại `(30.49,79.13)`. Bản ghi có timestamp UTC trong [live-cold-check.json](live-cold-check.json); đây là smoke check một vị trí, không phải kiểm định toàn cầu.

| Đại lượng | Kết quả từ nguồn |
|---|---|
| SRTM pixel elevation | 1484 m |
| POWER model-grid elevation | 3184.08 m |
| Chênh DEM − ô khí hậu | -1700.08 m |
| Thời kỳ daily được kiểm tra | 2021-01-01 đến 2025-12-31 |
| Tmin thấp nhất lịch sử được tải | -16.95°C, 2022-02-05 |
| Tháng có ngày dưới 0°C trong lịch sử | 1,2,3,4,5,10,11,12 |

Những nhiệt độ này thuộc **ô khí hậu POWER**, không thể gán trực tiếp cho pixel SRTM thấp hơn khoảng 1700 m. Vì vậy ứng dụng chặn khuyến nghị tại ruộng cho trường hợp này. Không khẳng định điểm này là đỉnh núi, sông băng hoặc có cây đã chết.

Chạy lại kiểm tra online bằng `npm run check:live` (cần mạng, không nằm trong npm test). Script ghi lại snapshot kiểm chứng nguồn thật, không dùng snapshot làm dữ liệu fallback khi API lỗi.

## Giao diện và kiểm thử

Kết quả cuối đợt: **86/86 test đạt**, **48 file JavaScript qua node --check**, git diff --check không có lỗi whitespace. Bộ 68 test cũ vẫn đạt; thêm 18 test cho period/parser/nguy cơ rét/độ cao/API/UI. Kiểm tra nguồn thật qua script online thành công ở vị trí đã ghi trên. ZIP mã nguồn được cập nhật, loại cả các ZIP đính kèm cũ để tránh lồng phiên bản cũ vào bản chia sẻ.

- Biểu đồ phân biệt T2M trung bình, T2M_MIN khí hậu, Tmin thấp nhất lịch sử đã tải, TS và đường 0°C; trục nhiệt độ không chặn số âm. Khoảng thiếu vẫn là khoảng thiếu.
- Thẻ độ cao/rét liệt kê từng tháng, ngày lạnh nhất, thời kỳ, thiếu dữ liệu và chênh độ cao DEM/POWER.
- Mỗi chiến lược có lý do theo vụ, ví dụ T1 âm dù trung bình vụ dương; cảnh báo “có thể tổn thương/chết rét” thay cho kết luận “chết hoàn toàn”.
- Reset/no-data xóa cả thẻ độ cao và danh sách nguy cơ cũ. Không thay đổi bố cục bản đồ và các lựa chọn cây.
- Test mới kiểm tra parser ngày/năm nhuận, tháng rét đơn lẻ, dữ liệu thiếu, min khí hậu, mùa hè ấm, nhóm rau, Fallow, ràng buộc chung classical/QAOA, độ cao thiếu/0/âm, cache, metadata API và UI/biểu đồ bằng DOM giả lập.

Các file chính: src/algorithms/01,03,08,11,13; src/services/nasa.js,scoring.js,coldRisk.js; src/utils/geoClassifier.js; src/routes/api.js; public/index.html,css/style.css,js/render.js,charts.js,analysis.js; tests/cold-risk.test.js và các fixture/test API/UI liên quan.

Chưa kiểm định thiệt hại thực địa, giống cây/giai đoạn sinh trưởng hoặc vi khí hậu từng ruộng. Lịch sử 5 năm không phải chuẩn xác suất sương giá dài hạn. Chưa chạy kiểm tra UI bằng trình duyệt thực; test UI hiện dùng Node VM/DOM giả lập.
