// Unified planning_rotation_v5 objective for UI, Classical Exact and simulated QAOA.
// This objective is a heuristic comparison, not a calibrated yield or profit prediction.
const { performance } = require('node:perf_hooks');
const { SCIENTIFIC_CROP_PROFILES: PROFILES, computeCropSeasonSuitability } = require('./11_crop_suitability_fuzzy_ecocrop');
const {seasonColdExposure}=require('../services/coldRisk');
const {OBJECTIVE_VERSION,SCORING_PARAMETERS:P,SEASON_IDX}=require('../config/crops');
const CROP_KEYS = ['Rice','Soybean','Peanut','Maize','Veggies','Fallow'];
const SEASON_MONTHS = SEASON_IDX;
const SCALE = 100;
const round = (v,n=2) => Math.round(v*10**n)/10**n;
function getRotationTransitionBenefit(a,b) {
  if (['Soybean','Peanut'].includes(a) && ['Rice','Maize','Veggies'].includes(b)) return P.transition_legume;
  if (a==='Rice' && b==='Rice') return P.transition_rice_repeat;
  if (a==='Fallow') return b==='Fallow' ? P.transition_fallow_repeat : P.transition_after_fallow;
  return P.transition_other;
}
function normalizeWeights(weights) {
  const w = ['soil','water','profit'].map(k=>weights[k]);
  if (w.some(v=>!Number.isFinite(v) || v<0)) throw new TypeError('Weights must be finite and nonnegative');
  const total=w.reduce((a,b)=>a+b,0);
  return Object.fromEntries(['soil','water','profit'].map((k,i)=>[k,total ? w[i]/total : 1/3]));
}
function buildSeasonEnvironments(data, {suitabilityMap = {}, marketData = {}} = {}) {
  for (const crop of CROP_KEYS) {
    const suitability = suitabilityMap[crop], market = marketData[crop];
    if (suitability !== undefined && (!Number.isFinite(suitability) || suitability < 0 || suitability > 1)) throw new RangeError(`suitabilityMap.${crop} must be between 0 and 1`);
    if (market !== undefined && (!Number.isFinite(market) || market < 0)) throw new RangeError(`marketData.${crop} must be finite and nonnegative`);
  }
  for (const key of ['T2M','PRECTOTCORR','GWETROOT','TS']) {
    if (!Array.isArray(data[key]) || data[key].length!==12 || !data[key].every(Number.isFinite)) throw new TypeError(`Missing climate variable ${key}`);
  }
  return SEASON_MONTHS.map(months=>({
    tempAvg:months.reduce((s,m)=>s+data.T2M[m],0)/4,
    rainSeasonAccum:months.reduce((s,m)=>s+data.PRECTOTCORR[m],0),
    soilMoistureAvg:months.reduce((s,m)=>s+data.GWETROOT[m],0)/4,
    maxTs:Math.max(...months.map(m=>data.TS[m])),
    coldExposure:seasonColdExposure(data,months),
    suitabilityMap, marketData
  }));
}
function localComponents(crop,suit) {
  const p=PROFILES[crop],clamp=v=>Math.min(100,Math.max(0,v));
  const externalFactor = crop !== 'Fallow' && Number.isFinite(suit.external_suitability) ? 2 * suit.external_suitability : 1;
  const marketFactor = suit.market_multiplier ?? 1;
  // Per-crop saturation makes the objective additive and exactly representable without auxiliary bits.
  return {soil:clamp(P.soil_base+P.soil_coefficient*p.nitrogen_balance),water:clamp(P.water_base+P.water_coefficient*p.water_intensity),
    profit:clamp(p.base_profit*suit.yield_factor*externalFactor*marketFactor),suitability:clamp(suit.suitability_score*externalFactor)};
}
function localBenefit(crop,suit,weights) {
  const w=normalizeWeights(weights),c=localComponents(crop,suit);
  return (w.soil*c.soil+w.water*c.water+w.profit*c.profit+P.suitability_weight*c.suitability)/3;
}
function evaluateRotationObjective(trio,matrix,weights) {
  if(!Array.isArray(trio) || trio.length!==3 || trio.some(c=>!CROP_KEYS.includes(c))) throw new TypeError('Exactly three known crops are required');
  const suits=trio.map((c,s)=>matrix[s][c]);
  const feasible=suits.every((s,i)=>(!s.is_lethal && !s.model_excluded) || trio[i]==='Fallow');
  const components=trio.map((c,s)=>localComponents(c,suits[s]));
  const score=trio.reduce((sum,c,s)=>sum+localBenefit(c,suits[s],weights),0)
    +getRotationTransitionBenefit(trio[0],trio[1])+getRotationTransitionBenefit(trio[1],trio[2]);
  const overall=feasible ? (score+P.display_offset)*P.display_scale : 0;
  const noPlanting=trio.every(c=>c==='Fallow');
  return {rotation:trio,objective_version:OBJECTIVE_VERSION,objective_score:feasible ? overall : -Infinity,
    raw_objective_score:feasible?score:null,
    objective_formula:'0.5 * (weighted_component_score + 0.3 * suitability_avg + transition_benefit + 40)',
    transition_benefit:getRotationTransitionBenefit(trio[0],trio[1])+getRotationTransitionBenefit(trio[1],trio[2]),
    overall,is_feasible:feasible,no_planting:noPlanting,
    rank:!feasible || noPlanting ? 'C' : overall>=72?'S':overall>=55?'A':overall>=35?'B':'C',
    soil_hp:feasible?components.reduce((a,c)=>a+c.soil,0)/3:0,
    water_hp:feasible?components.reduce((a,c)=>a+c.water,0)/3:0,
    profit_hp:feasible?components.reduce((a,c)=>a+c.profit,0)/3:0,suitability_avg:components.reduce((a,c)=>a+c.suitability,0)/3};
}
function suitabilityMatrix(envs) {
  return envs.map(env=>Object.fromEntries(CROP_KEYS.map(c=>[c,{
    ...computeCropSeasonSuitability(c,env),
    ...(env.suitabilityMap?.[c] !== undefined ? {external_suitability:env.suitabilityMap[c]} : {}),
    ...(env.marketData?.[c] !== undefined ? {market_multiplier:env.marketData[c]} : {})
  }])));
}
const DEFAULT_WEIGHTS={soil:0.33,water:0.33,profit:0.34};
function solveClassicalExactOptimizer(envs,weights=DEFAULT_WEIGHTS) {
  const started=performance.now(),matrix=suitabilityMatrix(envs),all=[];
  for(const a of CROP_KEYS) for(const b of CROP_KEYS) for(const c of CROP_KEYS) {
    const r=evaluateRotationObjective([a,b,c],matrix,weights); if(r.is_feasible) all.push(r);
  }
  all.sort((a,b)=>b.objective_score-a.objective_score);
  return {method:'Exact classical exhaustive search',objective_version:OBJECTIVE_VERSION,
    best_rotation:all[0]?.rotation || null,best_score:all[0]?.objective_score ?? null,
    top_candidates:all.slice(0,5),total_space_searched:216,feasible_count:all.length,
    suitabilityMatrix:matrix,runtime_ms:performance.now()-started};
}
function buildQUBOHamiltonian(envs,weights=DEFAULT_WEIGHTS,requestedPenalty=0) {
  const matrix=suitabilityMatrix(envs),nCrops=6,nQubits=18;
  const Q=Array.from({length:18},()=>Array(18).fill(0));
  let bound=0;
  for(let s=0;s<3;s++) for(let c=0;c<6;c++) {
    const i=s*6+c;Q[i][i]=-P.display_scale*localBenefit(CROP_KEYS[c],matrix[s][CROP_KEYS[c]],weights)/SCALE;
    bound+=Math.abs(Q[i][i]);
  }
  for(let s=0;s<2;s++) for(let a=0;a<6;a++) for(let b=0;b<6;b++) {
    const value=-P.display_scale*getRotationTransitionBenefit(CROP_KEYS[a],CROP_KEYS[b])/SCALE;
    Q[s*6+a][(s+1)*6+b]=value;bound+=Math.abs(value);
  }
  // Any objective difference is <= 2*sum|coefficient|. One biological violation cannot pay off.
  const biologicalPenalty=2*bound+1;
  for(let s=0;s<3;s++) for(let c=0;c<6;c++) if((matrix[s][CROP_KEYS[c]].is_lethal || matrix[s][CROP_KEYS[c]].model_excluded) && CROP_KEYS[c]!=='Fallow') {
    Q[s*6+c][s*6+c]+=biologicalPenalty;
  }
  const objectiveBound=Q.flat().reduce((a,b)=>a+Math.abs(b),0);
  // Every one-hot violation costs at least lambda; >2*objectiveBound dominates any objective gain.
  const lambda=Math.max(requestedPenalty,2*objectiveBound+1);
  for(let s=0;s<3;s++) for(let a=0;a<6;a++) {
    Q[s*6+a][s*6+a]-=lambda;
    for(let b=a+1;b<6;b++) Q[s*6+a][s*6+b]+=2*lambda;
  }
  return {Q,offset:3*lambda-P.display_offset*P.display_scale/SCALE,nCrops,nQubits,lambda,biologicalPenalty,scale:SCALE,
    convention:'upper_triangular',suitabilityMatrix:matrix,objective_version:OBJECTIVE_VERSION};
}
function quboEnergy(model,bits) {
  const x=typeof bits==='number' ? Array.from({length:model.Q.length},(_,i)=>(bits>>>i)&1) : bits;
  let energy=model.offset || 0;
  for(let i=0;i<model.Q.length;i++) if(x[i]) for(let j=i;j<model.Q.length;j++) if(x[j]) energy+=model.Q[i][j];
  return energy;
}
function quboToIsing(model) {
  const h=Array(model.Q.length).fill(0),couplings=[];
  let constant=model.offset || 0;
  for(let i=0;i<h.length;i++) {
    h[i]-=model.Q[i][i]/2;constant+=model.Q[i][i]/2;
    for(let j=i+1;j<h.length;j++) if(model.Q[i][j]) {
      const J=model.Q[i][j]/4;h[i]-=J;h[j]-=J;constant+=J;couplings.push({i,j,J});
    }
  }
  return {h,couplings,constant};
}
function applyQuboCostLayer(sv,model,gamma) {
  const {h,couplings}=quboToIsing(model);
  h.forEach((value,q)=>sv.rz(q,2*gamma*value));
  for(const {i,j,J} of couplings) { sv.cx(i,j);sv.rz(j,2*gamma*J);sv.cx(i,j); }
  // exp(-i gamma constant) is a global phase and can be omitted.
}
function rotationBits(rotation) {return rotation.reduce((bits,c,s)=>bits | (1<<(s*6+CROP_KEYS.indexOf(c))),0);}
function seededRandom(seed=42) {
  let state=seed>>>0;
  return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
// Exact simulation in the feasible one-hot subspace (<=216 amplitudes), not hardware execution.
// Per-season mixer exp(-i beta A), A = complete-graph adjacency over biologically allowed crops.
// Each fiber differs only in that season: neither one-hot nor biological feasibility can leak.
function prepareFeasibleModel(model) {
  const allowed=[0,1,2].map(s=>CROP_KEYS.filter(c=>(!model.suitabilityMatrix[s][c].is_lethal && !model.suitabilityMatrix[s][c].model_excluded) || c==='Fallow'));
  const rotations=[];
  for(const a of allowed[0]) for(const b of allowed[1]) for(const c of allowed[2]) rotations.push([a,b,c]);
  const fibers=[];
  for(let s=0;s<3;s++) {
    const groups=new Map();
    rotations.forEach((r,i)=>{const key=r.filter((_,j)=>j!==s).join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
    fibers.push(...groups.values());
  }
  return {rotations,fibers,energies:rotations.map(r=>quboEnergy(model,rotationBits(r)))};
}
function simulateFeasibleQAOA(space,gamma,beta) {
  const n=space.rotations.length;
  const re=Array(n).fill(1/Math.sqrt(n)),im=Array(n).fill(0);
  for(let i=0;i<n;i++) {const a=-gamma*space.energies[i];re[i]=Math.cos(a)/Math.sqrt(n);im[i]=Math.sin(a)/Math.sqrt(n);}
  for(const indices of space.fibers) {
    const k=indices.length,mr=indices.reduce((a,i)=>a+re[i],0)/k,mi=indices.reduce((a,i)=>a+im[i],0)/k;
    const c=Math.cos(beta),s=Math.sin(beta),c0=Math.cos(-beta*(k-1)),s0=Math.sin(-beta*(k-1));
    for(const i of indices) {
      const r=re[i]-mr,x=im[i]-mi;
      re[i]=c*r-s*x+c0*mr-s0*mi;im[i]=s*r+c*x+s0*mr+c0*mi;
    }
  }
  const probabilities=re.map((r,i)=>r*r+im[i]*im[i]);
  return {probabilities,expected_energy:probabilities.reduce((a,p,i)=>a+p*space.energies[i],0)};
}
function solveQuantumQAOA(envs,weights=DEFAULT_WEIGHTS,classicalTruth=null,options={}) {
  const started=performance.now(),classical=classicalTruth || solveClassicalExactOptimizer(envs,weights);
  const fallback=(reason)=>({method:'Exact classical fallback',best_rotation:classical.best_rotation,
    objective_score:classical.best_score,optimality_gap_pct:null,feasibility_rate_pct:null,
    quantum_available:false,quantum_feasible:false,fallback_used:true,hardware_executed:false,
    objective_version:OBJECTIVE_VERSION,shots:0,ok:false,status:reason,runtime_ms:performance.now()-started});
  const maxRuntime=options.max_runtime_ms ?? 3000;
  if(options.disabled) return fallback('quantum_disabled');
  if(!Number.isFinite(maxRuntime) || maxRuntime<=0) return fallback('runtime_limit');
  const shots=options.shots ?? 1024;
  if(!Number.isInteger(shots) || shots<=0) return fallback('invalid_shots');
  try {
    const model=buildQUBOHamiltonian(envs,weights),space=prepareFeasibleModel(model);
    if(!space.rotations.length) return fallback('no_feasible_state');
    const feasible=space.rotations.map(r=>evaluateRotationObjective(r,model.suitabilityMatrix,weights).is_feasible);
    const initial=simulateFeasibleQAOA(space,0,0);let best={...initial,gamma:0,beta:0};
    // Deterministic variational search minimizes expectation, never feasible-shot count.
    for(let g=1;space.rotations.length>1 && g<=24;g++) for(let b=1;b<=16;b++) {
      if(performance.now()-started>maxRuntime) return fallback('runtime_limit');
      const gamma=g*Math.PI/6,beta=b*Math.PI/32,result=simulateFeasibleQAOA(space,gamma,beta);
      if(result.expected_energy<best.expected_energy) best={...result,gamma,beta};
    }
    const rng=seededRandom(options.seed ?? 42),counts=Array(space.rotations.length).fill(0);
    for(let shot=0;shot<shots;shot++) {
      const u=rng();let acc=0,index=counts.length-1;
      for(let i=0;i<counts.length;i++) {acc+=best.probabilities[i];if(u<acc){index=i;break;}}
      counts[index]++;
    }
    let index=-1;
    counts.forEach((count,i)=>{if(count>0 && feasible[i] && (index<0 || space.energies[i]<space.energies[index]))index=i;});
    if(index<0) return fallback('no_feasible_sample');
    const result=evaluateRotationObjective(space.rotations[index],model.suitabilityMatrix,weights);
    const gap=Math.abs(classical.best_score)>1e-10 ? Math.max(0,(classical.best_score-result.objective_score)/Math.abs(classical.best_score)*100) : null;
    return {method:'Experimental QAOA simulation (feasible one-hot subspace)',best_rotation:result.rotation,
      objective_version:model.objective_version,objective_score:result.objective_score,
      reference_usage:'Exact result is used only for gap reporting and explicit fallback; angles and sampled candidate use QUBO energies only.',
      quantum_available:true,quantum_feasible:true,fallback_used:false,ok:true,status:'simulated_feasible',
      optimality_gap_pct:gap===null ? null : round(gap),
      feasibility_rate_pct:100*counts.reduce((sum,count,i)=>sum+(feasible[i]?count:0),0)/shots,
      feasible_probability:best.probabilities.reduce((sum,p,i)=>sum+(feasible[i]?p:0),0),
      sample_feasible_count:counts.reduce((sum,count,i)=>sum+(feasible[i]?count:0),0),
      feasible_space_size:space.rotations.length,
      expected_energy:best.expected_energy,initial_expected_energy:initial.expected_energy,
      angles:{gamma:best.gamma,beta:best.beta},shots,seed:options.seed ?? 42,counts,
      classical_best_score:classical.best_score,classical_ground_truth:classical.best_rotation,
      reference:'Exact exhaustive search, 216 rotations, same planning_rotation_v5 objective',
      runtime_ms:performance.now()-started,hardware_executed:false,quantum_advantage_claimed:false};
  } catch(e) {return {...fallback('simulation_error'),error:e.message};}
}
module.exports={CROP_KEYS,SEASON_MONTHS,getRotationTransitionBenefit,buildSeasonEnvironments,suitabilityMatrix,evaluateRotationObjective,
  solveClassicalExactOptimizer,buildQUBOHamiltonian,quboEnergy,quboToIsing,applyQuboCostLayer,rotationBits,
  prepareFeasibleModel,simulateFeasibleQAOA,seededRandom,solveQuantumQAOA};
