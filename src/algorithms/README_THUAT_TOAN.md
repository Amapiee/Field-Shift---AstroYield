# TỔNG HỢP HỆ THỐNG THUẬT TOÁN KHOA HỌC DỰ ÁN FARMSHIFT (PHIÊN BẢN CHUẨN HÓA KHOA HỌC V3)
**Dự án:** FarmShift (NASA Space Apps Challenge — *Field Shift: Adapting Farms with NASA Data*)  
**Đơn vị thực hiện:** Nhà Nghiên Cứu Khoa Học & Nhóm Kỹ Thuật FarmShift  
**Thư mục lưu trữ chính quy:** `FarmShiftRemake/thuật toán/` (và bản sao đồng bộ `thuat_toan/`)

---

## 1. Báo cáo khắc phục các lỗ hổng nghiêm trọng (P0 & P1)

Dưới đây là các vấn đề khoa học được chỉ ra trong đợt đánh giá chuyên sâu và giải pháp kỹ thuật đã được triển khai khắc phục triệt để:

### 1.1. [P0] Tích hợp Dữ liệu NASA Thực và Phân định Nguồn Dữ liệu (Thuật toán 01 & nasa.js)
* **Vấn đề cũ:** Trong `src/routes/api.js`, luồng chính vẫn gọi hàm riêng mà chưa tích hợp `fetchNasaPointData(lat, lon)` của Thuật toán 01. Mô tả sản phẩm NASA POWER bị nhầm lẫn là trực tiếp truy vấn các cảm biến độc lập.
* **Giải pháp V3:**
  - `fetchNasaPointData(lat, lon)` trong `01_nasa_data_provider.js` trở thành cổng nạp dữ liệu chính quy duy nhất của hệ thống, trả về hợp đồng siêu dữ liệu ISO 19115.
  - Phân định minh bạch về mặt khí tượng học và viễn thám:
    + **NASA POWER**: Dữ liệu khí tượng nông học dựa trên mô hình đồng hóa và tái phân tích **GMAO MERRA-2** ($0.5^\circ \times 0.5^\circ$).
    + **Lượng mưa (`PRECTOTCORR`)**: Được đo bằng trạm mặt đất hiệu chỉnh phối hợp với sản phẩm vệ tinh viễn thám **GPM IMERG**.
    + **Ẩm độ đất rễ & tầng mặt (`GWETROOT`, `GWETTOP`)**: Đồng hóa từ mô hình bề mặt đất Catchment LSM kết hợp dữ liệu bức xạ vi sóng L-Band từ vệ tinh **SMAP**.
    + **Nhiệt độ bề mặt (`TS`)**: Ước tính từ cân bằng năng lượng bề mặt (Surface Energy Balance Skin Temp Proxy), phân biệt rõ với dữ liệu hồng ngoại nhiệt phân giải cao 70m từ cảm biến **ECOSTRESS** trên trạm ISS.
    + **Chỉ số thực vật (`NDVI`)**: Mô hình hóa sinh lý tán lá chuẩn hóa từ cảm biến **MODIS MOD13Q1 / Sentinel-2**.

### 1.2. [P0] Chuẩn hóa Chỉ số Hạn Hán SPI theo WMO-1090 (Thuật toán 08)
* **Vấn đề cũ:** Ước lượng phân phối Gamma trên 12 giá trị tháng đơn lẻ; xấp xỉ Wilson-Hilferty thiếu chính xác; dùng phép modulo `(i - 2 + n) % n` nối tháng 11-12 với tháng 1 cùng năm khi tính SPI-3.
* **Giải pháp V3:**
  - Triển khai **Hàm phân phối Gamma tích lũy không đầy đủ chính xác (Regularized Incomplete Gamma Function $P(\alpha, x) = \frac{\gamma(\alpha, x)}{\Gamma(\alpha)}$)** thông qua khai triển chuỗi số Taylor ($x < \alpha + 1$) và liên phân số Lentz ($x \ge \alpha + 1$), loại bỏ hoàn toàn sai số của xấp xỉ Wilson-Hilferty.
  - Xây dựng hàm `calculateMultiYearSPI(series, timescale)` tính toán SPI-1 và SPI-3 trên chuỗi lịch sử nhiều năm (20-30 năm) theo đúng khuyến nghị của WMO: Mỗi tháng trong năm được khớp một phân phối Gamma $(\alpha_m, \beta_m)$ độc lập, không nối xoay vòng modulo qua các năm.
  - Trong điều kiện chuẩn khí hậu 12 tháng, hệ thống công bố rõ tính chất 30-Year Climatological Mean và tính toán xác suất tích lũy bằng phân phối Gamma quy chuẩn.

### 1.3. [P0] Sửa đổi Toàn diện Thuật toán Lượng tử QAOA & Tối ưu Cổ điển (Thuật toán 13 & qaoa.js)
* **Vấn đề cũ:**
  - Góc $\gamma = 0.785, \beta = 0.523$ bị gán cứng.
  - Tỷ lệ khả thi `feasibility_rate_pct = 98.5%` và `optimality_gap_pct = 3.8%` là con số giả định gán cứng (dummy hardcoded), không phải kết quả đo đạc thực nghiệm.
  - Mạch 18 qubit dùng mixer RX không bảo đảm mỗi mùa chỉ chọn đúng 1 cây (ràng buộc One-Hot).
  - Thuật toán Cổ điển dùng hình phạt hữu hạn ($+80.0$) nên vẫn có nguy cơ chọn phương án tử địa nếu các phương án khác điểm thấp.
* **Giải pháp V3:**
  - **Hard Constraint Pruning (Cổ điển)**: Loại bỏ hoàn toàn (Prune) các phương án vi phạm giới hạn sinh học ($T < T_{\text{kill\_min}}$ hoặc khô hạn sa mạc), bảo đảm tập nghiệm tối ưu luôn thuộc $\Omega_{\text{feasible}}$.
  - **QUBO Hamiltonian hoàn chỉnh**: Tích hợp hình phạt ràng buộc One-Hot $H_{\text{penalty}} = \lambda \sum_{s=0}^2 \left(\sum_{c=0}^5 x_{s,c} - 1\right)^2$ với $\lambda = 1.8$.
  - **Variational Parameter Grid Search**: Tìm kiếm góc tối ưu $(\gamma^*, \beta^*)$ để tối đa hóa hàm sóng lượng tử hội tụ về trạng thái khả thi.
  - **Đo lường Thực nghiệm Trung thực**:
    + `feasibility_rate_pct`: Tỷ lệ phần trăm các bitstring đo được tuân thủ đúng 100% ràng buộc One-Hot trên toàn bộ 1024 lần đo (shots).
    + `optimality_gap_pct`: Đo lường trực tiếp từ hàm mục tiêu thực nghiệm:
      $$\text{Optimality Gap} = \max\left(0, \frac{F_{\text{classical}} - F_{\text{qaoa}}}{F_{\text{classical}}} \times 100\%\right)$$
    + Tuyệt đối không còn bất kỳ con số gán cứng nào!

### 1.4. [P1] Tách Riêng Chuẩn Mặt Nạ Mây QA theo Từng Vệ Tinh (Thuật toán 05)
* Tách biệt 3 hàm giải mã chuyên biệt:
  - `decodeLandsatQAPixel(qaInt16)`: Giải mã bitmask chuẩn 16-bit USGS Landsat 8/9 Collection-2 (Dilated Cloud, Cirrus, Cloud, Shadow, Snow, Water, Cloud Confidence).
  - `decodeModisStateQA(qaInt16)`: Giải mã chuẩn NASA MODIS MOD09GA / MOD13Q1 16-bit State QA (Bits 0-1 Cloud State, Bits 8-9 Cirrus, Internal Cloud Flag).
  - `decodeSentinel2SCL(sclVal)`: Giải mã phân loại cảnh 20m ESA Sentinel-2 L2A (12 lớp chuẩn SCL).
  - Cung cấp hàm wrapper tự động `maskCloudByProduct(value, sensorType)`.

### 1.5. [P1] Hoàn thiện Phân tích Đa Tiêu Chuẩn AHP & TOPSIS (Thuật toán 12)
* **AHP**: Tự động tính toán ma trận so sánh cặp từ thanh trượt ưu tiên của người dùng, giải vector riêng chính, tính $\lambda_{\max}$ và tỷ số nhất quán $CR = CI / RI < 0.10$.
* **TOPSIS**: Phân biệt rõ Tiêu chí Lợi ích (Benefit: Đất, Lợi nhuận) và Tiêu chí Chi phí (Cost: Nhu cầu nước, Xói mòn), xử lý ma trận suy biến khi tất cả phương án rơi vào vùng khắc nghiệt.
* Tích hợp trực tiếp AHP và TOPSIS vào luồng phân tích `/api/analyze`.

### 1.6. [P1] Định Danh Chính Xác K-Means và Random Forest (Thuật toán 09 & 10)
* **Thuật toán 09**: Đổi tên thành `Seasonal Climate Regimes` (Phân cụm vi khí hậu 12 tháng tại điểm khảo sát), bổ sung hàm phân vùng đa điểm `clusterMultiSiteAgroZones` cho phân vùng sinh thái khu vực.
* **Thuật toán 10**: Công bố rõ tính chất mô hình là Architecture Benchmark trên cơ sở dữ liệu FAO GAEZ, nêu rõ yêu cầu hiệu chuẩn thực địa trước khi áp dụng thương mại.

---

## 2. Bảng tổng hợp 14 thuật toán đã hoàn thiện và kiểm chứng

| STT | File thuật toán | Đánh giá reviewer | Tình trạng V3 | Nội dung nâng cấp kỹ thuật |
|---|---|---|---|---|
| **01** | `01_nasa_data_provider.js` | Cần sửa | **ĐÃ HOÀN TẤT V3** | Đã tích hợp làm luồng chính; phân định rõ MERRA-2, SMAP assimilation, GPM calibration; ISO 19115. |
| **02** | `02_calibrated_simulation_fallback.js` | Khá tốt | **ĐÃ HOÀN TẤT V3** | Mô hình phân đới nhiệt động học Köppen-Geiger gắn cờ `status: "mock"` minh bạch. |
| **03** | `03_quality_control_preprocessing.js` | Khá tốt | **ĐÃ HOÀN TẤT V3** | Bảo toàn mưa = 0mm, lọc sentinel -999, Modified Z-Score (MAD) khử ngoại lai. |
| **04** | `04_atmospheric_correction_dos.js` | Cần kiểm chứng | **ĐÃ HOÀN TẤT V3** | Bổ sung $ESUN_\lambda$, độ dày quang học Rayleigh $\tau_\lambda$, phân biệt TOA Reflectance vs Radiance. |
| **05** | `05_cloud_masking_qa.js` | Cần sửa | **ĐÃ HOÀN TẤT V3** | Tách riêng Landsat QA_PIXEL, MODIS StateQA, Sentinel-2 SCL; Fmask 4.0 quang phổ. |
| **06** | `06_remote_sensing_indices.js` | Một phần đúng | **ĐÃ HOÀN TẤT V3** | NDVI, EVI, NDMI, SAVI; Ràng buộc sinh thái: Băng tuyết NDVI $\le 0.05$, Sa mạc $\le 0.08$. |
| **07** | `07_timeseries_savitzky_golay.js` | Cơ bản đúng | **ĐÃ HOÀN TẤT V3** | Lọc Savitzky-Golay đa thức bậc 2 cửa sổ 5 điểm, kết nối trực tiếp làm mượt NDVI tán lá trong API. |
| **08** | `08_anomaly_detection_spi.js` | Cần sửa lớn | **ĐÃ HOÀN TẤT V3** | Hàm Gamma không đầy đủ chính xác $P(\alpha, x)$; Multi-Year SPI-1 và SPI-3; bỏ phép modulo nối năm. |
| **09** | `09_unsupervised_agro_clustering.js` | Cần cải tiến | **ĐÃ HOÀN TẤT V3** | Định danh Seasonal Climate Clustering 12 tháng; bổ sung Multi-Site Regional AEZ; WCSS/Inertia. |
| **10** | `10_supervised_crop_suitability.js` | Chưa dùng được thực tế | **ĐÃ HOÀN TẤT V3** | Nêu rõ nguồn gốc Architecture Benchmark trên FAO GAEZ (7 đặc trưng); minh bạch hạn chế mô hình. |
| **11** | `11_crop_suitability_fuzzy_ecocrop.js` | Cần hiệu chỉnh | **ĐÃ HOÀN TẤT V3** | Ràng buộc sinh tử (Lethal Frost / Arid Kill); liên thuộc mờ hình thang FAO EcoCrop; tích hợp scoring. |
| **12** | `12_mcda_ahp_topsis.js` | Cần sửa | **ĐÃ HOÀN TẤT V3** | Tích hợp AHP vào API chính, kiểm tra $CR < 0.10$; TOPSIS phân biệt Benefit/Cost criteria. |
| **13** | `13_crop_rotation_optimization_qaoa_milp.js` | Chưa chính xác | **ĐÃ HOÀN TẤT V3** | Hard Constraint Pruning; QUBO với ràng buộc One-Hot; đo lường thực nghiệm gap và feasibility. |
| **14** | `14_validation_and_benchmarking.js` | Chưa đáng tin cậy | **ĐÃ HOÀN TẤT V3** | Benchmark 5 địa bàn thế giới (Vịnh Bắc Bộ, Greenland, Sahara, ĐBSCL, Iowa Corn Belt); tính RMSE. |

---

## 3. Lệnh kiểm thử tự động toàn diện

Chạy toàn bộ 33 bài kiểm thử (bao gồm Unit test, GeoClassifier test, Benchmark đa địa bàn và API Test):

```bash
npm test
```
