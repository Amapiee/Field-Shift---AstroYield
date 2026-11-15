const test = require('node:test');
const assert = require('node:assert/strict');
const {runQualityControl: qc} = require('../src/algorithms/03_quality_control_preprocessing');
const provider = require('../src/algorithms/01_nasa_data_provider');
const {fetchNasa,fetchRainfallHistory} = require('../src/services/nasa');
const {calculateMultiYearSPI,detectEnvironmentalAnomalies,validateRainfallHistory,regularizedGammaP,cdfToStandardNormal} = require('../src/algorithms/08_anomaly_detection_spi');
const {processReflectanceScene} = require('../src/algorithms/06_remote_sensing_indices');
const fixture = require('./fixtures/climates.json')[0];
const keys = Object.keys(provider.DATA_CATALOG);
function point() {
  return {source:'Controlled test fixture',period:{start:1991,end:2020},data:Object.fromEntries(keys.map(k=>[k,(fixture[k] || Array(12).fill(null)).map(v=>provider.createScientificRecord(k,v))]))};
}

test('QC: null, undefined, NaN, infinity, sentinels, blanks and booleans stay missing; real zero survives',()=>{
  const result=qc([1,null,undefined,NaN,Infinity,-Infinity,-999,'',false,0,'3',{value:null}], 'PRECTOTCORR',null,{maxGap:0,isCyclic:false});
  assert.deepEqual(result.clean_array,[1,null,null,null,null,null,null,null,null,0,3,null]);
  assert.equal(result.series[1].status,'missing');
  assert.equal(result.series[9].status,'observed');
});
test('QC: linear gaps use original endpoints and respect maxGap including zero',()=>{
  const raw=[1,null,null,null,9];
  assert.deepEqual(qc(raw,'T2M',null,{isCyclic:false,maxGap:3}).clean_array,[1,3,5,7,9]);
  assert.deepEqual(qc(raw,'T2M',null,{isCyclic:false,maxGap:2}).clean_array,raw);
  const result=qc(raw,'T2M',[10,20,30,40,50],{isCyclic:false,maxGap:2});
  assert.deepEqual(result.clean_array,[1,20,30,40,9]);
  assert.equal(result.series[1].status,'mock');
  assert.equal(qc([1,null,3],'T2M',null,{maxGap:1}).series[1].original_status,'missing');
});
test('QC: cyclic gap across December/January is distance weighted; edges and one anchor are not extrapolated',()=>{
  const raw=[null,null,7,9,11,null];
  assert.deepEqual(qc(raw,'T2M',null,{maxGap:3}).clean_array,[9,8,7,9,11,10]);
  assert.deepEqual(qc(raw,'T2M',null,{maxGap:2}).clean_array,raw);
  assert.deepEqual(qc([null,4,null],'T2M').clean_array,[null,4,null]);
  assert.deepEqual(qc([null,1,3,null],'T2M',null,{isCyclic:false}).clean_array,[null,1,3,null]);
  assert.deepEqual(qc([null,null],'T2M').clean_array,[null,null]);
});
test('POWER parser: metadata, nulls, rain units and radiation conversions come from response',()=>{
  const raw={properties:{parameter:Object.fromEntries(keys.map(k=>[k,Object.fromEntries(provider.MONTH_NAMES.map(m=>[m,k==='PRECTOTCORR'?2:k==='ALLSKY_SFC_SW_DWN'?5:0.5]))]))},parameters:{PRECTOTCORR:{units:'mm/day'},ALLSKY_SFC_SW_DWN:{units:'kW-hr/m^2/day'}},header:{start:'20010101',end:'20201231'}};
  raw.properties.parameter.T2M.JAN=null;
  const result=provider.parseClimatology(raw);
  assert.equal(result.data.T2M[0].value,null);
  assert.equal(result.data.T2M[0].status,'missing');
  assert.equal(result.data.PRECTOTCORR[0].value,62);
  assert.equal(result.data.PRECTOTCORR[1].value,56.5);
  assert.equal(result.data.ALLSKY_SFC_SW_DWN[0].value,18);
  const record=result.data.GWETROOT[0];
  assert.equal(record.status,'climatology');assert.equal(record.underlying_status,'reanalysis');
  assert.equal(record.confidence,null);assert.deepEqual(record.period,{start:'20010101',end:'20201231'});
  assert.match(record.spatial_resolution,/0.625/);
  assert.throws(()=>provider.convertValue('PRECTOTCORR',2,'unknown',30),/units/);
});
test('NASA service: real data, interpolation, missing data and offline failure have separate provenance',async()=>{
  const good=await fetchNasa(10.04,105.78,{provider:async()=>point()});
  assert.equal(good.source_status,'climatology');assert.equal(good._mock,false);
  const partial=point();partial.data.PRECTOTCORR[1].value=null;
  const mixed=await fetchNasa(10.04,105.78,{provider:async()=>partial});
  assert.equal(mixed.source_status,'interpolated');assert.equal(mixed._raw_catalog.PRECTOTCORR[1].status,'interpolated');
  const empty=point();empty.data.GWETROOT=[];
  const missing=await fetchNasa(10.04,105.78,{provider:async()=>empty});
  assert.equal(missing.source_status,'unavailable');assert.equal(missing.recommendation_allowed,false);
  assert.ok(missing.GWETROOT.every(v=>v===null));
  const offline=await fetchNasa(10.04,105.78,{provider:async()=>{throw Error('offline fixture');}});
  assert.equal(offline.source_status,'unavailable');assert.equal(offline.T2M,undefined);assert.equal(offline._mock,false);
  const mock=point();mock.data.T2M[0].status='mock';
  assert.equal((await fetchNasa(10.04,105.78,{provider:async()=>mock})).recommendation_allowed,false);
});
test('Monthly rainfall loader: dated real records, leap years, failed history and cache provenance',async()=>{
  const parsed={properties:{parameter:{PRECTOTCORR:{202002:2}}},parameters:{PRECTOTCORR:{units:'mm/day'}}};
  const h=provider.parseMonthlyRainfall(parsed,2020,2020);
  assert.equal(h.records[1].rain_mm,58);assert.equal(h.records[0].rain_mm,null);
  const unavailable=await fetchRainfallHistory(10.1,105.1,{provider:async()=>{throw Error('offline');}});
  assert.equal(unavailable.status,'unavailable');assert.deepEqual(unavailable.records,[]);
  let calls=0;
  const records=Array.from({length:372},(_,i)=>({year:1995+Math.floor(i/12),month:i%12+1,rain_mm:10+i%100}));
  const fake=async()=>{calls++;return {records,status:'reanalysis',source:'Controlled history fixture'};};
  const now=new Date('2026-11-14T00:00:00Z');
  await fetchRainfallHistory(10.2,105.2,{provider:fake,now});
  const cached=await fetchRainfallHistory(10.2,105.2,{provider:fake,now});
  assert.equal(calls,1);assert.equal(cached.cache_used,true);assert.equal(cached.source,'Controlled history fixture');
});
test('SPI: no climatology-to-history synthesis; incomplete, duplicated or degenerate histories are unavailable',()=>{
  const missing=detectEnvironmentalAnomalies(fixture);
  assert.equal(missing.spi_status,'unavailable');assert.equal(missing.multi_year_history_length,0);
  assert.ok(missing.spi_details.every(r=>r.spi_value===null && r.spi_1m===null));
  const records=Array.from({length:372},(_,i)=>({year:1995+Math.floor(i/12),month:i%12+1,rain_mm:100}));
  assert.equal(detectEnvironmentalAnomalies(fixture,records).spi_status,'unavailable');
  records[22]={...records[21]};assert.equal(validateRainfallHistory(records).ok,false);
  records[22]={year:1996,month:11,rain_mm:null};assert.equal(validateRainfallHistory(records).ok,false);
});
test('Gamma CDF and normal transform match analytic reference values',()=>{
  // Erlang integer-shape CDF has a closed form independent of the implementation's series/continued fraction.
  for(const shape of [1,2,3,5]) for(const x of [.1,1,3,10]) {
    let sum=1,term=1;for(let k=1;k<shape;k++){term*=x/k;sum+=term;}
    assert.ok(Math.abs(regularizedGammaP(shape,x)-(1-Math.exp(-x)*sum))<1e-10);
  }
  for(const [p,z] of [[.5,0],[.025,-1.959963984540054],[.975,1.959963984540054],[.158655253931457,-1]]) {
    assert.ok(Math.abs(cdfToStandardNormal(p)-z)<.0005);
  }
});
test('SPI-1 and SPI-3 agree with an independent numerical integration reference on dated fixture',()=>{
  // Deterministic synthetic rainfall is used only as a mathematical fixture, never as real history.
  const records=Array.from({length:31*12},(_,i)=>({year:1995+Math.floor(i/12),month:i%12+1,
    rain_mm:20+(i%12)*7+((Math.floor(i/12)*17)%31)*5}));
  // Simpson quadrature and bisection invert the normal CDF; no production gamma/normal code is reused.
  function integrate(f,a,b,n=12000){let sum=f(a)+f(b);for(let i=1;i<n;i++)sum+=(i%2?4:2)*f(a+(b-a)*i/n);return sum*(b-a)/(3*n);}
  for(const scale of [1,3]) {
    const result=calculateMultiYearSPI(records,scale),idx=records.length-6;
    const samples=[];
    for(let i=scale-1;i<records.length;i++) if(records[i].month===records[idx].month) samples.push(records.slice(i-scale+1,i+1).reduce((s,r)=>s+r.rain_mm,0));
    const mean=samples.reduce((a,b)=>a+b)/samples.length;
    const A=Math.log(mean)-samples.reduce((s,x)=>s+Math.log(x),0)/samples.length;
    const alpha=(1+Math.sqrt(1+4*A/3))/(4*A),beta=mean/alpha;
    const x=result[idx].accum_rain/beta;
    // The gamma normalization cancels in this ratio; integration range covers the full positive mass.
    const density=t=>t===0?0:Math.exp((alpha-1)*Math.log(t)-t);
    const p=integrate(density,0,x)/integrate(density,0,alpha+20*Math.sqrt(alpha)+50);
    const normal=z=>integrate(t=>Math.exp(-t*t/2)/Math.sqrt(2*Math.PI),-10,z,2000);
    let lo=-8,hi=8;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(normal(mid)<p)lo=mid;else hi=mid;}
    assert.ok(Math.abs(result[idx].spi-(lo+hi)/2)<.011,`SPI-${scale} reference mismatch`);
    assert.equal(result[0].spi,scale===3?null:result[0].spi);
  }
});
test('Spectral processing requires matching reflectance and product QA; cloudy/nodata pixels remain null',()=>{
  const pixel={nir:.6,red:.1,blue:.05,swir1:.2};
  const scene={product:'SENTINEL2_L2A',qa_product:'SENTINEL2_SCL',processing_level:'surface_reflectance',source:'Controlled spectral fixture',date:'2020-01-01',pixels:[pixel,pixel,pixel],qa:[4,9,null]};
  const result=processReflectanceScene(scene);
  assert.equal(result.pixels[0].NDVI,.714);assert.equal(result.pixels[1].NDVI,null);assert.equal(result.pixels[2].status,'missing_qa');
  assert.throws(()=>processReflectanceScene({...scene,qa_product:'LANDSAT_C2'}),/matching/);
  assert.throws(()=>processReflectanceScene({...scene,qa:undefined}),/matching/);
});
test('Product QA fixtures distinguish cloud, cirrus, shadow, snow, water and unknown codes',()=>{
  const {maskCloudByProduct:mask}=require('../src/algorithms/05_cloud_masking_qa');
  assert.equal(mask(8,'MOD09GA').usable_for_agriculture,true); // land, clear
  assert.equal(mask(0,'MOD09GA').is_water,true); // shallow ocean
  for(const bit of [2,8,10,12,13,15]) assert.equal(mask(8|(1<<bit),'MOD09GA').usable_for_agriculture,false);
  for(const bit of [0,1,2,3,4,5,7]) assert.equal(mask(1<<bit,'LANDSAT_C2').usable_for_agriculture,false);
  for(const code of [0,1,3,6,8,9,10,11]) assert.equal(mask(code,'SENTINEL2_SCL').usable_for_agriculture,false);
  assert.equal(mask(5,'SENTINEL2_SCL').usable_for_agriculture,true);
  assert.throws(()=>mask(null,'MOD09GA'),/missing/);
  assert.throws(()=>mask(0,'MODIS'),/Unrecognized/);
});
