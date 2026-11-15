const test=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");
const {buildCropRanking}=require("../src/services/cropRanking");
const {assessColdRisk}=require("../src/services/coldRisk");
const {createApiRouter}=require("../src/routes/api");
const {computeDerived}=require("../src/services/nasa");
const {fuzzyPeakedOptimum,computeCropSeasonSuitability}=require("../src/algorithms/11_crop_suitability_fuzzy_ecocrop");
function climate() {
  return {...structuredClone(require("./fixtures/climates.json")[0]),T2M:Array(12).fill(25),TS:Array(12).fill(28),
    T2M_MIN:Array(12).fill(12),PRECTOTCORR:Array(12).fill(120),GWETROOT:Array(12).fill(.6),_mock:false,_raw_catalog:{}};
}

test("continuous fit distinguishes the optimal interval and joins both shoulders continuously",()=>{
  const fit=x=>fuzzyPeakedOptimum(x,10,20,30,40);
  assert.equal(fit(25),1);
  assert.equal(fit(20),.9);assert.equal(fit(30),.9);
  assert.ok(fit(25)>fit(22) && fit(22)>fit(20) && fit(20)>fit(15));
  for(const boundary of [10,20,30,40]) assert.ok(Math.abs(fit(boundary-1e-7)-fit(boundary+1e-7))<1e-6);
  for(const value of [0,10,40,50])assert.equal(fit(value),0);
});

test("ranking computes distinct optimal-range scores without amplifying external scores",()=>{
  const data=climate();
  const ranking=buildCropRanking(data);
  const maize=ranking.rows.find(row=>row.crop==="Maize");
  const env={tempAvg:25,rainSeasonAccum:480,soilMoistureAvg:.6,maxTs:28};
  assert.equal(computeCropSeasonSuitability("Maize",env).suitability_score,100);
  assert.equal(maize.raw_score_pct,computeCropSeasonSuitability("Maize",env,{continuousFit:true}).suitability_score);
  assert.ok(maize.raw_score_pct<100);
  assert.ok(new Set(ranking.rows.map(row=>row.raw_score_pct)).size>3);
  const suitabilityMap={Rice:1,Maize:1,Soybean:1,Peanut:1,Veggies:1};
  assert.deepEqual(buildCropRanking(data,{suitabilityMap}).rows,ranking.rows);
  const dry=buildCropRanking({...data,PRECTOTCORR:Array(12).fill(20),GWETROOT:Array(12).fill(.3)});
  assert.ok(dry.rows.find(row=>row.crop==="Maize").raw_score_pct<maize.raw_score_pct);
});

test("best growing window can span December and January",()=>{
  const data=climate();
  data.T2M=[25,25,...Array(8).fill(-20),25,25];
  data.TS=data.T2M.map(value=>value+3);data.T2M_MIN=data.T2M.map(value=>value-5);
  data._cold_risk=assessColdRisk(data);
  const maize=buildCropRanking(data).rows.find(row=>row.crop==="Maize");
  assert.deepEqual(maize.months,[11,12,1,2]);assert.equal(maize.cold_risk,false);
});

test("analysis and preview return identical climate rankings even with high external suitability",async t=>{
  const app=express();app.use(express.json());
  app.use("/api",createApiRouter({climateProvider:async()=>computeDerived(climate()),
    historyProvider:async()=>({status:"unavailable",records:[]}),
    coldHistoryProvider:async()=>({status:"unavailable",records:[]}),
    elevationProvider:async()=>({status:"unavailable",value:null}),
    externalProvider:async()=>({ok:true,source:"live",data:Object.fromEntries(
      ["Rice","Maize","Soybean","Peanut","Veggies"].map(crop=>[crop,{suitability:1,source:"cartodrone"}]))}),
    quantumOptions:{disabled:true}}));
  const server=await new Promise(resolve=>{const server=app.listen(0,"127.0.0.1",()=>resolve(server));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const preview=await (await fetch(base+"/crop_suitability?lat=10.04&lon=105.78")).json();
  const analysis=await (await fetch(base+"/analyze",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({lat:10.04,lon:105.78})})).json();
  assert.equal(analysis.ok,true);assert.equal(preview.ok,true);
  assert.deepEqual(analysis.crop_rankings,preview.crop_rankings);
  assert.ok(analysis.crop_rankings.rows.every(row=>row.score_pct<100));
});
test("five productive crop groups are ranked descending with a growing window and relative percentages",()=>{
  const data=climate();data._cold_risk=assessColdRisk(data);
  const result=buildCropRanking(data);
  assert.equal(result.status,"available");assert.equal(result.rows.length,5);
  assert.ok(result.rows.every(row=>row.crop!=="Fallow" && row.score_pct>=1 && row.score_pct<=100));
  for(let i=1;i<result.rows.length;i++)assert.ok(result.rows[i-1].raw_score_pct>=result.rows[i].raw_score_pct);
  assert.ok(result.rows.every(row=>row.windows.length===12 && row.months.length>=3));
});
test("high mountains keep their warm growing season rather than being rejected by elevation",()=>{
  const data=climate();data.T2M=[-10,-5,0,8,15,22,24,23,18,8,0,-8];
  data.TS=data.T2M.map(v=>v+3);data.T2M_MIN=data.T2M.map(v=>v-5);data._cold_risk=assessColdRisk(data);
  const result=buildCropRanking(data,{terrain:{site_elevation_m:3500}});
  const maize=result.rows.find(row=>row.crop==="Maize");
  assert.ok(maize.score_pct>35);assert.ok(maize.months.includes(7));
  assert.deepEqual(result.rows,buildCropRanking(data,{terrain:{site_elevation_m:0}}).rows);
});
test("rare historical frost affects the relative score without being diagnosed as year-round crop death",()=>{
  const data=climate();data._cold_risk={months:Array.from({length:12},(_,i)=>({month:i+1,frost_risk:"detected",daily:{valid_days:150,freezing_days:1}}))};
  const result=buildCropRanking(data);
  assert.ok(result.rows.some(row=>row.score_pct>35 && row.cold_risk));
  assert.ok(result.rows.every(row=>row.frost_frequency>0));
});
test("extreme cold has the explicit 1% display floor; missing climate and demo data never get invented scores",()=>{
  const data=climate();data.T2M.fill(-30);data.TS.fill(-27);data.T2M_MIN.fill(-35);data._cold_risk=assessColdRisk(data);
  const rows=buildCropRanking(data).rows;
  assert.ok(rows.every(row=>row.score_pct===1 && row.raw_score_pct===0 && row.display_floor_applied && row.suitability_class==="N"));
  assert.equal(buildCropRanking({...data,_mock:true}).rows.length,0);
  assert.equal(buildCropRanking({...data,GWETROOT:[]}).status,"unavailable");
});
test("preview API deduplicates concurrent requests, excludes water and never needs optional crop APIs",async t=>{
  let calls=0,externalCalls=0;
  const app=express();app.use("/api",createApiRouter({climateProvider:async()=>{calls++;return computeDerived(climate());},
    coldHistoryProvider:async()=>({status:"unavailable",records:[]}),elevationProvider:async()=>({value:3000,status:"dem"}),
    externalProvider:async()=>{externalCalls++;throw Error("offline");}}));
  const server=await new Promise(resolve=>{const server=app.listen(0,"127.0.0.1",()=>resolve(server));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}/api/crop_suitability`;
  const responses=await Promise.all([fetch(base+"?lat=10.04&lon=105.78"),fetch(base+"?lat=10.04&lon=105.78")]);
  const result=await responses[0].json();await responses[1].json();
  assert.equal(calls,1);assert.equal(externalCalls,0);assert.equal(result.ok,true);assert.equal(result.crop_rankings.rows.length,5);
  const sea=await (await fetch(base+"?lat=0&lon=-140")).json();assert.equal(sea.ok,false);assert.equal(sea.crop_rankings.rows.length,0);assert.equal(calls,1);
  assert.equal((await fetch(base+"?lat=91&lon=105")).status,400);
});
