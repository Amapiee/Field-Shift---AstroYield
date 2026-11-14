/**
 * ==============================================================================
 * THUẬT TOÁN 01: NASA DATA PROVIDER & SCIENTIFIC METADATA CONTRACT (NÂNG CẤP V2)
 * ==============================================================================
 * 
 * 1. BỐI CẢNH KHOA HỌC & HIỆU CHỈNH:
 *    - Đơn vị lượng mưa NASA POWER Climatology: Endpoint climatology của NASA trả về
 *      PRECTOTCORR tính theo mm/ngày (mm/day). Code trước đây bỏ qua việc nhân với số ngày
 *      trong tháng, dẫn đến lượng mưa bị chia nhỏ ~30 lần (ví dụ: 5mm/ngày bị hiểu thành 5mm/tháng)!
 *      Thuật toán V2 tự động chuyển đổi chuẩn xác sang mm/tháng dựa trên số ngày thực tế từng tháng.
 *    - Tích hợp bộ phân loại địa lý toàn cầu (geoClassifier): Phân định dứt khoát ranh giới giữa
 *      Biển/Vịnh ven bờ (như Vịnh Bắc Bộ, Vịnh Thái Lan), Băng đảo/Băng hà (Greenland, Nam Cực)
 *      và Đất liền nông nghiệp, thay vì phán đoán mơ hồ dựa trên -999.
 * 
 * 2. LOẠI DỮ LIỆU PHÙ HỢP:
 *    - Format: JSON API, GeoTIFF, NetCDF-4/HDF5.
 *    - Nguồn: NASA POWER Agroclimatology (MERRA-2 assimilation), SMAP L4, GPM IMERG.
 *    - Đơn vị chuẩn: T2M, TS (°C); PRECTOTCORR (mm/tháng); ALLSKY_SFC_SW_DWN (MJ/m²/ngày); GWET (0.0 - 1.0).
 */

const https = require("https");
const { classifyCoordinates } = require("../utils/geoClassifier");

const DATA_CATALOG = {
  T2M: {
    source: "NASA POWER / GMAO MERRA-2",
    product: "Agroclimatology 2m Air Temperature",
    unit: "°C",
    spatial_resolution: "0.5° x 0.5°",
    processing_level: "Level-3 Assimilated Grid",
    description: "Nhiệt độ không khí 2m tái phân tích toàn cầu MERRA-2"
  },
  TS: {
    source: "NASA POWER / GMAO MERRA-2 Surface Model",
    product: "Surface Skin Temperature (Thermal Indicator)",
    unit: "°C",
    spatial_resolution: "0.5° x 0.5°",
    processing_level: "Level-3 Surface Grid",
    description: "Nhiệt độ bề mặt đất bức xạ (Surface Skin Temperature)"
  },
  PRECTOTCORR: {
    source: "NASA POWER / MERRA-2 & GPCP Gauge Calibration",
    product: "Corrected Precipitation (Climatology)",
    unit: "mm/month",
    spatial_resolution: "0.5° x 0.5°",
    processing_level: "Level-3 Gridded",
    description: "Tổng lượng mưa tháng hiệu chỉnh bề mặt (đã nhân số ngày từng tháng)"
  },
  ALLSKY_SFC_SW_DWN: {
    source: "NASA POWER / CERES & GEOS",
    product: "Surface Solar Radiation",
    unit: "MJ/m²/day",
    spatial_resolution: "1.0° x 1.0°",
    processing_level: "Level-3 Satellite / Model",
    description: "Bức xạ mặt trời sóng ngắn chiếu tới bề mặt"
  },
  GWETTOP: {
    source: "NASA POWER / MERRA-2 Catchment LSM",
    product: "Surface Soil Wetness Fraction (0-5cm)",
    unit: "dimensionless (0-1)",
    spatial_resolution: "0.5° x 0.5°",
    processing_level: "Level-4 Land Surface Model Output",
    description: "Tỷ lệ ẩm đất tầng mặt (0 - 5cm, wetness fraction)"
  },
  GWETROOT: {
    source: "NASA POWER / MERRA-2 Catchment LSM",
    product: "Root Zone Soil Wetness Fraction (0-100cm)",
    unit: "dimensionless (0-1)",
    spatial_resolution: "0.5° x 0.5°",
    processing_level: "Level-4 Land Surface Model Output",
    description: "Tỷ lệ ẩm đất vùng rễ (0 - 100cm, wetness fraction)"
  }
};

const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function createScientificRecord(key, value, status = "observed", quality = "valid", extra = {}) {
  const meta = DATA_CATALOG[key] || {
    source: "NASA POWER / Model Assimilation", product: key, unit: "unknown",
    spatial_resolution: "0.5° x 0.5°", processing_level: "Level-3", description: key
  };

  const confidence = status === "observed"
    ? (quality === "valid" ? 0.90 : 0.70)
    : status === "interpolated" ? 0.65 : 0.40;

  return {
    variable: key,
    value: value,
    unit: meta.unit,
    source: meta.source,
    product: meta.product,
    spatial_resolution: meta.spatial_resolution,
    processing_level: meta.processing_level,
    description: meta.description,
    status: status,
    quality: quality,
    climatology_period: extra.climatology_period || "NASA POWER 30-year Climatology Reference",
    confidence: confidence,
    ...extra
  };
}

/**
 * Lấy dữ liệu điểm từ NASA POWER API kèm kiểm tra địa lý toàn cầu
 */
async function fetchNasaPointData(lat, lon, timeoutMs = 15000) {
  // Bước 1: Kiểm tra vị trí địa lý bằng bộ phân loại Geo-Classifier
  const geoCheck = classifyCoordinates(lat, lon);
  if (!geoCheck.can_cultivate) {
    return {
      is_water: geoCheck.is_water,
      is_ice: geoCheck.is_ice,
      terrain_type: geoCheck.type,
      message: geoCheck.message,
      coordinates: { lat, lon }
    };
  }

  const params = Object.keys(DATA_CATALOG).join(",");
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${params}&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`NASA POWER API HTTP Error ${res.statusCode}: ${res.statusMessage}`));
      }

      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const rawParam = parsed?.properties?.parameter;
          if (!rawParam) {
            return reject(new Error("Phản hồi từ NASA không chứa trường parameter hợp lệ"));
          }

          const structured = {};
          for (const key of Object.keys(DATA_CATALOG)) {
            structured[key] = [];
            for (let m = 0; m < 12; m++) {
              const monthKey = MONTH_NAMES[m];
              const padKey = String(m + 1).padStart(2, "0");
              let rawVal = rawParam[key]?.[monthKey] ?? rawParam[key]?.[padKey] ?? rawParam[key]?.[String(m + 1)];

              let val = Number(rawVal);
              let status = "observed";
              let quality = "valid";

              // Sentinel value kiểm tra (-999, NaN)
              if (rawVal === undefined || rawVal === null || isNaN(val) || val <= -900) {
                status = "missing";
                quality = "invalid";
                val = null;
              } else if (key === "PRECTOTCORR") {
                // CHUYỂN ĐỔI CHUẨN XÁC: NASA Climatology PRECTOTCORR tính theo mm/day -> chuyển thành mm/month
                val = Math.round(val * DAYS_IN_MONTH[m] * 10) / 10;
              }

              structured[key].push(createScientificRecord(key, val, status, quality, {
                month: m + 1,
                month_name: monthKey
              }));
            }
          }

          resolve({
            is_water: false,
            is_ice: false,
            terrain_type: "LAND",
            source: "NASA POWER API (Climatology)",
            coordinates: { lat, lon },
            data: structured
          });
        } catch (e) {
          reject(new Error(`Lỗi parse dữ liệu NASA POWER: ${e.message}`));
        }
      });
    });

    req.on("error", (err) => reject(new Error(`Lỗi kết nối mạng NASA: ${err.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Kết nối đến NASA POWER API vượt quá thời gian chờ (${timeoutMs}ms)`));
    });
  });
}

module.exports = {
  DATA_CATALOG,
  MONTH_NAMES,
  DAYS_IN_MONTH,
  createScientificRecord,
  fetchNasaPointData
};

// ─── Test thực thi ───
if (require.main === module) {
  console.log("=== KIỂM THỬ THUẬT TOÁN 01 (NÂNG CẤP V2) ===");
  console.log("1. Thử tọa độ Vịnh Bắc Bộ (19.5308, 106.6433):");
  fetchNasaPointData(19.5308, 106.6433).then(r => console.log("Kết quả:", r));

  console.log("2. Thử tọa độ Greenland (76.1513, -42.3889):");
  fetchNasaPointData(76.1513, -42.3889).then(r => console.log("Kết quả:", r));
}
