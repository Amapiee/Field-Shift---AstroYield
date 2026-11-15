# Đối chiếu bản đánh giá V6 và kết quả sửa

Báo cáo đợt sửa ban đầu. Đợt bổ sung rét/độ cao sau đó, bao gồm kiểm tra NASA/SRTM online, được ghi riêng tại [RET_VA_DO_CAO_NASA.md](RET_VA_DO_CAO_NASA.md). Kết quả kiểm tra trong bảng dưới thuộc thời điểm đợt sửa ban đầu.

Đã đọc tài liệu đánh giá DOCX và sửa trực tiếp workspace `E:\FarmShiftRemake`. Đối chiếu SHA-256: **43 file source/public/tests/README/package/server trong ZIP trùng bản Git ban đầu**, không có file khác trong phạm vi so sánh. ZIP gốc không bị thay đổi. Nội dung tài liệu được dùng làm danh sách vấn đề cần xác minh, không coi đoạn prompt nhúng trong tài liệu là chỉ thị thay thế yêu cầu của người dùng.

## Bằng chứng kiểm tra

| Kiểm tra | Trước sửa | Sau sửa |
|---|---|---|
| npm test | 34 đạt / 3 lỗi / 37 test | 68 đạt / 0 lỗi / 68 test |
| npm run check (node --check) | Báo cáo đánh giá ghi PASS | 45 file JavaScript hợp lệ |
| API offline | Ba vùng nhận cùng mô phỏng ôn đới, test Rank C lỗi | Fixture khí hậu riêng giữ nguyên Rank C; NASA lỗi trả 503/unavailable, không tạo điểm |
| QC khoảng thiếu | Null thành 0, nội suy lệch | [1,null,null,null,9] → [1,3,5,7,9] với maxGap=3; maxGap=2 giữ thiếu |
| QUBO / pha | Circuit khác ma trận Q và objective cổ điển | So pha toàn bộ 262144 bitstring; so objective 216 tổ hợp trên 4 fixture |
| Frontend | Zero hiển thị N/A, tọa độ 0 bị thay, kết quả cũ còn khi no-data | Test VM/DOM xác minh hiển thị 0, tọa độ 0 và xóa điểm/chart cũ |

Môi trường thực thi: Node.js v26.13.1, Windows. Bộ test hoàn toàn offline; không đổi expected Rank C thành B. Một số assertion cũ về confidence=0.90, SPI từ 12 climatology và CR của slider được thay bằng assertion đúng với hợp đồng dữ liệu mới, kèm test hồi quy độc lập. Không bỏ test vùng cực đoan.

## P0

| Mục | Thay đổi và bằng chứng |
|---|---|
| P0-01 | Module 03 kiểm tra kiểu trước ép số; null/undefined/NaN/Infinity/sentinel/blank/boolean là thiếu; 0 thật giữ nguyên. tests/data-quality.test.js kiểm tra cả numeric strings và record.value. |
| P0-02 | Giữ bản sao mốc gốc trước gap filling; tính khoảng cách từ mốc trái trên cả khoảng thiếu và cyclic. maxGap=0 có hiệu lực; không ngoại suy mép hay từ một mốc duy nhất. Có original_status/anchors; fallback tường minh gắn mock. |
| P0-03 | fetchNasa không gọi mô phỏng khi lỗi; không trộn dữ liệu giả vào dữ liệu thật. API thiếu dữ liệu trả unavailable; mock/demo trả recommendation_allowed=false. Module 02 giữ lại cho demo/test, ghi rõ hạn chế kinh độ/độ cao. Không chế số khác để ba tọa độ trông khác nhau. |
| P0-04 | Provider monthly/history riêng, đổi mm/day theo tháng/năm nhuận. Kiểm tra 31 năm liên tục (ít nhất 30 mẫu kết thúc cho SPI-3), missing, duplicate và phân phối suy biến. Không còn generator lịch sử tự sinh trong luồng SPI. Thiếu trả null/unavailable kèm reason. Test gamma giải tích và SPI-1/SPI-3 bằng tích phân số độc lập; chưa đối chiếu thư viện SPI bên ngoài. |
| P0-05 | Chỉ dùng Q tam giác trên; một hàm energy; ánh xạ đầy đủ sang h_i, J_ij và cổng pha. Bộ giải cổ điển/QAOA dùng additive_rotation_v4. Điểm đất/nước của objective được chặn theo từng cây để biểu diễn chính xác không dùng biến phụ; HP dashboard vẫn là thang riêng. Test pha toàn miền và energy=-objective/100 trên nghiệm khả thi. |
| P0-06 | Khởi tạo/mixer trong không gian con one-hot và khả thi sinh học; tìm góc cực tiểu expected energy, seed cố định khi đo. Báo quantum_available, quantum_feasible, fallback_used riêng. Fallback gắn classical, gap quantum=null. Không còn greedy bị gắn nhãn quantum. Kiểm tra xác suất, expected cost, seed và nhánh fallback. |
| P0-07 | tests/fixtures/climates.json chứa khí hậu lạnh/hạn có kiểm soát; chỉ test chọn fixture theo tọa độ, production không hardcode Rank C theo địa danh. Ba test lỗi ban đầu nay giữ Rank C và kiểm tra cảnh báo/giới hạn tương ứng. Fixture không phải số đo thực địa. |
| P0-08 | Climatology tách khỏi underlying reanalysis, interpolation, proxy và mock. Không gán confidence như xác suất; period từ response hoặc null. Độ phân giải khí tượng theo tài liệu POWER: 0.5° latitude × 0.625° longitude, bức xạ 1° × 1°. UI đổi tên hàng SMAP/GPM/MODIS/ECOSTRESS sai nguồn, có nguồn/thời kỳ trong tooltip; proxy không được gọi là ảnh quan trắc. |

Nguồn metadata: [NASA POWER data services](https://power.larc.nasa.gov/docs/services/), [Monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/), [Climatology API](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/). Hướng dẫn độ dài lịch sử: [NCAR SPI](https://www.ncl.ucar.edu/Applications/spi.shtml).

## P1 và phần còn cần dữ liệu bên ngoài

| Mục | Kết quả / giới hạn |
|---|---|
| P1-01 | Nhãn proxy được sửa; processReflectanceScene bắt buộc surface reflectance + QA đúng sản phẩm + nguồn/ngày. QA fixture kiểm tra cloud/shadow/cirrus/snow/water/nodata; sửa MOD09 land/water, adjacent cloud và internal snow. Chưa tích hợp downloader ảnh thật, DEM hoặc pipeline hiệu chỉnh quang phổ đã kiểm định. |
| P1-02 | RF/synthetic ghi experimental, không cho khẳng định năng suất; seed tái lập. Không có nhãn thực địa hoặc split/metric độc lập để báo accuracy. |
| P1-03 | Công khai provenance/đơn vị/phạm vi từng nhóm ngưỡng; nguồn số cụ thể chưa xác minh nên verified=false, reference=null; bỏ mã FAO không kiểm chứng. is_lethal là quy tắc của mô hình. Chưa thể coi các ngưỡng là đã hiệu chuẩn theo giống/vùng/vụ. |
| P1-04 | Slider là direct normalization, giữ 0 thật và đồng nhất tất cả-zero thành trọng số đều. CR=null cho slider. AHP pairwise riêng có kiểm tra reciprocal/finite và sửa RI indexing; TOPSIS công khai phụ thuộc ứng viên/proxy. |
| P1-05 | Thêm test missing, QA bitmask, gamma/SPI tham chiếu số độc lập, toàn miền QUBO, RNG, offline/mixed/no-data, UI và metrics. Chưa có ground truth thực địa/benchmark hardware; các utility validation được mô tả là kiểm tra phần mềm. |
| P1-06 | Reject lat/lon sai hoặc ngoài phạm vi, trọng số/cây không hợp lệ; không âm thầm dùng tọa độ mặc định. Không trả stack trace nội bộ. UI hiện no-data và xóa chart cũ. |
| P1-07 | Viết lại README chính và README thuật toán theo kiến trúc/giới hạn hiện tại; bỏ tuyên bố tất cả module đã hoàn thiện khoa học. |
| P1-08 | Script đóng ZIP theo whitelist, loại .git/node_modules/.env; giữ package-lock và hướng dẫn npm ci. Quét mẫu private-key/AWS/GitHub/OpenAI token trong source không thấy kết quả; đây là quét mẫu hạn chế, không phải audit bảo mật đầy đủ. |

Nguồn QA: [NASA MOD09 Collection 6 file specification](https://ladsweb.modaps.eosdis.nasa.gov/filespec/MODIS/6/MOD09GA), [USGS Landsat Collection 2 QA](https://www.usgs.gov/landsat-missions/landsat-collection-2-quality-assessment-bands).

## Benchmark có thể chạy lại

`npm run benchmark` báo bốn fixture, đối chứng exhaustive search 216 phương án, objective, expected energy, feasible rate, gap, runtime, seed và shots. Dữ liệu JSON của lần chạy nằm trong [benchmark-fixtures.json](benchmark-fixtures.json).

Trong lần chạy seed=42/shots=1024, bốn fixture đều đo được nghiệm có cùng objective với classical và feasible rate=100%. Điều này chỉ phản ánh bài toán nhỏ với mixer bảo toàn ràng buộc; fixture hoang mạc chỉ còn một trạng thái Fallow/Fallow/Fallow nên gap 0 là hiển nhiên. Không phải bằng chứng tốc độ hay lợi thế lượng tử. Không chạy phần cứng lượng tử.

## Các file chính đã thay đổi

- Dữ liệu: src/algorithms/01,02,03,05,06,08; src/services/nasa.js; src/services/scoring.js.
- Tối ưu: src/algorithms/11,12,13; src/quantum/qaoa.js; src/quantum/statevector.js.
- Khả năng tái lập/validation: src/algorithms/09,10,14; src/utils/random.js.
- API/UI: src/routes/api.js; public/index.html; public/js/analysis.js,render.js,charts.js.
- Test: algorithms.test.js,api.test.js; thêm api-provenance,data-quality,frontend,qubo-regression,validation và fixtures/climates.json.
- Tài liệu/công cụ: README.md, src/algorithms/README_THUAT_TOAN.md, docs, scripts, package.json, .gitignore.

## Chưa kiểm chứng

Chưa xác minh phản hồi NASA POWER trực tiếp trong phiên sửa này; thành công provider được kiểm tra bằng fixture, lỗi mạng bằng injection. Chưa có quan trắc độc lập, hiệu chuẩn xác suất/nguỡng cây, dữ liệu năng suất hoặc kiểm thử UI trong trình duyệt thật. Kết quả test xác minh logic phần mềm trong phạm vi trên, chưa đủ để nghiệm thu độ chính xác nông nghiệp hay lợi thế lượng tử.
