// Bộ mô phỏng statevector thuần JS (H, RZ, CX, RX + đo mẫu)
class Statevector {
  constructor(n) {
    this.n = n;
    this.N = 1 << n;
    this.re = new Float64Array(this.N);
    this.im = new Float64Array(this.N);
    this.re[0] = 1; // |00…0>
  }
  h(q) {
    const { re, im, N } = this, m = 1 << q, s = Math.SQRT1_2;
    for (let i = 0; i < N; i++) {
      if (i & m) continue;
      const j = i | m;
      const ar = re[i], ai = im[i], br = re[j], bi = im[j];
      re[i] = (ar + br) * s; im[i] = (ai + bi) * s;
      re[j] = (ar - br) * s; im[j] = (ai - bi) * s;
    }
  }
  // RZ(θ) = diag(e^{-iθ/2}, e^{+iθ/2})
  rz(q, theta) {
    const { re, im, N } = this, m = 1 << q;
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    for (let i = 0; i < N; i++) {
      const sn = i & m ? s : -s; // bit=1 → +iθ/2, bit=0 → -iθ/2
      const r = re[i], x = im[i];
      re[i] = r * c - x * sn;
      im[i] = r * sn + x * c;
    }
  }
  cx(ctrl, tgt) {
    const { re, im, N } = this, cm = 1 << ctrl, tm = 1 << tgt;
    for (let i = 0; i < N; i++) {
      if (!(i & cm) || i & tm) continue;
      const j = i | tm;
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // RX(θ) = [[cos, -i·sin], [-i·sin, cos]]
  rx(q, theta) {
    const { re, im, N } = this, m = 1 << q;
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    for (let i = 0; i < N; i++) {
      if (i & m) continue;
      const j = i | m;
      const ar = re[i], ai = im[i], br = re[j], bi = im[j];
      re[i] = c * ar + s * bi; im[i] = c * ai - s * br;
      re[j] = c * br + s * ai; im[j] = c * bi - s * ar;
    }
  }
  // Đo `shots` lần → Map<bitstring (qubit cao nhất bên trái, như Qiskit), count>
  sample(shots, random = Math.random) {
    if (typeof random !== "function") throw new TypeError("random must be a function");
    const { re, im, N, n } = this;
    const cdf = new Float64Array(N);
    let acc = 0;
    for (let i = 0; i < N; i++) { acc += re[i] * re[i] + im[i] * im[i]; cdf[i] = acc; }
    const counts = new Map();
    for (let s = 0; s < shots; s++) {
      const x = random() * acc;
      let lo = 0, hi = N - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; cdf[mid] < x ? (lo = mid + 1) : (hi = mid); }
      const key = lo.toString(2).padStart(n, "0");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }
}

module.exports = { Statevector };
