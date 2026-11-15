// Explicit online smoke check. Never part of the offline test suite.
const {fetchNasaPointData}=require('../src/algorithms/01_nasa_data_provider');
const {fetchColdHistory,fetchElevation,assessColdRisk,describeTerrain}=require('../src/services/coldRisk');
const {fetchNasa}=require('../src/services/nasa');
const fs=require('node:fs');
(async()=>{
  const lat=30.49,lon=79.13;
  const results=await Promise.allSettled([
    fetchNasaPointData(lat,lon),fetchColdHistory(lat,lon),fetchElevation(lat,lon)
  ]);
  const point=results[0].status==='fulfilled'?results[0].value:null;
  const daily=results[1].status==='fulfilled'?results[1].value:{status:'unavailable',reason:results[1].reason.message};
  const elevation=results[2].status==='fulfilled'?results[2].value:{status:'unavailable',reason:results[2].reason.message};
  const data=point ? await fetchNasa(lat,lon,{provider:async()=>point}) : null;
  const output={kind:'live_source_smoke_check',coordinates:{lat,lon},checked_at:new Date().toISOString(),
    climatology:data?.source_status || 'unavailable',climatology_error:results[0].status==='rejected'?results[0].reason.message:null,
    daily_status:daily.status,daily_error:daily.reason || null,elevation,
    climatology_messages:point?.data?.T2M?.[0]?.notes || [],
    cold_risk:data?assessColdRisk(data,daily):null,terrain:data?describeTerrain(data,elevation):null};
  fs.writeFileSync('docs/live-cold-check.json',JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({coordinates:output.coordinates,climatology:output.climatology,daily_status:output.daily_status,
    daily_error:output.daily_error,climatology_error:output.climatology_error,elevation_status:elevation.status,
    site_elevation_m:output.terrain?.site_elevation_m,grid_elevation_m:output.terrain?.grid_elevation_m,
    elevation_difference_m:output.terrain?.elevation_difference_m,frost_months:output.cold_risk?.frost_months,
    saved:'docs/live-cold-check.json'},null,2));
  if(!data || data._unavailable || daily.status==='unavailable' || elevation.status==='unavailable')process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
