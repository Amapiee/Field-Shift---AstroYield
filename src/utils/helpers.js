// Hàm tiện ích dùng chung (toán, làm tròn, ép kiểu)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 0) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const uniform = (a, b) => a + Math.random() * (b - a);
const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const meanAt = (arr, idx) => mean(idx.map((i) => arr[i]));
const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

function argmax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

module.exports = { clamp, round, uniform, mean, sum, meanAt, num, argmax };
