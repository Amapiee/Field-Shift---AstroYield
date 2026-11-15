// Controlled offline mathematical benchmark, not an agronomic or hardware validation.
const {buildSeasonEnvironments,solveClassicalExactOptimizer,solveQuantumQAOA}=require('../src/algorithms/13_crop_rotation_optimization_qaoa_milp');
const fixtures=require('../tests/fixtures/climates.json');
const weights={soil:.33,water:.33,profit:.34};
const results=fixtures.map(f=>{
  const envs=buildSeasonEnvironments(f),classical=solveClassicalExactOptimizer(envs,weights),q=solveQuantumQAOA(envs,weights,classical,{seed:42});
  return {fixture:f.name,reference:'Exhaustive search (216 rotations)',objective_version:'additive_rotation_v4',
    classical_objective:classical.best_score,sampled_objective:q.objective_score,
    expected_energy:q.expected_energy,initial_expected_energy:q.initial_expected_energy,
    sample_feasible_rate_pct:q.feasibility_rate_pct,gap_pct:q.optimality_gap_pct,
    feasible_space_size:q.feasible_space_size,
    classical_runtime_ms:classical.runtime_ms,simulation_runtime_ms:q.runtime_ms,
    quantum_available:q.quantum_available,quantum_feasible:q.quantum_feasible,fallback_used:q.fallback_used,
    seed:q.seed,shots:q.shots,hardware_executed:false};
});
console.log(JSON.stringify({kind:'software_fixture_benchmark',results},null,2));
