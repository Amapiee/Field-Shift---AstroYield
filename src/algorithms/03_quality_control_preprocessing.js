/**
 * ==============================================================================
 * THUẬT TOÁN 03: DATA PREPROCESSING & QUALITY CONTROL (QC)
 * ==============================================================================
 *
 * 1. BỐI CẢNH KHOA HỌC:
 *    Code nguyên bản của FarmShift gặp 2 lỗi nghiêm trọng trong tầng tiền xử lý:
 *    - Lỗi 1: Coi lượng mưa PRECTOTCORR = 0 là dữ liệu lỗi và tự ý thay bằng giá trị mock!
 *      Trong nông học, lượng mưa bằng 0mm là sự thật vật lý thể hiện mùa khô/hạn hán gay gắt.
 *    - Lỗi 2: Lấy dữ liệu mock đắp vào các tháng thiếu nhưng cờ `_mock` tổng thể vẫn báo `false`,
 *      khiến người dùng lầm tưởng toàn bộ là dữ liệu NASA thật.
 *
 * 2. LOẠI DỮ LIỆU PHÙ HỢP:
 *    - Chuỗi thời gian khí tượng nông nghiệp (12 tháng climatology hoặc chuỗi ngày).
 *    - Các chỉ số: Nhiệt độ (°C), Mưa (mm), Bức xạ (MJ/m²), Độ ẩm đất (0-1).
 *
 * 3. NGUYÊN TẮC THUẬT TOÁN QC & LÀM SẠCH:
 *    - Bước 1: Physical Boundary Check (Giới hạn hợp lý sinh lý - WMO standards).
 *      + T2M, TS: [-50°C, 65°C]
 *      + PRECTOTCORR: [0.0mm, 2000.0mm/tháng] (0.0mm HOÀN TOÀN HỢP LỆ)
 *      + ALLSKY_SFC_SW_DWN: [0.0, 35.0 MJ/m²/ngày]
 *      + GWETTOP, GWETROOT: [0.0, 1.0]
 *    - Bước 2: Sentinel & Missing Filtering:
 *      + Lọc các mã sentinel như -999, -9999, null, undefined, NaN.
 *    - Bước 3: Outlier Detection bằng Modified Z-Score (MAD):
 *      + Sử dụng Trung vị (Median) và Sai lệch tuyệt đối trung vị (MAD).
 *      + M_i = 0.6745 * |x_i - Median| / MAD > 3.5 -> Đánh dấu ngoại lai.
 *    - Bước 4: Gap-filling (Nội suy khuyết thiếu có kiểm soát):
 *      + Áp dụng Linear / Akima Spline Interpolation.
 *      + Gắn nhãn rõ ràng: status = "interpolated", ghi tăng độ bất định (uncertainty).
 */

const WMO_PHYSICAL_BOUNDS = {
  T2M: { min: -50.0, max: 65.0, zeroValid: true },
  T2M_MIN: { min: -100.0, max: 65.0, zeroValid: true },
  TS: { min: -55.0, max: 75.0, zeroValid: true },
  PRECTOTCORR: { min: 0.0, max: 2000.0, zeroValid: true }, // QUAN TRỌNG: Mưa = 0 là hợp lệ!
  ALLSKY_SFC_SW_DWN: { min: 0.0, max: 35.0, zeroValid: true },
  GWETTOP: { min: 0.0, max: 1.0, zeroValid: true },
  GWETROOT: { min: 0.0, max: 1.0, zeroValid: true }
};

/**
 * Tính Median (Trung vị) của mảng số
 */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Tính MAD (Median Absolute Deviation)
 */
function medianAbsoluteDeviation(values, med) {
  const deviations = values.map(v => Math.abs(v - med));
  return median(deviations);
}

/**
 * Kiểm tra chất lượng và làm sạch chuỗi dữ liệu (Quality Control Pipeline)
 * @param {Array} rawSeries - Chuỗi dữ liệu thô
 * @param {string} variableKey - Tên biến khí hậu (T2M, PRECTOTCORR, ...)
 * @param {Array|null} fallbackSeries - Chuỗi dự phòng mô phỏng
 * @param {Object} options - Tùy chọn: { isCyclic: true, maxGap: 4 }
 */
function runQualityControl(rawSeries, variableKey, fallbackSeries = null, options = {}) {
  const isCyclic = options.isCyclic !== undefined ? options.isCyclic : true;
  const maxGap = options.maxGap ?? 4;
  if (!Number.isInteger(maxGap) || maxGap < 0) throw new RangeError("maxGap must be a nonnegative integer");

  if (!rawSeries || !rawSeries.length) {
    return {
      variable: variableKey,
      series: [],
      clean_array: [],
      stats: {
        total: 0,
        valid_observed: 0,
        interpolated_or_filled: 0,
        suspect_outliers: 0,
        missing: 0,
        data_integrity_score: 0
      }
    };
  }

  const bounds = WMO_PHYSICAL_BOUNDS[variableKey] || { min: -Infinity, max: Infinity, zeroValid: true };
  const n = rawSeries.length;
  const qcResult = [];
  const validValues = [];
  const validIndices = [];

  // Pha 1: Kiểm tra tính hợp lệ cơ bản & Vật lý
  for (let i = 0; i < n; i++) {
    const rawItem = rawSeries[i];
    const raw = rawItem !== null && typeof rawItem === "object" ? rawItem.value : rawItem;
    // Only finite numbers and explicit numeric strings are accepted; null/booleans/blank are missing.
    const val = typeof raw === "number" ? raw
      : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : null;

    let isInvalid = false;
    let reason = "valid";

    if (val === null || !Number.isFinite(val)) {
      isInvalid = true;
      reason = "missing_or_null";
    } else if (val <= -900) {
      isInvalid = true;
      reason = "sentinel_value_detected";
    } else if (val < bounds.min || val > bounds.max) {
      isInvalid = true;
      reason = `out_of_physical_bounds [${bounds.min}, ${bounds.max}]`;
    }

    if (!isInvalid) {
      validValues.push(val);
      validIndices.push(i);
      qcResult.push({
        index: i,
        original_value: val,
        clean_value: val,
        status: rawItem && typeof rawItem === "object" ? (rawItem.status || "observed") : "observed",
        quality: "pass",
        flag: reason
      });
    } else {
      qcResult.push({
        index: i,
        original_value: val,
        clean_value: null,
        status: "missing",
        quality: "fail",
        flag: reason
      });
    }
  }

  // Pha 2: Phát hiện ngoại lai bằng Modified Z-Score trên tập giá trị hợp lệ
  let outlierCount = 0;
  if (validValues.length >= 5) {
    const med = median(validValues);
    const mad = medianAbsoluteDeviation(validValues, med);
    const threshold = 3.5;

    if (mad > 1e-6) {
      for (const validIdx of validIndices) {
        const item = qcResult[validIdx];
        const modZ = 0.6745 * Math.abs(item.clean_value - med) / mad;
        if (modZ > threshold) {
          // Monthly climatological means are seasonal, not 12 exchangeable samples.
          // Also require a local Hampel outlier in a cyclic five-month window.
          // Retain the original value; this is a heuristic QC screen, not data correction.
          if (options.seasonalClimatology && n === 12) {
            const window = [-2,-1,0,1,2].map(offset => qcResult[(validIdx+offset+n)%n].clean_value)
              .filter(Number.isFinite);
            if (window.length < 3) continue;
            const localMedian = median(window), localMAD = medianAbsoluteDeviation(window,localMedian);
            const localZ = 0.6745 * Math.abs(item.clean_value-localMedian) / (localMAD>1e-6 ? localMAD : mad);
            if (localZ <= threshold) {
              item.flag = 'seasonal_peak_retained';
              continue;
            }
          }
          item.quality = "suspect_outlier";
          item.flag = `modified_z_score_${modZ.toFixed(2)}_exceeds_${threshold}`;
          outlierCount++;
        }
      }
    }
  }

  // Freeze the anchors before filling. Every point in a gap uses the same original endpoints.
  const anchors = qcResult.map(r => r.clean_value);
  let interpolatedCount = 0;
  for (let i = 0; i < n; i++) {
    if (qcResult[i].clean_value === null) {
      let prevIdx = null, nextIdx = null;

      if (isCyclic) {
        // Nội suy chu kỳ (Cyclic Interpolation cho 12 tháng khí hậu)
        for (let offset = 1; offset < n; offset++) {
          const p = (i - offset + n) % n;
          if (prevIdx === null && anchors[p] !== null) prevIdx = p;
          const next = (i + offset) % n;
          if (nextIdx === null && anchors[next] !== null) nextIdx = next;
          if (prevIdx !== null && nextIdx !== null) break;
        }
      } else {
        // Nội suy thời gian liên tục (Chronological Interpolation)
        for (let p = i - 1; p >= 0; p--) {
          if (anchors[p] !== null) { prevIdx = p; break; }
        }
        for (let next = i + 1; next < n; next++) {
          if (anchors[next] !== null) { nextIdx = next; break; }
        }
      }

      // Kiểm tra độ dài gap
      const gapLength = (prevIdx !== null && nextIdx !== null)
        ? (nextIdx > prevIdx ? nextIdx - prevIdx - 1 : (n - prevIdx - 1) + nextIdx)
        : Infinity;

      if (prevIdx !== null && nextIdx !== null && prevIdx !== nextIdx && gapLength <= maxGap) {
        const vPrev = anchors[prevIdx];
        const vNext = anchors[nextIdx];
        const distance = isCyclic ? (i - prevIdx + n) % n : i - prevIdx;
        const interpVal = vPrev + (vNext - vPrev) * distance / (gapLength + 1);
        qcResult[i].clean_value = Math.round(interpVal * 1000) / 1000;
        qcResult[i].status = "interpolated";
        qcResult[i].quality = "interpolated";
        qcResult[i].anchors = [prevIdx, nextIdx];
        qcResult[i].original_status = "missing";
        qcResult[i].flag += `; filled_by_${isCyclic ? "cyclic" : "linear"}_interpolation`;
        interpolatedCount++;
      } else if (fallbackSeries && Number.isFinite(fallbackSeries[i]) && fallbackSeries[i] >= bounds.min && fallbackSeries[i] <= bounds.max) {
        qcResult[i].clean_value = fallbackSeries[i];
        qcResult[i].status = "mock";
        qcResult[i].quality = "fallback_simulated";
        qcResult[i].flag += "; filled_by_calibrated_model";
        interpolatedCount++;
      }
    }
  }

  const missingCount = qcResult.filter(r => r.clean_value === null).length;

  return {
    variable: variableKey,
    series: qcResult,
    clean_array: qcResult.map(r => r.clean_value),
    stats: {
      total: n,
      valid_observed: validValues.length,
      interpolated_or_filled: interpolatedCount,
      suspect_outliers: outlierCount,
      outlier_test: options.seasonalClimatology && n===12 ? 'global_MAD_and_cyclic_5_month_Hampel_3.5' : 'global_MAD_3.5',
      missing: missingCount,
      has_missing_unfilled: missingCount > 0,
      data_integrity_score: n > 0 ? Math.round((validValues.length / n) * 100) : 0
    }
  };
}

module.exports = {
  WMO_PHYSICAL_BOUNDS,
  runQualityControl,
  median,
  medianAbsoluteDeviation
};

// ─── Test thực thi trực tiếp ───
if (require.main === module) {
  console.log("=== KIỂM THỬ THUẬT TOÁN 03: QUALITY CONTROL & PREPROCESSING ===");
  // Kiểm thử trường hợp mưa = 0mm và giá trị sentinel -999
  const testRainSeries = [120, 150, 0, 0, 5, 200, -999, 180, 220, 95, 40, 10];
  const qcRain = runQualityControl(testRainSeries, "PRECTOTCORR");

  console.log("Chuỗi mưa gốc:", testRainSeries);
  console.log("Chuỗi mưa sau QC:", qcRain.clean_array);
  console.log("Kiểm tra tháng 3 (0mm):", qcRain.series[2].status, "| Quality:", qcRain.series[2].quality);
  console.log("Kiểm tra tháng 7 (-999):", qcRain.series[6].status, "| Quality:", qcRain.series[6].quality, "| Flag:", qcRain.series[6].flag);
  console.log("Điểm trọn vẹn dữ liệu (Data Integrity):", qcRain.stats.data_integrity_score + "%");
}
