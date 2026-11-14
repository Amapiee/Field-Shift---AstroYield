const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function browser() {
  const elements=new Map(),messages=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',className:'',disabled:false,
      style:{},children:[],classList:{add(){},remove(){}},appendChild(el){this.children.push(el);}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({})},
    alert:msg=>messages.push(msg),setTimeout(){},setInterval(){return 1;},clearInterval(){},
    map:{flyTo(){},getZoom(){return 7;}},placeMarker(){},destroyChart:ref=>{if(ref)ref.destroy();return null;},
    buildCharts(){},buildRadar(){},cropTagsHTML:()=>'',hpBarHTML:()=>'',console});
  for(const f of ['state.js','analysis.js','render.js'])vm.runInContext(fs.readFileSync('public/js/'+f,'utf8'),context);
  return {context,element,messages};
}
test('Frontend: zero coordinates survive; no-data response clears prior scores and charts',async()=>{
  const {context,element}=browser();let sent,destroyed=0;
  for(const [id,value] of [['inp-lat','0'],['inp-lon','105'],['sl-soil','.33'],['sl-water','.33'],['sl-profit','.34'],['crop-s1','Rice'],['crop-s2','Soybean'],['crop-s3','Maize']])element(id).value=value;
  context.fakeChart={destroy(){destroyed++;}};
  vm.runInContext('chartTemp = fakeChart; chartRain = fakeChart; chartNdvi = fakeChart; chartRadar = fakeChart;',context);
  element('user-rank').textContent='RANK S';
  context.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {json:async()=>({ok:false,source_status:'unavailable',error:'No real climate data'})};};
  await vm.runInContext('runAnalysis()',context);
  assert.equal(sent.lat,0);assert.equal(sent.lon,105);assert.equal(destroyed,4);
  assert.equal(element('user-rank').textContent,'RANK -');assert.equal(element('match-desc').textContent,'No real climate data');
  assert.match(element('data-source-badge').textContent,/unavailable/);assert.equal(element('btn-run').disabled,false);
});
test('Frontend: invalid coordinates stop before a request; network failure clears stale data',async()=>{
  const {context,element,messages}=browser();let calls=0;
  context.fetch=async()=>{calls++;throw Error('offline');};
  element('inp-lat').value='';element('inp-lon').value='105';
  await vm.runInContext('runAnalysis()',context);assert.equal(calls,0);assert.equal(messages.length,1);
  element('inp-lat').value='10';element('user-rank').textContent='RANK S';
  await vm.runInContext('runAnalysis()',context);assert.equal(calls,1);
  assert.equal(element('user-rank').textContent,'RANK -');assert.match(element('data-source-badge').textContent,/unavailable/);
});
test('Frontend: real zeros display as zero; alerts use text; classical fallback is visible',()=>{
  const {context,element}=browser();
  const row={temp_avg:0,temp_min:0,temp_max:0,rad_avg:0,gwetroot_avg:0,drought_months:0,
    rain_avg:0,rain_total:0,flood_months:0,ts_max:0,esi_avg:0,heat_months:0,ndvi_avg:0,ndvi_min:0,ndvi_max:0,metadata:{}};
  const scenario={rank:'C',overall:0,crop_info:[],soil_hp:0,water_hp:0,profit_hp:0};
  context.response={source:'Controlled fixture',source_status:'climatology',spi:{status:'unavailable'},
    satellite:{POWER:row,SMAP:row,GPM:row,ECOSTRESS:row,MODIS:row},
    scenarios:{baseline:scenario,user:scenario,quantum:{...scenario,fallback_used:true,method:'Exact classical fallback'}},
    alerts:[{msg:'<img src=x onerror=alert(1)>',level:'warning'}],monthly:{},match_pct:null,match_desc:'No comparison'};
  vm.runInContext('updateUI(response)',context);
  assert.equal(element('sv-temp').textContent,'0 °C');assert.equal(element('sv-rain').textContent,'0 mm/mo');
  assert.match(element('q-method').textContent,/Classical fallback/);assert.equal(element('match-score').textContent,'N/A');
  assert.equal(element('alerts-list').children[0].textContent,'<img src=x onerror=alert(1)>');
});
test('Frontend: cold panel displays negative historical minima, event dates and DEM/grid difference',()=>{
  const {context,element}=browser();
  context.response={terrain:{site_elevation_m:1484,grid_elevation_m:3184,high_elevation:false,
    climate_representativeness:'limited_by_elevation_difference'},
    cold_risk:{frost_months:[1],period:{start:'2024-01-01',end:'2024-12-31'},daily_history:{status:'available'},
      months:[{month:1,mean_temperature_c:25,frost_risk:'detected',climatology_tmin_c:0,
        daily:{minimum_tmin_c:-4,freezing_days:1,coldest_date:'2024-01-15',status:'complete'}}]},
    scenarios:{user:{season_results:[{season:1,months:[1,2,3,4],crop:'Rice',reason:'Nguy cơ rét T1; chưa xác nhận cây đã chết',cold_risk:{frost_months:[1]}}]}}};
  vm.runInContext('renderColdRisk(response)',context);
  assert.match(element('terrain-summary').textContent,/1484 m/);assert.match(element('terrain-summary').textContent,/3184 m/);
  assert.match(element('terrain-summary').textContent,/Chênh độ cao/);
  assert.match(element('cold-risk-months').children[0].textContent,/-4°C/);
  assert.match(element('cold-risk-months').children[0].textContent,/2024-01-15/);
  assert.match(element('user-season-risks').children[0].textContent,/Nguy cơ rét T1/);
});
test('Frontend: temperature chart preserves negative values and distinguishes means, minima and zero line',()=>{
  const {context}=browser(),configs=[];
  context.Chart=function(el,config){configs.push(config);this.destroy=()=>{};};
  vm.runInContext(fs.readFileSync('public/js/charts.js','utf8'),context);
  context.monthly={T2M:Array(12).fill(25),TS:Array(12).fill(28),T2M_MIN:Array(12).fill(0),
    T2M_MIN_HISTORY:[-4,...Array(11).fill(8)],RAIN:Array(12).fill(100),GWETROOT:Array(12).fill(.5),NDVI:Array(12).fill(.5)};
  vm.runInContext('buildCharts(monthly)',context);
  const temp=configs[0],minimum=temp.data.datasets.find(d=>d.label.includes('Tmin thấp nhất'));
  assert.equal(minimum.data[0],-4);assert.equal(minimum.spanGaps,false);
  assert.equal(temp.data.datasets.find(d=>d.label==='Mốc 0°C').data[0],0);
  assert.notEqual(temp.options.scales.y.min,0);
});
