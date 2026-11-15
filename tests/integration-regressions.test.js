const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const express = require("express");
const optimizer = require("../src/algorithms/13_crop_rotation_optimization_qaoa_milp");
const { scoreScenario } = require("../src/services/scoring");
const { runQuantum } = require("../src/quantum/qaoa");
const { createApiRouter } = require("../src/routes/api");
const { computeDerived } = require("../src/services/nasa");
const TradeCore = require("../public/js/trade-core");
const HeatCore = require("../public/js/heatmap-core");

function climate() {
  return computeDerived({...structuredClone(require("./fixtures/climates.json")[0]),
    T2M:Array(12).fill(25), TS:Array(12).fill(28), T2M_MIN:[-4,...Array(11).fill(8)],
    _mock:false, _raw_catalog:{}, source_status:"climatology"});
}

test("planning overlays preserve biological exclusions and maximize the same UI objective over 216 rotations", () => {
  const data = climate(), suitabilityMap = {Rice:1, Soybean:0.1, Peanut:0.9, Maize:0.6, Veggies:0.2};
  const marketData = {Peanut:1.2}, weights = {soil:.33, water:.33, profit:.34};
  const envs = optimizer.buildSeasonEnvironments(data, {suitabilityMap, marketData});
  const exact = optimizer.solveClassicalExactOptimizer(envs, weights);
  let maximum = -Infinity;
  for (const a of optimizer.CROP_KEYS) for (const b of optimizer.CROP_KEYS) for (const c of optimizer.CROP_KEYS) {
    const score = scoreScenario([a,b,c], data, .33,.33,.34, suitabilityMap, marketData, {mode:"planning"});
    if (score.is_feasible) maximum = Math.max(maximum, score.overall);
    assert.ok(score.overall >= 0 && score.overall <= 100);
  }
  assert.equal(exact.best_score, maximum);
  assert.equal(exact.best_rotation[0], "Fallow");
  const q = runQuantum(data,.33,.33,.34,{mode:"planning",suitabilityMap,marketData,seed:7});
  const score = scoreScenario(q.crops,data,.33,.33,.34,suitabilityMap,marketData,{mode:"planning"});
  assert.equal(q.crops[0],"Fallow");
  assert.equal(q.objective_score,score.overall);
  const high = scoreScenario(["Fallow","Peanut","Peanut"],data,.33,.33,.34,{Peanut:1},{},{mode:"planning"});
  const low = scoreScenario(["Fallow","Peanut","Peanut"],data,.33,.33,.34,{Peanut:0},{},{mode:"planning"});
  assert.ok(high.profit_hp > low.profit_hp);
});

test("API keeps live suitability, exact baseline and disabled-QAOA fallback on the same objective", async t => {
  const app = express(); app.use(express.json());
  app.use("/api",createApiRouter({climateProvider:async()=>climate(),
    historyProvider:async()=>({status:"unavailable",records:[]}),
    coldHistoryProvider:async()=>({status:"unavailable",records:[]}),
    elevationProvider:async()=>({status:"unavailable",value:null}),
    externalProvider:async()=>({ok:true,source:"live",data:{Rice:{suitability:1,source:"cartodrone"},Peanut:{suitability:.8,source:"everyfarm"}}}),
    quantumOptions:{disabled:true}}));
  const server = await new Promise(resolve => {const server=app.listen(0,"127.0.0.1",()=>resolve(server));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:10.04,lon:105.78})});
  const data=await response.json();
  assert.equal(response.status,200); assert.equal(data.ok,true); assert.equal(data.external_api.ok,true);
  assert.equal(data.scenarios.quantum.fallback_used,true); assert.equal(data.scenarios.quantum.quantum_available,false);
  assert.deepEqual(data.scenarios.quantum.crops,data.scenarios.classical.crops);
  assert.equal(data.scenarios.classical.overall,data.scenarios.quantum.objective_score);
  assert.equal(data.scenarios.user.season_results[0].model_excluded,true);
  assert.equal(data.scenarios.user.season_results[0].external_suitability,1);
});

test("legacy adapter retains its external simulator and accepts disabled options in the sixth argument", () => {
  const data=climate();
  const result=runQuantum(data,.33,.33,.34,{Rice:.8},{disabled:true});
  assert.equal(result.fallback_used,true);
  assert.equal(result.quantum_available,false);
  assert.deepEqual(result.crops,result.classical_baseline);
  const planning=runQuantum(data,.33,.33,.34,{}, {disabled:true});
  assert.equal(planning.fallback_used,true);
  assert.equal(planning.quantum_available,false);
});

function browser() {
  const elements=new Map();
  function makeElement() {
    const element={value:"",style:{},children:[],classList:{add(){},remove(){}},querySelector:()=>null,
      appendChild(child){this.children.push(child);}};
    let html="",text="";
    Object.defineProperties(element,{
      innerHTML:{get:()=>html,set:value=>{html=value;element.children=[];}},
      textContent:{get:()=>text,set:value=>{text=String(value);element.children=[];html="";}},
    });
    return element;
  }
  const el=id=>{if(!elements.has(id))elements.set(id,makeElement());return elements.get(id);};
  const context=vm.createContext({window:{},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:makeElement},
    setTimeout(){},setInterval(){},clearInterval(){},console});
  for(const file of ["state.js","ui-helpers.js","analysis.js","render.js"]) vm.runInContext(fs.readFileSync(`public/js/${file}`,"utf8"),context);
  return {context,el};
}

test("render preserves null and zero, clears stale risks and renders messages as text", () => {
  const {context,el}=browser();
  context.payload={satellite:{POWER:{temp_avg:null},GPM:{rain_avg:0},RISK:{dri_avg:.8,fri_avg:.1}},
    match_pct:null,match_desc:"No comparison",alerts:[{level:"warning",msg:"<img src=x onerror=alert(1)>"}]};
  vm.runInContext("updateUI(payload)",context);
  assert.equal(el("sv-temp").textContent,"N/A"); assert.equal(el("sv-rain").textContent,"0 mm/mo");
  assert.equal(el("match-score").textContent,"-%");
  assert.equal(el("alerts-list").children[0].textContent,"<img src=x onerror=alert(1)>");
  assert.ok(el("risk-bars").innerHTML.includes("80%"));
  vm.runInContext("renderRiskBlock({})",context);
  assert.equal(el("risk-bars").style.display,"none"); assert.equal(el("risk-bars").innerHTML,"");
  vm.runInContext("renderRiskBlock(payload.satellite); resetDashboardUI()",context);
  assert.equal(el("risk-block").style.display,"none"); assert.equal(el("risk-bars").innerHTML,"");
  assert.equal(el("match-score").textContent,"-%");
});

test("climate heatmap loads all 39 states without requesting the unused crop grid", async () => {
  const grid=fs.readFileSync("public/data/climate-grid.json","utf8"),requests=[];
  const context=vm.createContext({HeatCore,console,document:{getElementById:()=>null},L:{Layer:{extend:()=>function(){}}},
    fetch:async url=>{requests.push(url);assert.equal(url,"/data/climate-grid.json");return {ok:true,text:async()=>grid};}});
  vm.runInContext(fs.readFileSync("public/js/heatmap.js","utf8"),context);
  await vm.runInContext("Heat.loadGrid()",context);
  assert.deepEqual(requests,["/data/climate-grid.json"]);
  for(const def of ["temp","rh","soil"]) for(let month=0;month<=12;month++) {
    context.selected=def;context.month=month;
    const state=vm.runInContext("Heat.defId=selected; Heat.month=month; Heat.currentState()",context);
    assert.equal(state.data.length,state.grid.nLat*state.grid.nLon);
    assert.ok(Number.isFinite(state.range.min) && Number.isFinite(state.range.max));
  }
});

test("land paths and markers share inland hubs for real three-letter country codes", () => {
  const hubs=require("../public/data/trade-hubs.json").hubs;
  const flow={from:"VNM",to:"CHN",modes:{land:{kt:10}}}, item={flow,mode:"land",kt:10};
  const path=TradeCore.pathFor(item,hubs),usage=TradeCore.hubUsage([item],hubs);
  assert.deepEqual(path[0],[21.0285,105.8542]); assert.deepEqual(path.at(-1),[22.817,108.3665]);
  assert.ok(path.some(([lat,lon])=>lat===21.9735 && lon===106.7578));
  assert.equal(usage.get("land:VNM").lat,path[0][0]);
  assert.equal(usage.get("land:CHN").lon,path.at(-1)[1]);
});

test("language changes keep tooltip controls and target chart headings without replacing the cold panel title", () => {
  const icon={className:"info-q"},label={children:[icon],appendChild(child){this.children.push(child);},
    querySelectorAll:()=>label.children.filter(child=>child===icon)};
  Object.defineProperty(label,"textContent",{set(value){this.text=value;this.children=[];}});
  const titles={"chart-temp":{},"chart-rain":{},"chart-ndvi":{}},coldTitle={textContent:"TERRAIN & COLD RISK"};
  const context=vm.createContext({localStorage:{setItem(){}},document:{documentElement:{},addEventListener(){},
    querySelector:selector=>selector===".match-score-label"?label:null,
    querySelectorAll:selector=>selector==="#tab-telemetry .mini-chart-title"?[coldTitle,...Object.values(titles)]:[],
    getElementById:id=>titles[id]?{parentElement:{querySelector:()=>titles[id]}}:null}});
  vm.runInContext(fs.readFileSync("public/js/settings.js","utf8"),context);
  vm.runInContext("AppSettings.setLanguage('vi')",context);
  assert.deepEqual(label.children,[icon]);
  assert.match(titles["chart-temp"].textContent,/NHIỆT ĐỘ/);
  assert.match(titles["chart-rain"].textContent,/LƯỢNG MƯA/);
  assert.equal(coldTitle.textContent,"TERRAIN & COLD RISK");
});

test("percentage scores keep -% for missing, use the low-fit floor, and do not toast on optional API outages",()=>{
  const {context,el}=browser();let toasts=0;
  context.showCustomToast=()=>toasts++;
  assert.match(vm.runInContext('hpBarHTML("Soil",70)',context),/>70%</);
  assert.match(vm.runInContext('hpBarHTML("Soil",0)',context),/>1%</);
  assert.match(vm.runInContext('hpBarHTML("Soil",null)',context),/>-%</);
  assert.match(vm.runInContext('hpBarHTML("Risk",0,null,"percent")',context),/>0%</);
  context.payload={external_api:{ok:false},match_pct:85.9};
  vm.runInContext("updateUI(payload)",context);
  assert.equal(el("match-score").textContent,"86%");assert.equal(toasts,0);
  assert.match(el("ext-api-desc").textContent,/khí hậu NASA/);
});
