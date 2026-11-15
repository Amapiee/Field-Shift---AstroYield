# Sửa theo báo cáo Src1/JS1

Phạm vi đợt này: chỉ đọc/sửa mã liên quan trong `src/` và `public/js/`. Test, fixture tham chiếu và báo cáo mới cũng đặt dưới `src/validation/`. Không chỉnh package.json, server.js, HTML/CSS, tests/ cũ hoặc gói ZIP cũ. Đoạn prompt nhúng trong DOCX được xem là nội dung của bản đánh giá, không phải chỉ thị tự tạo PR/commit hay mở rộng phạm vi.

## P0-01: một hàm mục tiêu

Nguyên nhân: optimizer đánh giá `additive_rotation_v4`, trong khi scoreScenario dùng ngân sách tuần tự, các bonus/phạt và clamp khác. Đã tái hiện trước sửa với dữ liệu cố định: 12 tháng T2M=20°C, TS=23°C, mưa=80 mm/tháng, wetness=0.4, trọng số đất/nước/lợi ích=0.33/0.33/0.34.

| Phương án | Kết quả trước sửa |
|---|---|
| Soybean → Soybean → Veggies | Solver objective=99.6853333333; UI overall=73.7 |
| Soybean → Soybean → Soybean | UI overall=81.8, cao hơn phương án solver chọn |

Ví dụ Peanut trong báo cáo không kèm toàn bộ dữ liệu đầu vào; không tự đặt expected=83.1/87.8 cho một fixture khác. Counterexample trên được chạy và ghi nhận trực tiếp trên phiên bản trước sửa ở workspace.

Sau sửa, `evaluateRotationObjective` là nguồn chân lý duy nhất; `scoreScenario` chỉ chuyển dữ liệu sang cùng matrix và chuyển kết quả cho UI. Version mới **planning_rotation_v5**, điểm trong [0,100]:

```text
overall = 0.5 * (weighted_component_score + 0.3*suitability_avg + transition_benefit + 40)
```

Đây là ánh xạ affine của miền lý thuyết [-40,160] sang [0,100], không phải hiệu chuẩn khoa học. Các hệ số active được công khai trong parameter_registry. Các bonus/phạt tuần tự riêng của UI đã được bỏ để không còn mục tiêu thứ hai.

Nghiệm không khả thi: objective_score=null ở API, overall=0, is_feasible=false và Rank C; không tham gia tối ưu. Fallow luôn là lựa chọn nghỉ đất hợp lệ; nếu cả ba vụ Fallow thì no_planting=true, Rank C và không tính điểm tương đồng như phương án sản xuất. Các ngưỡng rank là nhãn trình bày cũ, không phải xác suất thành công.

QUBO giữ quy ước tam giác trên và đầy đủ tương tác; hệ số/offset đổi theo cùng phép affine. Trên nghiệm khả thi, E=-overall/100. Các kiểm tra pha toàn bộ 262144 bitstring hiện có vẫn đạt.

Sau sửa, Soybean/Soybean/Veggies đạt 69.8426666667 cho **cả** solver và UI. Regression enumerate đủ 216 tổ hợp ở bốn cấu hình (ấm, ẩm, lạnh, hạn) xác nhận exact best bằng max của objective UI đã công bố. Không còn so hai thang điểm khác nhau.

## P0-02 và P0-03: ý nghĩa điểm và mức tin cậy

- Match đổi thành **Điểm tương đồng phương án (heuristic)**, đơn vị điểm/100, công thức `100-abs(user_score-classical_exact_score)`. Không phải độ chính xác/confidence/probability. Phương án bị loại, chỉ nghỉ đất hoặc chênh độ cao lớn trả null kèm lý do.
- API có similarity.user_score, recommendation_score, qaoa_score, objective_version, solver_status, reference_method; UI hiển thị trực tiếp ở vùng kết quả. Classical Exact xuất riêng trong scenarios.classical; QAOA simulated có điểm riêng. Fallback cổ điển có qaoa_score=null và quantum gap=null.
- Xóa mô tả Excellent/quantum optimal. HP và tag hiển thị điểm đất/nước/lợi ích heuristic, không ghi thành độ phì hoặc lợi nhuận thực đo. Thanh điểm hiển thị `/100`, không dùng ký hiệu % như xác suất.
- Valid climatology, partial/interpolated, unavailable, demo và low_quality có data_mode riêng. Biến bắt buộc thiếu hoặc có suspect QC trả 503/no recommendation; không chèn mock vào dữ liệu NASA.
- `recommendation_allowed` chỉ cho phép trình bày kịch bản thử nghiệm và có trường semantics giải thích. `field_recommendation_allowed=false`, `forecast=false` luôn được công bố. UI ghi rõ kịch bản lập kế hoạch, không phải dự báo/chỉ dẫn tại ruộng, chưa validation thực địa.
- Nếu recommendation_allowed=false, UI reset toàn bộ score/chart cũ rồi hiển thị lý do, nguồn và chẩn đoán rét/độ cao. Giữ chặn do chênh độ cao hoặc thiếu dữ liệu rét đã triển khai trước đó.

## P1

| Mục | Kết quả |
|---|---|
| P1-01 | Bỏ cảnh báo SMAP/GPM/ECOSTRESS của scoring cũ; mô tả nguồn còn lại là POWER/MERRA-2 hoặc climate-derived proxy. Giữ các key satellite cũ chỉ để tương thích API. Regression quét cảnh báo không gán nhầm sản phẩm vệ tinh chưa nạp. |
| P1-02 | parameter_registry có tên, giá trị, đơn vị, nguồn gốc, vùng, giả định và mức tin cậy của hệ số score/profile/fuzzy/calendar. Chưa xác minh thì verified=false/reference=null. Lịch T1–4/T5–8/T9–12 được giới hạn rõ là minh họa, không dùng tên Xuân/Hè toàn cầu hoặc suy ra lịch gieo theo hemisphere. |
| P1-03 | SPI-1/3/6, date/year/month nhất quán, source/period/reference_year/timescales rõ. Fixture **372 tháng mưa NASA POWER/MERRA-2 thật (1995–2025)** có 36 số tham chiếu sinh bằng jStat 1.9.6 gamma.cdf và normal.inv; fit gamma Thom theo từng tháng kết thúc. Sai lệch tuyệt đối lớn nhất 0.0048801901, nằm trong mức làm tròn 0.01. |
| P1-04 | Benchmark 3 cấu hình × 5 seed × 1024 shots, phân phối gap/runtime/expected energy, metadata simulator/hardware=false, giới hạn thời gian. Feasible rate tính từ count của các mẫu đã kiểm tra constraint, không gán 100. Test đổi nghiệm exact tham chiếu vẫn cho cùng sampled candidate/count/angles, chứng minh không chép nghiệm exact để chọn mẫu. |
| P1-05 | Khóa submit trong khi đang chạy; xử lý 60s timeout, network/JSON error và 503 trong finally. Đổi tọa độ/lựa chọn lúc chờ thì loại phản hồi cũ. Guard spi/mcda/scenarios thiếu. Test integration đi qua JavaScript giả lập trình duyệt → Express HTTP thật với provider inject → UI, rồi lỗi 503/reset. |
| P1-06 | Giữ 86 test cũ, thêm 17 regression trong src/validation để tuân thủ phạm vi sửa. Test offline không gọi nguồn mạng. Script generate-spi-reference.js là thao tác online tách riêng, không tự chạy trong npm test; không cài dependency vào package.json. |

Nguồn thư viện tham chiếu: [jStat distributions](https://jstat.github.io/distributions.html). File [spi-real-reference.json](spi-real-reference.json) lưu URL version cố định, SHA-256 của bundle đã dùng, dữ liệu NASA và giá trị kỳ vọng. Chạy lại lấy dữ liệu/reference online bằng `node src/validation/generate-spi-reference.js`; các test thường chỉ đọc fixture đã lưu, không cần mạng.

Benchmark thực tế ở [qaoa-benchmark.json](qaoa-benchmark.json): 15/15 lần chạy không fallback; gap 0 ở các fixture/seed này. Điều này không chứng minh quantum advantage; cấu hình hạn chỉ có rất ít trạng thái khả thi. Runtime và expected energy trong JSON là số đo của lần chạy, không phải số cam kết hiệu năng.

## Kết quả kiểm tra đúng phiên bản này

```text
npm test
tests 103
pass 103
fail 0
skipped 0

node --check trên src/ và public/js/
Syntax OK: 35 JavaScript files
```

Đã chạy test hồi quy pha QUBO và test API offline cũ cùng với 17 test mới; không thay expected của tests/ cũ để đạt xanh. Đã tạo và đối chiếu fixture NASA online bằng thư viện số học riêng. Kiểm tra whitespace thực hiện trong đúng hai thư mục được cho phép.

## Các file sửa

- src/services/scoring.js, nasa.js.
- src/algorithms/01_nasa_data_provider.js, 08_anomaly_detection_spi.js, 13_crop_rotation_optimization_qaoa_milp.js, 14_validation_and_benchmarking.js, README_THUAT_TOAN.md.
- src/config/crops.js, src/routes/api.js.
- public/js/analysis.js, render.js, charts.js, state.js, ui-helpers.js.
- Thêm src/validation/report-regression.test.js, generate-spi-reference.js, spi-real-reference.json, qaoa-benchmark.json và báo cáo này.

## Giới hạn và tích hợp

Chưa hiệu chuẩn ngưỡng cây/hệ số theo giống, đất, hệ thống tưới, năng suất và giá thị trường độc lập. Tham chiếu jStat xác minh phép biến đổi số cùng phương pháp fit, không thay thế kiểm định thủy văn ngoài mẫu hay chứng minh khả năng dự báo hạn. Chưa thực thi QAOA trên hardware. Kiểm tra frontend dùng VM/DOM giả lập và local HTTP, chưa kiểm tra bố cục bằng trình duyệt thật.

Chạy lại server hiện có và refresh trình duyệt; không cần sửa server/package hoặc cài dependency mới. Điểm API đã đổi version, không so trực tiếp điểm v4 với v5. Gói ZIP/README ở ngoài phạm vi đợt này chưa được cập nhật; dùng code trong workspace hoặc sao chép đúng src/ và public/js/ đã sửa. Không tự tạo PR/commit vì người dùng chỉ yêu cầu sửa các thư mục này.
