// Shared numeric utilities + frozen thresholds.
const THRESHOLDS = Object.freeze({
  FLOOD_RAIN_MM: 160,   // mm/month — flood / waterlogging risk
  FALLOW_EROSION_MM: 100, // mm/month — fallow + high rain -> erosion
  DROUGHT_GWET: 0.33,   // root-zone GWET below threshold -> drought warning
  DROUGHT_GWET_CRIT: 0.38, // used in scoring: water-demanding crops + dry soil
  HEAT_TS_C: 34,        // TS above threshold -> heat stress
});

/**
 * Clamp to [lo, hi]. Defensive: swaps bounds if provided inverted.
 * @param {*} v value
 * @param {number} lo lower bound
 * @param {number} hi upper bound
 */
const clamp = (v, lo, hi) => {
  let a = lo;
  let b = hi;
  if (a > b) [a, b] = [b, a];
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
};

/**
 * Round with safe NaN handling.
 * @param {*} v value
 * @param {number} [digits] decimal places
 */
const round = (v, digits = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

/**
 * Uniform random in [a, b].
 */
const uniform = (a, b) => a + Math.random() * (b - a);

/**
 * Mean ignoring non-finite values.
 * @param {Array<number>} arr
 */
const mean = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let s = 0;
  let n = 0;
  for (const v of arr) {
    const x = Number(v);
    if (Number.isFinite(x)) {
      s += x;
      n += 1;
    }
  }
  return n ? s / n : 0;
};

/**
 * Sum ignoring non-finite values.
 * @param {Array<number>} arr
 */
const sum = (arr) => {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const v of arr) {
    const x = Number(v);
    if (Number.isFinite(x)) s += x;
  }
  return s;
};

/**
 * Mean over selected indices.
 * @param {Array<number>} arr
 * @param {Array<number>} idx indices
 */
const meanAt = (arr, idx) => {
  if (!Array.isArray(arr) || !Array.isArray(idx)) return 0;
  const vals = [];
  for (const i of idx) {
    const v = arr[i];
    if (Number.isFinite(v)) vals.push(v);
  }
  return mean(vals);
};

/**
 * Max ignoring non-finite values.
 */
const maxOf = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let m = -Infinity;
  for (const v of arr) {
    const x = Number(v);
    if (Number.isFinite(x) && x > m) m = x;
  }
  return Number.isFinite(m) ? m : 0;
};

/**
 * Min ignoring non-finite values.
 */
const minOf = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let m = Infinity;
  for (const v of arr) {
    const x = Number(v);
    if (Number.isFinite(x) && x < m) m = x;
  }
  return Number.isFinite(m) ? m : 0;
};

/**
 * Safe number coercion.
 * null/undefined/"" fall back to `def`.
 */
const num = (v, def = 0) => {
  if (v === null || v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/**
 * Argmax over finite values.
 * @param {Array<number>} arr
 * @returns {number} index of max value, or -1 when empty.
 */
function argmax(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return -1;
  let best = -1;
  let bestVal = -Infinity;
  for (let i = 0; i < arr.length; i += 1) {
    const v = Number(arr[i]);
    if (Number.isFinite(v) && v > bestVal) {
      bestVal = v;
      best = i;
    }
  }
  return best;
}

module.exports = {
  clamp,
  round,
  uniform,
  mean,
  sum,
  meanAt,
  maxOf,
  minOf,
  num,
  argmax,
  THRESHOLDS,
};