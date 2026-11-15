const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const {classifyCoordinates:classify}=require('../utils/geoClassifier');
const {createApiRouter}=require('../routes/api');
const {fetchNasa}=require('../services/nasa');
const {createScientificRecord}=require('../algorithms/01_nasa_data_provider');

// Geographically distinct cases catch regressions from the former ocean rectangles.
const locations=[
  ['Greenland Sea screenshot',74.2174,7.5411,'OCEAN'],
  ['Gulf of Tonkin',19.5308,106.6433,'OCEAN'],
  ['Gulf of Thailand',10,101,'OCEAN'],
  ['Pacific',0,-150,'OCEAN'],['North Atlantic',40,-30,'OCEAN'],
  ['Arctic pole',90,0,'OCEAN'],['Southern Ocean',-65,20,'OCEAN'],['Dateline',0,180,'OCEAN'],
  ['Baikal',53.5,108,'INLAND_WATER'],['Lake Michigan',43.7,-87,'INLAND_WATER'],
  ['Mont Blanc',45.8326,6.8652,'ICE_SHEET'],['Matterhorn',45.9763,7.6586,'ICE_SHEET'],
  ['Jungfrau',46.5368,7.9626,'ICE_SHEET'],['Everest',27.9881,86.925,'ICE_SHEET'],
  ['Andean glacier',-9.12,-77.6,'ICE_SHEET'],['Greenland interior',76,-42,'ICE_SHEET'],
  ['Antarctica',-80,0,'ICE_SHEET'],['South pole',-90,0,'ICE_SHEET'],
  ['Zermatt valley',46.0207,7.7491,'LAND'],['Fuji seasonal snow',35.3606,138.7274,'LAND'],
  ['Thai Binh farmland',20.3864,106.4196,'LAND'],['Can Tho',10.04,105.78,'LAND'],
  ['Thailand screenshot',13.7532,101.6945,'LAND'],['Iceland Reykjavik',64.1466,-21.9426,'LAND'],
  ['Fiji Suva',-18.1416,178.4419,'LAND'],['New Zealand Wellington',-41.2866,174.7756,'LAND'],
  ['Hawaii Honolulu',21.3069,-157.8583,'LAND'],['Sri Lanka Colombo',6.9271,79.8612,'LAND'],
  ['Sardinia',40.12,9.01,'LAND']
];
for(const [name,lat,lon,expected] of locations)test('Geographic regression: '+name,()=>{
  const result=classify(lat,lon);assert.equal(result.type,expected);
  assert.equal(result.live_snow_observed,false);
  if(expected!=='LAND')assert.equal(result.can_cultivate,false);
});
test('Generalized polar shorelines stay uncertain, not asserted to be open ocean',()=>{
  for(const [lat,lon] of [[64.1835,-51.7216],[78.2232,15.6469]]){
    const geo=classify(lat,lon);assert.equal(geo.type,'COASTAL_UNCERTAIN');
    assert.equal(geo.is_water,false);assert.equal(geo.can_cultivate,false);assert.equal(geo.requires_verification,true);
  }
});
test('Cold air alone cannot turn farmland into a mapped glacier',()=>{
  assert.equal(classify(46.0207,7.7491,{T2M:Array(12).fill(-30)}).type,'LAND');
  assert.equal(classify(null,7).type,'UNKNOWN');assert.equal(classify(91,7).type,'UNKNOWN');
});

async function api(t,overrides={}){
  const counts={climate:0,elevation:0};
  const app=express();app.use(express.json());app.use('/api',createApiRouter({
    climateProvider:async()=>{counts.climate++;return {_unavailable:true,source_status:'unavailable',_error:'NASA offline fixture',_raw_catalog:{}};},
    elevationProvider:async()=>{counts.elevation++;return {status:'dem',value:3400,source:'Controlled DEM fixture'};},...overrides}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api`;
  return {counts,get:async p=>{const r=await fetch(url+p);return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json()};},
    send:async(lat,lon)=>{const r=await fetch(url+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lon})});return {status:r.status,data:await r.json()};}};
}
test('Map lookup and Run agree for water/glaciers even when NASA is offline, without calling NASA or DEM',async t=>{
  const a=await api(t);
  for(const [,lat,lon,type] of locations.filter(p=>p[3]!=='LAND')){
    const get=await a.get(`/location?lat=${lat}&lon=${lon}`),post=await a.send(lat,lon);
    assert.equal(get.data.location.type,type);assert.equal(post.data.terrain_type,type);
    assert.equal(post.data.ok,false);assert.equal(post.data.location.type,type);assert.equal(get.cache,'no-store');
  }
  assert.deepEqual(a.counts,{climate:0,elevation:0});
  assert.equal((await a.get('/location?lat=&lon=0')).status,400);
  assert.equal((await a.get('/runtime')).data.contract_version,'terrain-v2-objective-v5');
});
test('Unavailable agricultural data still returns sourced high terrain and cold evidence',async t=>{
  const a=await api(t,{climateProvider:async()=>({_unavailable:true,source_status:'unavailable',
    _qc:{GWETROOT:{missing:12}},T2M:Array(12).fill(-5),T2M_MIN:Array(12).fill(-10),_raw_catalog:{}})});
  const {status,data}=await a.send(30.49,79.13);
  assert.equal(status,503);assert.equal(data.terrain.site_elevation_m,3400);
  assert.equal(data.terrain.high_elevation,true);assert.equal(data.cold_risk.frost_months.length,12);
  assert.match(data.error,/GWETROOT/);assert.equal(data.scenarios,null);
  assert.ok(data.alerts.some(a=>a.msg.includes('3400')));
});
test('QC retains actual Can Tho seasonal maxima and still rejects an isolated suspect spike',async()=>{
  const live=require('./terrain-live-check.json').results.find(r=>r.name==='Can Tho');
  const point={source:'NASA POWER saved live check',period:live.period,
    data:Object.fromEntries(Object.entries(live.climatology_values).map(([k,a])=>[k,a.map(v=>createScientificRecord(k,v))]))};
  const good=await fetchNasa(10.04,105.78,{provider:async()=>point});
  assert.equal(good.source_status,'climatology');assert.equal(good.recommendation_allowed,true);
  assert.deepEqual(good.T2M,live.climatology_values.T2M);assert.equal(good._qc.T2M.suspect_outliers,0);
  const bad=structuredClone(point);bad.data.T2M=[20,21,22,20,21,22,20,21,22,20,21,60].map(v=>createScientificRecord('T2M',v));
  const suspect=await fetchNasa(10.04,105.78,{provider:async()=>bad});
  assert.equal(suspect.source_status,'low_quality');assert.equal(suspect.recommendation_allowed,false);
});

function browser(){
  const elements=new Map(),timers=[],alerts=[];
  function el(id){if(!elements.has(id)){
    const classes=new Set();elements.set(id,{value:'',textContent:'',innerHTML:'',style:{},children:[],hidden:false,disabled:false,
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      querySelector:s=>el(id+s),appendChild(x){this.children.push(x);}});
  }return elements.get(id);}
  const context=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({})},
    alert:m=>alerts.push(m),AbortController,map:{flyTo(){},getZoom(){return 7;}},placeMarker(){},
    setTimeout:(cb,ms)=>{const t={cb,ms};timers.push(t);return t;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
    destroyChart:()=>null,buildCharts(){},buildRadar(){},cropTagsHTML:()=>'',hpBarHTML:()=>''});
  for(const f of ['state.js','location.js','ui-helpers.js','analysis.js','render.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../../public/js',f),'utf8'),context);
  for(const [id,value] of Object.entries({'inp-lat':'10.04','inp-lon':'105.78','sl-soil':'.33','sl-water':'.33','sl-profit':'.34','crop-s1':'Rice','crop-s2':'Soybean','crop-s3':'Maize'}))el(id).value=value;
  return {context,el,alerts,run:code=>vm.runInContext(code,context)};
}
test('Map warning is immediate after local lookup and cached Run preserves it with no NASA request',async()=>{
  const b=browser();let calls=0;
  b.context.fetch=async()=>{calls++;return {ok:true,json:async()=>({ok:true,contract_version:'terrain-v2-objective-v5',location:classify(74.2174,7.5411)})};};
  await b.run('farmLat=74.2174;farmLon=7.5411;checkSelectedLocation(farmLat,farmLon)');
  assert.equal(b.el('water-alert').classList.contains('show'),true);assert.match(b.el('analysis-message').textContent,/biển/);
  b.el('inp-lat').value='74.2174';b.el('inp-lon').value='7.5411';await b.run('runAnalysis()');
  assert.equal(calls,1);assert.equal(b.el('loading').classList.contains('show'),false);
});
test('Out-of-order map lookups never replace the latest location warning',async()=>{
  const b=browser(),pending=[];
  b.context.fetch=()=>new Promise(resolve=>pending.push(resolve));
  const first=b.run('farmLat=45.8326;farmLon=6.8652;checkSelectedLocation(farmLat,farmLon)');
  const second=b.run('farmLat=74.2174;farmLon=7.5411;checkSelectedLocation(farmLat,farmLon)');
  pending[1]({ok:true,json:async()=>({ok:true,contract_version:'terrain-v2-objective-v5',location:classify(74.2174,7.5411)})});await second;
  pending[0]({ok:true,json:async()=>({ok:true,contract_version:'terrain-v2-objective-v5',location:classify(45.8326,6.8652)})});await first;
  assert.match(b.el('water-alert.water-alert-title').textContent || b.el('water-alert.water-alert-title').innerHTML,/BIỂN/);
  assert.match(b.el('analysis-message').textContent,/biển/);
});
test('Old backend is explained; API errors close loading without blocking browser alerts',async()=>{
  const b=browser();b.context.fetch=async()=>({ok:true,json:async()=>({ok:true,source:'Old server'})});
  await b.run('runAnalysis()');assert.match(b.el('analysis-message').textContent,/phiên bản cũ/);
  assert.equal(b.el('loading').classList.contains('show'),false);assert.equal(b.el('btn-run').disabled,false);assert.equal(b.alerts.length,0);
  b.context.fetch=async()=>({ok:false,json:async()=>({ok:false,error:'NASA thiếu GWETROOT'})});
  await b.run('runAnalysis()');assert.match(b.el('analysis-message').textContent,/GWETROOT/);
  assert.equal(b.el('loading').classList.contains('show'),false);assert.equal(b.alerts.length,0);
});
test('Header has no Source badge; provenance remains available in collapsed details',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../public/index.html'),'utf8');
  assert.ok(!html.slice(0,html.indexOf('</header>')).includes('data-source-badge'));
  assert.match(html,/<details[^>]*id="data-details"[^>]*>/);assert.equal((html.match(/id="data-source-badge"/g)||[]).length,1);
  assert.match(html,/id="analysis-message"/);assert.match(html,/js\/location.js\?v=terrain2/);
});
