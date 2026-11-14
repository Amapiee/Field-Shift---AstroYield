const { CROPS, SEASON_IDX } = require("../config/crops");
const { round, meanAt, clamp, THRESHOLDS } = require("../utils/helpers");

const SEVERITY_ORDER = { danger: 0, warning: 1, ok: 2 };
const REQUIRED_FIELDS = ["GWETROOT", "TS", "PRECTOTCORR", "NDVI"];

function cropName(cd) {
  return (cd.label || "").replace(/^\S+\s+/, "").trim() || cd.label || "?";
}

function scoreScenario(cropTrio, data, wWater, wSoil, wProfit, suitabilityMap = {}, marketData = {}) {
  if (!Array.isArray(cropTrio) || cropTrio.length !== 3) {
    throw new RangeError(`cropTrio phải là mảng 3 phần tử, nhận ${cropTrio?.length}`);
  }
  for (const k of cropTrio) {
    if (!CROPS[k]) throw new RangeError(`Crop không hợp lệ: "${k}"`);
  }
  for (const f of REQUIRED_FIELDS) {
    if (!Array.isArray(data[f]) || data[f].length !== 12) {
      throw new RangeError(`data.${f} phải là mảng 12 phần tử`);
    }
  }

  let soilHp = 60, waterHp = 70, profitHp = 50;
  const alerts = [];

  cropTrio.forEach((ckey, si) => {
    const sidx  = SEASON_IDX[si];
    const cd    = CROPS[ckey];
    const gw    = meanAt(data.GWETROOT, sidx);
    const tmp   = meanAt(data.TS, sidx);
    const prp   = meanAt(data.PRECTOTCORR, sidx);
    const ndv   = meanAt(data.NDVI, sidx);
    const label = cropName(cd);

    const localSuitability = suitabilityMap[ckey] !== undefined ? suitabilityMap[ckey] : 0.5;
    const marketMultiplier = marketData[ckey] !== undefined ? marketData[ckey] : 1.0;

    // ── SOIL ─────────────────────────────────────────────
    let soilDelta = cd.soil * 0.55;
    if (ckey === "Fallow" && prp > THRESHOLDS.FALLOW_EROSION_MM) {
      soilDelta -= 14;
      alerts.push({ level: "warning", msg: `Vụ ${si + 1}: Bỏ trống + mưa ${prp.toFixed(0)}mm → Xói mòn đất!` });
    }
    soilHp += soilDelta;

    // ── WATER ────────────────────────────────────────────
    let droughtPenalty = 1.0;
    if (gw < THRESHOLDS.DROUGHT_GWET_CRIT && cd.water < -18) {
      waterHp += cd.water * 1.6;
      droughtPenalty = 0.2;
      alerts.push({ level: "danger", msg: `Vụ ${si + 1}: SMAP khô (${gw.toFixed(2)}) + ${label} háo nước → Hạn hán!` });
    } else {
      waterHp += cd.water * 0.5;
    }

    // ── PROFIT ───────────────────────────────────────────
    let profitDelta = (cd.profit * 0.5) * (localSuitability * 2.0) * marketMultiplier;

    if (tmp > THRESHOLDS.HEAT_TS_C && (cd.heat_tol ?? 0.5) < 0.45) {
      profitDelta *= 0.52;
      alerts.push({ level: "warning", msg: `Vụ ${si + 1}: ECOSTRESS TS=${tmp.toFixed(1)}°C → ${label} giảm năng suất!` });
    } else if (cd.T_opt && tmp > cd.T_opt + 3) {
      profitDelta *= 0.78;
      alerts.push({ level: "warning", msg: `Vụ ${si + 1}: Nhiệt độ ${tmp.toFixed(1)}°C vượt ngưỡng tối ưu của ${label}!` });
    }

    profitDelta *= droughtPenalty;
    if (droughtPenalty < 1.0) {
      alerts.push({ level: "warning", msg: `Vụ ${si + 1}: Thiếu nước làm giảm ${((1 - droughtPenalty) * 100).toFixed(0)}% lợi nhuận của ${label}!` });
    }
    profitHp += profitDelta;

    if (ckey === "Soybean" || ckey === "Peanut") {
      soilHp  += 5 * (0.5 + ndv);
      waterHp += 2;
    }
  });

  soilHp  = clamp(soilHp, 0, 100);
  waterHp = clamp(waterHp, 0, 100);

  if (waterHp < 40) {
    const survival = Math.max(waterHp / 40, 0);
    profitHp *= survival;
    alerts.push({ level: "danger", msg: "📉 Hệ thống tưới tiêu cạn kiệt — nguy cơ ảnh hưởng mùa màng!" });
  }
  profitHp = clamp(profitHp, 0, 100);

  const totalW  = Math.max(wWater + wSoil + wProfit, 1e-6);
  const overall = (wSoil * soilHp + wWater * waterHp + wProfit * profitHp) / totalW;
  const rank    = overall >= 80 ? "S" : overall >= 67 ? "A" : overall >= 44 ? "B" : "C";

  alerts.sort((a, b) => (SEVERITY_ORDER[a.level] ?? 9) - (SEVERITY_ORDER[b.level] ?? 9));
  const seen = new Set();
  const outAlerts = [];
  for (const a of alerts) {
    if (seen.has(a.msg)) continue;
    seen.add(a.msg);
    outAlerts.push(a.msg);
    if (outAlerts.length === 4) break;
  }

  return {
    soil_hp: round(soilHp, 1), water_hp: round(waterHp, 1), profit_hp: round(profitHp, 1),
    overall: round(overall, 1), rank, alerts: outAlerts, crops: cropTrio,
  };
}

module.exports = { scoreScenario };