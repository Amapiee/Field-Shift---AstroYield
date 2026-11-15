const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createApiRouter}=require('../src/routes/api');
const {fetchNasa,mockNasa}=require('../src/services/nasa');
const {DATA_CATALOG,createScientificRecord}=require('../src/algorithms/01_nasa_data_provider');
const fixture=require('./fixtures/climates.json')[0];
async function climate() {
  return fetchNasa(10.04,105.78,{provider:async()=>({source:'Controlled fixture',period:{start:1991,end:2020},
    data:Object.fromEntries(Object.keys(DATA_CATALOG).map(k=>[k,(fixture[k] || Array(12).fill(null)).map(value=>createScientificRecord(k,value,'climatology','valid',{period:{start:1991,end:2020}}))]))})});
}
async function start(t,options={}) {
  const app=express();app.use(express.json());app.use('/api',createApiRouter({coldHistoryProvider:async()=>({status:"unavailable",records:[]}),elevationProvider:async()=>({status:"unavailable",value:null}),...options}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return async(body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
}
test('API validates missing, null, string, nonfinite and out-of-range coordinates before fetching',async t=>{
  let calls=0;const send=await start(t,{climateProvider:async()=>{calls++;throw Error('unexpected fetch');}});
  for(const body of [{},{lat:null,lon:0},{lat:'10',lon:105},{lat:91,lon:0},{lat:0,lon:-181},{lat:Infinity,lon:0},{lat:[],lon:0}]){
    const r=await send(body);assert.equal(r.status,400);assert.equal(r.data.ok,false);assert.equal(r.data.trace,undefined);
  }
  assert.equal(calls,0);
});
test('API validates weights and crops instead of silently changing the request',async t=>{
  const send=await start(t);
  for(const extra of [{w_water:'0.5'},{w_soil:-1},{w_profit:2},{user_crops:['Rice','bad','Rice']},{user_crops:['toString','Rice','Rice']}]) {
    assert.equal((await send({lat:10.04,lon:105.78,...extra})).status,400);
  }
});
test('API offline at Tibet, Saudi and Kartik: unavailable, no scores or simulated climate',async t=>{
  const send=await start(t,{climateProvider:(lat,lon)=>fetchNasa(lat,lon,{provider:async()=>{throw Error('offline fixture');}})});
  for(const [lat,lon] of [[29.0084,86.2293],[26.2807,46.8403],[30.49,79.13]]){
    const {status,data}=await send({lat,lon});assert.equal(status,503);assert.equal(data.source_status,'unavailable');
    assert.equal(data.recommendation_allowed,false);assert.equal(data.scenarios,null);assert.equal(data.match_pct,null);
    assert.equal(data.spi.status,'unavailable');assert.equal(data.monthly,undefined);
  }
});
test('API demo inputs are clearly marked and cannot yield recommendations',async t=>{
  const send=await start(t,{climateProvider:async()=>mockNasa(29,86)});
  const {status,data}=await send({lat:29,lon:86});assert.equal(status,503);assert.equal(data.source_status,'demo');
  assert.equal(data.recommendation_allowed,false);assert.equal(data.scenarios,null);assert.match(data.source,/DEMO/);
});
test('API source metadata exposes climatology, reanalysis, proxy, period and unavailable SPI separately',async t=>{
  const send=await start(t,{climateProvider:climate,historyProvider:async()=>({status:'unavailable',records:[],reason:'offline'})});
  const {data}=await send({lat:10.04,lon:105.78,w_water:0,w_soil:0,w_profit:0});
  assert.equal(data.ok,true);assert.equal(data.source_status,'climatology');assert.equal(data.spi.status,'unavailable');
  assert.equal(data.variables.T2M[0].status,'climatology');assert.equal(data.variables.NDVI[0].status,'proxy');
  assert.equal(data.variables.T2M[0].confidence,null);assert.deepEqual(data.variables.T2M[0].period,{start:1991,end:2020});
  assert.match(data.satellite.MODIS.source,/proxy/);assert.equal(data.mcda.weights.pairwise_elicited,false);
  assert.equal(data.crops_meta.Rice.suitability_model.parameter_provenance.temp_limits.verified,false);
});
test('API classical fallback is labeled separately from a quantum result',async t=>{
  const send=await start(t,{climateProvider:climate,historyProvider:async()=>({status:'unavailable',records:[]}),quantumOptions:{disabled:true}});
  const {data}=await send({lat:10.04,lon:105.78});const q=data.scenarios.quantum;
  assert.equal(q.fallback_used,true);assert.equal(q.quantum_available,false);assert.equal(q.quantum_feasible,false);
  assert.equal(q.optimality_gap_pct,null);assert.equal(q.feasibility_rate_pct,null);assert.match(q.method,/classical/i);
  assert.ok(!/quantum/i.test(data.match_desc));assert.match(data.mcda.topsis.find(s=>s.id==='quantum').label,/cổ điển/);
});
test('API uses dated monthly history when available instead of climatology',async t=>{
  const records=Array.from({length:372},(_,i)=>({year:1995+Math.floor(i/12),month:i%12+1,rain_mm:20+i%12*7+(Math.floor(i/12)*17%31)*5}));
  const send=await start(t,{climateProvider:climate,historyProvider:async()=>({status:'reanalysis',source:'Controlled history fixture',period:{start:1995,end:2025},records})});
  const {data}=await send({lat:10.04,lon:105.78});assert.equal(data.spi.status,'available');
  assert.equal(data.spi.details[0].year,2025);assert.equal(data.spi.details[0].rain_mm,records.at(-12).rain_mm);
  assert.notEqual(data.spi.details[0].rain_mm,data.monthly.RAIN[0]);
});
