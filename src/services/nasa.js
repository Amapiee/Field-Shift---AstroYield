// Lấy dữ liệu NASA POWER, mock dự phòng (deterministic theo toạ độ),
// tính chỉ số phái sinh NDVI / ESI / DRI / FRI.
const { NASA_KEYS } = require("../config/crops");
const {
  clamp, round, mean, sum, maxOf, minOf, THRESHOLDS,
} = require("../utils/helpers");
const { debug, timer } = require("../utils/logger");

// NASA POWER trả PRECTOTCORR theo mm/NGÀY → chuẩn hoá về mm/THÁNG
// để khớp ngưỡng cảnh báo (THRESHOLDS.FLOOD_RAIN_MM = 160 mm/tháng).
const MM_PER_MONTH = 30.44;

// ── PRNG deterministic (mulberry32) ────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromCoords(lat, lon) {
  const a = Math.floor((lat + 90) * 1000);
  const b = Math.floor((lon + 180) * 1000);
  return ((a * 73856093) ^ (b * 19349663)) >>> 0;
}

function mockNasa(lat, lon = 0) {
  const absLat = Math.abs(lat);
  const isSouthern = lat < 0;
  const tropical = absLat < 23.5;
  const temperate = absLat >= 23.5 && absLat < 55;

  const baseTemp = tropical ? 30 : temperate ? 20 : 5;
  const baseRain = tropical ? 130 : temperate ? 60 : 20;    // mm/tháng
  const baseGwet = tropical ? 0.65 : temperate ? 0.5 : 0.35;
  const baseRad = tropical ? 18.0 : temperate ? 15.0 : 9.0;

  const phase = isSouthern ? Math.PI : 0;
  const months = [...Array(12).keys()];
  const w = (m) => (2 * Math.PI * m) / 12;

  // RNG deterministic theo lat/lon → cùng farm luôn cho cùng mock data
  const rand = mulberry32(seedFromCoords(lat, lon));
  const rnd = (a, b) => a + rand() * (b - a);

  const T2M = months.map((m) => round(baseTemp + 4.0 * Math.sin(w(m) - phase + 0.5) + rnd(-0.5, 0.5), 1));
  const TS = T2M.map((t) => round(t + 3.5 + rnd(-0.5, 0.8), 1));
  const RAIN = months.map((m) => round(clamp(baseRain + 60 * Math.sin(w(m) - phase) + rnd(-10, 15), 5, 350), 1));
  const RAD = months.map((m) => round(clamp(baseRad + 3.5 * Math.sin(w(m) - phase + 0.3) + rnd(-0.5, 0.5), 6, 25), 2));
  const GWET_TOP = months.map((m) => round(clamp(baseGwet + 0.12 * Math.sin(w(m) - phase + 0.8) + rnd(-0.03, 0.03), 0.15, 0.95), 3));
  const GWET_ROOT = GWET_TOP.map((g) => round(clamp(g - 0.05 + rnd(-0.02, 0.02), 0.12, 0.92), 3));

  return {
    T2M, TS, PRECTOTCORR: RAIN, ALLSKY_SFC_SW_DWN: RAD,
    GWETTOP: GWET_TOP, GWETROOT: GWET_ROOT, _mock: true,
  };
}

function validateCoords(lat, lon) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`lat không hợp lệ: ${lat}`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(`lon không hợp lệ: ${lon}`);
  }
}

// ── In-memory cache (key theo ô 0.1° ≈ 11km) ──
const CACHE_TTL_MS     = 3_600_000;  // 1h — data thật
const CACHE_ERR_TTL_MS =   120_000;  // 2 phút — mock do lỗi, để retry sớm
const cache = new Map();
const CACHE_MAX = 500;

function cacheKey(lat, lon) {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}
function cacheGet(k) {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() - e.t > (e.ttl ?? CACHE_TTL_MS)) { cache.delete(k); return null; }
  return e.v;
}
function cacheSet(k, v, ttl) {
  cache.set(k, { t: Date.now(), v, ttl });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); // LRU thô
}

async function fetchNasa(lat, lon) {
  validateCoords(lat, lon);

  const ck = cacheKey(lat, lon);
  const hit = cacheGet(ck);
  if (hit) {
    debug("nasa cache hit", ck);
    return { ...hit, _cached: true };
  }

  const url =
    "https://power.larc.nasa.gov/api/temporal/climatology/point" +
    `?parameters=${NASA_KEYS.join(",")}&community=AG&longitude=${lon.toFixed(4)}` +
    `&latitude=${lat.toFixed(4)}&format=JSON`;

  const done = timer("nasa fetch");
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const raw  = (await r.json()).properties.parameter;
    const mock = mockNasa(lat, lon); // luôn tạo sẵn để lấp -999
    const result = {};
    let patched = 0, total = 0;

    for (const key of NASA_KEYS) {
      result[key] = [];
      for (let m = 1; m <= 12; m++) {
        total++;
        const code = String(m).padStart(2, "0");
        const v = raw[key]?.[code];
        const bad =
          v === undefined || v === null || v <= -900 ||
          (v === 0 && ["T2M", "TS", "PRECTOTCORR"].includes(key));

        if (bad) {
          patched++;
          result[key].push(mock[key][m - 1]);
        } else {
          let n = Number(v);
          if (key === "PRECTOTCORR") n *= MM_PER_MONTH; // mm/ngày → mm/tháng
          result[key].push(round(n, 3));
        }
      }
    }

    result._mock    = false;
    result._patched = patched;
    result._source  = patched === 0 ? "live" : patched >= total ? "mock" : "hybrid";
    done(`source=${result._source} patched=${patched}/${total}`);
    cacheSet(ck, result);
    return result;
  } catch (e) {
    done(`error=${e.message}`);
    debug("nasa fallback to mock:", e.message);
    const data = mockNasa(lat, lon);
    data._error   = String(e.message || e).slice(0, 80);
    data._patched = NASA_KEYS.length * 12;
    data._source  = "mock";
    cacheSet(ck, data, CACHE_ERR_TTL_MS);
    return data;
  }
}

function computeDerived(data) {
  const gwet = data.GWETROOT || [];
  const rain = data.PRECTOTCORR || [];
  const temp = data.T2M || [];
  const rad  = data.ALLSKY_SFC_SW_DWN || [];

  // 1. Công thức Hargreaves-Samani tính Bốc thoát hơi nước tham chiếu ET0 (mm/tháng)
  // ET0 = 0.0023 * R_a * (T_mean + 17.8) * sqrt(T_max - T_min)
  // Sử dụng Bức xạ ALLSKY_SFC_SW_DWN (MJ/m2/day)
  data.ET0 = temp.map((t, i) => {
    const r = rad[i] || 15.0;
    const et0_daily = 0.0023 * (r * 0.408) * (t + 17.8) * Math.sqrt(Math.max(t * 0.3, 2.0));
    return round(clamp(et0_daily * 30.44, 10, 300), 2);
  });

  // 2. NDVI phái sinh dựa trên năng lượng & nước khả dụng
  data.NDVI = gwet.map((g, i) => {
    const waterAvailability = clamp(g + (rain[i] / (data.ET0[i] + 1e-6)), 0, 1);
    return round(clamp(0.1 + 0.75 * waterAvailability - 0.002 * Math.max(temp[i] - 25, 0), 0.05, 0.95), 3);
  });

  // 3. ESI (Evaporative Stress Index) = Nước thực tế / Nhu cầu ET0
  data.ESI = gwet.map((g, i) => round(clamp(g / (data.ET0[i] / 150.0 + 1e-6), 0.05, 0.98), 3));

  // 4. Rủi ro xói mòn đất (RUSLE Rain-Erosivity Factor R-proxy)
  data.EROSION = rain.map((r) => round(clamp((r * r) / 12000.0, 0, 1), 3));

  // 5. DRI (Drought Risk Index) & FRI (Flood Risk Index)
  const tMin = minOf(temp), tMax = maxOf(temp);
  const tRange = tMax - tMin || 1;
  data.DRI = temp.map((t, i) => {
    const dryness = 1 - (gwet[i] ?? 0);
    const heat = (t - tMin) / tRange;
    return round(clamp(0.6 * dryness + 0.4 * heat, 0, 1), 3);
  });

  const rMax = maxOf(rain) || 1;
  data.FRI = rain.map((r, i) => {
    const saturation = clamp((gwet[i] ?? 0) / 0.85, 0, 1);
    return round(clamp(0.7 * (r / rMax) + 0.3 * saturation, 0, 1), 3);
  });

  return data;
}

function buildSatelliteSummary(d) {
  const T   = THRESHOLDS;
  const dri = Array.isArray(d.DRI) ? d.DRI : [];
  const fri = Array.isArray(d.FRI) ? d.FRI : [];
  return {
    POWER: {
      temp_avg: round(mean(d.T2M), 1),
      temp_max: round(maxOf(d.T2M), 1),
      temp_min: round(minOf(d.T2M), 1),
      rad_avg:  round(mean(d.ALLSKY_SFC_SW_DWN), 2),
      monthly_T2M: d.T2M,
      monthly_RAD: d.ALLSKY_SFC_SW_DWN,
    },
    SMAP: {
      gwettop_avg:   round(mean(d.GWETTOP), 3),
      gwetroot_avg:  round(mean(d.GWETROOT), 3),
      gwetroot_min:  round(minOf(d.GWETROOT), 3),
      drought_months: (d.GWETROOT || []).filter((v) => v < T.DROUGHT_GWET).length,
      monthly: d.GWETROOT,
    },
    GPM: {
      rain_avg:    round(mean(d.PRECTOTCORR), 1),
      rain_max:    round(maxOf(d.PRECTOTCORR), 1),
      rain_total:  round(sum(d.PRECTOTCORR), 0),
      flood_months: (d.PRECTOTCORR || []).filter((v) => v > T.FLOOD_RAIN_MM).length,
      monthly: d.PRECTOTCORR,
    },
    ECOSTRESS: {
      ts_avg: round(mean(d.TS), 1),
      ts_max: round(maxOf(d.TS), 1),
      esi_avg: round(mean(d.ESI), 3),
      heat_months: (d.TS || []).filter((v) => v > T.HEAT_TS_C).length,
      monthly_TS:  d.TS,
      monthly_ESI: d.ESI,
    },
    MODIS: {
      ndvi_avg: round(mean(d.NDVI), 3),
      ndvi_max: round(maxOf(d.NDVI), 3),
      ndvi_min: round(minOf(d.NDVI), 3),
      monthly:  d.NDVI,
    },
    // ── Rủi ro thiên tai (chỉ HẠN và LŨ, theo yêu cầu đề tài) ──
    RISK: {
      dri_avg: round(mean(dri), 3),
      dri_max: round(maxOf(dri), 3),
      fri_avg: round(mean(fri), 3),
      fri_max: round(maxOf(fri), 3),
      drought_months: dri.map((v, i) => (v > 0.6 ? i + 1 : null)).filter((x) => x !== null),
      flood_months:   fri.map((v, i) => (v > 0.7 ? i + 1 : null)).filter((x) => x !== null),
    },
    months: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  };
}

module.exports = { mockNasa, fetchNasa, computeDerived, buildSatelliteSummary};
