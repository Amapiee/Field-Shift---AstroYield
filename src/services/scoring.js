const { CROPS, CROP_KEYS, SEASON_IDX } = require("../config/crops");
const { round, sum, meanAt, argmax, clamp, THRESHOLDS } = require("../utils/helpers");
const { Statevector } = require('../quantum/statevector');

const SEVERITY_ORDER = { danger: 0, warning: 1, ok: 2 };
const REQUIRED_FIELDS = ["GWETROOT", "TS", "PRECTOTCORR", "NDVI"];

function cropName(cd) {
  return (cd.label || "").replace(/^\S+\s+/, "").trim() || cd.label || "?";
}

// Bổ sung suitabilityMap và marketData để tính điểm lợi nhuận thực tế
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

    // Lấy dữ liệu Động (Dynamic)
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
    // Lợi nhuận bị ảnh hưởng bởi Sinh thái vùng và Giá cả thị trường
    let profitDelta = (cd.profit * 0.5) * (localSuitability * 2.0) * marketMultiplier;
    
    if (tmp > THRESHOLDS.HEAT_TS_C && cd.heat_tol < 0.4) {
      profitDelta *= 0.52;
      alerts.push({ level: "warning", msg: `Vụ ${si + 1}: ECOSTRESS TS=${tmp.toFixed(1)}°C → ${label} giảm năng suất!` });
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

function buildCostMatrix(data, wWater, wSoil, wProfit) {
  const cost = SEASON_IDX.map(() => new Array(CROP_KEYS.length).fill(0));
  
  SEASON_IDX.forEach((sidx, s) => {
    const gw  = meanAt(data.GWETROOT, sidx);
    const tmp = meanAt(data.T2M, sidx);
    const et0 = meanAt(data.ET0, sidx);
    const ndv = meanAt(data.NDVI, sidx);

    CROP_KEYS.forEach((ckey, ci) => {
      const cd = CROPS[ckey];
      let score = (wProfit * cd.profit) / 100.0;

      // 1. Phạt theo Cân bằng Nước thực tế (ETc vs Soil Water)
      const ETc = et0 * cd.Kc;
      const deficitRatio = Math.max(0, (ETc - (gw * 150)) / ETc);
      score -= wWater * deficitRatio * 0.6;

      // 2. Thưởng cải tạo đất nông học (Legumes + NDVI)
      score += wSoil * (Math.max(cd.soil, 0) / 35.0) * (0.5 + ndv);

      // 3. Phạt lệch nhiệt độ sinh trưởng tối ưu (T_opt)
      if (tmp > cd.T_opt) {
        score -= (tmp - cd.T_opt) / (cd.T_max - cd.T_opt + 1e-6) * 0.4;
      }

      cost[s][ci] = score;
    });
  });
  return cost;
}

function runQuantum(data, wWater, wSoil, wProfit) {
  const cost = buildCostMatrix(data, wWater, wSoil, wProfit);
  const classicalBest = cost.map((row) => CROP_KEYS[argmax(row)]);

  try {
    const nCrops = CROP_KEYS.length;
    const nQubits = 3 * nCrops;
    const sv = new Statevector(nQubits);

    // DYNAMIC QAOA ANGLE SCALING: Tính góc Gamma tự điều chỉnh theo biên độ Ma trận Chi phí
    const flatCost = cost.flat();
    const maxC = Math.max(...flatCost);
    const minC = Math.min(...flatCost);
    const deltaE = maxC - minC || 1.0;

    // Gamma được tỉ lệ hóa để pha RZ nằm chuẩn trong khoảng [0, pi]
    const gamma = Math.PI / (2.0 * deltaE);
    const beta  = Math.PI / 4.0; // Standard Mixer Angle

    // 1. Layer Hadamard Superposition
    for (let q = 0; q < nQubits; q++) sv.h(q);

    // 2. Phase Separation Layer
    for (let s = 0; s < 3; s++) {
      for (let ci = 0; ci < nCrops; ci++) {
        sv.rz(s * nCrops + ci, -2.0 * gamma * cost[s][ci]);
      }
    }

    // 3. Entanglement Layer (Khóa 1-hot theo từng mùa)
    for (let s = 0; s < 3; s++) {
      for (let ci = 0; ci < nCrops - 1; ci++) {
        const q1 = s * nCrops + ci, q2 = q1 + 1;
        sv.cx(q1, q2);
        sv.rz(q2, gamma * 0.5);
        sv.cx(q1, q2);
      }
    }

    // 4. Mixer Layer
    for (let q = 0; q < nQubits; q++) sv.rx(q, 2.0 * beta);

    const counts = sv.sample(1024);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top20 = sorted.slice(0, 20).map(([k]) => k);

    const decode = (bs) => {
      const padded = bs.padStart(nQubits, "0").split("").reverse().join("");
      return [0, 1, 2].map((s) => {
        let bestCi = 0, bestVal = -Infinity;
        for (let ci = 0; ci < nCrops; ci++) {
          const active = Number(padded[s * nCrops + ci]);
          const v = active * cost[s][ci];
          if (v > bestVal) { bestVal = v; bestCi = ci; }
        }
        return CROP_KEYS[bestCi];
      });
    };

    const decodedCost = (bs) => decode(bs).reduce((t, c, s) => t + cost[s][CROP_KEYS.indexOf(c)], 0);

    let bestBs = top20[0];
    for (const bs of top20) {
      if (decodedCost(bs) > decodedCost(bestBs)) bestBs = bs;
    }

    const total = sum([...counts.values()]);
    const probs = {};
    for (const [k, v] of sorted.slice(0, 10)) probs[k.slice(-8)] = round(v / total, 4);

    return {
      method: `Node.js Dynamic QAOA Simulator (18-qubit, γ=${gamma.toFixed(2)})`,
      crops: decode(bestBs),
      probs,
      ok: true,
    };
  } catch (e) {
    return {
      method: `Classical Greedy (Quantum error: ${String(e.message).slice(0, 60)})`,
      crops: classicalBest,
      probs: {},
      ok: false,
    };
  }
}

module.exports = { buildCostMatrix, runQuantum, scoreScenario };