const test=require('node:test');
const assert=require('node:assert/strict');
const optimizer=require('../src/algorithms/13_crop_rotation_optimization_qaoa_milp');
const {Statevector}=require('../src/quantum/statevector');
const {runQuantum}=require('../src/quantum/qaoa');
const fixtures=require('./fixtures/climates.json');
const weights={soil:.33,water:.33,profit:.34};
const envs=optimizer.buildSeasonEnvironments(fixtures[0]);

test('QUBO: all 216 feasible one-hot energies equal the shared classical objective',()=>{
  for(const fixture of fixtures) {
    const environments=optimizer.buildSeasonEnvironments(fixture);
    const model=optimizer.buildQUBOHamiltonian(environments,weights);
    for(const a of optimizer.CROP_KEYS)for(const b of optimizer.CROP_KEYS)for(const c of optimizer.CROP_KEYS){
      const trio=[a,b,c],result=optimizer.evaluateRotationObjective(trio,model.suitabilityMatrix,weights);
      const energy=optimizer.quboEnergy(model,optimizer.rotationBits(trio));
      if(result.is_feasible) assert.ok(Math.abs(energy+result.objective_score/model.scale)<1e-10);
      else assert.ok(energy>0,'Biological constraint must dominate objective');
    }
  }
});
test('QUBO: cost circuit phases match energy for ALL 262144 bitstrings, up to global phase; penalties enforce one-hot',()=>{
  const model=optimizer.buildQUBOHamiltonian(envs,weights),sv=new Statevector(model.nQubits),gamma=.137;
  for(let q=0;q<model.nQubits;q++)sv.h(q);
  optimizer.applyQuboCostLayer(sv,model,gamma);
  const constant=optimizer.quboToIsing(model).constant,amplitude=1/Math.sqrt(sv.N);
  let minimum=Infinity,minInvalid=Infinity,minBits=null;
  for(let bits=0;bits<sv.N;bits++) {
    const energy=optimizer.quboEnergy(model,bits),phase=-gamma*(energy-constant);
    assert.ok(Math.abs(sv.re[bits]/amplitude-Math.cos(phase))<1e-9,`real phase mismatch at ${bits}`);
    assert.ok(Math.abs(sv.im[bits]/amplitude-Math.sin(phase))<1e-9,`imaginary phase mismatch at ${bits}`);
    let valid=true;
    for(let s=0;s<3;s++) {const group=(bits>>>(6*s))&63;if(!group || (group&(group-1)))valid=false;}
    if(valid && energy<minimum){minimum=energy;minBits=bits;}
    if(!valid)minInvalid=Math.min(minInvalid,energy);
  }
  const classical=optimizer.solveClassicalExactOptimizer(envs,weights);
  assert.ok(Math.abs(minimum+classical.best_score/100)<1e-10);
  assert.ok(minInvalid>minimum);assert.ok(minBits!==null);
});
test('QAOA: constraint-preserving mixer keeps total feasible probability one at varied angles',()=>{
  for(const f of fixtures) {
    const model=optimizer.buildQUBOHamiltonian(optimizer.buildSeasonEnvironments(f),weights);
    const space=optimizer.prepareFeasibleModel(model);
    for(const gamma of [0,.1,2,Math.PI])for(const beta of [0,.3,1.5]){
      const result=optimizer.simulateFeasibleQAOA(space,gamma,beta);
      assert.ok(Math.abs(result.probabilities.reduce((a,b)=>a+b)-1)<1e-12);
      space.rotations.forEach(r=>assert.ok(optimizer.evaluateRotationObjective(r,model.suitabilityMatrix,weights).is_feasible));
    }
  }
});
test('QAOA: minimizes expected energy, reports reproducible measured samples and a shared reference',()=>{
  const a=optimizer.solveQuantumQAOA(envs,weights,null,{seed:17}),b=optimizer.solveQuantumQAOA(envs,weights,null,{seed:17});
  assert.equal(a.quantum_available,true);assert.equal(a.quantum_feasible,true);assert.equal(a.fallback_used,false);
  assert.deepEqual(a.counts,b.counts);assert.deepEqual(a.best_rotation,b.best_rotation);
  assert.equal(a.expected_energy,b.expected_energy);
  assert.ok(a.expected_energy<a.initial_expected_energy-1e-6);
  assert.equal(a.counts.reduce((s,n)=>s+n),1024);assert.equal(a.feasibility_rate_pct,100);
  assert.ok(a.objective_score<=a.classical_best_score+1e-10);
  assert.ok(a.runtime_ms>=0);assert.equal(a.hardware_executed,false);
});
test('QAOA disabled or failed: returned classical rotation is explicitly a fallback and quantum gap is null',()=>{
  for(const options of [{disabled:true},{shots:0}]) {
    const q=runQuantum(fixtures[0],.33,.33,.34,options);
    assert.equal(q.fallback_used,true);assert.equal(q.quantum_available,false);assert.equal(q.quantum_feasible,false);
    assert.equal(q.optimality_gap_pct,null);assert.equal(q.feasibility_rate_pct,null);
    assert.match(q.method,/classical/i);assert.deepEqual(q.crops,q.classical_baseline);
  }
});
test('Statevector sampling can use a deterministic seed',()=>{
  const sv=new Statevector(3);for(let i=0;i<3;i++)sv.h(i);
  assert.deepEqual(sv.sample(50,optimizer.seededRandom(7)),sv.sample(50,optimizer.seededRandom(7)));
});
