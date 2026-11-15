/**
 * ==============================================================================
 * THUẬT TOÁN 07: TIME SERIES ANALYSIS & SAVITZKY-GOLAY FILTERING
 * ==============================================================================
 * 
 * 1. BỐI CẢNH KHOA HỌC:
 *    Chuỗi thời gian viễn thám nông nghiệp (như NDVI 16 ngày hoặc độ ẩm rễ SMAP) thường xuyên
 *    chịu nhiễu đột ngột do mây mù tàn dư, sol khí hoặc lỗi cảm biến vệ tinh. Nếu dùng trung bình
 *    trượt đơn giản (Moving Average), các đỉnh sinh trưởng mùa vụ (phenological peaks) sẽ bị
 *    san phẳng và trễ pha, làm sai lệch thời điểm gieo cấy và thu hoạch.
 *    Bộ lọc Savitzky-Golay (Savitzky & Golay, 1964) thực hiện hồi quy đa thức bình phương tối thiểu
 *    cục bộ (Local Least Squares Polynomial Fitting), bảo toàn nguyên vẹn độ cao đỉnh, độ rộng và
 *    vị trí cực trị của chuỗi thời gian nông học.
 * 
 * 2. LOẠI DỮ LIỆU PHÙ HỢP:
 *    - Chuỗi thời gian đều đặn: 12 tháng climatology, 16 ngày MODIS composite, hoặc chuỗi ngày.
 *    - Biến số: NDVI, EVI, GWETROOT, LST.
 *    - Định dạng: Mảng 1 chiều số thực liên tục $Y = [y_1, y_2, ..., y_n]$.
 * 
 * 3. NGUYÊN LÝ TOÁN HỌC:
 *    Tại mỗi điểm $j$, đặt một cửa sổ đối xứng kích thước $2m + 1$ lân cận:
 *    $$Y_j^* = \frac{\sum_{i=-m}^m C_i \cdot Y_{j+i}}{N}$$
 *    Trong đó:
 *    - $m$: Nửa độ rộng cửa sổ (Window half-width, $2m+1$ là độ dài cửa sổ).
 *    - $C_i$: Các hệ số tích chập (Convolution Coefficients) được giải tích từ đa thức bậc $d$.
 *    - Với chuỗi 12 tháng nông nghiệp, cửa sổ $2m+1 = 5$ (tức $m = 2$) và đa thức bậc 2 ($d = 2$):
 *      Bộ trọng số chuẩn hóa là: $C = [-3, 12, 17, 12, -3] / 35$.
 *    - Áp dụng Cyclic Boundary Padding để bảo toàn tính chu kỳ tuần hoàn khép kín của 12 tháng trong năm.
 */

function round(v, dec = 3) {
  const p = Math.pow(10, dec);
  return Math.round(v * p) / p;
}

/**
 * Bộ lọc Savitzky-Golay cho chuỗi thời gian nông học tuần hoàn
 * 
 * @param {Array<number>} series Chuỗi số thực đầu vào
 * @param {Object} options Tham số lọc (windowSize: 5, polyOrder: 2, isCyclic: true)
 * @returns {Array<number>} Chuỗi sau khi làm mượt bảo toàn đỉnh sinh trưởng
 */
function applySavitzkyGolayFilter(series, options = {}) {
  const { isCyclic = true } = options;
  const n = series.length;
  if (n < 5) return series.slice();

  // Hệ số chập bậc 2, cửa sổ 5 điểm: [-3, 12, 17, 12, -3] / 35
  const weights = [-3, 12, 17, 12, -3];
  const norm = 35.0;
  const m = 2; // Nửa độ rộng cửa sổ

  const smoothed = new Array(n);

  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = -m; i <= m; i++) {
      let idx = j + i;
      if (idx < 0) {
        idx = isCyclic ? (idx + n) % n : 0;
      } else if (idx >= n) {
        idx = isCyclic ? idx % n : n - 1;
      }
      sum += weights[i + m] * series[idx];
    }
    smoothed[j] = round(sum / norm, 3);
  }

  return smoothed;
}

/**
 * Phân tích đặc trưng chuỗi thời gian nông học (Phenological Metrics Extraction)
 * Tìm thời điểm đỉnh sinh trưởng, thung lũng khô hạn và tốc độ tăng trưởng
 */
function extractPhenologyMetrics(smoothedSeries) {
  let maxVal = -Infinity, minVal = Infinity;
  let peakMonth = 0, troughMonth = 0;

  smoothedSeries.forEach((val, idx) => {
    if (val > maxVal) {
      maxVal = val;
      peakMonth = idx + 1;
    }
    if (val < minVal) {
      minVal = val;
      troughMonth = idx + 1;
    }
  });

  const seasonalAmplitude = round(maxVal - minVal, 3);
  const baselineMean = round(smoothedSeries.reduce((a, b) => a + b, 0) / smoothedSeries.length, 3);

  return {
    peak_month: peakMonth,
    peak_value: maxVal,
    trough_month: troughMonth,
    trough_value: minVal,
    amplitude: seasonalAmplitude,
    mean: baselineMean,
    growing_season_vigour: seasonalAmplitude > 0.3 ? "Rất mạnh (High Vigour)" : "Ổn định / Thấp (Low Vigour)"
  };
}

module.exports = {
  applySavitzkyGolayFilter,
  smoothTimeSeriesSavitzkyGolay: applySavitzkyGolayFilter,
  extractPhenologyMetrics
};

// ─── Test thực thi trực tiếp ───
if (require.main === module) {
  console.log("=== KIỂM THỬ THUẬT TOÁN 07: SAVITZKY-GOLAY FILTERING ===");
  // Chuỗi NDVI 12 tháng có nhiễu mây sụt giảm đột ngột tại tháng 7 (từ 0.72 xuống 0.45)
  const noisyNDVI = [0.25, 0.30, 0.42, 0.65, 0.75, 0.78, 0.45, 0.76, 0.68, 0.50, 0.35, 0.28];
  const filtered = applySavitzkyGolayFilter(noisyNDVI);
  const metrics = extractPhenologyMetrics(filtered);

  console.log("Chuỗi NDVI có nhiễu mây:", noisyNDVI);
  console.log("Chuỗi NDVI sau Savitzky-Golay:", filtered);
  console.log("Đặc trưng chỉ số mùa vụ (Phenology):", metrics);
}
