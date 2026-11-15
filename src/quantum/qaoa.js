const { CROPS, CROP_KEYS, SEASON_IDX } = require("../config/crops");
const { Statevector } = require("./statevector");
const optimizer = require("../algorithms/13_crop_rotation_optimization_qaoa_milp");

function meanAt(values, indexes) {
  const valid = indexes.map((index) => values?.[index]).filter(Number.isFinite);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : 0;
}

function buildCostMatrix(data = {}, wWater, wSoil, wProfit, suitabilityMap = {}, marketData = {}) {
  return SEASON_IDX.map((months) => {
    const gw = meanAt(data.GWETROOT, months);
    const temp = meanAt(data.T2M, months);
    const et0 = meanAt(data.ET0, months) || 120;
    const ndvi = meanAt(data.NDVI, months);

    return CROP_KEYS.map((cropKey) => {
      const crop = CROPS[cropKey];
      const suitability = suitabilityMap[cropKey] !== undefined ? suitabilityMap[cropKey] : 0.5;
      const marketMultiplier = marketData[cropKey] !== undefined ? marketData[cropKey] : 1;
      let score = ((wProfit * crop.profit) / 100) * suitability * 2 * marketMultiplier;

      const etc = Math.max(et0 * (crop.Kc || 1), 1e-6);
      const deficitRatio = Math.max(0, (etc - gw * 150) / etc);
      score -= wWater * deficitRatio * 0.6;
      score += wSoil * (Math.max(crop.soil, 0) / 35) * (0.5 + ndvi);

      if (Number.isFinite(crop.T_opt) && Number.isFinite(crop.T_max) && temp > crop.T_opt) {
        score -= ((temp - crop.T_opt) / (crop.T_max - crop.T_opt + 1e-6)) * 0.4;
      }

      return score;
    });
  });
}

function runLegacyQuantum(data, wWater, wSoil, wProfit, suitabilityMap, marketData, options = {}) {
  const cost = buildCostMatrix(data, wWater, wSoil, wProfit, suitabilityMap, marketData);
  const classicalBest = cost.map((row) => CROP_KEYS[row.reduce((best, value, index) => (
    value > row[best] ? index : best
  ), 0)]);

  try {
    const nCrops = CROP_KEYS.length;
    const nQubits = 3 * nCrops;
    const sv = new Statevector(nQubits);
    const flatCost = cost.flat();
    const deltaE = Math.max(...flatCost) - Math.min(...flatCost) || 1;
    const gamma = Math.PI / (2 * deltaE);
    const beta = Math.PI / 4;

    for (let q = 0; q < nQubits; q++) sv.h(q);
    for (let season = 0; season < 3; season++) {
      for (let crop = 0; crop < nCrops; crop++) {
        sv.rz(season * nCrops + crop, -2 * gamma * cost[season][crop]);
      }
    }
    for (let season = 0; season < 3; season++) {
      for (let crop = 0; crop < nCrops - 1; crop++) {
        const q1 = season * nCrops + crop;
        const q2 = q1 + 1;
        sv.cx(q1, q2);
        sv.rz(q2, gamma * 0.5);
        sv.cx(q1, q2);
      }
    }
    for (let q = 0; q < nQubits; q++) sv.rx(q, 2 * beta);

    const random = options.seed === undefined ? Math.random : optimizer.seededRandom(options.seed);
    const counts = sv.sample(1024, random);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const decode = (bits) => {
      const padded = bits.padStart(nQubits, "0").split("").reverse().join("");
      return [0, 1, 2].map((season) => {
        let bestCrop = 0;
        let bestValue = -Infinity;
        for (let crop = 0; crop < nCrops; crop++) {
          const value = Number(padded[season * nCrops + crop]) * cost[season][crop];
          if (value > bestValue) {
            bestValue = value;
            bestCrop = crop;
          }
        }
        return CROP_KEYS[bestCrop];
      });
    };
    const decodedCost = (bits) => decode(bits).reduce(
      (total, crop, season) => total + cost[season][CROP_KEYS.indexOf(crop)],
      0
    );
    const bestBits = sorted.slice(0, 20).reduce(
      (best, [bits]) => decodedCost(bits) > decodedCost(best) ? bits : best,
      sorted[0][0]
    );
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const probs = {};
    for (const [bits, count] of sorted.slice(0, 10)) {
      probs[bits.slice(-8)] = Math.round((count / total) * 10000) / 10000;
    }

    return {
      method: `Legacy Node.js statevector simulator (18-qubit, γ=${gamma.toFixed(2)})`,
      crops: decode(bestBits),
      probs,
      ok: true,
    };
  } catch (error) {
    return {
      method: `Classical Greedy (Quantum error: ${String(error.message).slice(0, 60)})`,
      crops: classicalBest,
      probs: {},
      ok: false,
    };
  }
}

function runQuantum(data, wWater, wSoil, wProfit, optionsOrSuitability = {}, marketData = {}, legacyOptions = {}) {
  const optionKeys = ["mode", "suitabilityMap", "marketData", "disabled", "seed", "shots", "max_runtime_ms"];
  const isOptions = value => value && optionKeys.some(key => Object.hasOwn(value, key));
  const options = isOptions(optionsOrSuitability) ? optionsOrSuitability
    : isOptions(marketData) ? marketData : legacyOptions;
  const suitabilityMap = options.suitabilityMap || (isOptions(optionsOrSuitability) ? {} : optionsOrSuitability);
  const suppliedMarketData = options.marketData || (isOptions(marketData) ? {} : marketData);
  const hasExternalScoring = CROP_KEYS.some((crop) => (
    suitabilityMap?.[crop] !== undefined || suppliedMarketData?.[crop] !== undefined
  ));

  if (hasExternalScoring && options.mode !== "planning") {
    const costs = buildCostMatrix(data, wWater, wSoil, wProfit, suitabilityMap, suppliedMarketData);
    const baseline = costs.map(row => CROP_KEYS[row.indexOf(Math.max(...row))]);
    const result = options.disabled
      ? {method:"Classical Greedy fallback (legacy external overlay)", crops:baseline, probs:{}, ok:false}
      : runLegacyQuantum(data, wWater, wSoil, wProfit, suitabilityMap, suppliedMarketData, options);
    return {...result, classical_baseline:baseline, quantum_available:result.ok,
      quantum_feasible:null, fallback_used:!result.ok, hardware_executed:false,
      status:result.ok ? "legacy_simulated" : "legacy_classical_fallback",
      optimality_gap_pct:null, feasibility_rate_pct:null};
  }

  const envs = optimizer.buildSeasonEnvironments(data, {suitabilityMap, marketData:suppliedMarketData});
  const weights = { soil: wSoil, water: wWater, profit: wProfit };
  const classical = optimizer.solveClassicalExactOptimizer(envs, weights);
  const result = optimizer.solveQuantumQAOA(envs, weights, classical, options);
  return {
    ...result,
    crops: result.best_rotation || classical.best_rotation,
    probs: {},
    classical_baseline: classical.best_rotation,
    classical_best_score: classical.best_score,
    classical_runtime_ms: classical.runtime_ms,
  };
}

module.exports = {
  buildCostMatrix,
  runQuantum,
  solveClassicalExactOptimizer: optimizer.solveClassicalExactOptimizer,
  solveQuantumQAOA: optimizer.solveQuantumQAOA,
};
