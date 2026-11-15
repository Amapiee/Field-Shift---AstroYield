const { CROPS, CROP_KEYS, SEASON_IDX } = require("../config/crops");
const {
  buildSeasonEnvironments,
  suitabilityMatrix,
  evaluateRotationObjective,
} = require("../algorithms/13_crop_rotation_optimization_qaoa_milp");

const REQUIRED_OVERLAY_FIELDS = ["GWETROOT", "TS", "PRECTOTCORR", "NDVI"];
const SEVERITY_ORDER = { danger: 0, warning: 1, ok: 2 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 0) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const meanAt = (values, indexes) => {
  const valid = indexes.map((index) => values[index]).filter(Number.isFinite);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : 0;
};

function validateScenario(cropTrio) {
  if (!Array.isArray(cropTrio) || cropTrio.length !== 3) {
    throw new RangeError(`cropTrio phải là mảng 3 phần tử, nhận ${cropTrio?.length}`);
  }
  for (const crop of cropTrio) {
    if (!CROP_KEYS.includes(crop)) throw new RangeError(`Unknown crop "${crop}"; exactly three known crops are required`);
  }
}

function validateWeights(wWater, wSoil, wProfit) {
  if ([wWater, wSoil, wProfit].some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new TypeError("Weights must be finite and nonnegative");
  }
}

function hasExternalOverlay(suitabilityMap, marketData) {
  return CROP_KEYS.some((crop) => (
    suitabilityMap?.[crop] !== undefined || marketData?.[crop] !== undefined
  ));
}

function validateOverlay(map, name, { min = 0, max = Infinity } = {}) {
  for (const crop of CROP_KEYS) {
    const value = map?.[crop];
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) {
      throw new RangeError(`${name}.${crop} must be between ${min} and ${max}`);
    }
  }
}

function legacyOverlayScore(cropTrio, data, wWater, wSoil, wProfit, suitabilityMap, marketData) {
  for (const field of REQUIRED_OVERLAY_FIELDS) {
    if (!Array.isArray(data[field]) || data[field].length !== 12 || !data[field].every(Number.isFinite)) {
      throw new RangeError(`data.${field} phải là mảng 12 giá trị hữu hạn`);
    }
  }
  validateOverlay(suitabilityMap, "suitabilityMap", { max: 1 });
  validateOverlay(marketData, "marketData");

  let soilHp = 60;
  let waterHp = 70;
  let profitHp = 50;
  const alerts = [];

  cropTrio.forEach((cropKey, season) => {
    const months = SEASON_IDX[season];
    const crop = CROPS[cropKey];
    const wetness = meanAt(data.GWETROOT, months);
    const surfaceTemp = meanAt(data.TS, months);
    const rainfall = meanAt(data.PRECTOTCORR, months);
    const ndvi = meanAt(data.NDVI, months);
    const cropLabel = (crop.label || "").replace(/^\S+\s+/, "").trim() || crop.label || cropKey;
    const suitability = suitabilityMap?.[cropKey] ?? 0.5;
    const marketMultiplier = marketData?.[cropKey] ?? 1;

    let soilDelta = crop.soil * 0.55;
    if (cropKey === "Fallow" && rainfall > 100) {
      soilDelta -= 14;
      alerts.push({ level: "warning", msg: `Vụ ${season + 1}: Bỏ trống + mưa ${rainfall.toFixed(0)}mm có thể làm tăng xói mòn đất.` });
    }
    soilHp += soilDelta;

    let droughtPenalty = 1;
    if (wetness < 0.38 && crop.water < -18) {
      waterHp += crop.water * 1.6;
      droughtPenalty = 0.2;
      alerts.push({ level: "danger", msg: `Vụ ${season + 1}: Độ ẩm đất mô hình thấp (${wetness.toFixed(2)}); ${cropLabel} có nhu cầu nước cao.` });
    } else {
      waterHp += crop.water * 0.5;
    }

    let profitDelta = (crop.profit * 0.5) * (suitability * 2) * marketMultiplier;
    if (surfaceTemp > 34 && (crop.heat_tol ?? 0.5) < 0.45) {
      profitDelta *= 0.52;
      alerts.push({ level: "warning", msg: `Vụ ${season + 1}: Nhiệt độ bề mặt cao (${surfaceTemp.toFixed(1)}°C, chỉ báo mô hình) có thể gây stress cho ${cropLabel}.` });
    } else if (Number.isFinite(crop.T_opt) && surfaceTemp > crop.T_opt + 3) {
      profitDelta *= 0.78;
      alerts.push({ level: "warning", msg: `Vụ ${season + 1}: Nhiệt độ bề mặt (${surfaceTemp.toFixed(1)}°C) vượt ngưỡng tối ưu giả định của ${cropLabel}.` });
    }

    profitHp += profitDelta * droughtPenalty;
    if (droughtPenalty < 1) {
      alerts.push({ level: "warning", msg: `Vụ ${season + 1}: Thiếu nước làm giảm điểm lợi nhuận ước tính của ${cropLabel}.` });
    }
    if (cropKey === "Soybean" || cropKey === "Peanut") {
      soilHp += 5 * (0.5 + ndvi);
      waterHp += 2;
    }
  });

  soilHp = clamp(soilHp, 0, 100);
  waterHp = clamp(waterHp, 0, 100);
  if (waterHp < 40) {
    profitHp *= Math.max(waterHp / 40, 0);
    alerts.push({ level: "danger", msg: "Khả năng cấp nước thấp theo điểm số mô hình; cần kiểm tra nguồn tưới tại ruộng." });
  }
  profitHp = clamp(profitHp, 0, 100);

  const totalWeight = Math.max(wWater + wSoil + wProfit, 1e-6);
  const overall = (wSoil * soilHp + wWater * waterHp + wProfit * profitHp) / totalWeight;
  const rank = overall >= 80 ? "S" : overall >= 67 ? "A" : overall >= 44 ? "B" : "C";
  alerts.sort((a, b) => (SEVERITY_ORDER[a.level] ?? 9) - (SEVERITY_ORDER[b.level] ?? 9));
  const seen = new Set();
  const uniqueAlerts = [];
  for (const alert of alerts) {
    if (seen.has(alert.msg)) continue;
    seen.add(alert.msg);
    uniqueAlerts.push(alert.msg);
    if (uniqueAlerts.length === 4) break;
  }

  return {
    soil_hp: round(soilHp, 1),
    water_hp: round(waterHp, 1),
    profit_hp: round(profitHp, 1),
    overall: round(overall, 1),
    rank,
    alerts: uniqueAlerts,
    crops: cropTrio,
    model_status: "experimental_unvalidated",
    score_kind: "legacy_external_overlay",
    score_units: "0–100 heuristic points; not measured soil fertility, water availability or profit",
  };
}

function scoreScenario(cropTrio, data, wWater, wSoil, wProfit, suitabilityMap = {}, marketData = {}, options = {}) {
  validateScenario(cropTrio);
  validateWeights(wWater, wSoil, wProfit);
  if (hasExternalOverlay(suitabilityMap, marketData) && options.mode !== "planning") {
    return legacyOverlayScore(cropTrio, data, wWater, wSoil, wProfit, suitabilityMap, marketData);
  }

  const environments = buildSeasonEnvironments(data, { suitabilityMap, marketData });
  const matrix = suitabilityMatrix(environments);
  const result = evaluateRotationObjective(
    cropTrio,
    matrix,
    { soil: wSoil, water: wWater, profit: wProfit }
  );
  const seasons = cropTrio.map((crop, index) => ({
    season: index + 1,
    months: SEASON_IDX[index].map((month) => month + 1),
    ...matrix[index][crop],
  }));
  const alerts = seasons
    .filter((season) => season.is_lethal || season.model_excluded)
    .map((season) => (
      `Vụ ${season.season}: ${season.reason || "Bị loại theo ràng buộc mô hình"}; không xác nhận thiệt hại thực địa.`
    ));
  if (result.no_planting) {
    alerts.unshift("Nghỉ đất cả ba vụ; đây không phải phương án sản xuất hoặc xác suất thành công.");
  }
  if (!result.is_feasible) {
    alerts.unshift("Rank C: có vụ vi phạm ràng buộc của mô hình; kế hoạch không được xếp hạng là khả thi.");
  }

  return {
    ...result,
    objective_score: result.is_feasible ? result.objective_score : null,
    model_status: "experimental_unvalidated",
    score_kind: "heuristic_planning_score",
    score_units: "0–100 heuristic points; not measured soil fertility, water availability or profit",
    alerts,
    season_results: seasons,
    crops: cropTrio,
  };
}

module.exports = { scoreScenario };
