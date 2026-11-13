// QAOA / QUBO: dựng ma trận chi phí rồi chạy mạch lượng tử mô phỏng
const { CROPS, CROP_KEYS, SEASON_IDX } = require("../config/crops");
const { round, sum, meanAt, argmax } = require("../utils/helpers");
const { Statevector } = require("./statevector");

function buildCostMatrix(data, wWater, wSoil, wProfit) {
  const cost = SEASON_IDX.map(() => new Array(CROP_KEYS.length).fill(0));
  SEASON_IDX.forEach((sidx, s) => {
    const gw = meanAt(data.GWETROOT, sidx);
    const tmp = meanAt(data.TS, sidx);
    const prp = meanAt(data.PRECTOTCORR, sidx);
    const ndv = meanAt(data.NDVI, sidx);

    CROP_KEYS.forEach((ckey, ci) => {
      const cd = CROPS[ckey];
      
      // Khởi tạo điểm bằng lợi nhuận
      let score = (wProfit * cd.profit) / 100.0;
      
      // Trừ điểm vì dùng nước, cộng điểm vì bảo vệ đất
      score -= wWater * (Math.abs(cd.water) / 35.0) * (1 - gw);
      score += wSoil * (Math.max(cd.soil, 0) / 35.0) * (0.5 + ndv);
      
      // Tác động thời tiết
      if (tmp > 32) score -= (1 - cd.heat_tol) * 0.28;
      if (gw < 0.4) score += cd.drought_tol * 0.18;
      if (ckey === "Fallow" && prp > 100) score -= 0.38;

      // => THÊM RÀNG BUỘC NHÂN QUẢ CHO AI:
      // Nếu đất rất khô (gw < 0.38) mà loại cây này lại cần nhiều nước (water < -18)
      if (gw < 0.38 && cd.water < -18) {
          score -= 0.6; // Hình phạt tử hình (Death Penalty): Đánh tụt điểm của cây này để AI loại bỏ nó ngay lập tức
      }

      cost[s][ci] = score;
    });
  });
  return cost;
}

function runQuantum(data, wWater, wSoil, wProfit) {
  const cost = buildCostMatrix(data, wWater, wSoil, wProfit);
  const classicalBest = cost.map((row) => CROP_KEYS[argmax(row)]);

  try {
    const nCrops = CROP_KEYS.length;
    const nQubits = 3 * nCrops; // 18 qubit
    const sv = new Statevector(nQubits);
    const gamma = 0.82, beta = 0.58;

    // Hadamard superposition
    for (let q = 0; q < nQubits; q++) sv.h(q);

    // Phase separation — cost mã hoá bằng RZ
    for (let s = 0; s < 3; s++)
      for (let ci = 0; ci < nCrops; ci++) sv.rz(s * nCrops + ci, -2.0 * gamma * cost[s][ci]);

    // Entanglement trong mỗi khối mùa vụ
    for (let s = 0; s < 3; s++) {
      for (let ci = 0; ci < nCrops - 1; ci++) {
        const q1 = s * nCrops + ci, q2 = q1 + 1;
        sv.cx(q1, q2);
        sv.rz(q2, gamma * 0.45);
        sv.cx(q1, q2);
      }
    }

    // Mixer layer
    for (let q = 0; q < nQubits; q++) sv.rx(q, 2.0 * beta);

    const counts = sv.sample(1024);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top20 = sorted.slice(0, 20).map(([k]) => k);

    const decode = (bs) => {
      const padded = bs.padStart(nQubits, "0").split("").reverse().join(""); // qubit 0 đứng đầu
      return [0, 1, 2].map((s) => {
        let bestCi = 0, bestVal = -Infinity;
        for (let ci = 0; ci < nCrops; ci++) {
          const v = Number(padded[s * nCrops + ci]) * cost[s][ci];
          if (v > bestVal) { bestVal = v; bestCi = ci; }
        }
        return CROP_KEYS[bestCi];
      });
    };
    const decodedCost = (bs) => decode(bs).reduce((t, c, s) => t + cost[s][CROP_KEYS.indexOf(c)], 0);

    let bestBs = top20[0];
    for (const bs of top20) if (decodedCost(bs) > decodedCost(bestBs)) bestBs = bs;

    const total = sum([...counts.values()]);
    const probs = {};
    for (const [k, v] of sorted.slice(0, 10)) probs[k.slice(-8)] = round(v / total, 4);

    return {
      method: "Node.js Statevector QAOA Simulator (18-qubit, 1024 shots)",
      crops: decode(bestBs),
      probs,
      ok: true,
    };
  } catch (e) {
    return {
      method: `Classical Greedy (Quantum sim error: ${String(e.message).slice(0, 60)})`,
      crops: classicalBest,
      probs: {},
      ok: false,
    };
  }
}

module.exports = { buildCostMatrix, runQuantum };
