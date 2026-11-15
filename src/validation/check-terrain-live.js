// Explicit online check of real NASA climatology, temperature history and SRTM.
// Not imported by tests and never used as replacement data at runtime.
const fs=require('node:fs');
const path=require('node:path');
const {classifyCoordinates}=require('../utils/geoClassifier');
const {fetchNasaPointData}=require('../algorithms/01_nasa_data_provider');
const {fetchNasa}=require('../services/nasa');
const {fetchColdHistory,fetchElevation,assessColdRisk,describeTerrain}=require('../services/coldRisk');
async function main(){
  const points=[['Thailand screenshot',13.7532,101.6945],['Can Tho',10.04,105.78],['Alpine valley Zermatt',46.0207,7.7491]];
  const results=await Promise.all(points.map(async([name,lat,lon])=>{
    const [point,daily,elevation]=await Promise.all([
      fetchNasaPointData(lat,lon).catch(e=>({error:e.message || e.code})),
      fetchColdHistory(lat,lon),fetchElevation(lat,lon)
    ]);
    const climate=await fetchNasa(lat,lon,{provider:async()=>{if(point.error)throw Error(point.error);return point;}});
    const cold=assessColdRisk(climate,daily);
    return {name,lat,lon,location:classifyCoordinates(lat,lon).type,climate_status:climate.source_status,
      climate_error:point.error || null,period:point.period || null,qc:climate._qc,
      climatology_values:Object.fromEntries(Object.entries(point.data || {}).map(([key,records])=>[key,records.map(r=>r.value)])),
      flagged_records:Object.entries(climate._raw_catalog || {}).flatMap(([variable,records])=>records
        .filter(r=>(r.flag && r.flag!=='valid') || r.value===null).map(r=>({variable,month:r.month,value:r.value,flag:r.flag}))),
      daily_status:daily.status,daily_reason:daily.reason,terrain:describeTerrain(climate,elevation),
      frost_months:cold.frost_months,unknown_cold_months:cold.unknown_months,
      monthly_minima:cold.months.map(m=>({month:m.month,climatology_tmin_c:m.climatology_tmin_c,daily_tmin_c:m.daily?.minimum_tmin_c ?? null}))};
  }));
  const output={checked_at:new Date().toISOString(),kind:'Live sourced smoke check, not a runtime fallback',results};
  fs.writeFileSync(path.join(__dirname,'terrain-live-check.json'),JSON.stringify(output,null,2)+'\n');
  for(const r of results)console.log(JSON.stringify({name:r.name,location:r.location,climate:r.climate_status,error:r.climate_error,
    daily:r.daily_status,elevation:r.terrain.site_elevation_m,grid:r.terrain.grid_elevation_m,frost_months:r.frost_months,
    missing_months:r.unknown_cold_months,flagged:r.flagged_records}));
  if(results.some(r=>r.climate_error))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message || e.code);process.exitCode=1;});
