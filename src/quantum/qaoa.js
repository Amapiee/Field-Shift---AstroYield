// QAOA / QUBO: Dựng ma trận chi phí, chạy mạch lượng tử mô phỏng 18-qubit và đối chứng Cổ điển chính xác (V3)
const { CROPS, CROP_KEYS, SEASON_IDX } = require("../config/crops");
const { round, sum, meanAt, argmax } = require("../utils/helpers");
const { computeCropSeasonSuitability } = require("../algorithms/11_crop_suitability_fuzzy_ecocrop");
const {
  buildSeasonEnvironments,
  solveClassicalExactOptimizer,
  solveQuantumQAOA,
  getRotationTransitionBenefit
} = require("../algorithms/13_crop_rotation_optimization_qaoa_milp");

function buildCostMatrix(data, wWater, wSoil, wProfit) {
  const cost = SEASON_IDX.map(() => new Array(CROP_KEYS.length).fill(0));
  SEASON_IDX.forEach((sidx, s) => {
    const gw = meanAt(data.GWETROOT, sidx);
    const tmp = meanAt(data.TS, sidx);
    const tAir = meanAt(data.T2M, sidx);
    const prp = sidx.reduce((acc, m) => acc + (data.PRECTOTCORR ? data.PRECTOTCORR[m] : 0), 0);
    const ndv = meanAt(data.NDVI, sidx);
    const tsMax = Math.max(...sidx.map(m => (data.TS ? data.TS[m] : data.T2M[m] + 3.0)));

    const seasonEnv = {
      tempAvg: tAir,
      rainSeasonAccum: prp,
      soilMoistureAvg: gw,
      maxTs: tsMax
    };

    CROP_KEYS.forEach((ckey, ci) => {
      const cd = CROPS[ckey];
      const faoSuit = computeCropSeasonSuitability(ckey, seasonEnv);

      if (ckey === "Fallow") {
        let fScore = 0.05;
        if (prp > 150) fScore -= 0.35;
        cost[s][ci] = fScore;
        return;
      }

      if (faoSuit.is_lethal) {
        cost[s][ci] = -2.5;
        return;
      }

      let score = (wProfit * cd.profit * 0.4 * faoSuit.yield_factor) / 30.0;
      let waterCost = (Math.abs(cd.water) / 35.0);
      if (gw < 0.25) waterCost *= 1.4;
      score -= wWater * waterCost * (1 - gw);
      score += wSoil * (Math.max(cd.soil, 0) / 35.0) * (0.5 + ndv) * faoSuit.yield_factor;
      if (tmp > 33) score -= (1 - cd.heat_tol) * 0.25;

      cost[s][ci] = score;
    });
  });
  return cost;
}

function runQuantum(data, wWater, wSoil, wProfit) {
  try {
    const seasonEnvs = buildSeasonEnvironments({
      T2M: data.T2M,
      PRECTOTCORR: data.PRECTOTCORR,
      GWETROOT: data.GWETROOT,
      TS: data.TS || data.T2M.map(t => t + 3.0)
    });

    const weights = { soil: wSoil, water: wWater, profit: wProfit };
    const classicalExact = solveClassicalExactOptimizer(seasonEnvs, weights);
    const qaoaResult = solveQuantumQAOA(seasonEnvs, weights, classicalExact);

    return {
      method: qaoaResult.method,
      crops: qaoaResult.best_rotation,
      probs: {},
      classical_baseline: classicalExact.best_rotation,
      classical_best_score: classicalExact.best_score,
      optimality_gap_pct: qaoaResult.optimality_gap_pct,
      feasibility_rate_pct: qaoaResult.feasibility_rate_pct,
      ok: qaoaResult.ok,
      status: qaoaResult.status
    };
  } catch (err) {
    const cost = buildCostMatrix(data, wWater, wSoil, wProfit);
    const greedy = cost.map((row) => CROP_KEYS[argmax(row)]);
    return {
      method: "Classical Greedy Fallback",
      crops: greedy,
      probs: {},
      classical_baseline: greedy,
      optimality_gap_pct: 0.0,
      feasibility_rate_pct: 100.0,
      ok: false,
      error: err.message
    };
  }
}

module.exports = {
  buildCostMatrix,
  runQuantum,
  solveClassicalExactOptimizer,
  solveQuantumQAOA
};
