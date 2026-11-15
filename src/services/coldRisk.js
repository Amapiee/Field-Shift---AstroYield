// Historical frost screening, not a forecast or a diagnosis of actual plant mortality.
const {requestJson,fetchNasaDailyTemperature}=require('../algorithms/01_nasa_data_provider');
const dailyCache=new Map(),elevationCache=new Map();
function remember(cache,key,value){if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,value);return value;}
async function fetchColdHistory(lat,lon,{provider=fetchNasaDailyTemperature,now=new Date()}={}) {
  const end=now.getUTCFullYear()-1,start=end-4,key=[lat,lon,start,end].join(':');
  if(dailyCache.has(key))return {...dailyCache.get(key),cache_used:true};
  try {
    const result=await provider(lat,lon,start,end);
    if(result.status!=='reanalysis' || !result.source || !Array.isArray(result.records) || !result.records.length ||
        result.period?.start!==`${start}-01-01` || result.period?.end!==`${end}-12-31` || summarizeDailyHistory(result).status==='unavailable')
      throw new Error('No sourced daily temperature history');
    return remember(dailyCache,key,{...result,cache_used:false});
  }catch(e){return {records:[],status:'unavailable',reason:e.message,source:'NASA POWER daily T2M_MIN'};}
}
function parseElevation(response,lat,lon) {
  const r=response?.results?.[0];
  if(response?.status!=='OK' || r?.dataset!=='srtm90m' || !Number.isFinite(r.elevation) ||
      r.elevation < -500 || r.elevation>9000 || !Number.isFinite(r.location?.lat) || !Number.isFinite(r.location?.lng) ||
      Math.abs(r.location.lat-lat)>.001 || Math.abs(r.location.lng-lon)>.001) throw new Error('SRTM elevation unavailable or mismatched location');
  return {value:r.elevation,unit:'m',status:'dem',source:'NASA/NGA SRTM v3 via Open Topo Data',
    product:'srtm90m',spatial_resolution:'3 arc-seconds (~90 m at equator)',
    period:'SRTM acquisition February 2000',vertical_reference:'SRTM elevation above sea level',
    limitations:'DEM pixel elevation, not a ground survey. No slope, snow cover or lapse-rate correction is inferred.'};
}
async function fetchElevation(lat,lon,{request=requestJson}={}) {
  const key=[lat,lon].join(':');
  if(elevationCache.has(key))return {...elevationCache.get(key),cache_used:true};
  // Conservative NASA SRTM acquisition bounds; no invented elevation outside coverage.
  if(lat < -56 || lat > 60)return {value:null,status:'unavailable',reason:'Outside nominal SRTM coverage',source:'NASA/NGA SRTM'};
  try{return remember(elevationCache,key,{...parseElevation(await request(`https://api.opentopodata.org/v1/srtm90m?locations=${lat},${lon}`,8000),lat,lon),cache_used:false});}
  catch(e){return {value:null,status:'unavailable',reason:e.message,source:'NASA/NGA SRTM via Open Topo Data'};}
}
function describeTerrain(data,elevation={value:null,status:'unavailable'}) {
  const site=elevation.status==='dem' && Number.isFinite(elevation.value) ? elevation.value : null;
  const grid=Number.isFinite(data._grid_elevation?.value) ? data._grid_elevation.value : null;
  const difference=site!==null && grid!==null ? site-grid : null;
  return {status:site!==null?'dem':grid!==null?'model_grid_only':'unavailable',
    site_elevation_m:site,grid_elevation_m:grid,elevation_difference_m:difference,
    high_elevation:site===null ? null : site>=2000,
    high_elevation_label_threshold_m:2000,
    elevation,grid_elevation:data._grid_elevation || null,
    climate_representativeness:difference!==null && Math.abs(difference)>=500 ? 'limited_by_elevation_difference' : 'unverified_at_field',
    limitations:'2000 m is a descriptive UI threshold, not a crop viability limit. Elevation alone does not prove freezing, steep slopes, snow or glaciers. POWER grid temperatures are not adjusted to the DEM height.'};
}
function summarizeDailyHistory(history) {
  if(history?.status!=='reanalysis' || !history.source || !Array.isArray(history.records) || !history.period)
    return {status:'unavailable',reason:history?.reason || 'No dated daily reanalysis',months:[]};
  const start=Date.parse(history.period.start),end=Date.parse(history.period.end);
  if(!Number.isFinite(start) || !Number.isFinite(end) || end<start || end-start>366*10*86400000)
    return {status:'unavailable',reason:'Invalid daily history period',months:[]};
  const byDate=new Map();
  for(const r of history.records){
    const t=Date.parse(r.date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !Number.isFinite(t) || new Date(t).toISOString().slice(0,10)!==r.date ||
        t<start || t>end || byDate.has(r.date))return {status:'unavailable',reason:'Invalid or duplicate daily dates',months:[]};
    // Sentinel and impossible values stay missing. Do not interpolate daily extremes.
    byDate.set(r.date,Number.isFinite(r.tmin_c) && r.tmin_c>=-100 && r.tmin_c<=65 ? r.tmin_c : null);
  }
  const months=Array.from({length:12},(_,i)=>({month:i+1,expected_days:0,valid_days:0,missing_days:0,
    freezing_days:0,years_with_freezing:[],minimum_tmin_c:null,coldest_date:null,longest_freezing_run_days:0}));
  let run=0,lastMonth=-1;
  for(let t=start;t<=end;t+=86400000){
    const date=new Date(t).toISOString().slice(0,10),month=Number(date.slice(5,7))-1,year=Number(date.slice(0,4)),r=months[month],v=byDate.get(date);
    r.expected_days++;
    if(Number.isFinite(v)){
      r.valid_days++;
      if(r.minimum_tmin_c===null || v<r.minimum_tmin_c){r.minimum_tmin_c=v;r.coldest_date=date;}
      if(v<0){r.freezing_days++;if(!r.years_with_freezing.includes(year))r.years_with_freezing.push(year);
        run=lastMonth===month ? run+1 : 1;r.longest_freezing_run_days=Math.max(r.longest_freezing_run_days,run);
      }else run=0;
    }else{r.missing_days++;run=0;}
    lastMonth=month;
  }
  for(const r of months){
    r.coverage_pct=r.expected_days ? Math.round(r.valid_days/r.expected_days*1000)/10 : 0;
    r.status=r.expected_days && r.valid_days===r.expected_days ? 'complete' : r.valid_days ? 'partial' : 'unavailable';
  }
  return {status:months.every(r=>r.status==='complete')?'available':months.some(r=>r.valid_days)?'partial':'unavailable',
    months,period:history.period,source:history.source,time_standard:history.time_standard || 'LST',
    limitations:'Counts are historical reanalysis days with 2m air Tmin below 0°C. They do not measure frost on leaves, hours below a threshold, crop death or forecast probability.'};
}
function assessColdRisk(data,history=null) {
  const daily=summarizeDailyHistory(history);
  const months=Array.from({length:12},(_,i)=>{
    const mean=Number.isFinite(data.T2M?.[i])?data.T2M[i]:null;
    const min=Number.isFinite(data.T2M_MIN?.[i])?data.T2M_MIN[i]:null;
    const r=daily.months[i];
    const evidence=[];
    if(r?.freezing_days>0)evidence.push('daily_reanalysis_below_zero');
    if(min!==null && min<0)evidence.push('climatological_minimum_below_zero');
    if(mean!==null && mean<0)evidence.push('monthly_mean_below_zero');
    const screened=r?.status==='complete' || min!==null;
    return {month:i+1,mean_temperature_c:mean,climatology_tmin_c:min,
      daily:r || null,frost_risk:evidence.length?'detected':screened?'not_detected_in_available_data':'unknown',
      evidence,mortality_confirmed:false};
  });
  const known=months.filter(m=>m.frost_risk!=='unknown').length;
  return {status:known===12?'available':known?'partial':'unavailable',
    climatology_period:data._provenance?.period || null,
    source:daily.status!=='unavailable'?daily.source:'NASA POWER climatology screening',
    period:daily.status!=='unavailable'?daily.period:data._provenance?.period || null,
    daily_history:daily,months,
    frost_months:months.filter(m=>m.frost_risk==='detected').map(m=>m.month),
    unknown_months:months.filter(m=>m.frost_risk==='unknown').map(m=>m.month),
    mortality_confirmed:false,forecast:false,
    policy:'Conservative screening for unprotected frost-sensitive crops across each full four-month season; not a calibrated yield-loss estimate.',
    limitations:'A positive monthly/seasonal average does not rule out freezing nights. No detected event is not a safety guarantee. Damage depends on crop, cultivar, growth stage and local conditions.'};
}
function seasonColdExposure(data,months) {
  const risk=data._cold_risk || assessColdRisk(data);
  const records=months.map(i=>risk.months[i]);
  return {months:months.map(i=>i+1),frost_months:records.filter(r=>r.frost_risk==='detected').map(r=>r.month),
    unknown_months:records.filter(r=>r.frost_risk==='unknown').map(r=>r.month),
    evidence:records.filter(r=>r.frost_risk==='detected'),mortality_confirmed:false};
}
function coldRiskAlerts(risk,terrain) {
  const alerts=[];
  if(risk.frost_months.length){
    const details=risk.months.filter(m=>m.frost_risk==='detected').map(m=>{
      if(m.daily?.freezing_days)return `T${m.month}: Tmin ${m.daily.minimum_tmin_c.toFixed(1)}°C, ${m.daily.freezing_days} ngày dưới 0°C trong lịch sử`;
      return `T${m.month}: ${m.climatology_tmin_c!==null ? 'Tmin khí hậu '+m.climatology_tmin_c.toFixed(1) : 'nhiệt độ TB '+m.mean_temperature_c.toFixed(1)}°C`;
    }).join('; ');
    alerts.push({level:'danger',msg:`Băng giá / nguy cơ rét: ${details}. Cây nhạy rét có thể bị tổn thương hoặc chết; chưa xác nhận thiệt hại tại ruộng và đây không phải dự báo.`});
  }
  if(risk.unknown_months.length)alerts.push({level:'warning',msg:`Chưa đủ dữ liệu nhiệt độ tối thiểu để đánh giá rét ở ${risk.unknown_months.map(m=>'T'+m).join(', ')}; nhiệt độ trung bình dương không chứng minh không có sương giá.`});
  if(terrain?.high_elevation)alerts.push({level:'warning',msg:`Địa hình cao: SRTM khoảng ${Math.round(terrain.site_elevation_m)} m. Nguy cơ rét được xét bằng nhiệt độ, không suy ra cây chết hoặc sông băng chỉ từ độ cao.`});
  if(terrain?.climate_representativeness==='limited_by_elevation_difference')alerts.push({level:'warning',msg:`Độ cao SRTM lệch ô khí hậu POWER khoảng ${Math.round(Math.abs(terrain.elevation_difference_m))} m; nhiệt độ lưới có thể không đại diện đúng vi khí hậu tại ruộng. Cần số đo địa phương; chưa tự hiệu chỉnh nhiệt độ.`});
  return alerts;
}
module.exports={fetchColdHistory,parseElevation,fetchElevation,describeTerrain,summarizeDailyHistory,assessColdRisk,seasonColdExposure,coldRiskAlerts};
