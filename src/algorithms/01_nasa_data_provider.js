// NASA POWER provider: climatological means and monthly history are separate products.
const https = require('node:https');
const { classifyCoordinates } = require('../utils/geoClassifier');
const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DAYS_IN_MONTH = [31,28.25,31,30,31,30,31,31,30,31,30,31];
const DATA_CATALOG = Object.fromEntries([
  ['T2M','2m air temperature','°C'], ['TS','Surface skin temperature','°C'],
  ['T2M_MIN','2m minimum air temperature (climatological statistic)','°C'],
  ['PRECTOTCORR','Bias-corrected precipitation','mm/month'],
  ['ALLSKY_SFC_SW_DWN','Surface shortwave radiation','MJ/m²/day'],
  ['GWETTOP','Surface soil wetness','dimensionless (0-1)'],
  ['GWETROOT','Root zone soil wetness','dimensionless (0-1)']
].map(([key,product,unit]) => [key, {
  source: key === 'ALLSKY_SFC_SW_DWN' ? 'NASA POWER / CERES SYN1deg' : 'NASA POWER / MERRA-2',
  product, unit,
  spatial_resolution: key === 'ALLSKY_SFC_SW_DWN' ? '1° latitude x 1° longitude' : '0.5° latitude x 0.625° longitude (native MERRA-2)',
  processing_level: key === 'ALLSKY_SFC_SW_DWN' ? 'Satellite-derived gridded climatology' : 'Reanalysis / land surface model climatology',
  description: product,
  limitations: 'Grid-cell climatological mean; not a field observation or a seasonal forecast. Soil wetness is not measured volumetric water content.'
}]));
function createScientificRecord(key, value, status = 'climatology', quality = 'valid', extra = {}) {
  const meta = DATA_CATALOG[key] || {source:'Unknown',product:key,unit:'unknown'};
  return {variable:key,value,...meta,status,quality,period:null,climatology_period:null,
    confidence:null,confidence_note:'No calibrated probability of accuracy is available.',...extra};
}
function requestJson(url, timeoutMs = 15000) {
  return new Promise((resolve,reject) => {
    const req = https.get(url,{timeout:timeoutMs},res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); reject(new Error(`NASA POWER HTTP ${res.statusCode}`)); return;
      }
      let body = '';
      res.on('data',chunk => { body += chunk; });
      res.on('error',reject);
      res.on('end',() => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error',reject);
    req.on('timeout',() => req.destroy(new Error('NASA POWER request timed out')));
  });
}
function validRaw(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > -900 ? n : null;
}
// Read response units rather than assuming the same units for every POWER community.
function convertValue(key,value,unit,days) {
  const n = validRaw(value);
  if (n === null) return null;
  const u = String(unit || '').toLowerCase().replace(/\s/g,'');
  if (key === 'PRECTOTCORR') {
    if (['mm/day','mm/d'].includes(u)) return n * days;
    if (['mm/month','mm'].includes(u)) return n;
    throw new Error(`Unsupported precipitation units: ${unit}`);
  }
  if (key === 'ALLSKY_SFC_SW_DWN') {
    if (u.includes('kw-hr') || u.includes('kwh')) return n * 3.6;
    if (u.includes('mj')) return n;
    if (u === 'w/m^2' || u === 'w/m2') return n * 0.0864;
    throw new Error(`Unsupported radiation units: ${unit}`);
  }
  return n;
}
function parseClimatology(parsed) {
  const raw = parsed?.properties?.parameter;
  if (!raw) throw new Error('NASA POWER response has no parameters');
  let period = parsed.header?.start && parsed.header?.end
    ? {start:parsed.header.start,end:parsed.header.end} : null;
  // Current climatology responses can put the reference period only in a message.
  if(!period && Array.isArray(parsed.messages))for(const note of parsed.messages){
    const m=String(note).match(/climatological period\s*\(([A-Za-z]+)\s+(\d{4})\s*[-–]\s*([A-Za-z]+)\s+(\d{4})\)/i);
    if(m){
      const first=MONTH_NAMES.indexOf(m[1].slice(0,3).toUpperCase())+1,last=MONTH_NAMES.indexOf(m[3].slice(0,3).toUpperCase())+1;
      if(first && last){period={start:`${m[2]}-${String(first).padStart(2,'0')}`,end:`${m[4]}-${String(last).padStart(2,'0')}`,source:'NASA response message'};break;}
    }
  }
  const data = {};
  for (const key of Object.keys(DATA_CATALOG)) {
    const unit = parsed.parameters?.[key]?.units;
    data[key] = MONTH_NAMES.map((name,m) => {
      const value = convertValue(key,raw[key]?.[name] ?? raw[key]?.[String(m+1).padStart(2,'0')],unit,DAYS_IN_MONTH[m]);
      return createScientificRecord(key,value,value === null ? 'missing' : 'climatology',value === null ? 'invalid' : 'valid',{
        month:m+1,month_name:name,period,climatology_period:period,
        original_unit:unit || null,notes:parsed.messages || [],
        underlying_status:key === 'ALLSKY_SFC_SW_DWN' ? 'satellite_derived' : 'reanalysis',
        request_sources:parsed.header?.sources || []
      });
    });
  }
  const elevation = validRaw(parsed.geometry?.coordinates?.[2]);
  return {source:'NASA POWER climatology',data,period,
    grid_elevation:{value:elevation,unit:'m',status:elevation===null?'unavailable':'model_grid',
      source:'NASA POWER response geometry',limitations:'Model grid elevation, not a surveyed field elevation.'}};
}
async function fetchNasaPointData(lat,lon,timeoutMs = 15000,request = requestJson) {
  const geo = classifyCoordinates(lat,lon);
  if (!geo.can_cultivate) return {is_water:geo.is_water,is_ice:geo.is_ice,message:geo.message};
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${Object.keys(DATA_CATALOG).join(',')}&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
  return {...parseClimatology(await request(url,timeoutMs)),coordinates:{lat,lon}};
}
function parseMonthlyRainfall(parsed,startYear,endYear) {
  const raw = parsed?.properties?.parameter?.PRECTOTCORR;
  if (!raw) throw new Error('NASA monthly response has no precipitation');
  const records = [];
  for (let year=startYear;year<=endYear;year++) for(let month=1;month<=12;month++) {
    const days = new Date(Date.UTC(year,month,0)).getUTCDate();
    records.push({year,month,date:`${year}-${String(month).padStart(2,'0')}-01`,rain_mm:convertValue('PRECTOTCORR',raw[`${year}${String(month).padStart(2,'0')}`],parsed.parameters?.PRECTOTCORR?.units,days)});
  }
  return {records,source:'NASA POWER monthly PRECTOTCORR / MERRA-2',status:'reanalysis',unit:'mm/month',period:{start:startYear,end:endYear}};
}
async function fetchNasaMonthlyRainfall(lat,lon,startYear,endYear,timeoutMs = 15000,request = requestJson) {
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=${startYear}&end=${endYear}&format=JSON`;
  return parseMonthlyRainfall(await request(url,timeoutMs),startYear,endYear);
}
function parseDailyTemperature(parsed,startYear,endYear) {
  const raw=parsed?.properties?.parameter;
  if (!raw?.T2M_MIN) throw new Error('NASA daily response has no T2M_MIN');
  for (const key of ['T2M_MIN','T2M']) {
    const unit=parsed.parameters?.[key]?.units;
    if (unit && !['c','°c','degc'].includes(unit.toLowerCase())) throw new Error(`Unsupported temperature units: ${unit}`);
  }
  const records=[];
  for(let t=Date.UTC(startYear,0,1);t<Date.UTC(endYear+1,0,1);t+=86400000) {
    const date=new Date(t).toISOString().slice(0,10),key=date.replaceAll('-','');
    const minimum=validRaw(raw.T2M_MIN[key]),mean=validRaw(raw.T2M?.[key]);
    records.push({date,year:Number(date.slice(0,4)),month:Number(date.slice(5,7)),
      tmin_c:minimum!==null && minimum>=-100 && minimum<=65 ? minimum : null,
      tmean_c:mean!==null && mean>=-100 && mean<=65 ? mean : null});
  }
  return {records,status:'reanalysis',source:'NASA POWER daily / MERRA-2',unit:'°C',
    period:{start:`${startYear}-01-01`,end:`${endYear}-12-31`},time_standard:'LST',
    limitations:'Historical grid-cell reanalysis; not a forecast or proof of frost/crop death at the field.'};
}
async function fetchNasaDailyTemperature(lat,lon,startYear,endYear,timeoutMs=15000,request=requestJson) {
  const url=`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MIN,T2M&community=AG&longitude=${lon}&latitude=${lat}&start=${startYear}0101&end=${endYear}1231&time-standard=LST&format=JSON`;
  return parseDailyTemperature(await request(url,timeoutMs),startYear,endYear);
}
module.exports = {DATA_CATALOG,MONTH_NAMES,DAYS_IN_MONTH,createScientificRecord,requestJson,convertValue,parseClimatology,parseMonthlyRainfall,fetchNasaPointData,fetchNasaMonthlyRainfall,parseDailyTemperature,fetchNasaDailyTemperature};
