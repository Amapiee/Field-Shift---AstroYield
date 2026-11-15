// DEMO ONLY: unvalidated latitude-only simulation. Not used as a NASA failure fallback.
// Longitude and elevation are ignored; identical outputs do not establish similar local climates.
const { DATA_CATALOG, createScientificRecord } = require("./01_nasa_data_provider");

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function round(val, decimals = 3) {
  const p = Math.pow(10, decimals);
  return Math.round(val * p) / p;
}

/**
 * Thuật toán mô phỏng vi khí hậu dự phòng đã qua hiệu chỉnh vật lý
 */
function generateCalibratedFallback(lat, lon, seed = 42) {
  const absLat = Math.abs(lat);
  const isSouthern = lat < 0;
  const isTropical = absLat < 23.5;
  const isTemperate = absLat >= 23.5 && absLat < 55.0;

  // Nhiệt độ cơ sở theo đới khí hậu
  const baseTemp = isTropical ? 28.5 : isTemperate ? 16.5 : 2.0;
  // Lượng mưa cơ sở theo đới gió mùa/ôn đới
  const baseRain = isTropical ? 140.0 : isTemperate ? 65.0 : 25.0;
  // Độ ẩm đất cơ sở
  const baseGwet = isTropical ? 0.62 : isTemperate ? 0.48 : 0.38;
  // Bức xạ sóng ngắn (MJ/m2/day)
  const baseRad = isTropical ? 18.5 : isTemperate ? 14.0 : 8.5;

  const phaseShift = isSouthern ? Math.PI : 0;
  const w = (m) => (2 * Math.PI * m) / 12;

  // Pseudo-random deterministic để kết quả ổn định và tái lặp được
  const pseudoRand = (idx, offset = 0) => {
    const x = Math.sin(seed + idx * 12.9898 + offset * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1; // [-1, 1]
  };

  const months = [...Array(12).keys()];

  // 1. T2M: Nhiệt độ không khí điều hòa theo chu kỳ mùa
  const T2M = months.map((m) => {
    const tempAmp = isTropical ? 3.5 : isTemperate ? 11.0 : 16.0;
    const val = baseTemp + tempAmp * Math.sin(w(m) - phaseShift - Math.PI / 2) + pseudoRand(m, 1) * 0.4;
    return round(val, 2);
  });

  // 2. TS: Nhiệt độ bề mặt (Land Surface Skin Temperature)
  const TS = T2M.map((t, m) => {
    const delta = isTropical ? 3.2 : isTemperate ? 4.5 : 2.0;
    return round(t + delta + pseudoRand(m, 2) * 0.5, 2);
  });

  // 3. PRECTOTCORR: Lượng mưa điều hòa chu kỳ mùa
  const PRECTOTCORR = months.map((m) => {
    const rainAmp = isTropical ? 100.0 : isTemperate ? 45.0 : 15.0;
    const val = baseRain + rainAmp * Math.sin(w(m) - phaseShift - Math.PI / 3) + pseudoRand(m, 3) * 10.0;
    return round(clamp(val, 0.0, 450.0), 1);
  });

  // 4. ALLSKY_SFC_SW_DWN: Bức xạ mặt trời
  const ALLSKY_SFC_SW_DWN = months.map((m) => {
    const radAmp = isTropical ? 3.5 : isTemperate ? 7.5 : 8.0;
    const val = baseRad + radAmp * Math.sin(w(m) - phaseShift - Math.PI / 2) + pseudoRand(m, 4) * 0.4;
    return round(clamp(val, 3.0, 28.0), 2);
  });

  // 5. GWETTOP: Độ ẩm đất bề mặt (phản ứng nhanh với lượng mưa)
  const GWETTOP = months.map((m) => {
    const rainFactor = (PRECTOTCORR[m] - 50.0) / 300.0;
    const val = baseGwet + 0.15 * rainFactor + pseudoRand(m, 5) * 0.02;
    return round(clamp(val, 0.08, 0.95), 3);
  });

  // 6. GWETROOT: Độ ẩm đất vùng rễ (trễ pha và bền vững hơn tầng mặt)
  const GWETROOT = months.map((m) => {
    const prevM = (m - 1 + 12) % 12;
    const laggedVal = 0.7 * GWETTOP[m] + 0.3 * GWETTOP[prevM] - 0.03 + pseudoRand(m, 6) * 0.015;
    return round(clamp(laggedVal, 0.10, 0.92), 3);
  });

  // Đóng gói cấu trúc chuẩn hóa gắn nhãn status = "mock"
  const rawArrays = { T2M, TS, PRECTOTCORR, ALLSKY_SFC_SW_DWN, GWETTOP, GWETROOT };
  const structuredData = {};

  for (const [key, arr] of Object.entries(rawArrays)) {
    structuredData[key] = arr.map((val, idx) => {
      return createScientificRecord(key, val, "mock", "simulated", {
        month: idx + 1,
        source: "Unvalidated latitude-only DEMO simulation",
        product: "DEMO / LOW_CONFIDENCE",
        period: null,
        confidence: null,
        warning: "DỮ LIỆU MÔ PHỎNG DỰ PHÒNG. KHÔNG SỬ DỤNG CHO BÁO CÁO NGHIỆM THU THỰC TRƯỜNG."
      });
    });
  }

  return {
    is_water: false,
    source: "DEMO / LOW_CONFIDENCE — unvalidated latitude-only simulation",
    source_status: "demo",
    recommendation_allowed: false,
    limitations: "Ignores longitude, elevation and local aridity. Not calibrated to local observations; never used automatically when NASA fails.",
    _mock: true,
    coordinates: { lat, lon },
    climate_zone: isTropical ? "Tropical (Nhiệt đới)" : isTemperate ? "Temperate (Ôn đới)" : "Polar/Boreal (Hàn đới)",
    data: structuredData,
    raw: rawArrays
  };
}

module.exports = {
  generateCalibratedFallback
};

// ─── Test thực thi trực tiếp ───
if (require.main === module) {
  console.log("=== KIỂM THỬ THUẬT TOÁN 02: CALIBRATED FALLBACK MODEL ===");
  const testLat = 10.04, testLon = 105.78; // Cần Thơ, ĐBSCL
  const fallback = generateCalibratedFallback(testLat, testLon);
  console.log(`Tọa độ: (${testLat}, ${testLon}) -> Vùng: ${fallback.climate_zone}`);
  console.log("Dữ liệu T2M 12 tháng:", fallback.raw.T2M);
  console.log("Dữ liệu PRECTOTCORR 12 tháng:", fallback.raw.PRECTOTCORR);
  console.log("Kiểm tra cờ dữ liệu tháng 1:", fallback.data.T2M[0].status, "| Cảnh báo:", fallback.data.T2M[0].warning);
}
