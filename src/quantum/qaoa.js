const { CROPS, CROP_KEYS, SEASON_IDX } = require("../config/crops");
const { round, sum, meanAt, argmax } = require("../utils/helpers");
const { Statevector } = require("./statevector");

function buildCostMatrix(data, wWater, wSoil, wProfit, suitabilityMap = {}, marketData = {}) {
  const cost = SEASON_IDX.map(() => new Array(CROP_KEYS.length).fill(0));

  SEASON_IDX.forEach((sidx, s) => {
    const gw  = meanAt(data.GWETROOT, sidx);
    const tmp = meanAt(data.T2M, sidx);
    const et0 = meanAt(data.ET0, sidx) || 120.0;
    const ndv = meanAt(data.NDVI, sidx);

    CROP_KEYS.forEach((ckey, ci) => {
      const cd = CROPS[ckey];
      const suitability = suitabilityMap[ckey] !== undefined ? suitabilityMap[ckey] : 0.5;
      const marketMultiplier = marketData[ckey] !== undefined ? marketData[ckey] : 1.0;

      let score = ((wProfit * cd.profit) / 100.0) * (suitability * 2.0) * marketMultiplier;

      // 1. Phạt theo Cân bằng Nước thực tế (ETc vs Soil Water)
      const ETc = Math.max(et0 * (cd.Kc || 1.0), 1e-6);
      const deficitRatio = Math.max(0, (ETc - gw * 150) / ETc);
      score -= wWater * deficitRatio * 0.6;

      // 2. Thưởng cải tạo đất nông học (Legumes + NDVI)
      score += wSoil * (Math.max(cd.soil, 0) / 35.0) * (0.5 + ndv);

      // 3. Phạt lệch nhiệt độ sinh trưởng tối ưu (T_opt)
      if (tmp > cd.T_opt) {
        score -= ((tmp - cd.T_opt) / (cd.T_max - cd.T_opt + 1e-6)) * 0.4;
      }

      cost[s][ci] = score;
    });
  });
  return cost;
}

function runQuantum(data, wWater, wSoil, wProfit, suitabilityMap = {}, marketData = {}) {
  const cost = buildCostMatrix(data, wWater, wSoil, wProfit, suitabilityMap, marketData);
  const classicalBest = cost.map((row) => CROP_KEYS[argmax(row)]);

  try {
    const nCrops = CROP_KEYS.length;
    const nQubits = 3 * nCrops;
    const sv = new Statevector(nQubits);

    const flatCost = cost.flat();
    const maxC = Math.max(...flatCost);
    const minC = Math.min(...flatCost);
    const deltaE = maxC - minC || 1.0;

    const gamma = Math.PI / (2.0 * deltaE);
    const beta  = Math.PI / 4.0;

    for (let q = 0; q < nQubits; q++) sv.h(q);

    for (let s = 0; s < 3; s++) {
      for (let ci = 0; ci < nCrops; ci++) {
        sv.rz(s * nCrops + ci, -2.0 * gamma * cost[s][ci]);
      }
    }

    for (let s = 0; s < 3; s++) {
      for (let ci = 0; ci < nCrops - 1; ci++) {
        const q1 = s * nCrops + ci, q2 = q1 + 1;
        sv.cx(q1, q2);
        sv.rz(q2, gamma * 0.5);
        sv.cx(q1, q2);
      }
    }

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

module.exports = { buildCostMatrix, runQuantum };