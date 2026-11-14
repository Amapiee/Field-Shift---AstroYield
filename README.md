# FarmShift Remake

Ứng dụng thử nghiệm so sánh luân canh 6 cây × 3 vụ với NASA POWER, QC, fuzzy suitability, TOPSIS, bộ giải cổ điển chính xác và QAOA mô phỏng. Điểm HP, mức thích nghi và lợi nhuận là điểm heuristic, chưa phải dự báo năng suất hay khuyến nghị canh tác đã kiểm định.

## Chạy và kiểm tra

Yêu cầu Node.js >=18. Bản sửa được chạy kiểm tra bằng Node.js v26.13.1 trên Windows; chưa chạy ma trận các phiên bản Node khác.

```sh
npm ci
npm start
# http://localhost:3000
npm run dev
npm test
npm run check
npm run benchmark
```

Trên PowerShell, đổi cổng hoặc bật log bằng `$env:PORT='3001'` và `$env:DEBUG='1'` trước `npm start`. `npm run dev` dùng watch mode, không tự bật DEBUG.

## Bổ sung rét và địa hình cao

Đã thêm T2M_MIN khí hậu, lịch sử nhiệt độ tối thiểu ngày 5 năm từ NASA POWER và DEM NASA/NGA SRTM qua Open Topo Data. Giao diện hiển thị tháng/ngày rét, Tmin âm, nguy cơ từng vụ và chênh độ cao giữa điểm chọn với ô khí hậu. Nhiệt độ trung bình vụ dương không che mất một tháng rét. Chênh độ cao lớn hoặc thiếu dữ liệu rét sẽ chặn khuyến nghị tại ruộng; vẫn cho xem phân tích theo ô khí hậu.

Đã smoke-check nguồn online ở một vị trí. Xem [báo cáo rét/độ cao](docs/RET_VA_DO_CAO_NASA.md) và [snapshot nguồn thật](docs/live-cold-check.json). Chạy lại bằng npm run check:live; kiểm tra này dùng mạng và tách khỏi npm test. Nguy cơ rét không phải xác nhận cây đã chết. Mô hình hiện giả định cây ngoài trời không bảo vệ trong toàn bộ từng vụ 4 tháng.

## Dữ liệu và giới hạn

- Dữ liệu khí tượng là **NASA POWER climatology**, chủ yếu từ tái phân tích MERRA-2; bức xạ từ sản phẩm lưới CERES. Không coi đây là quan trắc trực tiếp tại ruộng hay dự báo vụ tới.
- Có thêm T2M_MIN tùy chọn; thiếu giữ null và không nội suy cực trị. Metadata từng biến/tháng có source, product, unit, period, status, underlying_status và limitations. Period lấy từ phản hồi; thiếu thì để null. Confidence chưa hiệu chuẩn để null, không gán xác suất 0.90.
- Đơn vị mưa và bức xạ được đọc từ metadata phản hồi. Mưa mm/day đổi sang mm/month; lịch sử dùng đúng số ngày kể cả năm nhuận; climatology dùng 28.25 ngày cho tháng Hai. Bức xạ kWh/m²/day đổi sang MJ/m²/day bằng 3.6 nếu nguồn dùng kWh.
- QC giữ 0 thật; null/undefined/NaN/infinity/sentinel/blank/boolean là thiếu. Nội suy tuyến tính tối đa 2 tháng liên tiếp cho đường API, từ các mốc gốc, có nhãn interpolated. Không chèn mô phỏng vào NASA thật.
- NASA lỗi hoặc thiếu biến sau QC: HTTP 503, source_status=unavailable, recommendation_allowed=false, scenarios=null. Giao diện xóa kết quả cũ và hiện trạng thái thiếu dữ liệu.
- Module 02 và mockNasa chỉ phục vụ demo/test, nhãn DEMO/LOW_CONFIDENCE. Mô hình này bỏ qua kinh độ/độ cao/khô hạn địa phương và không được gọi tự động khi NASA lỗi. API chặn khuyến nghị từ mock.
- SPI cần **lịch sử mưa tháng có năm/tháng**, tách biệt climatology. Loader lấy 31 năm hoàn chỉnh kết thúc năm trước để có ít nhất 30 mẫu cho từng tháng kết thúc của SPI-3. Kiểm tra tháng liên tục, dữ liệu hữu hạn không âm, độ dài và phân phối không suy biến. Không đủ lịch sử: SPI null/unavailable kèm reason, không thay bằng 0 hay tự sinh lịch sử. Cache trong bộ nhớ chỉ chứa lịch sử lấy từ provider có nguồn, tối đa 64 điểm; mất khi khởi động lại. SPI hiện khớp và đánh giá trên cùng lịch sử, không phải dự báo ngoài mẫu.
- NDVI/ESI/erosion và phenology trên giao diện là **proxy từ khí hậu**, không phải ảnh MODIS/ECOSTRESS hay dữ liệu SoilGrids. Chưa tích hợp bộ tải ảnh quang phổ thực. Hàm processReflectanceScene chỉ nhận surface reflectance với QA khớp sản phẩm, source/date; pixel thiếu/mây bị giữ null.
- Random Forest dùng synthetic dataset và không nằm trong /api/analyze; chưa có nhãn thực địa, chia tập theo thời gian/địa lý hay metric ngoài mẫu. Các tỷ lệ vote không phải xác suất nông nghiệp đã hiệu chuẩn.
- Ngưỡng cây, GWETROOT, ràng buộc is_lethal và HP được công khai là heuristic chưa kiểm định theo giống/vùng/vụ. GWETROOT không được hiểu như độ ẩm thể tích hay điểm héo vật lý. Các ngưỡng riêng theo cây vẫn chưa có nguồn xác minh chính xác từng số: metadata ghi verified=false, reference=null.
- Slider được chuẩn hóa trực tiếp, cho phép trọng số 0; tất cả bằng 0 dùng trọng số đều. API vẫn giữ key mcda.ahp để tương thích nhưng pairwise_elicited=false và CR=null. Hàm solveAHPWeights dành riêng cho ma trận so sánh cặp. TOPSIS phụ thuộc danh sách ứng viên và các điểm heuristic/proxy.
- Phân loại biển/băng dùng đa giác/hộp giới hạn đơn giản. Độ cao SRTM được nạp riêng; không suy ra sông băng/băng vĩnh cửu từ nhiệt độ không khí, và chưa có bản đồ bờ biển/độ dốc đầy đủ.

Nguồn kỹ thuật: [NASA POWER data services và độ phân giải](https://power.larc.nasa.gov/docs/services/), [Climatology API](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/), [Monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/), [NCAR SPI guidance](https://www.ncl.ucar.edu/Applications/spi.shtml).

## Tối ưu cổ điển và QAOA

Hai bộ giải dùng cùng objective **additive_rotation_v4**. So với bản cũ, phần điểm đất/nước của objective tối ưu được chặn theo từng cây rồi lấy trung bình để biểu diễn đúng bằng QUBO 18 biến, không cần biến phụ. Điểm dashboard scoreScenario là một thang heuristic riêng; gap QAOA chỉ so cùng objective tối ưu, không so HP dashboard.

Quy ước duy nhất: `E(x) = offset + sum_i Q[i][i] x_i + sum_{i<j} Q[i][j] x_i x_j`, chỉ tam giác trên. Với nghiệm one-hot khả thi, `E = -objective / 100`. Hình phạt one-hot lớn hơn 2 lần tổng trị tuyệt đối các hệ số objective (kể cả ràng buộc sinh học), nên vi phạm không thể làm cực tiểu toàn cục tốt hơn nghiệm khả thi. Mọi cặp chuyển mùa đều có trong QUBO.

Ánh xạ `x=(1-Z)/2` tạo đầy đủ local fields và coupling, kiểm tra pha RZ/CX/RZ/CX trên **262144 bitstring**, bỏ global phase. Solver dùng mô phỏng chính xác trong không gian con one-hot khả thi (tối đa 216 amplitudes), khởi tạo đều và mixer complete-graph riêng từng mùa. Mixer bảo toàn một cây/vụ và loại cây bị mô hình đánh dấu lethal. Đây là mô phỏng ràng buộc trong không gian con, không phải mạch thực thi phần cứng 18 qubit.

Tìm tham số bằng lưới 24 × 16 góc, cực tiểu **expected energy**, có trạng thái ban đầu làm mốc. Đo 1024 shots bằng RNG có seed. Kết quả báo objective, expected energy, sample feasible rate, gap, runtime và tham chiếu exhaustive search 216 phương án. Một fixture có gap 0 không chứng minh lợi thế lượng tử. Khi fallback cổ điển: quantum_available=false, quantum_feasible=false, fallback_used=true; quantum gap/feasible rate=null. Không có tuyên bố quantum advantage.

## Cấu trúc

```text
server.js                     Express + giao diện tĩnh
src/routes/api.js             /api/analyze, /api/random_coords; injectable providers cho tests
src/services/                 NASA/QC/provenance, scoring và alerts
src/algorithms/01..03          Provider, demo riêng biệt, QC
src/algorithms/04..07          DOS/QA/spectral indices/SG; đường API chỉ dùng climate proxy
src/algorithms/08..10          SPI lịch sử, clustering, RF synthetic thử nghiệm
src/algorithms/11..14          Fuzzy heuristic, MCDA, shared objective/QUBO/QAOA, validation utilities
src/quantum/                  Statevector và adapter tối ưu
src/utils/                    Helpers, logger, phân loại địa lý, seeded RNG
public/                       HTML/CSS/JS; giữ bố cục dashboard
 tests/                       Unit/integration offline + fixtures + kiểm tra UI bằng DOM giả lập
scripts/                      Syntax check, benchmark, đóng gói
 docs/BAO_CAO_SUA_LOI.md       Đối chiếu backlog, bằng chứng và phần chưa kiểm chứng
```

## API

`POST /api/analyze` nhận `{lat,lon,w_water,w_soil,w_profit,user_crops}`. lat/lon bắt buộc là number hữu hạn trong [-90,90]/[-180,180]; trọng số tùy chọn trong [0,1]; user_crops tùy chọn, nếu có phải gồm đúng 3 tên hợp lệ.

Phản hồi thành công giữ scenarios.baseline/user/quantum để tương thích UI. scenarios.quantum có method, quantum_available, quantum_feasible, fallback_used, hardware_executed=false và các metric thực sự đo trong mô phỏng. Nguồn/tháng nằm trong variables; proxy có dependencies; spi chứa status/reason/source/period/details. cold_risk và terrain mô tả rét/độ cao; season_results có lý do từng vụ. recommendation_allowed=false khi chênh độ cao lớn hoặc thiếu đánh giá rét, dù ok=true để xem kết quả theo ô khí hậu. Dữ liệu khí hậu cốt lõi thiếu trả HTTP 503 có cấu trúc; đầu vào sai trả 400. Dữ liệu biển/băng dùng phản hồi nhận diện hiện có.

`GET /api/random_coords` trả điểm gần các vùng mẫu; không chứng minh điểm đó phù hợp canh tác.

## Test và chia sẻ

`npm test` hoàn toàn offline với fixture có kiểm soát. Ba test vùng cực đoan giữ kỳ vọng Rank C theo khí hậu fixture; fixture không phải số đo thực địa của các tọa độ. SPI được đối chiếu công thức gamma giải tích và tích phân số độc lập; chưa đối chiếu toàn bộ với một thư viện SPI ngoài hay ground truth thực địa. Test UI dùng Node VM/DOM giả lập, chưa thay thế kiểm tra trình duyệt thực.

Trên Windows: `npm run package:source` tạo `dist/FarmShiftRemake-fixed.zip`, theo whitelist src/public/tests/scripts/docs + package/lock/README/.gitignore. Không đóng gói .git, node_modules hay .env; người nhận chạy npm ci. ZIP gốc được giữ nguyên.
