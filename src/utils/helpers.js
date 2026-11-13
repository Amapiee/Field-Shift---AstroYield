const THRESHOLDS = Object.freeze({
  FLOOD_RAIN_MM:      160,   // mm/tháng — rủi ro lũ / ngập úng
  FALLOW_EROSION_MM:  100,   // mm/tháng — bỏ trống + mưa nhiều → xói mòn
  DROUGHT_GWET:       0.33,  // GWETROOT dưới ngưỡng → cảnh báo hạn
  DROUGHT_GWET_CRIT:  0.38,  // dùng trong scoring: cây háo nước + đất khô
  HEAT_TS_C:          34,    // TS vượt ngưỡng → stress nhiệt
});

const clamp = (v, lo, hi) => {
  if (lo > hi) [lo, hi] = [hi, lo]; // defensive: không âm thầm trả lo
  return Math.max(lo, Math.min(hi, v));
};

const round = (v, d = 0) => {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

const uniform = (a, b) => a + Math.random() * (b - a);

// mean / sum bỏ qua phần tử không hữu hạn → không bao giờ trả NaN
const mean = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let s = 0, n = 0;
  for (const v of arr) if (Number.isFinite(v)) { s += v; n++; }
  return n ? s / n : 0;
};

const sum = (arr) => {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const v of arr) if (Number.isFinite(v)) s += v;
  return s;
};

const meanAt = (arr, idx) => {
  if (!Array.isArray(arr) || !Array.isArray(idx)) return 0;
  const vals = [];
  for (const i of idx) {
    const v = arr[i];
    if (Number.isFinite(v)) vals.push(v);
  }
  return mean(vals);
};

const maxOf = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let m = -Infinity;
  for (const v of arr) if (Number.isFinite(v) && v > m) m = v;
  return Number.isFinite(m) ? m : 0;
};

const minOf = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let m = Infinity;
  for (const v of arr) if (Number.isFinite(v) && v < m) m = v;
  return Number.isFinite(m) ? m : 0;
};

// num: null/undefined/"" → def (KHÔNG coi là 0 như trước)
const num = (v, def = 0) => {
  if (v === null || v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

function argmax(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < arr.length; i++) {
    if (Number.isFinite(arr[i]) && arr[i] > arr[best]) best = i;
  }
  return best;
}

module.exports = {
  clamp, round, uniform, mean, sum, meanAt, maxOf, minOf, num, argmax, THRESHOLDS,
};