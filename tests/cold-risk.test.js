const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const provider=require('../src/algorithms/01_nasa_data_provider');
const {fetchNasa,computeDerived}=require('../src/services/nasa');
const {NASA_KEYS}=require('../src/config/crops');
const {fetchColdHistory,fetchElevation,parseElevation,describeTerrain,summarizeDailyHistory,assessColdRisk}=require('../src/services/coldRisk');
const {buildSeasonEnvironments,solveClassicalExactOptimizer,solveQuantumQAOA}=require('../src/algorithms/13_crop_rotation_optimization_qaoa_milp');
const {computeCropSeasonSuitability}=require('../src/algorithms/11_crop_suitability_fuzzy_ecocrop');
const {scoreScenario}=require('../src/services/scoring');
const {classifyCoordinates}=require('../src/utils/geoClassifier');
const {createApiRouter}=require('../src/routes/api');
const fixture=require('./fixtures/climates.json')[0];
function history(startYear=2024,years=1){
  const records=[];
  for(let t=Date.UTC(startYear,0,1);t<Date.UTC(startYear+years,0,1);t+=86400000){
    const date=new Date(t).toISOString().slice(0,10);records.push({date,tmin_c:8,tmean_c:25});
  }
  return {records,source:'Controlled daily temperature fixture',status:'reanalysis',
    period:{start:`${startYear}-01-01`,end:`${startYear+years-1}-12-31`},time_standard:'LST'};
}
function warm(){return computeDerived({...structuredClone(fixture),T2M:Array(12).fill(25),TS:Array(12).fill(28),
  _mock:false,_raw_catalog:{},_provenance:{period:{start:1991,end:2020}},source_status:'climatology'});}
const cropPlan=['Rice','Soybean','Maize'];
function frozenDay(h,date,value=-3){h.records.find(r=>r.date===date).tmin_c=value;return h;}

test('Daily NASA parser preserves negative minima, true zero, missing/sentinel and leap day',()=>{
  const raw={properties:{parameter:{T2M_MIN:{20240228:0,20240229:-4.5,20240301:-999,20240302:null},T2M:{20240229:7}}},parameters:{T2M_MIN:{units:'C'},T2M:{units:'C'}}};
  const result=provider.parseDailyTemperature(raw,2024,2024);
  assert.equal(result.records.length,366);
  assert.equal(result.records.find(r=>r.date==='2024-02-28').tmin_c,0);
  assert.equal(result.records.find(r=>r.date==='2024-02-29').tmin_c,-4.5);
  assert.equal(result.records.find(r=>r.date==='2024-03-01').tmin_c,null);
  assert.equal(result.records.find(r=>r.date==='2024-03-02').tmin_c,null);
  raw.parameters.T2M_MIN.units='K';assert.throws(()=>provider.parseDailyTemperature(raw,2024,2024),/units/);
});
test('Climatology reference period can be read from the explicit NASA response message',()=>{
  const result=provider.parseClimatology({properties:{parameter:{}},
    messages:['The requested parameters are retrieved from a pre-computed climatological period (January 2001 - December 2025)']});
  assert.deepEqual(result.period,{start:'2001-01',end:'2025-12',source:'NASA response message'});
});
test('Daily provider requests daily T2M_MIN explicitly with LST and exact dates',async()=>{
  let requested='';
  const result=await provider.fetchNasaDailyTemperature(30.49,79.13,2024,2024,1,async url=>{
    requested=url;return {properties:{parameter:{T2M_MIN:{20240101:-2}}},parameters:{T2M_MIN:{units:'C'}}};
  });
  const url=new URL(requested);assert.match(url.pathname,/daily\/point/);assert.equal(url.searchParams.get('time-standard'),'LST');
  assert.equal(url.searchParams.get('start'),'20240101');assert.equal(url.searchParams.get('end'),'20241231');
  assert.equal(result.records[0].tmin_c,-2);
});
test('Optional Tmin climatology is retained without interpolating cold extremes or replacing missing values',async()=>{
  const minima=Array(12).fill(8);minima[0]=-3;minima[1]=null;
  const data=await fetchNasa(10.04,105.78,{provider:async()=>({period:{start:1991,end:2020},
    grid_elevation:{value:1500,status:'model_grid'},
    data:Object.fromEntries([...NASA_KEYS,'T2M_MIN'].map(k=>[k,(k==='T2M_MIN'?minima:fixture[k]).map(value=>provider.createScientificRecord(k,value))]))})});
  assert.equal(data.T2M_MIN[0],-3);assert.equal(data.T2M_MIN[1],null);assert.equal(data._raw_catalog.T2M_MIN[1].status,'missing');
  assert.equal(data._grid_elevation.value,1500);assert.equal(data.source_status,'climatology');
});
test('Daily aggregation counts freezing days by calendar month without crossing gaps or years',()=>{
  const h=history();frozenDay(h,'2024-02-28');frozenDay(h,'2024-02-29');frozenDay(h,'2024-03-01');
  const summary=summarizeDailyHistory(h),feb=summary.months[1],mar=summary.months[2];
  assert.equal(summary.status,'available');assert.equal(feb.expected_days,29);assert.equal(feb.freezing_days,2);
  assert.equal(feb.longest_freezing_run_days,2);assert.equal(mar.longest_freezing_run_days,1);
  assert.deepEqual(feb.years_with_freezing,[2024]);assert.equal(feb.coldest_date,'2024-02-28');
  h.records.find(r=>r.date==='2024-02-28').tmin_c=null;
  assert.equal(summarizeDailyHistory(h).months[1].longest_freezing_run_days,1);
});
test('Missing/invalid/duplicate daily records do not imply absence of frost',()=>{
  const h=history();h.records=h.records.filter(r=>!r.date.startsWith('2024-01'));
  const summary=summarizeDailyHistory(h);assert.equal(summary.status,'partial');assert.equal(summary.months[0].missing_days,31);
  const risk=assessColdRisk(warm(),h);assert.equal(risk.months[0].frost_risk,'unknown');
  h.records.push({...h.records[0]});assert.equal(summarizeDailyHistory(h).status,'unavailable');
  const invalid=history();invalid.records[0].date='2024-02-30';assert.equal(summarizeDailyHistory(invalid).status,'unavailable');
});
test('A single freezing night is detected even when every monthly and seasonal mean is warm',()=>{
  const data=warm(),h=frozenDay(history(),'2024-01-15',-4);
  data._cold_risk=assessColdRisk(data,h);
  assert.deepEqual(data._cold_risk.frost_months,[1]);assert.equal(data._cold_risk.mortality_confirmed,false);
  const envs=buildSeasonEnvironments(data);assert.equal(envs[0].tempAvg,25);
  const first=computeCropSeasonSuitability('Rice',envs[0]),second=computeCropSeasonSuitability('Rice',envs[1]);
  assert.equal(first.model_excluded,true);assert.equal(first.yield_factor,0);assert.equal(first.mortality_confirmed,false);
  assert.deepEqual(first.cold_risk.frost_months,[1]);assert.equal(second.is_lethal,false);
  assert.equal(computeCropSeasonSuitability('Fallow',envs[0]).is_lethal,false);
  const veggies=computeCropSeasonSuitability('Veggies',envs[0]);
  assert.equal(veggies.is_lethal,false);assert.equal(veggies.model_excluded,true);assert.equal(veggies.cold_risk.status,'variety_dependent');
});
test('Monthly Tmin fallback detects risk; a warm mean alone is explicitly insufficient',()=>{
  const data=warm();assert.equal(assessColdRisk(data).status,'unavailable');
  data.T2M_MIN=Array(12).fill(8);data.T2M_MIN[8]=-1;
  assert.deepEqual(assessColdRisk(data).frost_months,[9]);assert.equal(assessColdRisk(data).months[8].daily,null);
  data.T2M_MIN=null;data.T2M[0]=-1;
  assert.equal(assessColdRisk(data).months[0].frost_risk,'detected');
  assert.equal(assessColdRisk(data).months[1].frost_risk,'unknown');
});
test('Scoring applies cold exclusions only to the exposed season and exposes per-season reasons',()=>{
  const data=warm(),h=frozenDay(history(),'2024-01-15');data._cold_risk=assessColdRisk(data,h);
  const once=scoreScenario(cropPlan,data,.33,.33,.34);
  assert.equal(once.season_results[0].model_excluded,true);assert.equal(once.season_results[1].is_lethal,false);
  assert.equal(once.season_results[2].is_lethal,false);assert.ok(once.overall<=52);
  frozenDay(h,'2024-06-15');data._cold_risk=assessColdRisk(data,h);
  assert.equal(scoreScenario(cropPlan,data,.33,.33,.34).rank,'C');
});
test('Classical and QAOA both respect the same single-month frost constraint',()=>{
  const data=warm();data._cold_risk=assessColdRisk(data,frozenDay(history(),'2024-01-15'));
  const envs=buildSeasonEnvironments(data),classical=solveClassicalExactOptimizer(envs),q=solveQuantumQAOA(envs,undefined,classical,{seed:42});
  assert.equal(classical.best_rotation[0],'Fallow');assert.equal(q.best_rotation[0],'Fallow');assert.equal(q.quantum_feasible,true);
  assert.ok(q.best_rotation.slice(1).some(c=>c!=='Fallow'));
});
test('Cold climate does not establish glacier/permafrost/altitude; a warm summer remains analyzable',()=>{
  const data=warm();data.T2M=Array(12).fill(-10);
  assert.equal(classifyCoordinates(30.49,79.13,data).is_ice,false);
  data.T2M=[-15,-10,-5,0,12,18,20,18,10,0,-5,-15];
  data.T2M_MIN=data.T2M.map(v=>v-5);
  const seasons=buildSeasonEnvironments(data);
  assert.equal(computeCropSeasonSuitability('Maize',seasons[1]).is_lethal,false);
});
test('Elevation preserves sea level/negative heights and separates DEM from POWER grid elevation',()=>{
  const parsed=(value,lat=30.49,lon=79.13)=>({status:'OK',results:[{dataset:'srtm90m',elevation:value,location:{lat,lng:lon}}]});
  assert.equal(parseElevation(parsed(0),30.49,79.13).value,0);assert.equal(parseElevation(parsed(-100),30.49,79.13).value,-100);
  assert.throws(()=>parseElevation(parsed(null),30.49,79.13),/unavailable/);
  assert.throws(()=>parseElevation(parsed(3000,30,79),30.49,79.13),/mismatched/);
  const terrain=describeTerrain({_grid_elevation:{value:3184.08}},parseElevation(parsed(1484),30.49,79.13));
  assert.equal(terrain.site_elevation_m,1484);assert.equal(terrain.grid_elevation_m,3184.08);
  assert.equal(terrain.climate_representativeness,'limited_by_elevation_difference');
  assert.equal(describeTerrain({},parseElevation(parsed(2500),30.49,79.13)).high_elevation,true);
  assert.equal(describeTerrain({}).site_elevation_m,null);
});
test('Independent source failures stay unavailable; source cache only accepts matching real periods',async()=>{
  assert.equal((await fetchColdHistory(11.1,106.1,{provider:async()=>{throw Error('offline');}})).status,'unavailable');
  assert.equal((await fetchElevation(11.1,106.1,{request:async()=>{throw Error('offline');}})).value,null);
  let calls=0;
  const fake=async(lat,lon,start,end)=>{calls++;assert.equal(start,2021);assert.equal(end,2025);return history(2021,5);};
  await fetchColdHistory(11.2,106.2,{provider:fake,now:new Date('2026-11-15')});
  assert.equal((await fetchColdHistory(11.2,106.2,{provider:fake,now:new Date('2026-11-15')})).cache_used,true);
  assert.equal(calls,1);
  assert.equal((await fetchColdHistory(11.3,106.3,{provider:async()=>history(2024),now:new Date('2026-11-15')})).status,'unavailable');
});

async function api(t,{historyData=history(),site=2500,grid=2450}={}){
  const app=express();app.use(express.json());
  app.use('/api',createApiRouter({climateProvider:async()=>({...warm(),_grid_elevation:{value:grid,status:'model_grid'}}),
    historyProvider:async()=>({status:'unavailable',records:[]}),coldHistoryProvider:async()=>historyData,
    elevationProvider:async()=>({value:site,status:'dem',source:'Controlled SRTM fixture',unit:'m'})}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const res=await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({lat:30.49,lon:79.13,user_crops:cropPlan})});
  assert.equal(res.status,200);return res.json();
}
test('API exposes actual cold month, daily period, altitude and season-specific crop exclusion',async t=>{
  const result=await api(t,{historyData:frozenDay(history(),'2024-01-15',-4)});
  assert.equal(result.ok,true);assert.deepEqual(result.cold_risk.frost_months,[1]);
  assert.equal(result.monthly.T2M_MIN_HISTORY[0],-4);assert.equal(result.variables.T2M_MIN_HISTORY[0].status,'historical_extreme');
  assert.equal(result.scenarios.quantum.crops[0],'Fallow');assert.equal(result.terrain.site_elevation_m,2500);
  assert.equal(result.scenarios.user.season_results[0].mortality_confirmed,false);
  assert.equal(result.recommendation_allowed,true);
});
test('API elevation mismatch disables local recommendation and percentage without fabricating a glacier',async t=>{
  const result=await api(t,{site:1484,grid:3184.08});
  assert.equal(result.ok,true);assert.equal(result.recommendation_allowed,false);assert.equal(result.recommendation_status,'elevation_mismatch');
  assert.equal(result.match_pct,null);assert.equal(result.is_ice,undefined);assert.equal(result.terrain.climate_representativeness,'limited_by_elevation_difference');
  assert.ok(result.alerts.some(a=>/độ cao/i.test(a.msg)));
});
test('API marks insufficient cold data instead of calling a warm monthly average frost-safe',async t=>{
  const result=await api(t,{historyData:{status:'unavailable',records:[],reason:'offline fixture'}});
  assert.equal(result.cold_risk.status,'unavailable');assert.equal(result.recommendation_allowed,false);
  assert.equal(result.recommendation_status,'cold_risk_incomplete');
  assert.equal(result.cold_risk.months[0].frost_risk,'unknown');
});
