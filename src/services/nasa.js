// Lấy dữ liệu NASA POWER, kiểm tra chất lượng (QC), dự phòng vi khí hậu và chỉ số phái sinh (V3)
const { NASA_KEYS } = require("../config/crops");
const { clamp, round, mean, sum } = require("../utils/helpers");
const { classifyCoordinates } = require("../utils/geoClassifier");
const { fetchNasaPointData, DATA_CATALOG, MONTH_NAMES, DAYS_IN_MONTH } = require("../algorithms/01_nasa_data_provider");
const { runQualityControl } = require("../algorithms/03_quality_control_preprocessing");
const { generateCalibratedFallback } = require("../algorithms/02_calibrated_simulation_fallback");
const { estimateVegetationProxyFromClimate } = require("../algorithms/06_remote_sensing_indices");

/**
 * Mô phỏng vi khí hậu dự phòng chuẩn hóa vật lý
 */
function mockNasa(lat, lon = 105.78) {
  const fallback = generateCalibratedFallback(lat, lon);
  return {
    T2M: fallback.raw.T2M,
    TS: fallback.raw.TS,
    PRECTOTCORR: fallback.raw.PRECTOTCORR,
    ALLSKY_SFC_SW_DWN: fallback.raw.ALLSKY_SFC_SW_DWN,
    GWETTOP: fallback.raw.GWETTOP,
    GWETROOT: fallback.raw.GWETROOT,
    _mock: true,
    _source_description: "Calibrated Thermodynamic Model (Köppen-Geiger)",
    _climate_zone: fallback.climate_zone,
  };
}

/**
 * Lấy dữ liệu từ NASA POWER API thông qua Thuật toán 01 (fetchNasaPointData)
 * kết hợp bộ phân loại địa lý và kiểm soát chất lượng (QC)
 */
async function fetchNasa(lat, lon) {
  // 1. Phân loại địa lý bằng Geo-Classifier
  const geoCheck = classifyCoordinates(lat, lon);
  if (geoCheck.is_water) {
    return { _is_water: true, _terrain: "OCEAN", message: geoCheck.message };
  }
  if (geoCheck.is_ice) {
    return { _is_ice: true, _terrain: "ICE_SHEET", message: geoCheck.message };
  }

  try {
    // 2. Gọi trực tiếp Thuật toán 01 để lấy dữ liệu có hợp đồng siêu dữ liệu ISO 19115
    const pointData = await fetchNasaPointData(lat, lon, 18000);

    if (pointData.is_water) {
      return { _is_water: true, _terrain: "OCEAN", message: pointData.message };
    }
    if (pointData.is_ice) {
      return { _is_ice: true, _terrain: "ICE_SHEET", message: pointData.message };
    }

    const mock = mockNasa(lat, lon);
    const result = {};
    let totalInterpolated = 0;
    let totalObserved = 0;
    let totalRecords = 0;

    for (const key of NASA_KEYS) {
      const records = pointData.data[key] || [];
      const rawMonthArray = records.map(r => r.value);

      // Áp dụng QC: Bảo toàn mưa = 0mm, lọc sentinel -999, nội suy cyclic có kiểm soát
      const qc = runQualityControl(rawMonthArray, key, mock[key], { isCyclic: true });
      result[key] = qc.clean_array;
      totalInterpolated += qc.stats.interpolated_or_filled;
      totalObserved += qc.stats.valid_observed;
      totalRecords += qc.stats.total;
    }

    const integrityScore = totalRecords > 0 ? Math.round((totalObserved / totalRecords) * 100) : 0;
    result._mock = false;
    result._has_interpolated = totalInterpolated > 0;
    result._qc_integrity = integrityScore;
    result._provenance = {
      status: totalInterpolated === 0 ? "observed" : (totalObserved > 0 ? "mixed" : "fallback"),
      observed_ratio_pct: integrityScore,
      source_name: totalInterpolated === 0
        ? "NASA POWER API (Climatology Observed)"
        : "NASA POWER Climatology (QC Interpolated)",
      parameters_count: NASA_KEYS.length
    };
    result._source_description = result._provenance.source_name;
    result._raw_catalog = pointData.data;
    return result;
  } catch (e) {
    const data = mockNasa(lat, lon);
    data._error = String(e.message || e).slice(0, 80);
    return data;
  }
}

/**
 * Tính toán các chỉ số phái sinh: NDVI, ESI, EROSION
 */
function computeDerived(data) {
  if (data._is_water || data._is_ice) return data;

  const { GWETROOT: gwet, PRECTOTCORR: rain, T2M: temp, TS: ts } = data;
  const tempSkin = ts || temp.map(t => t + 3.0);

  const proxy = estimateVegetationProxyFromClimate(gwet, rain, temp, tempSkin);
  data.NDVI = proxy.NDVI;
  data.ESI = proxy.ESI;
  data.EROSION = proxy.EROSION;
  data._derived_meta = proxy.metadata;
  return data;
}

/**
 * Xây dựng tóm tắt dữ liệu vệ tinh với đầy đủ siêu dữ liệu khoa học minh bạch
 */
function buildSatelliteSummary(d) {
  if (!d.T2M || !d.GWETROOT || !d.PRECTOTCORR) return {};

  return {
    POWER: {
      source: "NASA POWER / GMAO MERRA-2 Climatology",
      description: "Nhiệt độ không khí 2m và bức xạ mặt trời tái phân tích toàn cầu",
      temp_avg: round(mean(d.T2M), 1),
      temp_max: round(Math.max(...d.T2M), 1),
      temp_min: round(Math.min(...d.T2M), 1),
      rad_avg: round(mean(d.ALLSKY_SFC_SW_DWN), 2),
      monthly_T2M: d.T2M,
      monthly_RAD: d.ALLSKY_SFC_SW_DWN,
    },
    SMAP: {
      source: "NASA POWER Land Surface Model (MERRA-2 / Catchment LSM)",
      description: "Tỷ lệ độ ẩm đất tầng rễ và tầng mặt từ mô hình bề mặt đất Catchment LSM",
      gwettop_avg: round(mean(d.GWETTOP), 3),
      gwetroot_avg: round(mean(d.GWETROOT), 3),
      gwetroot_min: round(Math.min(...d.GWETROOT), 3),
      drought_months: d.GWETROOT.filter((v) => v < 0.30).length,
      monthly: d.GWETROOT,
    },
    GPM: {
      source: "NASA POWER / MERRA-2 & GPCP Gauge Calibration",
      description: "Tổng lượng mưa tháng hiệu chỉnh bề mặt kết hợp quan trắc mặt đất và vệ tinh",
      rain_avg: round(mean(d.PRECTOTCORR), 1),
      rain_max: round(Math.max(...d.PRECTOTCORR), 1),
      rain_total: round(sum(d.PRECTOTCORR), 0),
      flood_months: d.PRECTOTCORR.filter((v) => v > 150).length,
      monthly: d.PRECTOTCORR,
    },
    ECOSTRESS: {
      source: "NASA POWER Skin Thermal Model (Thermal Proxy for Evaporative Stress)",
      description: "Nhiệt độ bề mặt đất bức xạ và chỉ số bốc thoát hơi nước tương đối (ESI Proxy)",
      ts_avg: round(mean(d.TS), 1),
      ts_max: round(Math.max(...d.TS), 1),
      esi_avg: round(mean(d.ESI), 3),
      heat_months: d.TS.filter((v) => v > 34).length,
      monthly_TS: d.TS,
      monthly_ESI: d.ESI,
    },
    MODIS: {
      source: "Biophysical Vegetation Model (NDVI Proxy from Moisture & Energy)",
      description: "Chỉ số thực vật NDVI phái sinh từ cân bằng ẩm độ và nhiệt độ tán lá",
      ndvi_avg: round(mean(d.NDVI), 3),
      ndvi_max: round(Math.max(...d.NDVI), 3),
      ndvi_min: round(Math.min(...d.NDVI), 3),
      monthly: d.NDVI,
    },
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  };
}

module.exports = {
  mockNasa,
  fetchNasa,
  computeDerived,
  buildSatelliteSummary
};
