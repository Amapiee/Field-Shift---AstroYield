// Experimental synthetic classifier; no GAEZ or independent field labels are bundled.
// EXPERIMENTAL: synthetic examples; no field labels, geographic/time holdout or calibrated probabilities.
const {seededRandom} = require('../utils/random');


function calculateGini(labels) {
  if (labels.length === 0) return 0;
  const counts = {};
  labels.forEach(l => counts[l] = (counts[l] || 0) + 1);
  let sumSq = 0;
  for (const c in counts) {
    const p = counts[c] / labels.length;
    sumSq += p * p;
  }
  return 1.0 - sumSq;
}

class DecisionTreeNode {
  constructor(depth = 0, maxDepth = 4, rng = seededRandom()) {
    this.rng = rng;
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.featureIdx = null;
    this.threshold = null;
    this.left = null;
    this.right = null;
    this.prediction = null;
    this.probabilities = {};
  }

  fit(X, y) {
    const n = X.length;
    const numFeatures = X[0].length;
    const uniqueLabels = [...new Set(y)];

    const counts = {};
    y.forEach(l => counts[l] = (counts[l] || 0) + 1);
    for (const l in counts) {
      this.probabilities[l] = counts[l] / n;
    }

    if (uniqueLabels.length === 1 || this.depth >= this.maxDepth || n < 5) {
      this.prediction = uniqueLabels[0];
      return;
    }

    let bestGini = Infinity;
    let bestFeature = null;
    let bestThreshold = null;

    // Nguyên lý Random Forest tiêu chuẩn (Breiman 2001): Chọn ngẫu nhiên m_try = floor(sqrt(p)) đặc trưng tại mỗi nút rẽ nhánh
    const mTry = Math.max(1, Math.floor(Math.sqrt(numFeatures)));
    const allIndices = Array.from({ length: numFeatures }, (_, i) => i);
    for (let i = allIndices.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }
    const candidateFeatures = allIndices.slice(0, mTry);

    for (const f of candidateFeatures) {
      const vals = X.map(row => row[f]);
      const uniqueVals = [...new Set(vals)].sort((a, b) => a - b);

      for (let i = 0; i < uniqueVals.length - 1; i++) {
        const thresh = (uniqueVals[i] + uniqueVals[i + 1]) / 2.0;
        const leftY = [], rightY = [];

        for (let j = 0; j < n; j++) {
          if (X[j][f] <= thresh) leftY.push(y[j]);
          else rightY.push(y[j]);
        }

        if (leftY.length === 0 || rightY.length === 0) continue;

        const gini = (leftY.length / n) * calculateGini(leftY) + (rightY.length / n) * calculateGini(rightY);
        if (gini < bestGini) {
          bestGini = gini;
          bestFeature = f;
          bestThreshold = thresh;
        }
      }
    }

    if (bestFeature === null) {
      this.prediction = Number(Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b));
      return;
    }

    this.featureIdx = bestFeature;
    this.threshold = bestThreshold;

    const leftX = [], leftY = [], rightX = [], rightY = [];
    for (let j = 0; j < n; j++) {
      if (X[j][bestFeature] <= bestThreshold) {
        leftX.push(X[j]);
        leftY.push(y[j]);
      } else {
        rightX.push(X[j]);
        rightY.push(y[j]);
      }
    }

    this.left = new DecisionTreeNode(this.depth + 1, this.maxDepth, this.rng);
    this.left.fit(leftX, leftY);

    this.right = new DecisionTreeNode(this.depth + 1, this.maxDepth);
    this.right.fit(rightX, rightY);
  }

  predictProba(x) {
    if (this.featureIdx === null || this.left === null || this.right === null) {
      return this.probabilities;
    }
    if (x[this.featureIdx] <= this.threshold) {
      return this.left.predictProba(x);
    } else {
      return this.right.predictProba(x);
    }
  }
}

class AgroRandomForestClassifier {
  constructor(nTrees = 15, maxDepth = 4, {seed = 42} = {}) {
    this.seed = seed;
    this.nTrees = nTrees;
    this.maxDepth = maxDepth;
    this.trees = [];
  }

  fit(X, y) {
    if (!X.length || X.length!==y.length || X.some(r=>r.length!==7 || !r.every(Number.isFinite))) throw new TypeError('Invalid seven-feature training data');
    this.rng=seededRandom(this.seed);
    this.trees = [];
    const n = X.length;

    for (let t = 0; t < this.nTrees; t++) {
      const bootX = [], bootY = [];
      for (let i = 0; i < n; i++) {
        const randIdx = Math.floor(this.rng() * n);
        bootX.push(X[randIdx]);
        bootY.push(y[randIdx]);
      }

      const tree = new DecisionTreeNode(0, this.maxDepth, this.rng);
      tree.fit(bootX, bootY);
      this.trees.push(tree);
    }
  }

  predictViability(sampleFeatures) {
    // Kiểm tra tính hợp lệ và chiều đặc trưng đầu vào (7 chiều: [T_mean, T_min, T_max, P_accum, Soil, Rad, NDVI])
    if (!Array.isArray(sampleFeatures) || sampleFeatures.length !== 7) {
      throw new TypeError(`predictViability: Expected sampleFeatures array of length 7, got ${sampleFeatures ? sampleFeatures.length : 0}`);
    }
    if (sampleFeatures.some(v => !Number.isFinite(v))) {
      throw new RangeError("predictViability: sampleFeatures contains NaN or non-numeric values");
    }

    if (!this.trees.length) throw new Error('Model is not fitted');
    const aggregated = { 0: 0, 1: 0, 2: 0 };
    for (const tree of this.trees) {
      const prob = tree.predictProba(sampleFeatures);
      for (const cls in aggregated) {
        aggregated[cls] += (prob[cls] || 0) / this.trees.length;
      }
    }

    const failureRisk = aggregated[0];
    const optimalYield = aggregated[2];
    const viabilityScore = (aggregated[1] * 50 + aggregated[2] * 100);

    return {
      experimental: true,
      validation_status: 'No independent field validation; class vote fractions are not calibrated probabilities',
      recommendation_allowed: false,
      viability_score: Math.round(viabilityScore * 10) / 10,
      failure_risk: Math.round(failureRisk * 100) / 100,
      optimal_probability: Math.round(optimalYield * 100) / 100,
      status: failureRisk > 0.65 ? "KHÔNG THỂ CANH TÁC (FAILURE)" : viabilityScore >= 70 ? "RẤT PHÙ HỢP (OPTIMAL)" : "CANH TÁC CẬN BIÊN (MARGINAL)",
      model_type: "Random Forest Viability Classifier (m_try = floor(sqrt(p)))",
      prediction_target: "Agro-Ecological Suitability Class (Not Quantitative Yield in tons/ha)"
    };
  }
}

/**
 * Xây dựng tập dữ liệu nông học mô phỏng (Synthetic Agro-Ecological Dataset)
 * Lưu ý: Dữ liệu mô phỏng cho mục đích kiểm thử phân loại, không phải năng suất thực địa đã đo lường.
 */
function createGlobalAgroDataset(cropType = "Rice", seed = 42) {
  const rng = seededRandom(seed);
  // Features: [T_mean, T_min, T_max, P_accum, Soil_Moisture, Rad, NDVI]
  const X = [];
  const y = [];

  // 1. Nhóm vùng băng giá hàn đới (Polar/Cryosphere) -> Thất thu 100%
  for (let i = 0; i < 40; i++) {
    const tMean = -30 + rng() * 25; // -30 to -5°C
    const tMin = tMean - 8;
    const tMax = tMean + 6;
    const pAccum = 10 + rng() * 50;
    const soil = 0.1 + rng() * 0.15;
    const rad = 5 + rng() * 10;
    const ndvi = 0.02 + rng() * 0.05;
    X.push([tMean, tMin, tMax, pAccum, soil, rad, ndvi]);
    y.push(0); // Thất thu hoàn toàn
  }

  // 2. Nhóm vùng sa mạc cực khô hạn (Hyper-Arid Desert) -> Thất thu 100%
  for (let i = 0; i < 40; i++) {
    const tMean = 28 + rng() * 12; // 28 to 40°C
    const tMin = 20 + rng() * 5;
    const tMax = 42 + rng() * 8; // 42 to 50°C
    const pAccum = rng() * 25;     // < 25mm
    const soil = 0.08 + rng() * 0.10;
    const rad = 22 + rng() * 8;
    const ndvi = 0.05 + rng() * 0.05;
    X.push([tMean, tMin, tMax, pAccum, soil, rad, ndvi]);
    y.push(0); // Thất thu hoàn toàn
  }

  // 3. Nhóm vùng nhiệt đới / cận nhiệt đới phù hợp (Optimal Farming Zone)
  for (let i = 0; i < 60; i++) {
    const tMean = 24 + rng() * 6; // 24 to 30°C
    const tMin = 20 + rng() * 4;
    const tMax = 31 + rng() * 3;
    const pAccum = 350 + rng() * 500;
    const soil = 0.60 + rng() * 0.25;
    const rad = 16 + rng() * 5;
    const ndvi = 0.60 + rng() * 0.25;
    X.push([tMean, tMin, tMax, pAccum, soil, rad, ndvi]);
    y.push(2); // Năng suất cao
  }

  // 4. Nhóm cận biên (Marginal Zone)
  for (let i = 0; i < 40; i++) {
    const tMean = 18 + rng() * 5;
    const tMin = 13 + rng() * 3;
    const tMax = 28 + rng() * 4;
    const pAccum = 150 + rng() * 150;
    const soil = 0.35 + rng() * 0.20;
    const rad = 14 + rng() * 4;
    const ndvi = 0.35 + rng() * 0.20;
    X.push([tMean, tMin, tMax, pAccum, soil, rad, ndvi]);
    y.push(1); // Cận biên
  }

  return { X, y, metadata:{status:'synthetic',crop_specific:false,seed,validation:'No field labels; test data only'} };
}

module.exports = {
  AgroRandomForestClassifier,
  createGlobalAgroDataset,
  createSyntheticCropDataset: createGlobalAgroDataset,
  createSyntheticAgroDataset: createGlobalAgroDataset
};

// ─── Test thực thi ───
if (require.main === module) {
  console.log("=== KIỂM THỬ THUẬT TOÁN 10 (EXPERIMENTAL SYNTHETIC RANDOM FOREST) ===");
  const { X, y } = createGlobalAgroDataset("Rice");
  const rf = new AgroRandomForestClassifier(20, 4);
  rf.fit(X, y);

  // Test 1: Băng tuyết Greenland (-25°C, 30mm mưa, 0.1 ẩm đất)
  const greenlandSample = [-25.0, -32.0, -18.0, 30.0, 0.10, 8.0, 0.04];
  console.log("1. Dự báo vùng băng tuyết (Greenland):", rf.predictViability(greenlandSample));

  // Test 2: Sa mạc Sahara (36°C, 5mm mưa, 0.12 ẩm đất)
  const saharaSample = [36.0, 26.0, 46.0, 5.0, 0.12, 26.0, 0.06];
  console.log("2. Dự báo vùng sa mạc (Sahara):", rf.predictViability(saharaSample));

  // Test 3: ĐBSCL Việt Nam (28°C, 500mm mưa, 0.75 ẩm đất)
  const mekongSample = [28.0, 24.0, 32.0, 550.0, 0.75, 18.0, 0.70];
  console.log("3. Dự báo vùng lúa ĐBSCL:", rf.predictViability(mekongSample));
}
