// Các endpoint /api/*
const express = require("express");
const { CROPS, CROP_KEYS } = require("../config/crops");
const { clamp, round, uniform, num } = require("../utils/helpers");
const { debug, timer } = require("../utils/logger");
const { fetchNasa, computeDerived, buildSatelliteSummary } = require("../services/nasa");
const { fetchExternalData } = require("../services/external");
const { scoreScenario } = require("../services/scoring");
const { generateAlerts } = require("../services/alerts");
const { runQuantum } = require("../quantum/qaoa");
const { calculateTradeRoutes } = require("../services/trade");

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

    // 1) Dữ liệu NASA
    let done = timer("1. NASA fetch + derived");
    const nasa = computeDerived(await fetchNasa(lat, lon));
    done(nasa._mock ? `(mock${nasa._error ? ": " + nasa._error : ""})` : "(NASA POWER)");

    const satellite = buildSatelliteSummary(nasa);
    const alerts = generateAlerts(nasa);

    // 2) Lấy API Bên Thứ Ba  
    done = timer("2. Fetch External APIs (CartoDrone/Every.Farm)");
    const allCropsToFetch = [...new Set([...userCrops, ...CROP_KEYS])]; 
    const extData = await fetchExternalData(lat, lon, nasa, allCropsToFetch);
    done(`source=${extData.source} ok=${extData.ok}`);

    const suitabilityMap = {};
    if (extData && extData.data) {
      for (const [k, v] of Object.entries(extData.data)) {
        if (v && Number.isFinite(v.suitability)) suitabilityMap[k] = v.suitability;
      }
    }

    // 3) Chấm điểm
    done = timer("3. scoring baseline + user");
    const baselineCrops = ["Rice", "Rice", "Fallow"];
    const baseline = scoreScenario(baselineCrops, nasa, wWater, wSoil, wProfit, suitabilityMap);
    const user = scoreScenario(userCrops, nasa, wWater, wSoil, wProfit, suitabilityMap);
    done();

    // 4) Lượng tử 
    done = timer("4. quantum QAOA");
    const q = runQuantum(nasa, wWater, wSoil, wProfit, suitabilityMap);
    const quantum = scoreScenario(q.crops, nasa, wWater, wSoil, wProfit, suitabilityMap);
    done(`crops=${q.crops.join(",")} ok=${q.ok}`);

    const matchPct = clamp(round(100 - Math.abs(user.overall - quantum.overall) * 1.2, 1), 0, 100);

    const cropInfo = (keys) =>
      keys.map((k) => ({
        key: k, label: CROPS[k].label, color: CROPS[k].color,
        profit: CROPS[k].profit, water: CROPS[k].water, soil: CROPS[k].soil,
      }));

    res.json({
      ok: true,
      coords: { lat: round(lat, 4), lon: round(lon, 4) },
      source: nasa._mock ? "Fallback Mock Data" : "NASA POWER API",
      external_api: {
        ok: extData.ok,
        source: extData.source,
        error: extData.error
      },
      satellite,
      alerts,
      monthly: {
        T2M: nasa.T2M, TS: nasa.TS, RAIN: nasa.PRECTOTCORR,
        GWETROOT: nasa.GWETROOT, NDVI: nasa.NDVI,
      },
      scenarios: {
        baseline: { ...baseline, crop_info: cropInfo(baselineCrops) },
        user: { ...user, crop_info: cropInfo(userCrops) },
        quantum: { ...quantum, crop_info: cropInfo(q.crops), method: q.method, probs: q.probs },
      },
      match_pct: matchPct,
      crops_meta: Object.fromEntries(Object.entries(CROPS).map(([k, v]) => [k, { label: v.label, color: v.color }])),
    });
  } catch (e) {
    console.error("[/api/analyze] lỗi:", e);
    res.status(500).json({ ok: false, error: e.message, trace: String(e.stack).slice(0, 500) });
  }
});

// ─── GET /api/random_coords ──────────────────────────────────────────────────
router.get("/random_coords", (req, res) => {
  // Đã lọc lại toàn bộ: Xóa các thành phố ven biển/bán đảo, chỉ lấy vùng nông nghiệp sâu trong đất liền
  const zones = [
    [12.66, 108.03], // Đắk Lắk, Việt Nam (Tây Nguyên)
    [21.18, 105.23], // Phú Thọ, Việt Nam (Sâu trong đất liền)
    [36.77, -119.41], // Fresno, California, Mỹ (Thung lũng trung tâm)
    [41.58, -93.62],  // Iowa, Mỹ (Vùng trồng ngô Corn Belt - cực an toàn)
    [-34.28, 142.06], // Mildura, Úc
    [28.61, 77.23],   // Delhi, Ấn Độ
    [39.9, 116.4],    // Bắc Kinh, Trung Quốc
    [-1.29, 36.82],   // Nairobi, Kenya
    [45.46, 9.19],    // Thung lũng Po, Ý (Thay cho Rome ven biển)
    [23.72, 90.41],   // Dhaka, Bangladesh
    [12.63, -8.00],   // Bamako, Mali (Thay cho Senegal)
    [-15.78, -47.93], // Brasilia, Brazil
    [9.07, 7.39],     // Abuja, Nigeria (Thay cho Benin)
    [29.07, 31.09],   // Beni Suef, Ai Cập (Nông nghiệp ven sông Nile, sâu hơn Cairo)
    [48.20, 16.37],   // Vienna, Áo
  ];

  const [lat0, lon0] = zones[Math.floor(Math.random() * zones.length)];
  // Thu hẹp biên độ random từ ±3 xuống ±0.05 để tránh văng ra biển (chỉ ~15km quanh điểm gốc)
  const lat = clamp(round(lat0 + uniform(-0.05, 0.05), 4), -60, 70);
  const lon = round(lon0 + uniform(-0.05, 0.05), 4);
  res.json({ lat, lon });
});

// ─── POST /api/trade_routes ──────────────────────────────────────────────────
router.post("/trade_routes", async (req, res) => {
  try {
    const body = req.body || {};
    const lat = num(body.lat, 10.04);
    const lon = num(body.lon, 105.78);
    const crops = Array.isArray(body.crops) ? body.crops : ["Rice", "Soybean", "Maize"];

    const routes = await calculateTradeRoutes(lat, lon, crops);

    // Kiểm tra xem có bất kỳ tuyến đường nào dùng giá fallback không
    const hasFallback = routes.some((r) =>
      r.buyers.some((b) => b.price_source === "fallback")
    );

    res.json({
      ok: true,
      routes,
      price_source: hasFallback ? "fallback" : "live",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
