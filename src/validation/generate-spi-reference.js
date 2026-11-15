// Explicit online reference generation. Not imported by the application or offline test suite.
// jStat is evaluated without Node/process/require bindings; only generated numeric references are stored.
const https=require('node:https');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {fetchNasaMonthlyRainfall}=require('../algorithms/01_nasa_data_provider');
function getText(url){return new Promise((resolve,reject)=>{
  const req=https.get(url,{timeout:15000},res=>{if(res.statusCode!==200){res.resume();reject(Error('Reference download HTTP '+res.statusCode));return;}
    let s='';res.on('data',chunk=>s+=chunk);res.on('error',reject);res.on('end',()=>resolve(s));});
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Reference download timed out')));
});}
async function main(){
  const url='https://cdn.jsdelivr.net/npm/jstat@1.9.6/dist/jstat.min.js';
  const [code,history]=await Promise.all([getText(url),fetchNasaMonthlyRainfall(10.04,105.78,1995,2025)]);
  if(history.records.length!==372 || history.records.some(r=>!Number.isFinite(r.rain_mm) || r.rain_mm<0))throw Error('Incomplete real monthly rainfall fixture');
  const context=vm.createContext({});vm.runInContext(code,context,{timeout:1000});const jStat=context.jStat;
  if(!jStat?.gamma?.cdf || !jStat?.normal?.inv)throw Error('Missing reference distribution functions');
  const expected=[];
  for(const timescale of [1,3,6]){
    const accumulated=history.records.map((_,i)=>i<timescale-1?null:history.records.slice(i-timescale+1,i+1).reduce((a,r)=>a+r.rain_mm,0));
    for(let i=history.records.length-12;i<history.records.length;i++){
      const samples=accumulated.filter((v,j)=>v!==null && history.records[j].month===history.records[i].month);
      const positive=samples.filter(v=>v>0),q=1-positive.length/samples.length;
      const mean=jStat.mean(positive),A=Math.log(mean)-jStat.mean(positive.map(Math.log));
      const alpha=(1+Math.sqrt(1+4*A/3))/(4*A),beta=mean/alpha;
      const probability=accumulated[i]===0?q:q+(1-q)*jStat.gamma.cdf(accumulated[i],alpha,beta);
      expected.push({year:history.records[i].year,month:history.records[i].month,timescale,
        spi:jStat.normal.inv(probability,0,1),accum_rain_mm:accumulated[i]});
    }
  }
  const result={kind:'real_reanalysis_fixture_with_external_numeric_reference',coordinates:{lat:10.04,lon:105.78},
    fetched_at:new Date().toISOString(),source:history.source,status:history.status,period:history.period,unit:history.unit,
    reference:{library:'jStat 1.9.6',url,sha256:crypto.createHash('sha256').update(code).digest('hex'),
      functions:['gamma.cdf','normal.inv'],fit:'Thom gamma shape approximation fitted separately by ending calendar month',
      scope:'Numerical SPI transform comparison; not independent field validation or out-of-sample calibration'},
    records:history.records,expected};
  fs.writeFileSync(path.join(__dirname,'spi-real-reference.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({records:history.records.length,expected_values:expected.length,source:history.source,reference:result.reference.library}));
}
if(require.main===module)main().catch(e=>{console.error(e.message || e.code || String(e));process.exitCode=1;});
module.exports={main};
