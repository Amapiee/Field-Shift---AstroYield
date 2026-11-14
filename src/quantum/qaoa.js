// Adapter for the common classical/QAOA rotation objective. Quantum fields describe a simulator.
const optimizer = require('../algorithms/13_crop_rotation_optimization_qaoa_milp');
function runQuantum(data,wWater,wSoil,wProfit,options={}) {
  const envs=optimizer.buildSeasonEnvironments(data);
  const weights={soil:wSoil,water:wWater,profit:wProfit};
  const classical=optimizer.solveClassicalExactOptimizer(envs,weights);
  const q=optimizer.solveQuantumQAOA(envs,weights,classical,options);
  return {...q,crops:q.best_rotation,probs:{},classical_baseline:classical.best_rotation,
    classical_best_score:classical.best_score,classical_runtime_ms:classical.runtime_ms};
}
module.exports={runQuantum,solveClassicalExactOptimizer:optimizer.solveClassicalExactOptimizer,solveQuantumQAOA:optimizer.solveQuantumQAOA};
