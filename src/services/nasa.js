// Lấy dữ liệu NASA POWER, kiểm tra chất lượng (QC), dự phòng vi khí hậu và chỉ số phái sinh (V3)
const { NASA_KEYS } = require("../config/crops");
const { clamp, round, mean, sum } = require("../utils/helpers");
const { classifyCoordinates } = require("../utils/geoClassifier");
const { fetchNasaPointData, fetchNasaMonthlyRainfall, DATA_CATALOG } = require("../algorithms/01_nasa_data_provider");
const { runQualityControl } = require("../algorithms/03_quality_control_preprocessing");
const { generateCalibratedFallback } = require("../algorithms/02_calibrated_simulation_fallback");
const { estimateVegetationProxyFromClimate } = require("../algorithms/06_remote_sensing_indices");
const { validateRainfallHistory } = require("../algorithms/08_anomaly_detection_spi");

/**
 * Mô phỏng vi khí hậu dự phòng chuẩn hóa vật lý
 */
function mockNasa(lat, lon = 105.78) {
  const fallback = generateCalibratedFallback(lat, lon);
  return {
    T2M: fallback.raw.T2M,
    TS: fallback.raw.TS,
    PRECTOTCORR: fallback.raw.PRECTOTCORR,
    ALLSKY_SFC_SW_DWN: fallback.raw.ALLSKY_SFC_SW_DWN,
    GWETTOP: fallback.raw.GWETTOP,
    GWETROOT: fallback.raw.GWETROOT,
    _mock: true,
    _source_description: "DEMO / LOW_CONFIDENCE — unvalidated latitude-only simulation",
    source_status: "demo",
    recommendation_allowed: false,
    _raw_catalog: fallback.data,
    _climate_zone: fallback.climate_zone,
  };
}

/**
 * Lấy dữ liệu từ NASA POWER API thông qua Thuật toán 01 (fetchNasaPointData)
 * kết hợp bộ phân loại địa lý và kiểm soát chất lượng (QC)
 */
async function fetchNasa(lat, lon, { provider = fetchNasaPointData } = {}) {
  const geo = classifyCoordinates(lat, lon);
  if (geo.requires_verification) return {_unavailable:true,source_status:'location_uncertain',recommendation_allowed:false,
    _error:geo.message,location:geo,_raw_catalog:{}};
  if (geo.is_water || geo.is_ice) return { _is_water: geo.is_water, _is_ice: geo.is_ice, message: geo.message };
  try {
    const point = await provider(lat, lon, 15000);
    if (point.is_water || point.is_ice) return { _is_water: point.is_water, _is_ice: point.is_ice, message: point.message };
    const result = { _mock: false, _raw_catalog: {}, _qc: {} };
    result._grid_elevation = point.grid_elevation || {value:null,status:'unavailable'};
    let supplied = 0, interpolated = 0, missing = 0, mockCount = 0, suspectCount = 0;
    for (const key of NASA_KEYS) {
      const records = Array.from({length:12}, (_,i) => point.data?.[key]?.[i] || {value:null,status:'missing'});
      const qc = runQualityControl(records, key, null, {isCyclic:true,maxGap:2,seasonalClimatology:true});
      result[key] = qc.clean_array;
      result._qc[key] = qc.stats;
      result._raw_catalog[key] = qc.series.map((r,i) => ({...records[i],value:r.clean_value,status:r.status,quality:r.quality,
        original_value:r.original_value,original_status:r.original_status || records[i].status,anchors:r.anchors || null,flag:r.flag}));
      supplied += qc.stats.valid_observed;
      interpolated += qc.stats.interpolated_or_filled;
      missing += qc.stats.missing;
      suspectCount += qc.stats.suspect_outliers;
      mockCount += qc.series.filter(r => ['mock','demo'].includes(r.status)).length;
    }
    // Optional cold-risk statistic: never interpolate an extreme or infer it from T2M.
    const minimumRecords=Array.from({length:12},(_,i)=>point.data?.T2M_MIN?.[i] || {value:null,status:'missing'});
    const minimumQC=runQualityControl(minimumRecords,'T2M_MIN',null,{isCyclic:false,maxGap:0});
    result.T2M_MIN=minimumQC.clean_array;
    result._raw_catalog.T2M_MIN=minimumQC.series.map((r,i)=>({...minimumRecords[i],
      variable:'T2M_MIN',value:r.clean_value,status:r.status,quality:r.quality,
      source:minimumRecords[i].source || 'NASA POWER',product:'Minimum temperature climatological statistic',unit:'°C',
      period:point.period || null,limitations:'Climatological aggregation; not an event date or a forecast.'}));
    result.source_status = mockCount ? 'demo' : missing ? 'unavailable' : suspectCount ? 'low_quality' : interpolated ? 'interpolated' : 'climatology';
    result.recommendation_allowed = missing === 0 && mockCount === 0 && suspectCount === 0;
    result._low_quality = suspectCount > 0;
    result._unavailable = missing > 0 || mockCount > 0;
    result._mock = mockCount > 0;
    result._has_interpolated = interpolated > 0;
    result._provenance = {status:result.source_status,source_name:point.source || 'NASA POWER climatology',
      period:point.period || null,supplied_ratio_pct:round(supplied/72*100,1),
      interpolated_count:interpolated,missing_count:missing,mock_count:mockCount,suspect_count:suspectCount,confidence:null,
      limitations:'Grid-cell climatology, not observations of this farm or a forecast. Recommendations are experimental heuristic comparisons.'};
    result._source_description = result._provenance.source_name;
    return result;
  } catch (e) {
    return {_unavailable:true,_mock:false,source_status:'unavailable',recommendation_allowed:false,
      _error:String(e.message || e).slice(0,160),
      _provenance:{status:'unavailable',source_name:'NASA POWER',period:null,confidence:null},_raw_catalog:{}};
  }
}

// Cache only successfully fetched real monthly records, with provenance. Never synthesize history.
const rainfallCache = new Map();
async function fetchRainfallHistory(lat,lon,{provider=fetchNasaMonthlyRainfall,now=new Date()}={}) {
  const end = now.getUTCFullYear()-1, start=end-30;
  const key = [lat,lon,start,end].join(':');
  if (rainfallCache.has(key)) return {...rainfallCache.get(key),cache_used:true};
  try {
    const history = await provider(lat,lon,start,end);
    const validation = validateRainfallHistory(history.records);
    if (!validation.ok || ['mock','demo','synthetic','unavailable'].includes(history.status) || !history.source) {
      throw new Error(validation.reason || 'History must have a real source and usable status');
    }
    const result = {...history,cache_used:false};
    if (rainfallCache.size >= 64) rainfallCache.delete(rainfallCache.keys().next().value);
    rainfallCache.set(key,result);
    return result;
  } catch (e) { return {records:[],status:'unavailable',source:'NASA POWER monthly',reason:String(e.message || e)}; }
}

/**
 * Tính toán các chỉ số phái sinh: NDVI, ESI, EROSION
 */
function computeDerived(data) {
  if (data._is_water || data._is_ice || data._unavailable) return data;

  const { GWETROOT: gwet, PRECTOTCORR: rain, T2M: temp, TS: ts } = data;
  const tempSkin = ts || temp.map(t => t + 3.0);

  const proxy = estimateVegetationProxyFromClimate(gwet, rain, temp, tempSkin);
  data.NDVI = proxy.NDVI;
  data.ESI = proxy.ESI;
  data.EROSION = proxy.EROSION;
  data._derived_meta = proxy.metadata;
  for (const key of ['NDVI','ESI','EROSION']) {
    data._raw_catalog ||= {};
    data._raw_catalog[key] = data[key].map((value, month) => ({
      variable:key,value,month:month+1,status:data._mock ? 'mock' : 'proxy',
      source:'Project empirical climate proxy',product:key + ' proxy',unit:'dimensionless',
      period:data._provenance?.period || null,confidence:null,
      dependencies:['T2M','TS','GWETROOT','PRECTOTCORR'],
      limitations:proxy.metadata.warning
    }));
  }
  return data;
}

/**
 * Xây dựng tóm tắt dữ liệu vệ tinh với đầy đủ siêu dữ liệu khoa học minh bạch
 */
function buildSatelliteSummary(d) {
  if (!d.T2M || !d.GWETROOT || !d.PRECTOTCORR) return {};

  const summary = {
    POWER: {
      source: "NASA POWER / GMAO MERRA-2 Climatology",
      description: "POWER climatology: nhiệt độ MERRA-2 và bức xạ lưới",
      temp_avg: round(mean(d.T2M), 1),
      temp_max: round(Math.max(...d.T2M), 1),
      temp_min: round(Math.min(...d.T2M), 1),
      rad_avg: round(mean(d.ALLSKY_SFC_SW_DWN), 2),
      monthly_T2M: d.T2M,
      monthly_RAD: d.ALLSKY_SFC_SW_DWN,
    },
    SMAP: {
      source: "NASA POWER Land Surface Model (MERRA-2 / Catchment LSM)",
      description: "Tỷ lệ độ ẩm đất tầng rễ và tầng mặt từ mô hình bề mặt đất Catchment LSM",
      gwettop_avg: round(mean(d.GWETTOP), 3),
      gwetroot_avg: round(mean(d.GWETROOT), 3),
      gwetroot_min: round(Math.min(...d.GWETROOT), 3),
      drought_months: d.GWETROOT.filter((v) => v < 0.30).length,
      monthly: d.GWETROOT,
    },
    GPM: {
      source: "NASA POWER / MERRA-2 corrected precipitation",
      description: "Lượng mưa hiệu chỉnh từ POWER/MERRA-2; không phải GPM IMERG",
      rain_avg: round(mean(d.PRECTOTCORR), 1),
      rain_max: round(Math.max(...d.PRECTOTCORR), 1),
      rain_total: round(sum(d.PRECTOTCORR), 0),
      flood_months: d.PRECTOTCORR.filter((v) => v > 150).length,
      monthly: d.PRECTOTCORR,
    },
    ECOSTRESS: {
      source: "NASA POWER Skin Thermal Model (Thermal Proxy for Evaporative Stress)",
      description: "Nhiệt độ bề mặt đất bức xạ và chỉ số bốc thoát hơi nước tương đối (ESI Proxy)",
      ts_avg: round(mean(d.TS), 1),
      ts_max: round(Math.max(...d.TS), 1),
      esi_avg: round(mean(d.ESI), 3),
      heat_months: d.TS.filter((v) => v > 34).length,
      monthly_TS: d.TS,
      monthly_ESI: d.ESI,
    },
    MODIS: {
      source: "Biophysical Vegetation Model (NDVI Proxy from Moisture & Energy)",
      description: "Chỉ số thực vật NDVI phái sinh từ cân bằng ẩm độ và nhiệt độ tán lá",
      ndvi_avg: round(mean(d.NDVI), 3),
      ndvi_max: round(Math.max(...d.NDVI), 3),
      ndvi_min: round(Math.min(...d.NDVI), 3),
      monthly: d.NDVI,
    },
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  };
  const groups = {POWER:['T2M','ALLSKY_SFC_SW_DWN'],SMAP:['GWETROOT','GWETTOP'],GPM:['PRECTOTCORR'],ECOSTRESS:['TS','ESI'],MODIS:['NDVI']};
  for (const [group,keys] of Object.entries(groups)) {
    summary[group].source = group === 'MODIS' ? 'Climate-derived NDVI proxy; no MODIS imagery'
      : group === 'ECOSTRESS' ? 'POWER skin temperature and empirical ESI proxy; no ECOSTRESS imagery'
      : group === 'SMAP' ? 'POWER / MERRA-2 soil wetness model; no SMAP observations'
      : group === 'GPM' ? 'POWER / MERRA-2 corrected precipitation; no GPM IMERG observations' : 'NASA POWER climatology';
    summary[group].status = d._mock ? 'demo' : (group === 'MODIS' ? 'proxy' : d.source_status || 'climatology');
    summary[group].variables = keys;
    summary[group].metadata = Object.fromEntries(keys.map(key => [key,d._raw_catalog?.[key] || {
      variable:key,status:d._mock ? 'mock' : 'proxy',source:'Empirical climate proxy',product:key,unit:'dimensionless',
      period:d._provenance?.period || null,limitations:d._derived_meta?.warning,confidence:null
    }]));
  }
  return summary;
}

module.exports = {
  mockNasa,
  fetchNasa,
  fetchRainfallHistory,
  computeDerived,
  buildSatelliteSummary
};
