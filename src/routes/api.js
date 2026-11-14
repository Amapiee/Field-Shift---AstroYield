// Các endpoint /api/* kết hợp chuỗi thuật toán xử lý dữ liệu và lượng tử hoàn chỉnh (V3)
const express = require("express");
const { CROPS } = require("../config/crops");
const { clamp, round, uniform, num } = require("../utils/helpers");
const { debug, timer } = require("../utils/logger");
const { classifyCoordinates } = require("../utils/geoClassifier");
const { fetchNasa, computeDerived, buildSatelliteSummary } = require("../services/nasa");
const { scoreScenario } = require("../services/scoring");
const { generateAlerts } = require("../services/alerts");
const { runQuantum } = require("../quantum/qaoa");
const { smoothTimeSeriesSavitzkyGolay, extractPhenologyMetrics } = require("../algorithms/07_timeseries_savitzky_golay");
const { detectEnvironmentalAnomalies } = require("../algorithms/08_anomaly_detection_spi");
const { clusterSeasonalClimate } = require("../algorithms/09_unsupervised_agro_clustering");
const { deriveAHPWeightsFromPreferences, rankScenariosTOPSIS } = require("../algorithms/12_mcda_ahp_topsis");

const router = express.Router();

// ─── POST /api/analyze ───────────────────────────────────────────────────────
router.post("/analyze", async (req, res) => {
  try {
    const body = req.body || {};
    debug("analyze body:", JSON.stringify(body));

    const lat = num(body.lat, 10.04);
    const lon = num(body.lon, 105.78);
    const wWater = clamp(num(body.w_water, 0.33), 0, 1);
    const wSoil = clamp(num(body.w_soil, 0.33), 0, 1);
    const wProfit = clamp(num(body.w_profit, 0.34), 0, 1);

    let userCrops = Array.isArray(body.user_crops) ? body.user_crops.slice(0, 3) : ["Rice", "Soybean", "Maize"];
    userCrops = userCrops.map((c) => (c in CROPS ? c : "Rice"));
    while (userCrops.length < 3) userCrops.push("Rice");

    // 1) Kiểm tra địa lý (Ocean, Ice Sheet, Land) bằng Geo-Classifier
    const geoCheck = classifyCoordinates(lat, lon);
    if (geoCheck.is_water) {
      return res.json({
        ok: false,
        is_water: true,
        terrain_type: "OCEAN",
        error: geoCheck.message || "Tọa độ này nằm trên đại dương/mặt nước. Vui lòng chọn khu vực đất liền!"
      });
    }
    if (geoCheck.is_ice) {
      return res.json({
        ok: false,
        is_ice: true,
        terrain_type: "ICE_SHEET",
        error: geoCheck.message || "Tọa độ này nằm trên dải băng tuyết vĩnh cửu (Greenland / Vùng cực). Không có tầng đất trồng trọt!"
      });
    }

    // 2) Lấy Dữ liệu NASA & Tiền xử lý QC (Thuật toán 01 + 03)
    let done = timer("1. NASA fetch + QC + derived");
    const rawNasa = await fetchNasa(lat, lon);

    if (rawNasa._is_water) {
      return res.json({
        ok: false,
        is_water: true,
        terrain_type: "OCEAN",
        error: rawNasa.message || "Tọa độ này nằm trên đại dương/mặt nước. Vệ tinh nông nghiệp không có dữ liệu đất liền."
      });
    }
    if (rawNasa._is_ice) {
      return res.json({
        ok: false,
        is_ice: true,
        terrain_type: "ICE_SHEET",
        error: rawNasa.message || "Tọa độ này thuộc dải băng tuyết vĩnh cửu. Không có đất nông nghiệp!"
      });
    }

    const nasa = computeDerived(rawNasa);
    done(nasa._mock ? `(mock${nasa._error ? ": " + nasa._error : ""})` : "(NASA POWER thật)");

    // Kiểm tra địa lý kết hợp viễn thám khí hậu (Phát hiện đỉnh núi tuyết vĩnh cửu / Sông băng)
    const climateGeoCheck = classifyCoordinates(lat, lon, nasa);
    if (climateGeoCheck.is_ice) {
      return res.json({
        ok: false,
        is_ice: true,
        is_alpine: !!climateGeoCheck.is_alpine,
        terrain_type: climateGeoCheck.type || "ICE_SHEET",
        error: climateGeoCheck.message || "Tọa độ này thuộc đỉnh núi cao/sông băng tuyết phủ vĩnh cửu. Không có tầng đất canh tác nông nghiệp!"
      });
    }

    // 3) Áp dụng lọc Savitzky-Golay (Thuật toán 07) làm mịn đường cong tán lá
    if (nasa.NDVI && nasa.NDVI.length === 12) {
      nasa.NDVI_SMOOTHED = smoothTimeSeriesSavitzkyGolay(nasa.NDVI);
      nasa._phenology = extractPhenologyMetrics(nasa.NDVI_SMOOTHED);
    }

    // 4) Nhận diện bất thường SPI và Khí hậu cực đoan (Thuật toán 08)
    const envAnomalies = detectEnvironmentalAnomalies(nasa);

    // 5) Phân cụm mùa vụ vi khí hậu 12 tháng (Thuật toán 09)
    const seasonalRegimes = clusterSeasonalClimate(nasa, 3);

    const satellite = buildSatelliteSummary(nasa);
    const alerts = generateAlerts(nasa, envAnomalies);

    // Bổ sung cảnh báo địa hình núi cao cận băng giá nếu có
    if (nasa.T2M && Array.isArray(nasa.T2M)) {
      const minT = Math.min(...nasa.T2M);
      const maxT = Math.max(...nasa.T2M);
      const meanT = nasa.T2M.reduce((a, b) => a + b, 0) / nasa.T2M.length;
      if (minT < 0.0 && maxT < 15.0 && meanT < 8.0) {
        alerts.unshift({
          level: "danger",
          msg: `🏔️ Địa hình núi cao cận băng giá: Mùa hè chỉ đạt ${maxT.toFixed(1)}°C, mùa đông đóng băng ${minT.toFixed(1)}°C. Địa hình dốc hiểm trở, nguy cơ mất mùa rất cao!`
        });
      }
    }

    // Bổ sung các cảnh báo vật lý từ SPI / Khí hậu cực đoan nếu chưa có
    if (envAnomalies && Array.isArray(envAnomalies.alerts)) {
      envAnomalies.alerts.forEach(ea => {
        const alreadyExists = alerts.some(a => {
          const text = (typeof a === "string" ? a : (a && a.msg) || "");
          return (ea.satellite && text.includes(ea.satellite)) || (ea.msg && text.includes(ea.msg));
        });
        if (ea.level === "danger" && !alreadyExists) {
          alerts.unshift({ level: ea.level || "danger", msg: ea.msg });
        }
      });
    }

    // 6) Chấm điểm kịch bản đa tiêu chí (FAO EcoCrop & MCDA V2 - Thuật toán 11)
    done = timer("2. scoring baseline + user");
    const baselineCrops = ["Rice", "Rice", "Fallow"];
    const baseline = scoreScenario(baselineCrops, nasa, wWater, wSoil, wProfit);
    const user = scoreScenario(userCrops, nasa, wWater, wSoil, wProfit);
    done();

    // 7) Tối ưu hóa Luân canh Cổ điển & Lượng tử QAOA (Thuật toán 13)
    done = timer("3. quantum QAOA");
    const q = runQuantum(nasa, wWater, wSoil, wProfit);
    const quantum = scoreScenario(q.crops, nasa, wWater, wSoil, wProfit);
    done(`crops=${q.crops.join(",")} ok=${q.ok}`);

    // 8) Phân tích quyết định đa tiêu chuẩn AHP & TOPSIS (Thuật toán 12)
    // Tính vector trọng số chuẩn hóa Saaty AHP (CR < 0.10)
    const ahpResult = deriveAHPWeightsFromPreferences([wSoil, wWater, wProfit]);
    const calibratedWeights = ahpResult.weights; // [wSoil, wWater, wProfit]

    const scenariosForTOPSIS = [
      { id: "baseline", label: "Mặc định (Lúa-Lúa-Nghỉ)", soil_hp: baseline.soil_hp, water_hp: baseline.water_hp, profit_hp: baseline.profit_hp },
      { id: "user", label: "Lựa chọn Nông dân", soil_hp: user.soil_hp, water_hp: user.water_hp, profit_hp: user.profit_hp },
      { id: "quantum", label: "Tối ưu Lượng tử QAOA", soil_hp: quantum.soil_hp, water_hp: quantum.water_hp, profit_hp: quantum.profit_hp }
    ];
    const topsisRanked = rankScenariosTOPSIS(
      scenariosForTOPSIS,
      calibratedWeights,
      ["soil_hp", "water_hp", "profit_hp"],
      ["benefit", "benefit", "benefit"]
    );

    // 9) Đánh giá Quantum Match Score & Trạng thái Khả thi Nông học
    // Trong nông nghiệp chính xác: Điểm tương hợp phải phản ánh đồng thời độ tiệm cận nghiệm tối ưu
    // VÀ chất lượng nông học thực tế của vùng đất.
    // Nếu cả kịch bản của người dùng và AI Lượng tử đều rơi vào Rank C (hoặc overall < 35),
    // vùng đất là sa mạc khô hạn hoặc băng giá cực đoan, điểm không thể đánh giá là 98% "Xuất sắc" (Excellent)
    // mà phải chiết giảm theo mức độ khả thi thực tế (viability factor).
    let matchPct = 0;
    let matchDesc = "Run analysis to compare strategies";

    const isExtremeZone = (quantum.rank === "C" && user.rank === "C") || (quantum.overall < 35 && user.overall < 35);
    const isUserUnviable = user.rank === "C" || user.overall < 35;

    if (quantum.overall <= 0 && user.overall <= 0) {
      matchPct = 0;
      matchDesc = "🔴 High Risk — Environmental conditions do not support agriculture (Rank C)";
    } else if (isExtremeZone) {
      // Cả 2 kịch bản đều thất bại do đất đai cằn cỗi/sa mạc/băng giá
      const relativeCloseness = Math.max(0, 100 - Math.abs(user.overall - quantum.overall) * 2.5);
      const viabilityFactor = Math.min(1.0, Math.max(0.05, Math.max(user.overall, quantum.overall) / 60.0));
      matchPct = clamp(round(relativeCloseness * viabilityFactor, 1), 0, 100);
      matchDesc = "⚠️ Severe Environment — High failure risk for both rotations (Rank C)";
    } else if (isUserUnviable) {
      // Nông dân chọn cây trồng không phù hợp (Rank C), trong khi Lượng tử tìm ra giải pháp tốt hơn
      const diff = Math.max(0, quantum.overall - user.overall);
      matchPct = clamp(round(Math.max(5, 50 - diff * 0.8), 1), 0, 100);
      matchDesc = "🔴 High Risk — Selected crops are unviable in this climate (Rank C)";
    } else {
      // Vùng đất canh tác bình thường (Rank A, B, S):
      // Đánh giá khoảng cách tiệm cận giữa phương án người dùng và phương án lượng tử
      const diff = Math.abs(user.overall - quantum.overall);
      matchPct = clamp(round(100 - diff * 1.2, 1), 0, 100);
      matchDesc = matchPct >= 85 ? "🏆 Excellent — Very close to quantum optimal!"
        : matchPct >= 65 ? "👍 Good — Room for further optimization"
        : matchPct >= 45 ? "⚠️ Fair — Consider the quantum recommendation"
        : "🔴 Low — Quantum suggests a significantly better rotation";
    }

    const cropInfo = (keys) =>
      keys.map((k) => ({
        key: k, label: CROPS[k].label, color: CROPS[k].color,
        profit: CROPS[k].profit, water: CROPS[k].water, soil: CROPS[k].soil,
      }));

    res.json({
      ok: true,
      coords: { lat: round(lat, 4), lon: round(lon, 4) },
      source: nasa._mock 
        ? "Fallback Simulation (Calibrated Agricultural Model)" 
        : (nasa._has_interpolated ? "NASA POWER Climatology (QC Interpolated)" : "NASA POWER API (Climatology Observed)"),
      provenance: nasa._provenance || {
        status: nasa._mock ? "fallback" : "observed",
        integrity_score: nasa._qc_integrity || 100
      },
      satellite,
      alerts: alerts.slice(0, 5),
      monthly: {
        T2M: nasa.T2M, TS: nasa.TS, RAIN: nasa.PRECTOTCORR,
        GWETROOT: nasa.GWETROOT, NDVI: nasa.NDVI,
        NDVI_SMOOTHED: nasa.NDVI_SMOOTHED || nasa.NDVI
      },
      scenarios: {
        baseline: { ...baseline, crop_info: cropInfo(baselineCrops) },
        user: { ...user, crop_info: cropInfo(userCrops) },
        quantum: {
          ...quantum,
          crop_info: cropInfo(q.crops),
          method: q.method,
          probs: q.probs,
          classical_baseline: q.classical_baseline,
          optimality_gap_pct: q.optimality_gap_pct,
          feasibility_rate_pct: q.feasibility_rate_pct
        },
      },
      mcda: {
        ahp: ahpResult,
        topsis: topsisRanked
      },
      seasonal_clusters: seasonalRegimes.cluster_profiles,
      phenology: nasa._phenology || null,
      match_pct: matchPct,
      match_desc: matchDesc,
      crops_meta: Object.fromEntries(Object.entries(CROPS).map(([k, v]) => [k, { label: v.label, color: v.color }])),
    });
  } catch (e) {
    console.error("[/api/analyze] lỗi:", e);
    res.status(500).json({ ok: false, error: e.message, trace: String(e.stack).slice(0, 500) });
  }
});

// ─── GET /api/random_coords ──────────────────────────────────────────────────
router.get("/random_coords", (req, res) => {
  const zones = [
    [12.66, 108.03], // Đắk Lắk, Việt Nam (Tây Nguyên)
    [21.18, 105.23], // Phú Thọ, Việt Nam (Đồng bằng sông Hồng)
    [36.77, -119.41], // Fresno, California, Mỹ
    [41.58, -93.62],  // Iowa, Mỹ (Corn Belt)
    [-34.28, 142.06], // Mildura, Úc
    [28.61, 77.23],   // Delhi, Ấn Độ
    [39.9, 116.4],    // Bắc Kinh, Trung Quốc
    [-1.29, 36.82],   // Nairobi, Kenya
    [45.46, 9.19],    // Thung lũng Po, Ý
    [23.72, 90.41],   // Dhaka, Bangladesh
    [12.63, -8.00],   // Bamako, Mali
    [-15.78, -47.93], // Brasilia, Brazil
    [9.07, 7.39],     // Abuja, Nigeria
    [29.07, 31.09],   // Beni Suef, Ai Cập
    [48.20, 16.37],   // Vienna, Áo
  ];

  const [lat0, lon0] = zones[Math.floor(Math.random() * zones.length)];
  const lat = clamp(round(lat0 + uniform(-0.05, 0.05), 4), -60, 70);
  const lon = round(lon0 + uniform(-0.05, 0.05), 4);
  res.json({ lat, lon });
});

module.exports = router;
