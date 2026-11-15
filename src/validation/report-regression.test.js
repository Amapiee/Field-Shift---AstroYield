// Targeted offline regressions for the Src1/JS1 report. All fixtures/tests stay in the authorized src tree.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const {CROP_KEYS,NASA_KEYS,OBJECTIVE_VERSION,CALENDAR,PARAMETER_REGISTRY}=require('../config/crops');
const optimizer=require('../algorithms/13_crop_rotation_optimization_qaoa_milp');
const {benchmarkQAOA}=require('../algorithms/14_validation_and_benchmarking');
const {scoreScenario}=require('../services/scoring');
const {fetchNasa,mockNasa,computeDerived,buildSatelliteSummary}=require('../services/nasa');
const {createScientificRecord}=require('../algorithms/01_nasa_data_provider');
const {createApiRouter}=require('../routes/api');
const {calculateMultiYearSPI,validateRainfallHistory}=require('../algorithms/08_anomaly_detection_spi');
function climate({t=20,rain=80,wet=.4}={}){
  return {T2M:Array(12).fill(t),TS:Array(12).fill(t+3),T2M_MIN:Array(12).fill(8),
    PRECTOTCORR:Array(12).fill(rain),GWETROOT:Array(12).fill(wet),GWETTOP:Array(12).fill(wet),ALLSKY_SFC_SW_DWN:Array(12).fill(18)};
}
function point(data=climate()){
  return {source:'Controlled offline fixture',period:{start:1991,end:2020},grid_elevation:{value:100,status:'model_grid'},
    data:Object.fromEntries([...NASA_KEYS,'T2M_MIN'].map(k=>[k,data[k].map(value=>createScientificRecord(k,value,'climatology'))]))};
}
const defaultWeights={soil:.33,water:.33,profit:.34};
test('P0-01: enumerate 216 rotations; the exact optimizer maximizes the same UI objective',()=>{
  for(const config of [{},{t:28,rain:180,wet:.65},{t:-5,rain:80,wet:.4},{t:38,rain:2,wet:.1}]){
    const data=climate(config),envs=optimizer.buildSeasonEnvironments(data),exact=optimizer.solveClassicalExactOptimizer(envs);
    let maximum=-Infinity,count=0;
    for(const a of CROP_KEYS)for(const b of CROP_KEYS)for(const c of CROP_KEYS){
      const score=scoreScenario([a,b,c],data,.33,.33,.34);count++;
      assert.equal(score.objective_version,OBJECTIVE_VERSION);
      if(score.is_feasible){maximum=Math.max(maximum,score.overall);assert.equal(score.overall,score.objective_score);}
      else assert.equal(score.objective_score,null);
      assert.ok(score.overall>=0 && score.overall<=100);
    }
    assert.equal(count,216);assert.ok(Math.abs(exact.best_score-maximum)<1e-10);
    assert.equal(scoreScenario(exact.best_rotation,data,.33,.33,.34).overall,exact.best_score);
  }
});
test('P0-01 regression: old solver Soybean/Soybean/Veggies scored 73.7 vs UI max 81.8; no reversal remains',()=>{
  const data=climate();
  const exact=optimizer.solveClassicalExactOptimizer(optimizer.buildSeasonEnvironments(data));
  const solver=scoreScenario(['Soybean','Soybean','Veggies'],data,.33,.33,.34);
  const oldUiChoice=scoreScenario(['Soybean','Soybean','Soybean'],data,.33,.33,.34);
  assert.deepEqual(exact.best_rotation,['Soybean','Soybean','Veggies']);
  assert.ok(solver.overall>=oldUiChoice.overall);assert.equal(solver.overall,exact.best_score);
});
test('P1-02: calendar and every registered scoring coefficient disclose units, scope and uncalibrated source',()=>{
  assert.equal(CALENDAR.locally_validated,false);assert.match(CALENDAR.region_scope,/Illustrative/);
  for(const p of PARAMETER_REGISTRY){assert.ok(p.name && p.unit && p.source && p.region_scope);assert.equal(p.verified,false);}
  assert.throws(()=>scoreScenario(['Rice','bad','Rice'],climate(),.33,.33,.34),/known crops/);
});
test('P1-03: SPI-1/3/6 match external jStat reference on 372 real NASA monthly records',()=>{
  const fixture=require('./spi-real-reference.json');assert.equal(fixture.records.length,372);assert.equal(fixture.status,'reanalysis');
  assert.match(fixture.reference.library,/jStat/);assert.equal(fixture.reference.sha256.length,64);
  for(const scale of [1,3,6]){
    const actual=calculateMultiYearSPI(fixture.records,scale);
    for(const reference of fixture.expected.filter(r=>r.timescale===scale)){
      const rec=actual.find(r=>r.year===reference.year && r.month===reference.month);
      assert.equal(rec.status,'available');assert.ok(Math.abs(rec.spi-reference.spi)<.011,`SPI-${scale} ${rec.year}-${rec.month}`);
    }
    assert.equal(actual[scale-1].timescale,scale);
  }
});
test('P1-03: monthly zero is valid; missing, duplicate and inconsistent dates stay unavailable',()=>{
  const records=structuredClone(require('./spi-real-reference.json').records);
  records[15].rain_mm=0;assert.equal(validateRainfallHistory(records).ok,true);
  records[15].date='2000-01-01';assert.equal(validateRainfallHistory(records).ok,false);
  for(const broken of [records.slice(1),[...records.slice(0,15),records[14],...records.slice(16)]]){
    assert.ok(calculateMultiYearSPI(broken,6).every(r=>r.spi===null));
  }
});
test('P1-04: multiple configurations/seeds report measured distributions and bounded runtime',()=>{
  const report=benchmarkQAOA([{id:'warm',data:climate()},{id:'dry',data:climate({t:38,rain:2,wet:.1})}],{seeds:[1,7,42],shots:128,max_runtime_ms:3000});
  assert.equal(report.runs.length,6);assert.equal(report.distributions.runtime_ms.count,6);assert.equal(report.quantum_advantage_claimed,false);
  assert.ok(report.runs.every(r=>r.runtime_ms>=0 && r.hardware_executed===false));
  const limited=optimizer.solveQuantumQAOA(optimizer.buildSeasonEnvironments(climate()),defaultWeights,null,{max_runtime_ms:0});
  assert.equal(limited.status,'runtime_limit');assert.equal(limited.optimality_gap_pct,null);
});
test('P1-04: exact reference does not influence the sampled QAOA candidate or its angles',()=>{
  const envs=optimizer.buildSeasonEnvironments(climate()),exact=optimizer.solveClassicalExactOptimizer(envs);
  const a=optimizer.solveQuantumQAOA(envs,defaultWeights,exact,{seed:7});
  const b=optimizer.solveQuantumQAOA(envs,defaultWeights,{...exact,best_rotation:['Rice','Rice','Rice'],best_score:99999},{seed:7});
  assert.deepEqual(a.counts,b.counts);assert.deepEqual(a.best_rotation,b.best_rotation);assert.deepEqual(a.angles,b.angles);
});
async function startApi(t,options={}){
  const app=express();app.use(express.json());app.use('/api',createApiRouter({
    climateProvider:()=>fetchNasa(10.04,105.78,{provider:async()=>point()}),
    historyProvider:async()=>({status:'unavailable',records:[],source:'NASA monthly',reason:'Offline fixture'}),
    coldHistoryProvider:async()=>({status:'unavailable',records:[]}),
    elevationProvider:async()=>({value:100,status:'dem',source:'Controlled DEM fixture'}),...options}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api/analyze`;
  return {url,send:async(body={lat:10.04,lon:105.78})=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}};
}
test('P0-02 API: same-scale scores, explicit heuristic similarity, classical and simulated status',async t=>{
  const {send}=await startApi(t),{data}=await send({lat:10.04,lon:105.78,user_crops:['Soybean','Soybean','Soybean']});
  assert.equal(data.ok,true);assert.equal(data.forecast,false);assert.equal(data.field_recommendation_allowed,false);
  assert.equal(data.similarity.probability,false);assert.equal(data.similarity.objective_version,OBJECTIVE_VERSION);
  assert.equal(data.similarity.recommendation_score,data.scenarios.classical.overall);
  assert.equal(data.scenarios.quantum.objective_score,data.scenarios.quantum.overall);
  assert.equal(data.similarity.value,Math.round((100-Math.abs(data.similarity.user_score-data.similarity.recommendation_score))*10)/10);
  assert.ok(!/Excellent|quantum optimal/i.test(data.match_desc));
  assert.equal(data.spi.type,'historical_spi');assert.deepEqual(data.spi.timescales,[1,3,6]);
});
test('P0-02 API: classical fallback is distinct; its score is not attributed to QAOA',async t=>{
  const {send}=await startApi(t,{quantumOptions:{disabled:true}}),{data}=await send();
  assert.equal(data.scenarios.quantum.fallback_used,true);assert.equal(data.similarity.qaoa_score,null);
  assert.match(data.scenarios.quantum.method,/classical/i);assert.equal(data.scenarios.quantum.optimality_gap_pct,null);
});
test('P0-03 API: valid, interpolated, missing, demo and low-quality modes have distinct outcomes',async t=>{
  const partial=point();partial.data.PRECTOTCORR[1].value=null;
  const missing=point();missing.data.GWETROOT=[];
  const suspect=point();suspect.data.T2M=[20,21,22,20,21,22,20,21,22,20,21,60].map(v=>createScientificRecord('T2M',v));
  for(const [mode,p,status] of [['valid_climatology',point(),200],['partial_interpolated',partial,200],['unavailable',missing,503],['low_quality',suspect,503]]){
    const {send}=await startApi(t,{climateProvider:()=>fetchNasa(10.04,105.78,{provider:async()=>p})});
    const result=await send();assert.equal(result.status,status);assert.equal(result.data.data_mode,mode);
    assert.equal(result.data.field_recommendation_allowed,false);
    if(status===503){assert.equal(result.data.recommendation_allowed,false);assert.equal(result.data.scenarios,null);}
  }
  const {send}=await startApi(t,{climateProvider:async()=>mockNasa(10.04,105.78)});
  const demo=await send();assert.equal(demo.status,503);assert.equal(demo.data.data_mode,'demo');
});
test('P1-01: scenario alerts do not attribute POWER/proxy inputs to unfetched satellite products',()=>{
  const data=climate({t:-5});const score=scoreScenario(['Rice','Soybean','Maize'],data,.33,.33,.34);
  assert.ok(!/SMAP|GPM|ECOSTRESS|MODIS/.test(score.alerts.join(' ')));
  const sat=buildSatelliteSummary(computeDerived(data));
  assert.match(sat.MODIS.source,/proxy/);assert.match(sat.SMAP.source,/MERRA-2/);
});

function browser(){
  const elements=new Map(),timers=[],messages=[],metrics={charts:0,radars:0};
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',style:{},children:[],disabled:false,
    classList:{add(){},remove(){}},appendChild(el){this.children.push(el);}});return elements.get(id);};
  const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({})},
    map:{flyTo(){},getZoom(){return 7;}},placeMarker(){},alert:m=>messages.push(m),AbortController,
    setTimeout:(cb,ms)=>{const item={cb,ms};timers.push(item);return item;},clearTimeout:item=>{if(item)item.cancelled=true;},
    setInterval:()=>1,clearInterval(){},destroyChart:ref=>{ref?.destroy();return null;},
    buildCharts:()=>metrics.charts++,buildRadar:()=>metrics.radars++,cropTagsHTML:()=>'',hpBarHTML:()=>''});
  for(const file of ['state.js','analysis.js','render.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../public/js',file),'utf8'),context);
  for(const [id,value] of Object.entries({'inp-lat':'10.04','inp-lon':'105.78','sl-soil':'.33','sl-water':'.33','sl-profit':'.34','crop-s1':'Rice','crop-s2':'Soybean','crop-s3':'Maize'}))element(id).value=value;
  return {context,element,timers,messages,metrics,run:()=>vm.runInContext('runAnalysis()',context)};
}
test('P1-05: rapid submit issues one request and locks/unlocks the button',async()=>{
  const b=browser();let calls=0,resolve;
  b.context.fetch=()=>{calls++;return new Promise(r=>resolve=r);};
  const first=b.run();await b.run();await b.run();assert.equal(calls,1);assert.equal(b.element('btn-run').disabled,true);
  resolve({ok:false,json:async()=>({ok:false,source_status:'unavailable',error:'503 fixture'})});await first;
  assert.equal(b.element('btn-run').disabled,false);assert.equal(b.metrics.charts,0);
});
test('P1-05: changed location discards an in-flight response instead of showing stale scores',async()=>{
  const b=browser();let resolve;b.context.fetch=()=>new Promise(r=>resolve=r);
  const pending=b.run();b.element('inp-lat').value='11';
  resolve({ok:true,json:async()=>({ok:true})});await pending;
  assert.match(b.element('match-desc').textContent,/đã thay đổi/);assert.equal(b.metrics.charts,0);
});
test('P1-05: timeout and JSON/network errors always close loading and permit a later request',async()=>{
  const b=browser();b.context.fetch=(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));
  const pending=b.run();b.timers.find(t=>t.ms===60000).cb();await pending;
  assert.equal(b.element('btn-run').disabled,false);assert.match(b.element('match-desc').textContent,/60 giây/);
  b.context.fetch=async()=>({ok:true,json:async()=>{throw Error('invalid JSON');}});await b.run();
  assert.equal(b.element('btn-run').disabled,false);assert.match(b.element('match-desc').textContent,/invalid JSON/);
});
test('P1-05: blocked/missing payload resets charts and scores; spi/mcda null do not crash rendering',()=>{
  const b=browser();b.context.payload={ok:true,recommendation_allowed:false,source_status:'climatology',recommendation_status:'elevation_mismatch'};
  b.element('user-rank').textContent='RANK S';vm.runInContext('updateUI(payload)',b.context);
  assert.equal(b.element('user-rank').textContent,'RANK -');assert.equal(b.metrics.charts,0);
  b.context.payload={ok:true,spi:null,mcda:null};assert.doesNotThrow(()=>vm.runInContext('updateUI(payload)',b.context));
  b.context.payload={ok:true,spi:null,mcda:null,scenarios:{user:{overall:50},quantum:{overall:50},baseline:{overall:50}},
    satellite:{POWER:{},SMAP:{},GPM:{},ECOSTRESS:{},MODIS:{}}};
  assert.doesNotThrow(()=>vm.runInContext('updateUI(payload)',b.context));assert.equal(b.metrics.charts,0);
});
test('P1-02 UI helpers: score display uses percentages and season labels do not assert global spring/summer',()=>{
  const b=browser();
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../public/js/ui-helpers.js'),'utf8'),b.context);
  const html=vm.runInContext('hpBarHTML("heuristic", 62.5)',b.context);
  assert.match(html,/63%/);assert.match(vm.runInContext('hpBarHTML("heuristic", null)',b.context),/-%/);
  b.context.crops=[{label:'Rice',color:'#fff'}];
  const tags=vm.runInContext('cropTagsHTML(crops)',b.context);
  assert.match(tags,/T1–T4/);assert.ok(!/Xuân|Hè Thu/.test(tags));
});
test('P1-05 integration: browser submit → local HTTP API → planning UI, then 503 → reset',async t=>{
  const {url}=await startApi(t),b=browser();let calls=0;
  b.context.fetch=(target,options)=>{calls++;return fetch(url,options);};await b.run();
  assert.equal(calls,1);assert.equal(b.metrics.charts,1);assert.match(b.element('match-desc').textContent,/heuristic/);
  assert.match(b.element('match-desc').textContent,/Classical Exact/);assert.match(b.element('data-source-badge').textContent,/KHÔNG PHẢI DỰ BÁO/);
  b.context.fetch=async()=>({ok:false,status:503,json:async()=>({ok:false,source_status:'unavailable',error:'Offline NASA fixture'})});
  await b.run();assert.equal(b.element('user-rank').textContent,'RANK -');assert.match(b.element('match-desc').textContent,/Offline NASA/);
});
