// Direct slider normalization, separate pairwise AHP helper, and candidate-relative TOPSIS.
const RI_TABLE = [0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];

/**
 * Xây dựng ma trận so sánh cặp Saaty và giải nghiệm Vector trọng số AHP
 * Hỗ trợ thanh trượt giá trị 0 (Zero-Preserving Direct Normalization)
 * @param {Array<number>} rawPreferences Điểm ưu tiên tương đối của nông dân [Soil, Water, Profit]
 */
// Compatibility name: sliders provide direct weights, not elicited AHP pairwise judgments.
function deriveAHPWeightsFromPreferences(rawPreferences=[0.33,0.33,0.34]) {
  const values=rawPreferences.map(v=>Number.isFinite(v) && v>=0 ? v : 0);
  const total=values.reduce((a,b)=>a+b,0);
  return {weights:values.map(v=>total ? v/total : 1/values.length),
    method:'Direct normalized slider preferences',pairwise_elicited:false,
    is_consistent:null,consistency_ratio:null,lambda_max:null};
}

/**
 * Giải vector trọng số AHP từ ma trận so sánh cặp bất kỳ (có kiểm tra ma trận vuông và đường chéo = 1)
 */
function solveAHPWeights(pairwiseMatrix) {
  if (!Array.isArray(pairwiseMatrix) || pairwiseMatrix.length === 0) {
    throw new TypeError("solveAHPWeights: Input must be a non-empty square matrix.");
  }
  const n = pairwiseMatrix.length;
  for (let i = 0; i < n; i++) {
    if (!Array.isArray(pairwiseMatrix[i]) || pairwiseMatrix[i].length !== n) {
      throw new RangeError(`solveAHPWeights: Row ${i} length does not match dimension ${n}`);
    }
    if (Math.abs(pairwiseMatrix[i][i] - 1.0) > 1e-4) {
      throw new RangeError(`solveAHPWeights: Diagonal element [${i}][${i}] must be 1.0`);
    }
  }

  for (let i=0;i<n;i++) for(let j=0;j<n;j++) {
    if (!Number.isFinite(pairwiseMatrix[i][j]) || pairwiseMatrix[i][j]<=0 || Math.abs(pairwiseMatrix[i][j]*pairwiseMatrix[j][i]-1)>1e-4)
      throw new TypeError('AHP pairwise entries must be positive, finite and reciprocal');
  }
  const colSums = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) colSums[j] += pairwiseMatrix[i][j];
  }

  const weights = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += pairwiseMatrix[i][j] / Math.max(colSums[j], 1e-6);
    }
    weights[i] = rowSum / n;
  }

  // Tính Lambda Max và Tỷ số nhất quán Consistency Ratio (CR)
  let lambdaMax = 0;
  for (let i = 0; i < n; i++) {
    let dot = 0;
    for (let j = 0; j < n; j++) dot += pairwiseMatrix[i][j] * weights[j];
    lambdaMax += dot / Math.max(weights[i], 1e-6);
  }
  lambdaMax /= n;

  const CI = (lambdaMax - n) / Math.max(n - 1, 1);
  const RI = n <= 2 ? 0 : RI_TABLE[n - 1] || 0.90;
  const CR = RI > 0 ? CI / RI : 0.0;

  return {
    weights: weights.map(w => Math.round(w * 1000) / 1000),
    is_consistent: CR < 0.10,
    consistency_ratio: Math.round(CR * 1000) / 1000,
    lambda_max: Math.round(lambdaMax * 1000) / 1000
  };
}

/**
 * Xếp hạng kịch bản bằng thuật toán TOPSIS có phân biệt Benefit / Cost criteria
 * @param {Array<Object>} scenarios Danh sách các phương án canh tác
 * @param {Array<number>} weights Vector trọng số chuẩn hóa
 * @param {Array<string>} criteriaKeys Danh sách thuộc tính cần so sánh
 * @param {Array<string>} criteriaTypes Loại tiêu chí: "benefit" (càng cao càng tốt) hoặc "cost" (càng thấp càng tốt)
 */
function rankScenariosTOPSIS(
  scenarios,
  weights = [0.33, 0.33, 0.34],
  criteriaKeys = ["soil_hp", "water_hp", "profit_hp"],
  criteriaTypes = ["benefit", "benefit", "benefit"]
) {
  if (weights.length !== criteriaKeys.length || criteriaTypes.length !== criteriaKeys.length) {
    throw new RangeError(
      `rankScenariosTOPSIS: Dimension mismatch. criteriaKeys: ${criteriaKeys.length}, weights: ${weights.length}, criteriaTypes: ${criteriaTypes.length}`
    );
  }

  const m = scenarios.length;
  if (m === 0) return [];
  if (m === 1) {
    return [{
      ...scenarios[0],
      topsis_score: 1.0,
      rank: 1,
      unrankable: true,
      note: "Chỉ có 1 kịch bản đơn lẻ, không thể xếp hạng khoảng cách tương đối (Unrankable single scenario)."
    }];
  }

  const n = criteriaKeys.length;

  // 1. Kiểm tra ma trận suy biến (Tất cả điểm số đều bằng 0 hoặc không thể canh tác)
  const allZeros = scenarios.every(sc => criteriaKeys.every(k => (sc[k] || 0) === 0));
  if (allZeros) {
    return scenarios.map((sc, idx) => ({
      ...sc,
      topsis_score: 0.0,
      rank: idx + 1,
      note: "Điều kiện khắc nghiệt không khả thi cho mọi phương án (Degenerate Decision Matrix)."
    }));
  }

  // Chuẩn hóa trọng số
  const totalW = weights.reduce((a, b) => a + (Number(b) || 0), 0) || 1.0;
  const normWeights = weights.map(w => (Number(w) || 0) / totalW);

  // 2. Chuẩn hóa Vector r_{ij} = x_{ij} / sqrt(sum x_{kj}^2)
  const colNorms = criteriaKeys.map(k => {
    const sumSq = scenarios.reduce((acc, sc) => acc + Math.pow(Number(sc[k]) || 0, 2), 0);
    return Math.sqrt(sumSq) || 1.0;
  });

  const weightedMatrix = scenarios.map(sc => {
    return criteriaKeys.map((k, j) => ((Number(sc[k]) || 0) / colNorms[j]) * normWeights[j]);
  });

  // 3. Xác định Nghiệm lý tưởng (A+) và Nghiệm phản lý tưởng (A-)
  // Phân biệt Benefit Criteria vs Cost Criteria
  const idealPositive = new Array(n).fill(0);
  const idealNegative = new Array(n).fill(0);

  for (let j = 0; j < n; j++) {
    const colVals = weightedMatrix.map(row => row[j]);
    const maxVal = Math.max(...colVals);
    const minVal = Math.min(...colVals);
    const isBenefit = criteriaTypes[j] === "benefit";

    idealPositive[j] = isBenefit ? maxVal : minVal;
    idealNegative[j] = isBenefit ? minVal : maxVal;
  }

  // 4. Tính khoảng cách Euclidean d+ và d-
  const results = scenarios.map((sc, i) => {
    let dPlusSq = 0;
    let dMinusSq = 0;

    for (let j = 0; j < n; j++) {
      const val = weightedMatrix[i][j];
      dPlusSq += Math.pow(val - idealPositive[j], 2);
      dMinusSq += Math.pow(val - idealNegative[j], 2);
    }

    const dPlus = Math.sqrt(dPlusSq);
    const dMinus = Math.sqrt(dMinusSq);
    const closeness = (dPlus + dMinus) > 1e-6 ? dMinus / (dPlus + dMinus) : 0.0;

    return {
      ...sc,
      topsis_score: Math.round(closeness * 1000) / 1000,
      d_plus: Math.round(dPlus * 1000) / 1000,
      d_minus: Math.round(dMinus * 1000) / 1000
    };
  });

  results.sort((a, b) => b.topsis_score - a.topsis_score);
  results.forEach((r, idx) => r.rank = idx + 1);

  return results;
}

module.exports = {
  deriveAHPWeightsFromPreferences,
  solveAHPWeights,
  rankScenariosTOPSIS
};
