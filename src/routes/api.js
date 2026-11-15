// /api/* router — combined V3 pipeline with legacy trade-route support.
const express = require("express");
const {
  CROPS,
  CROP_KEYS,
  OBJECTIVE_VERSION,
  PARAMETER_REGISTRY,
  CALENDAR,
} = require("../config/crops");
const { clamp, round, uniform, num } = require("../utils/helpers");
const { debug, timer } = require("../utils/logger");
const { classifyCoordinates, mapProvenance } = require("../utils/geoClassifier");
const {
  fetchNasa,
  fetchRainfallHistory,
  computeDerived,
  buildSatelliteSummary,
} = require("../services/nasa");
const { fetchExternalData } = require("../services/external");
const { buildCropRanking } = require("../services/cropRanking");
const {
  fetchColdHistory,
  fetchElevation,
  describeTerrain,
  assessColdRisk,
  coldRiskAlerts,
} = require("../services/coldRisk");
const { SCIENTIFIC_CROP_PROFILES } = require("../algorithms/11_crop_suitability_fuzzy_ecocrop");
const { scoreScenario } = require("../services/scoring");
const { generateAlerts } = require("../services/alerts");
const { runQuantum } = require("../quantum/qaoa");
const { calculateTradeRoutes } = require("../services/trade");
const {
  smoothTimeSeriesSavitzkyGolay,
  extractPhenologyMetrics,
} = require("../algorithms/07_timeseries_savitzky_golay");
const { detectEnvironmentalAnomalies } = require("../algorithms/08_anomaly_detection_spi");
const { clusterSeasonalClimate } = require("../algorithms/09_unsupervised_agro_clustering");
const {
  deriveAHPWeightsFromPreferences,
  rankScenariosTOPSIS,
} = require("../algorithms/12_mcda_ahp_topsis");

const CONTRACT_VERSION = "terrain-v2-objective-v5";
const STARTED_AT = new Date().toISOString();

function createApiRouter({
  climateProvider = fetchNasa,
  historyProvider = fetchRainfallHistory,
  coldHistoryProvider = fetchColdHistory,
  elevationProvider = fetchElevation,
  externalProvider = fetchExternalData,
  quantumOptions = {},
} = {}) {
  const router = express.Router();
  const rankingCache = new Map();

  // Attach API contract version + no-store caching to all JSON responses.
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    const json = res.json.bind(res);
    res.json = (body) => json({ ...body, contract_version: CONTRACT_VERSION });
    next();
  });

  router.get("/runtime", (req, res) => {
    res.json({
      ok: true,
      started_at: STARTED_AT,
      objective_version: OBJECTIVE_VERSION,
      contract_version: CONTRACT_VERSION,
    });
  });

  // Local-only geolocation classification. NASA outages should not suppress
  // ocean/ice/land warnings.
  router.get("/location", (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    if (
      !String(req.query.lat || "").trim() ||
      !String(req.query.lon || "").trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      return res.status(400).json({ ok: false, error: "Tọa độ không hợp lệ." });
    }

    res.json({
      ok: true,
      coords: { lat, lon },
      location: classifyCoordinates(lat, lon),
      map_provenance: mapProvenance,
    });
  });

  // Pointer previews do not run QAOA, trade, SPI or optional crop APIs.
  router.get("/crop_suitability", async (req, res) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!String(req.query.lat || "").trim() || !String(req.query.lon || "").trim() ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) {
      return res.status(400).json({ok:false,error:"Tọa độ không hợp lệ."});
    }
    const location = classifyCoordinates(lat,lon);
    if (location.is_water || location.is_ice || location.requires_verification) {
      return res.json({ok:false,location,crop_rankings:{status:"unavailable",rows:[],reason:location.message}});
    }
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    let entry = rankingCache.get(key);
    if (!entry || entry.expires < Date.now()) {
      const promise = (async () => {
        const [raw, cold, elevation] = await Promise.all([
          climateProvider(lat,lon),
          Promise.resolve().then(()=>coldHistoryProvider(lat,lon)).catch(()=>({status:"unavailable",records:[]})),
          Promise.resolve().then(()=>elevationProvider(lat,lon)).catch(()=>({status:"unavailable",value:null})),
        ]);
        if (!raw || raw._unavailable || raw._mock || raw._low_quality || raw.recommendation_allowed === false || raw._is_water || raw._is_ice) {
          throw new Error("Chưa có dữ liệu khí hậu hợp lệ tại điểm này.");
        }
        const data=computeDerived(raw);
        data._cold_risk=assessColdRisk(data,cold);
        const terrain=describeTerrain(data,elevation);
        const crop_rankings=buildCropRanking(data,{terrain});
        return {ok:crop_rankings.status === "available",coords:{lat,lon},location,terrain,crop_rankings,source:data._source_description || data._source || "NASA POWER"};
      })();
      if (rankingCache.size>=32) rankingCache.delete(rankingCache.keys().next().value);
      entry={promise,expires:Date.now()+300000}; rankingCache.set(key,entry);
      promise.catch(()=>{if(rankingCache.get(key)===entry)rankingCache.delete(key);});
    }
    try { return res.json(await entry.promise); }
    catch (error) { return res.status(503).json({ok:false,crop_rankings:{status:"unavailable",rows:[],reason:error.message}}); }
  });

  // ─── POST /api/analyze ───────────────────────────────────────────────────────
  router.post("/analyze", async (req, res) => {
    try {
      const body = req.body || {};
      debug("analyze body:", JSON.stringify(body));

      // Strict coordinate validation: do not silently coerce bad input.
      const lat = body.lat;
      const lon = body.lon;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return res.status(400).json({
          ok: false,
          error: "lat/lon phải là số hữu hạn trong [-90,90] và [-180,180].",
        });
      }

      // Weights may be provided, but we normalize through AHP later.
      for (const key of ["w_water", "w_soil", "w_profit"]) {
        if (
          body[key] !== undefined &&
          (!Number.isFinite(body[key]) || body[key] < 0 || body[key] > 1)
        ) {
          return res.status(400).json({
            ok: false,
            error: "Trọng số phải là số trong [0,1].",
          });
        }
      }

      if (body.user_crops !== undefined && (
        !Array.isArray(body.user_crops) || body.user_crops.length !== 3 ||
        body.user_crops.some(crop => !CROP_KEYS.includes(crop))
      )) {
        return res.status(400).json({ok:false,error:"user_crops phải gồm đúng 3 loại cây được hỗ trợ."});
      }
      const userCrops = body.user_crops === undefined ? ["Rice", "Soybean", "Maize"] : [...body.user_crops];

      const ahpInput = [
        num(body.w_soil, 0.33),
        num(body.w_water, 0.33),
        num(body.w_profit, 0.34),
      ];
      const preferences = deriveAHPWeightsFromPreferences(ahpInput);
      const [wSoil, wWater, wProfit] = preferences.weights;

      // 1) Geo classification before expensive fetches.
      const geoCheck = classifyCoordinates(lat, lon);
      if (geoCheck.requires_verification) {
        return res.json({
          ok: false,
          location: geoCheck,
          terrain_type: geoCheck.type,
          recommendation_allowed: false,
          field_recommendation_allowed: false,
          error: geoCheck.message,
        });
      }

      if (geoCheck.is_water) {
        return res.json({
          ok: false,
          is_water: true,
          terrain_type: geoCheck.type,
          location: geoCheck,
          error:
            geoCheck.message ||
            "Tọa độ này nằm trên đại dương/mặt nước. Vui lòng chọn khu vực đất liền!",
        });
      }

      if (geoCheck.is_ice) {
        return res.json({
          ok: false,
          is_ice: true,
          terrain_type: "ICE_SHEET",
          location: geoCheck,
          error:
            geoCheck.message ||
            "Tọa độ này nằm trên dải băng tuyết vĩnh cửu. Không có tầng đất trồng trọt!",
        });
      }

      // 2) NASA climate + elevation in parallel.
      let done = timer("1. NASA fetch + QC + derived");
      const [rawNasa, elevation] = await Promise.all([
        Promise.resolve().then(() => climateProvider(lat, lon)).catch((e) => ({
          _error: e.message,
          _unavailable: true,
          source_status: "unavailable",
        })),
        Promise.resolve()
          .then(() => elevationProvider(lat, lon))
          .catch((e) => ({ status: "unavailable", value: null, reason: e.message })),
      ]);

      if (rawNasa._is_water) {
        return res.json({
          ok: false,
          is_water: true,
          terrain_type: "OCEAN",
          error:
            rawNasa.message ||
            "Tọa độ này nằm trên đại dương/mặt nước. Vệ tinh nông nghiệp không có dữ liệu đất liền.",
        });
      }

      if (rawNasa._is_ice) {
        return res.json({
          ok: false,
          is_ice: true,
          terrain_type: "ICE_SHEET",
          error:
            rawNasa.message ||
            "Tọa độ này thuộc dải băng tuyết vĩnh cửu. Không có đất nông nghiệp!",
        });
      }

      if (
        rawNasa._unavailable ||
        rawNasa._mock ||
        rawNasa.recommendation_allowed === false
      ) {
        done("(unavailable)");
        const terrain = describeTerrain(rawNasa, elevation);
        const coldRisk = assessColdRisk(rawNasa);
        const qc = rawNasa._qc || {};
        const missingVariables = Object.entries(qc)
          .filter(([, q]) => q.missing > 0)
          .map(([key]) => key);
        const suspectVariables = Object.entries(qc)
          .filter(([, q]) => q.suspect_outliers > 0)
          .map(([key]) => key);

        const problem = rawNasa._mock
          ? "Dữ liệu mô phỏng không được dùng để khuyến nghị."
          : rawNasa._low_quality
          ? `Dữ liệu NASA cần kiểm tra chất lượng${
              suspectVariables.length ? ` (${suspectVariables.join(", ")})` : ""
            }.`
          : missingVariables.length
          ? `NASA thiếu dữ liệu bắt buộc: ${missingVariables.join(", ")}.`
          : "Chưa tải được dữ liệu NASA POWER. Có thể do kết nối hoặc dịch vụ tạm thời không phản hồi.";

        return res.status(503).json({
          ok: false,
          source_status: rawNasa.source_status || "unavailable",
          recommendation_allowed: false,
          field_recommendation_allowed: false,
          forecast: false,
          data_mode:
            rawNasa._mock ? "demo" : rawNasa.source_status === "low_quality" ? "low_quality" : "unavailable",
          reason: rawNasa._error || "Required climate data missing or low quality",
          source: rawNasa._source_description || "NASA POWER unavailable",
          error: `${problem} Chưa thể phân tích; vui lòng thử lại sau.`,
          location: geoCheck,
          terrain,
          cold_risk: coldRisk,
          alerts: coldRiskAlerts(coldRisk, terrain),
          missing_variables: missingVariables,
          suspect_variables: suspectVariables,
          provenance: rawNasa._provenance || { status: "unavailable" },
          variables: rawNasa._raw_catalog || {},
          spi: {
            status: "unavailable",
            reason: "No validated monthly history loaded",
            source: "NASA POWER monthly PRECTOTCORR / MERRA-2",
            period: null,
            reference_year: null,
            type: "historical_spi",
            timescales: [1, 3, 6],
            details: [],
          },
          scenarios: null,
          match_pct: null,
        });
      }

      const nasa = computeDerived(rawNasa);
      done(`(${nasa.source_status})`);

      // 3) Savitzky-Golay smoothing + phenology extraction.
      if (nasa.NDVI && nasa.NDVI.length === 12) {
        nasa.NDVI_SMOOTHED = smoothTimeSeriesSavitzkyGolay(nasa.NDVI);
        nasa._raw_catalog.NDVI_SMOOTHED = nasa.NDVI_SMOOTHED.map((value, i) => ({
          ...nasa._raw_catalog.NDVI[i],
          variable: "NDVI_SMOOTHED",
          value,
          product: "Savitzky-Golay smoothed climate NDVI proxy",
          dependencies: ["NDVI"],
        }));
        nasa._phenology = extractPhenologyMetrics(nasa.NDVI_SMOOTHED);
      }

      // 4) SPI / anomaly detection + cold history.
      const [history, coldHistory] = await Promise.all([
        Promise.resolve()
          .then(() => historyProvider(lat, lon))
          .catch((e) => ({ status: "unavailable", records: [], reason: e.message })),
        Promise.resolve()
          .then(() => coldHistoryProvider(lat, lon))
          .catch((e) => ({ status: "unavailable", records: [], reason: e.message })),
      ]);

      nasa._cold_risk = assessColdRisk(nasa, coldHistory);
      nasa._terrain = describeTerrain(nasa, elevation);
      nasa._raw_catalog.T2M_MIN_HISTORY = nasa._cold_risk.months.map((m) => ({
        variable: "T2M_MIN_HISTORY",
        month: m.month,
        value: m.daily?.minimum_tmin_c ?? null,
        status: m.daily?.valid_days ? "historical_extreme" : "missing",
        source: coldHistory.source || "NASA POWER daily T2M_MIN",
        product: "Minimum daily Tmin by calendar month over available history",
        unit: "°C",
        period: coldHistory.period || null,
        valid_days: m.daily?.valid_days || 0,
        missing_days: m.daily?.missing_days ?? null,
        limitations:
          "Historical reanalysis extreme; not climatology, forecast or observed plant mortality.",
      }));

      const envAnomalies = detectEnvironmentalAnomalies(
        nasa,
        history.status === "unavailable" ? null : history.records
      );

      // 5) Seasonal micro-climate clustering.
      const seasonalRegimes = clusterSeasonalClimate(nasa, 3);

      const satellite = buildSatelliteSummary(nasa);
      const alerts = generateAlerts(nasa, envAnomalies);

      if (envAnomalies && Array.isArray(envAnomalies.alerts)) {
        envAnomalies.alerts.forEach((ea) => {
          const alreadyExists = alerts.some((a) => {
            const text = typeof a === "string" ? a : (a && a.msg) || "";
            return (ea.satellite && text.includes(ea.satellite)) || (ea.msg && text.includes(ea.msg));
          });
          if (ea.level === "danger" && !alreadyExists) {
            alerts.unshift({ level: ea.level || "danger", msg: ea.msg });
          }
        });
      }

      // 6) Optional third-party suitability overlay.
      done = timer("2. external suitability overlay");
      const allCropsToFetch = [...new Set([...userCrops, ...CROP_KEYS])];
      const extData = await Promise.resolve()
        .then(() => externalProvider(lat, lon, nasa, allCropsToFetch))
        .catch((e) => ({
          ok: false,
          source: "external-unavailable",
          error: e.message,
          data: {},
        }));
      done(`source=${extData.source} ok=${extData.ok}`);

      const suitabilityMap = {};
      if (extData && extData.data) {
        for (const [k, v] of Object.entries(extData.data)) {
          if (CROP_KEYS.includes(k) && v && Number.isFinite(v.suitability) &&
            v.suitability >= 0 && v.suitability <= 1 &&
            v.source !== "fallback" && v.source !== "static") suitabilityMap[k] = v.suitability;
        }
      }

      // 7) MCDA scoring.
      done = timer("3. scoring baseline + user + classical");
      const baselineCrops = ["Rice", "Rice", "Fallow"];
      const scorePlan = crops => scoreScenario(crops, nasa, wWater, wSoil, wProfit, suitabilityMap, {}, {mode:"planning"});
      const baseline = scorePlan(baselineCrops);
      const user = scorePlan(userCrops);
      done();

      // 8) Quantum/classical optimization.
      done = timer("4. quantum QAOA");
      const q = runQuantum(nasa, wWater, wSoil, wProfit, {...quantumOptions, mode:"planning", suitabilityMap});
      const quantum = scorePlan(q.crops);
      const classical = scorePlan(q.classical_baseline);
      done(`crops=${q.crops.join(",")} ok=${q.ok}`);

      // 9) AHP + TOPSIS ranking.
      const ahpResult = deriveAHPWeightsFromPreferences([wSoil, wWater, wProfit]);
      const calibratedWeights = ahpResult.weights;

      const scenariosForTOPSIS = [
        {
          id: "classical",
          label: "Classical Exact · planning objective",
          soil_hp: classical.soil_hp,
          water_hp: classical.water_hp,
          profit_hp: classical.profit_hp,
        },
        {
          id: "baseline",
          label: "Mặc định (Lúa-Lúa-Nghỉ)",
          soil_hp: baseline.soil_hp,
          water_hp: baseline.water_hp,
          profit_hp: baseline.profit_hp,
        },
        {
          id: "user",
          label: "Lựa chọn Nông dân",
          soil_hp: user.soil_hp,
          water_hp: user.water_hp,
          profit_hp: user.profit_hp,
        },
        {
          id: "quantum",
          label: q.fallback_used ? "Tối ưu cổ điển (fallback)" : "QAOA mô phỏng thử nghiệm",
          soil_hp: quantum.soil_hp,
          water_hp: quantum.water_hp,
          profit_hp: quantum.profit_hp,
        },
      ];

      const topsisRanked = rankScenariosTOPSIS(
        scenariosForTOPSIS,
        calibratedWeights,
        ["soil_hp", "water_hp", "profit_hp"],
        ["benefit", "benefit", "benefit"]
      );

      // Similarity is a bounded heuristic difference, not a probability.
      let matchPct =
        user.is_feasible && classical.is_feasible && !classical.no_planting
          ? round(Math.max(0, 100 - Math.abs(user.overall - classical.overall)), 1)
          : null;

      let matchDesc =
        matchPct === null
          ? "Rank C / High Risk: phương án không khả thi theo mô hình hoặc chỉ còn nghỉ đất; không tính tương đồng."
          : "Điểm tương đồng phương án với Classical Exact (heuristic), không phải độ chính xác hay xác suất thành công.";

      const cropInfo = (keys) =>
        keys.map((k) => ({
          key: k,
          label: CROPS[k].label,
          color: CROPS[k].color,
          profit: SCIENTIFIC_CROP_PROFILES[k].base_profit,
          water: SCIENTIFIC_CROP_PROFILES[k].water_intensity,
          soil: SCIENTIFIC_CROP_PROFILES[k].nitrogen_balance,
          units: "heuristic planning inputs",
        }));

      const elevationMismatch =
        nasa._terrain.climate_representativeness === "limited_by_elevation_difference";
      const coldCoverageComplete = nasa._cold_risk.unknown_months.length === 0;
      if (elevationMismatch) {
        matchPct = null;
        matchDesc =
          "Chênh lệch độ cao lớn: chỉ xem kết quả theo ô khí hậu NASA POWER; chưa đủ cơ sở khuyến nghị tại ruộng.";
      }

      res.json({
        ok: true,
        coords: { lat: round(lat, 4), lon: round(lon, 4) },
        location: geoCheck,
        map_provenance: mapProvenance,
        source: nasa._source_description || "NASA POWER climatology",
        source_status: nasa.source_status || "climatology",
        recommendation_allowed: !elevationMismatch && coldCoverageComplete,
        recommendation_allowed_semantics: "permission_to_display_experimental_planning_scenarios_only",
        planning_allowed: !elevationMismatch && coldCoverageComplete,
        recommendation_status: elevationMismatch
          ? "elevation_mismatch"
          : coldCoverageComplete
          ? "planning_scenario_experimental"
          : "cold_risk_incomplete",
        assessment_scope: "experimental_planning_scenario",
        forecast: false,
        field_recommendation_allowed: false,
        data_mode: nasa.source_status === "interpolated" ? "partial_interpolated" : "valid_climatology",
        planning_status: elevationMismatch
          ? "blocked_elevation_mismatch"
          : !coldCoverageComplete
          ? "blocked_cold_data"
          : "experimental",
        objective_version: OBJECTIVE_VERSION,
        calendar: {
          ...CALENDAR,
          hemisphere: lat < 0 ? "southern" : "northern",
          local_calendar_inferred: false,
        },
        parameter_registry: {
          scoring: PARAMETER_REGISTRY,
          crops: Object.fromEntries(
            Object.entries(SCIENTIFIC_CROP_PROFILES).map(([key, p]) => [
              key,
              Object.entries(p.parameter_provenance).map(([name, meta]) => ({
                name,
                value: p[name],
                ...meta,
                source: meta.origin,
                region_scope: p.region_scope,
                assumptions: p.water_regime_assumption,
                confidence: "uncalibrated",
              })),
            ])
          ),
        },
        limitations: [
          "Scores, crop thresholds and climate proxies have no independent field validation.",
          "Climatology is not a forecast. No optical imagery or measured soil chemistry is loaded.",
        ],
        provenance: nasa._provenance,
        variables: nasa._raw_catalog,
        derived_metadata: nasa._derived_meta,
        cold_risk: nasa._cold_risk,
        terrain: nasa._terrain,
        spi: {
          status: envAnomalies.spi_status,
          reason: envAnomalies.spi_reason || history.reason || null,
          source: history.source || "NASA POWER monthly PRECTOTCORR / MERRA-2",
          period: history.period || null,
          reference_year: envAnomalies.spi_details.find((r) => r.year)?.year || null,
          type: "historical_spi",
          timescales: [1, 3, 6],
          details: envAnomalies.spi_details,
        },
        external_api: {
          ok: extData.ok,
          source: extData.source,
          error: extData.error || null,
        },
        satellite,
        crop_rankings: buildCropRanking(nasa, {terrain:nasa._terrain}),
        alerts: alerts.slice(0, 10),
        monthly: {
          T2M_MIN_HISTORY: nasa._cold_risk.months.map((m) => m.daily?.minimum_tmin_c ?? null),
          T2M: nasa.T2M,
          T2M_MIN: nasa.T2M_MIN,
          TS: nasa.TS,
          RAIN: nasa.PRECTOTCORR,
          GWETROOT: nasa.GWETROOT,
          NDVI: nasa.NDVI,
          NDVI_SMOOTHED: nasa.NDVI_SMOOTHED || nasa.NDVI,
        },
        scenarios: {
          classical: {
            ...classical,
            method: "Classical Exact",
            crop_info: cropInfo(q.classical_baseline),
            status: "exact_feasible_reference",
          },
          baseline: {
            ...baseline,
            crop_info: cropInfo(baselineCrops),
          },
          user: {
            ...user,
            crop_info: cropInfo(userCrops),
          },
          quantum: {
            ...quantum,
            crop_info: cropInfo(q.crops),
            method: q.method,
            quantum_available: q.quantum_available,
            quantum_feasible: q.quantum_feasible,
            fallback_used: q.fallback_used,
            status: q.status,
            objective_version: q.objective_version || OBJECTIVE_VERSION,
            objective_score: q.objective_score,
            expected_energy: q.expected_energy ?? null,
            initial_expected_energy: q.initial_expected_energy ?? null,
            shots: q.shots,
            feasible_space_size: q.feasible_space_size ?? null,
            seed: q.seed ?? null,
            runtime_ms: q.runtime_ms,
            classical_runtime_ms: q.classical_runtime_ms,
            classical_best_score: q.classical_best_score,
            hardware_executed: false,
            probs: q.probs,
            classical_baseline: q.classical_baseline,
            optimality_gap_pct: q.optimality_gap_pct,
            feasibility_rate_pct: q.feasibility_rate_pct,
          },
        },
        mcda: {
          weights: ahpResult,
          ahp: ahpResult,
          limitations: "TOPSIS is relative to these candidates and uses heuristic/proxy scores.",
          topsis: topsisRanked,
        },
        seasonal_clusters: seasonalRegimes.cluster_profiles,
        phenology: nasa._phenology
          ? {
              ...nasa._phenology,
              status: "proxy",
              source: "Smoothed climate NDVI proxy",
              period: nasa._provenance?.period || null,
            }
          : null,
        match_pct: matchPct,
        match_desc: matchDesc,
        similarity: {
          kind: "heuristic_score_similarity",
          value: matchPct,
          unit: "heuristic points / 100",
          formula: "100 - abs(user_score - classical_exact_score)",
          user_score: user.overall,
          recommendation_score: classical.overall,
          qaoa_score: q.fallback_used ? null : quantum.overall,
          objective_version: OBJECTIVE_VERSION,
          solver_status: q.status,
          reference_method: "Classical Exact",
          probability: false,
          field_validated: false,
          reason: matchPct === null ? matchDesc : null,
        },
        crops_meta: Object.fromEntries(
          Object.entries(CROPS).map(([k, v]) => [
            k,
            {
              label: v.label,
              color: v.color,
              suitability_model: SCIENTIFIC_CROP_PROFILES[k],
            },
          ])
        ),
      });
    } catch (e) {
      console.error("[/api/analyze] lỗi:", e);
      res.status(500).json({ ok: false, error: "Không thể hoàn tất phân tích." });
    }
  });

  // ─── GET /api/random_coords ──────────────────────────────────────────────────
  router.get("/random_coords", (req, res) => {
    const zones = [
      [12.66, 108.03], // Đắk Lắk, Việt Nam
      [21.18, 105.23], // Phú Thọ, Việt Nam
      [36.77, -119.41], // Fresno, California, Mỹ
      [41.58, -93.62], // Iowa, Mỹ
      [-34.28, 142.06], // Mildura, Úc
      [28.61, 77.23], // Delhi, Ấn Độ
      [39.9, 116.4], // Bắc Kinh, Trung Quốc
      [-1.29, 36.82], // Nairobi, Kenya
      [45.46, 9.19], // Thung lũng Po, Ý
      [23.72, 90.41], // Dhaka, Bangladesh
      [12.63, -8.0], // Bamako, Mali
      [-15.78, -47.93], // Brasilia, Brazil
      [9.07, 7.39], // Abuja, Nigeria
      [29.07, 31.09], // Beni Suef, Ai Cập
      [48.2, 16.37], // Vienna, Áo
    ];

    const [lat0, lon0] = zones[Math.floor(Math.random() * zones.length)];
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

  return router;
}

module.exports = createApiRouter();
module.exports.createApiRouter = createApiRouter;
