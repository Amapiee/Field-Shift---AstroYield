const { NASA_KEYS } = require("../config/crops");
const { debug, timer } = require("../utils/logger");
const { classifyCoordinates } = require("../utils/geoClassifier");
const {
  DATA_CATALOG,
  createScientificRecord,
  fetchNasaPointData,
  fetchNasaMonthlyRainfall,
} = require("../algorithms/01_nasa_data_provider");
const { runQualityControl } = require("../algorithms/03_quality_control_preprocessing");
const { generateCalibratedFallback } = require("../algorithms/02_calibrated_simulation_fallback");
const { estimateVegetationProxyFromClimate } = require("../algorithms/06_remote_sensing_indices");
const { validateRainfallHistory } = require("../algorithms/08_anomaly_detection_spi");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THRESHOLDS = Object.freeze({
  DROUGHT_GWET: 0.33,
  FLOOD_RAIN_MM: 160,
  HEAT_TS_C: 34,
});
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 0) => {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const finiteValues = (values) => Array.isArray(values) ? values.filter(Number.isFinite) : [];
const mean = (values) => {
  const valid = finiteValues(values);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
};
const sum = (values) => finiteValues(values).reduce((total, value) => total + value, 0);
const maxOf = (values) => {
  const valid = finiteValues(values);
  return valid.length ? Math.max(...valid) : null;
};
const minOf = (values) => {
  const valid = finiteValues(values);
  return valid.length ? Math.min(...valid) : null;
};

function validateCoords(lat, lon) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`lat không hợp lệ: ${lat}`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(`lon không hợp lệ: ${lon}`);
  }
}

function mockNasa(lat, lon = 105.78) {
  validateCoords(lat, lon);
  const fallback = generateCalibratedFallback(lat, lon);
  const data = Object.fromEntries(NASA_KEYS.map((key) => [key, fallback.raw[key].slice()]));
  data._mock = true;
  data._source_description = fallback.source;
  data.source_status = "demo";
  data.recommendation_allowed = false;
  data.limitations = fallback.limitations;
  data._raw_catalog = fallback.data;
  data._climate_zone = fallback.climate_zone;
  data._provenance = {
    status: "demo",
    source_name: fallback.source,
    period: null,
    confidence: null,
    limitations: fallback.limitations,
  };
  return data;
}

async function fetchNasa(lat, lon, { provider = fetchNasaPointData } = {}) {
  validateCoords(lat, lon);
  const geo = classifyCoordinates(lat, lon);
  if (geo.requires_verification) {
    return {
      _unavailable: true,
      source_status: "location_uncertain",
      recommendation_allowed: false,
      _error: geo.message,
      location: geo,
      _raw_catalog: {},
    };
  }
  if (geo.is_water || geo.is_ice) {
    return {
      _is_water: geo.is_water,
      _is_ice: geo.is_ice,
      source_status: "location_invalid",
      recommendation_allowed: false,
      message: geo.message,
      location: geo,
    };
  }

  const done = timer("nasa fetch and QC");
  try {
    const point = await provider(lat, lon, 15000);
    if (point?.is_water || point?.is_ice) {
      return {
        _is_water: point.is_water,
        _is_ice: point.is_ice,
        source_status: "location_invalid",
        recommendation_allowed: false,
        message: point.message,
      };
    }
    if (!point || !point.data) throw new Error(point?.message || "NASA provider returned no climate data");

    const result = {
      _mock: false,
      _raw_catalog: {},
      _qc: {},
      _grid_elevation: point.grid_elevation || { value: null, status: "unavailable" },
    };
    let supplied = 0;
    let interpolated = 0;
    let missing = 0;
    let mockCount = 0;
    let suspectCount = 0;

    for (const key of NASA_KEYS) {
      const records = Array.from({ length: 12 }, (_, index) => {
        const record = point.data[key]?.[index];
        return record === undefined || record === null ? { value: null, status: "missing" } : record;
      });
      const qc = runQualityControl(records, key, null, {
        isCyclic: true,
        maxGap: 2,
        seasonalClimatology: true,
      });
      result[key] = qc.clean_array;
      result._qc[key] = qc.stats;
      result._raw_catalog[key] = qc.series.map((record, index) => ({
        ...records[index],
        value: record.clean_value,
        status: record.status,
        quality: record.quality,
        original_value: record.original_value,
        original_status: record.original_status || records[index].status,
        anchors: record.anchors || null,
        flag: record.flag,
      }));
      supplied += qc.stats.valid_observed;
      interpolated += qc.stats.interpolated_or_filled;
      missing += qc.stats.missing;
      suspectCount += qc.stats.suspect_outliers;
      mockCount += qc.series.filter((record) => ["mock", "demo"].includes(record.status)).length;
    }

    const minimumRecords = Array.from({ length: 12 }, (_, index) => {
      const record = point.data.T2M_MIN?.[index];
      return record === undefined || record === null ? { value: null, status: "missing" } : record;
    });
    const minimumQC = runQualityControl(minimumRecords, "T2M_MIN", null, { isCyclic: false, maxGap: 0 });
    result.T2M_MIN = minimumQC.clean_array;
    result._raw_catalog.T2M_MIN = minimumQC.series.map((record, index) => ({
      ...minimumRecords[index],
      variable: "T2M_MIN",
      value: record.clean_value,
      status: record.status,
      quality: record.quality,
      original_value: record.original_value,
      original_status: record.original_status || minimumRecords[index].status,
      source: minimumRecords[index].source || "NASA POWER",
      product: "Minimum temperature climatological statistic",
      unit: "°C",
      period: point.period || null,
      limitations: "Climatological aggregation; not an event date or a forecast.",
    }));

    result.source_status = mockCount
      ? "demo"
      : missing
        ? "unavailable"
        : suspectCount
          ? "low_quality"
          : interpolated
            ? "interpolated"
            : "climatology";
    result.recommendation_allowed = missing === 0 && mockCount === 0 && suspectCount === 0;
    result._low_quality = suspectCount > 0;
    result._unavailable = missing > 0 || mockCount > 0;
    result._mock = mockCount > 0;
    result._has_interpolated = interpolated > 0;
    result._provenance = {
      status: result.source_status,
      source_name: point.source || "NASA POWER climatology",
      period: point.period || null,
      supplied_ratio_pct: round((supplied / (NASA_KEYS.length * 12)) * 100, 1),
      interpolated_count: interpolated,
      missing_count: missing,
      mock_count: mockCount,
      suspect_count: suspectCount,
      confidence: null,
      limitations: "Grid-cell climatology, not field observations or a seasonal forecast. Recommendations are experimental heuristic comparisons.",
    };
    result._source_description = result._provenance.source_name;
    done(`source=${result.source_status} missing=${missing} interpolated=${interpolated}`);
    return result;
  } catch (error) {
    done(`error=${error.message}`);
    debug("nasa data unavailable:", error.message);
    return {
      _unavailable: true,
      _mock: false,
      source_status: "unavailable",
      recommendation_allowed: false,
      _error: String(error.message || error).slice(0, 160),
      _provenance: {
        status: "unavailable",
        source_name: "NASA POWER",
        period: null,
        confidence: null,
      },
      _raw_catalog: {},
    };
  }
}

const rainfallCache = new Map();
async function fetchRainfallHistory(lat, lon, { provider = fetchNasaMonthlyRainfall, now = new Date() } = {}) {
  validateCoords(lat, lon);
  const end = now.getUTCFullYear() - 1;
  const start = end - 30;
  const key = [lat, lon, start, end].join(":");
  if (rainfallCache.has(key)) return { ...rainfallCache.get(key), cache_used: true };

  try {
    const history = await provider(lat, lon, start, end);
    const validation = validateRainfallHistory(history?.records);
    if (!validation.ok || ["mock", "demo", "synthetic", "unavailable"].includes(history?.status) || !history?.source) {
      throw new Error(validation.reason || "History must have a real source and usable status");
    }
    const result = { ...history, cache_used: false };
    if (rainfallCache.size >= 64) rainfallCache.delete(rainfallCache.keys().next().value);
    rainfallCache.set(key, result);
    return result;
  } catch (error) {
    return {
      records: [],
      status: "unavailable",
      source: "NASA POWER monthly",
      reason: String(error.message || error),
    };
  }
}

function computeDerived(data) {
  if (!data || data._is_water || data._is_ice || data._unavailable) return data;

  const gwet = Array.isArray(data.GWETROOT) ? data.GWETROOT : [];
  const rain = Array.isArray(data.PRECTOTCORR) ? data.PRECTOTCORR : [];
  const temp = Array.isArray(data.T2M) ? data.T2M : [];
  const skinTemp = Array.isArray(data.TS) ? data.TS : [];
  const radiation = Array.isArray(data.ALLSKY_SFC_SW_DWN) ? data.ALLSKY_SFC_SW_DWN : [];
  const hasMonthInputs = (month) => (
    Number.isFinite(gwet[month]) &&
    Number.isFinite(rain[month]) &&
    Number.isFinite(temp[month])
  );
  const safe = (values) => Array.from({ length: 12 }, (_, month) => (
    Number.isFinite(values[month]) ? values[month] : 0
  ));
  const safeSkinTemp = Array.from({ length: 12 }, (_, month) => (
    Number.isFinite(skinTemp[month])
      ? skinTemp[month]
      : Number.isFinite(temp[month]) ? temp[month] + 3 : 0
  ));
  const proxy = estimateVegetationProxyFromClimate(
    safe(gwet),
    safe(rain),
    safe(temp),
    safeSkinTemp
  );
  const nullMissing = (values) => values.map((value, month) => hasMonthInputs(month) ? value : null);

  data.NDVI = nullMissing(proxy.NDVI);
  data.NDVI_PROXY = data.NDVI;
  data.ESI = nullMissing(proxy.ESI);
  data.ESI_PROXY = data.ESI;
  data.EROSION = nullMissing(proxy.EROSION);
  data.EROSION_PROXY = data.EROSION;

  data.ET0 = Array.from({ length: 12 }, (_, month) => {
    const t = temp[month];
    const rad = radiation[month];
    if (!Number.isFinite(t) || !Number.isFinite(rad)) return null;
    const dailyEstimate = 0.0023 * (rad * 0.408) * (t + 17.8) * Math.sqrt(Math.max(t * 0.3, 2));
    return round(clamp(dailyEstimate * 30.44, 10, 300), 2);
  });

  const validTemps = finiteValues(temp);
  const minTemp = validTemps.length ? Math.min(...validTemps) : null;
  const maxTemp = validTemps.length ? Math.max(...validTemps) : null;
  const tempRange = minTemp === null || maxTemp === null ? null : maxTemp - minTemp || 1;
  const validRain = finiteValues(rain);
  const maxRain = validRain.length ? Math.max(...validRain) || 1 : null;
  data.DRI = Array.from({ length: 12 }, (_, month) => {
    if (!hasMonthInputs(month) || tempRange === null) return null;
    const dryness = 1 - gwet[month];
    const heat = (temp[month] - minTemp) / tempRange;
    return round(clamp(0.6 * dryness + 0.4 * heat, 0, 1), 3);
  });
  data.FRI = Array.from({ length: 12 }, (_, month) => {
    if (!Number.isFinite(rain[month]) || !Number.isFinite(gwet[month]) || maxRain === null) return null;
    const saturation = clamp(gwet[month] / 0.85, 0, 1);
    return round(clamp(0.7 * (rain[month] / maxRain) + 0.3 * saturation, 0, 1), 3);
  });

  data._derived_meta = {
    ...proxy.metadata,
    ET0: "Legacy empirical temperature/radiation estimate; not a station measurement.",
    DRI: "Relative drought-risk index derived from wetness and temperature; not a forecast.",
    FRI: "Relative flood-risk index derived from rainfall and wetness; not a flood forecast.",
  };
  data._raw_catalog ||= {};
  const derivedMetadata = {
    ET0: {
      source: "NASA POWER temperature/radiation heuristic",
      product: "Monthly reference evapotranspiration estimate",
      unit: "mm/month",
      dependencies: ["T2M", "ALLSKY_SFC_SW_DWN"],
    },
    NDVI: {
      source: "Climate-derived vegetation proxy; no MODIS imagery",
      product: "NDVI proxy",
      unit: "dimensionless",
      dependencies: ["T2M", "TS", "GWETROOT", "PRECTOTCORR"],
    },
    ESI: {
      source: "POWER skin-temperature and wetness proxy; no ECOSTRESS imagery",
      product: "ESI proxy",
      unit: "dimensionless",
      dependencies: ["T2M", "TS", "GWETROOT", "PRECTOTCORR"],
    },
    EROSION: {
      source: "Climate-derived erosion-risk proxy",
      product: "RUSLE R-factor proxy",
      unit: "dimensionless",
      dependencies: ["NDVI", "PRECTOTCORR"],
    },
    DRI: {
      source: "Relative climate-derived drought-risk index",
      product: "DRI proxy",
      unit: "dimensionless",
      dependencies: ["T2M", "GWETROOT"],
    },
    FRI: {
      source: "Relative climate-derived flood-risk index",
      product: "FRI proxy",
      unit: "dimensionless",
      dependencies: ["PRECTOTCORR", "GWETROOT"],
    },
  };
  for (const [key, metadata] of Object.entries(derivedMetadata)) {
    data._raw_catalog[key] = data[key].map((value, index) => ({
      variable: key,
      value,
      month: index + 1,
      status: value === null ? "missing" : data._mock ? "demo" : "proxy",
      ...metadata,
      period: data._provenance?.period || null,
      confidence: null,
      limitations: key === "NDVI" || key === "ESI" ? proxy.metadata.warning : data._derived_meta[key],
    }));
  }
  return data;
}

function groupMetadata(data, keys) {
  return Object.fromEntries(keys.map((key) => [key, data._raw_catalog?.[key] || []]));
}

function buildSatelliteSummary(data) {
  if (!Array.isArray(data?.T2M) || !Array.isArray(data?.GWETROOT) || !Array.isArray(data?.PRECTOTCORR)) {
    return {};
  }
  const status = data._mock ? "demo" : data.source_status || "climatology";
  const summary = {
    POWER: {
      source: data._provenance?.source_name || "NASA POWER climatology",
      description: "Gridded air temperature and surface radiation climatology; not a field observation.",
      temp_avg: round(mean(data.T2M), 1),
      temp_max: round(maxOf(data.T2M), 1),
      temp_min: round(minOf(data.T2M), 1),
      rad_avg: round(mean(data.ALLSKY_SFC_SW_DWN), 2),
      monthly_T2M: data.T2M,
      monthly_RAD: data.ALLSKY_SFC_SW_DWN,
      status,
      variables: ["T2M", "ALLSKY_SFC_SW_DWN"],
      metadata: groupMetadata(data, ["T2M", "ALLSKY_SFC_SW_DWN"]),
    },
    SMAP: {
      source: "NASA POWER / MERRA-2 soil wetness model; not SMAP observations",
      description: "Modeled surface and root-zone wetness; not measured volumetric soil moisture.",
      gwettop_avg: round(mean(data.GWETTOP), 3),
      gwetroot_avg: round(mean(data.GWETROOT), 3),
      gwetroot_min: round(minOf(data.GWETROOT), 3),
      drought_months: finiteValues(data.GWETROOT).filter((value) => value < THRESHOLDS.DROUGHT_GWET).length,
      monthly: data.GWETROOT,
      status,
      variables: ["GWETROOT", "GWETTOP"],
      metadata: groupMetadata(data, ["GWETROOT", "GWETTOP"]),
    },
    GPM: {
      source: "NASA POWER / MERRA-2 corrected precipitation; not GPM IMERG observations",
      description: "Corrected gridded precipitation, reported as monthly totals.",
      rain_avg: round(mean(data.PRECTOTCORR), 1),
      rain_max: round(maxOf(data.PRECTOTCORR), 1),
      rain_total: round(sum(data.PRECTOTCORR), 0),
      flood_months: finiteValues(data.PRECTOTCORR).filter((value) => value > THRESHOLDS.FLOOD_RAIN_MM).length,
      monthly: data.PRECTOTCORR,
      status,
      variables: ["PRECTOTCORR"],
      metadata: groupMetadata(data, ["PRECTOTCORR"]),
    },
    ECOSTRESS: {
      source: "NASA POWER skin temperature and empirical ESI proxy; no ECOSTRESS imagery",
      description: "Thermal and evaporative-stress proxies derived from gridded climate inputs.",
      ts_avg: round(mean(data.TS), 1),
      ts_max: round(maxOf(data.TS), 1),
      esi_avg: round(mean(data.ESI), 3),
      heat_months: finiteValues(data.TS).filter((value) => value > THRESHOLDS.HEAT_TS_C).length,
      monthly_TS: data.TS,
      monthly_ESI: data.ESI,
      status: data.ESI ? (data._mock ? "demo" : "proxy") : status,
      variables: ["TS", "ESI"],
      metadata: groupMetadata(data, ["TS", "ESI"]),
    },
    MODIS: {
      source: "Climate-derived vegetation proxy; no MODIS imagery",
      description: "NDVI proxy estimated from temperature, wetness and precipitation.",
      ndvi_avg: round(mean(data.NDVI), 3),
      ndvi_max: round(maxOf(data.NDVI), 3),
      ndvi_min: round(minOf(data.NDVI), 3),
      monthly: data.NDVI,
      status: data.NDVI ? (data._mock ? "demo" : "proxy") : status,
      variables: ["NDVI"],
      metadata: groupMetadata(data, ["NDVI"]),
    },
    RISK: {
      dri_avg: round(mean(data.DRI), 3),
      dri_max: round(maxOf(data.DRI), 3),
      fri_avg: round(mean(data.FRI), 3),
      fri_max: round(maxOf(data.FRI), 3),
      drought_months: (data.DRI || []).map((value, index) => value > 0.6 ? index + 1 : null).filter((month) => month !== null),
      flood_months: (data.FRI || []).map((value, index) => value > 0.7 ? index + 1 : null).filter((month) => month !== null),
      description: "Relative heuristic indices; not forecasts or calibrated probabilities.",
    },
    months: MONTHS,
  };
  return summary;
}

module.exports = {
  mockNasa,
  fetchNasa,
  fetchRainfallHistory,
  computeDerived,
  buildSatelliteSummary,
};
