// Lấy dữ liệu NASA POWER, mock dự phòng, tính chỉ số phái sinh (NDVI/ESI)
const { NASA_KEYS } = require("../config/crops");
const { clamp, round, uniform, mean, sum } = require("../utils/helpers");

function mockNasa(lat /*, lon */) {
  const absLat = Math.abs(lat);
  const isSouthern = lat < 0;
  const tropical = absLat < 23.5;
  const temperate = absLat >= 23.5 && absLat < 55;

  const baseTemp = tropical ? 30 : temperate ? 20 : 5;
  const baseRain = tropical ? 130 : temperate ? 60 : 20;
  const baseGwet = tropical ? 0.65 : temperate ? 0.5 : 0.35;
  const baseRad = tropical ? 18.0 : temperate ? 15.0 : 9.0;

  const phase = isSouthern ? Math.PI : 0;
  const months = [...Array(12).keys()];
  const w = (m) => (2 * Math.PI * m) / 12;

  const T2M = months.map((m) => round(baseTemp + 4.0 * Math.sin(w(m) - phase + 0.5) + uniform(-0.5, 0.5), 1));
  const TS = T2M.map((t) => round(t + 3.5 + uniform(-0.5, 0.8), 1));
  const RAIN = months.map((m) => round(clamp(baseRain + 60 * Math.sin(w(m) - phase) + uniform(-10, 15), 5, 350), 1));
  const RAD = months.map((m) => round(clamp(baseRad + 3.5 * Math.sin(w(m) - phase + 0.3) + uniform(-0.5, 0.5), 6, 25), 2));
  const GWET_TOP = months.map((m) => round(clamp(baseGwet + 0.12 * Math.sin(w(m) - phase + 0.8) + uniform(-0.03, 0.03), 0.15, 0.95), 3));
  const GWET_ROOT = GWET_TOP.map((g) => round(clamp(g - 0.05 + uniform(-0.02, 0.02), 0.12, 0.92), 3));

  return {
    T2M, TS, PRECTOTCORR: RAIN, ALLSKY_SFC_SW_DWN: RAD,
    GWETTOP: GWET_TOP, GWETROOT: GWET_ROOT, _mock: true,
  };
}

async function fetchNasa(lat, lon) {
  const url =
    "https://power.larc.nasa.gov/api/temporal/climatology/point" +
    `?parameters=${NASA_KEYS.join(",")}&community=AG&longitude=${lon.toFixed(4)}` +
    `&latitude=${lat.toFixed(4)}&format=JSON`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(18000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = (await r.json()).properties.parameter;
    const mock = mockNasa(lat, lon); // dùng để lấp chỗ trống (-999)
    const result = {};

    for (const key of NASA_KEYS) {
      result[key] = [];
      for (let m = 1; m <= 12; m++) {
        const v = raw[key]?.[String(m).padStart(2, "0")];
        const bad =
          v === undefined || v === null || v <= -900 ||
          (v === 0 && ["T2M", "TS", "PRECTOTCORR"].includes(key));
        result[key].push(bad ? mock[key][m - 1] : round(Number(v), 3));
      }
    }
    result._mock = false;
    return result;
  } catch (e) {
    const data = mockNasa(lat, lon);
    data._error = String(e.message || e).slice(0, 80);
    return data;
  }
}

function computeDerived(data) {
  const { GWETROOT: gwet, PRECTOTCORR: rain, T2M: temp } = data;
  data.NDVI = gwet.map((g, i) => round(clamp(0.28 + 0.42 * g + 0.001 * rain[i] - 0.0035 * (temp[i] - 20), 0.05, 0.95), 3));
  data.ESI = gwet.map((g, i) => round(clamp(0.88 * g - 0.009 * (temp[i] - 25) + 0.0008 * rain[i], 0.05, 0.98), 3));
  data.EROSION = rain.map((r) => round(clamp(r / 220.0, 0, 1), 3));
  return data;
}

function buildSatelliteSummary(d) {
  return {
    POWER: {
      temp_avg: round(mean(d.T2M), 1),
      temp_max: round(Math.max(...d.T2M), 1),
      temp_min: round(Math.min(...d.T2M), 1),
      rad_avg: round(mean(d.ALLSKY_SFC_SW_DWN), 2),
      monthly_T2M: d.T2M,
      monthly_RAD: d.ALLSKY_SFC_SW_DWN,
    },
    SMAP: {
      gwettop_avg: round(mean(d.GWETTOP), 3),
      gwetroot_avg: round(mean(d.GWETROOT), 3),
      gwetroot_min: round(Math.min(...d.GWETROOT), 3),
      drought_months: d.GWETROOT.filter((v) => v < 0.35).length,
      monthly: d.GWETROOT,
    },
    GPM: {
      rain_avg: round(mean(d.PRECTOTCORR), 1),
      rain_max: round(Math.max(...d.PRECTOTCORR), 1),
      rain_total: round(sum(d.PRECTOTCORR), 0),
      flood_months: d.PRECTOTCORR.filter((v) => v > 150).length,
      monthly: d.PRECTOTCORR,
    },
    ECOSTRESS: {
      ts_avg: round(mean(d.TS), 1),
      ts_max: round(Math.max(...d.TS), 1),
      esi_avg: round(mean(d.ESI), 3),
      heat_months: d.TS.filter((v) => v > 34).length,
      monthly_TS: d.TS,
      monthly_ESI: d.ESI,
    },
    MODIS: {
      ndvi_avg: round(mean(d.NDVI), 3),
      ndvi_max: round(Math.max(...d.NDVI), 3),
      ndvi_min: round(Math.min(...d.NDVI), 3),
      monthly: d.NDVI,
    },
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  };
}

module.exports = { mockNasa, fetchNasa, computeDerived, buildSatelliteSummary };
