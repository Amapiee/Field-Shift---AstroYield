const test = require("node:test");
const assert = require("node:assert");

// Import toàn bộ 14 module thuật toán từ thư mục ASCII 'src/algorithms'
const { createScientificRecord } = require("../src/algorithms/01_nasa_data_provider");
const { generateCalibratedFallback } = require("../src/algorithms/02_calibrated_simulation_fallback");
const { runQualityControl } = require("../src/algorithms/03_quality_control_preprocessing");
const { applyDarkObjectSubtraction } = require("../src/algorithms/04_atmospheric_correction_dos");
const { decodeQABitmask, classifyPixelSpectra } = require("../src/algorithms/05_cloud_masking_qa");
const { computeNDVISpectral, computeEVISpectral, computeNDMISpectral, estimateVegetationProxyFromClimate } = require("../src/algorithms/06_remote_sensing_indices");
const { applySavitzkyGolayFilter, extractPhenologyMetrics } = require("../src/algorithms/07_timeseries_savitzky_golay");
const { calculateSPI, detectEnvironmentalAnomalies } = require("../src/algorithms/08_anomaly_detection_spi");
const { runKMeansPlusPlus, clusterAgroEcologicalSeasons } = require("../src/algorithms/09_unsupervised_agro_clustering");
const { AgroRandomForestClassifier, createSyntheticCropDataset } = require("../src/algorithms/10_supervised_crop_suitability");
const { computeCropSeasonSuitability, fuzzyTrapezoid } = require("../src/algorithms/11_crop_suitability_fuzzy_ecocrop");
const { solveAHPWeights, rankScenariosTOPSIS } = require("../src/algorithms/12_mcda_ahp_topsis");
const { solveClassicalExactOptimizer, solveQuantumQAOA, buildSeasonEnvironments } = require("../src/algorithms/13_crop_rotation_optimization_qaoa_milp");
const { calculateRMSE, calculateMAE, runSystemRobustnessCheck } = require("../src/algorithms/14_validation_and_benchmarking");

test("Thuật toán 01: Metadata phân biệt climatology và confidence chưa hiệu chuẩn", () => {
  const rec = createScientificRecord("GWETROOT", 0.45);
  assert.strictEqual(rec.variable, "GWETROOT");
  assert.strictEqual(rec.status, "climatology");
  assert.strictEqual(rec.unit, "dimensionless (0-1)");
  assert.strictEqual(rec.confidence, null);
  assert.strictEqual(rec.period,null);
});

test("Thuật toán 02: Calibrated Fallback gắn cờ mock minh bạch", () => {
  const fallback = generateCalibratedFallback(10.04, 105.78);
  assert.strictEqual(fallback._mock, true);
  assert.strictEqual(fallback.raw.T2M.length, 12);
  assert.strictEqual(fallback.raw.PRECTOTCORR.length, 12);
  assert.ok(fallback.data.T2M[0].status === "mock");
});

test("Thuật toán 03: QC bảo tồn lượng mưa = 0mm và xử lý sentinel -999", () => {
  const rawRain = [100, 50, 0, 0, 10, -999, 200, 250, 180, 90, 30, 10];
  const qc = runQualityControl(rawRain, "PRECTOTCORR");
  // Mưa 0mm ở tháng 3 và 4 phải được giữ nguyên là 0
  assert.strictEqual(qc.clean_array[2], 0);
  assert.strictEqual(qc.clean_array[3], 0);
  assert.strictEqual(qc.series[2].status, "observed");
  // Sentinel -999 ở tháng 6 phải được nội suy
  assert.ok(qc.clean_array[5] > 0);
  assert.strictEqual(qc.series[5].status, "interpolated");
});

test("Thuật toán 04: DOS1 loại bỏ sương mù khí quyển và kẹp phản xạ bề mặt", () => {
  const toaRed = [0.07, 0.08, 0.15, 0.25, 0.065];
  const dos = applyDarkObjectSubtraction(toaRed, { sunZenithDeg: 30, inputType: "TOA_REFLECTANCE" });
  assert.ok(dos.haze_value > 0);
  assert.ok(dos.corrected_pixels.every(p => p >= 0.001 && p <= 1.0));
  assert.strictEqual(dos.processing_level, "Prototype DOS1 Bottom-of-Atmosphere (BOA) Reflectance");

  // Kiểm tra từ chối tái hiệu chỉnh sản phẩm Level-2 Surface Reflectance
  assert.throws(() => {
    applyDarkObjectSubtraction(toaRed, { isSurfaceReflectance: true });
  }, /Level-2/);
});

test("Thuật toán 05: Cloud Masking bóc tách chính xác QA bitmask và phân loại phổ", () => {
  const clearQA = decodeQABitmask(0b0000000000000000);
  assert.strictEqual(clearQA.is_clear, true);
  const cloudyQA = decodeQABitmask(0b0000000000000001);
  assert.strictEqual(cloudyQA.is_cloud, true);

  // Phân biệt riêng Landsat, MODIS MOD09GA, MOD13Q1 và Sentinel-2 SCL
  const {
    decodeLandsatQAPixel,
    decodeMod09GAStateQA,
    decodeMod13Q1SummaryQA,
    decodeSentinel2SCL,
    heuristicSpectralMask
  } = require("../src/algorithms/05_cloud_masking_qa");

  const landsatCloud = decodeLandsatQAPixel(0b0000000000001000); // Bit 3 = Cloud
  assert.strictEqual(landsatCloud.is_cloud, true);

  const mod09Cloud = decodeMod09GAStateQA(0b0000000000000001); // Bits 0-1 = Cloudy
  assert.strictEqual(mod09Cloud.is_cloud, true);

  const mod13Good = decodeMod13Q1SummaryQA(0); // 0 = Good Data
  assert.strictEqual(mod13Good.is_clear, true);
  const mod13Snow = decodeMod13Q1SummaryQA(2); // 2 = Snow / Ice
  assert.strictEqual(mod13Snow.is_snow, true);

  const sclVeg = decodeSentinel2SCL(4); // 4 = Vegetation
  assert.strictEqual(sclVeg.is_clear, true);
  assert.strictEqual(sclVeg.label, "VEGETATION");

  const clearVeg = heuristicSpectralMask({ blue: 0.03, green: 0.06, red: 0.04, nir: 0.55, swir1: 0.15 });
  assert.strictEqual(clearVeg.class_id, 4); // VEGETATION
  assert.strictEqual(clearVeg.valid, true);
});

test("Thuật toán 06: Các chỉ số viễn thám NDVI, EVI, NDMI tính đúng công thức", () => {
  const ndvi = computeNDVISpectral(0.60, 0.10);
  assert.strictEqual(ndvi, 0.714);

  const evi = computeEVISpectral(0.60, 0.10, 0.05);
  assert.ok(evi > 0 && evi <= 1.0);

  const ndmi = computeNDMISpectral(0.60, 0.20);
  assert.strictEqual(ndmi, 0.5);
});

test("Thuật toán 07: Savitzky-Golay làm mượt chuỗi và giữ nguyên đỉnh sinh trưởng", () => {
  const noisy = [0.2, 0.3, 0.5, 0.8, 0.4, 0.75, 0.6, 0.3, 0.2, 0.2, 0.2, 0.2];
  const smoothed = applySavitzkyGolayFilter(noisy);
  assert.strictEqual(smoothed.length, 12);
  const pheno = extractPhenologyMetrics(smoothed);
  assert.ok(pheno.peak_month > 0 && pheno.peak_month <= 12);
  assert.ok(pheno.amplitude > 0);
});

test("Thuật toán 08: SPI không giả lập lịch sử từ climatology", () => {
  const rain = [5, 2, 0, 0, 50, 180, 250, 240, 190, 80, 30, 10];
  const spi = calculateSPI(rain);
  assert.strictEqual(spi.length,12);
  assert.ok(spi.every(r=>r.spi_value===null && r.status==='unavailable'));
  const {calculateMultiYearSPI,regularizedGammaP} = require('../src/algorithms/08_anomaly_detection_spi');
  assert.ok(Math.abs(regularizedGammaP(2,3)-(1-4*Math.exp(-3)))<1e-10);
  const short = Array.from({length:36},(_,i)=>({year:2000+Math.floor(i/12),month:i%12+1,rain_mm:120}));
  assert.ok(calculateMultiYearSPI(short,3).every(r=>r.spi===null));
});

test("Thuật toán 09: K-Means++ gom cụm vi khí hậu nông nghiệp (AEZ)", () => {
  const monthly = {
    T2M: [26, 27, 29, 31, 30, 28, 28, 28, 28, 27, 26, 25],
    PRECTOTCORR: [15, 8, 5, 2, 80, 180, 230, 250, 190, 120, 45, 20],
    GWETROOT: [0.38, 0.32, 0.25, 0.22, 0.45, 0.70, 0.82, 0.80, 0.74, 0.60, 0.48, 0.40],
    ALLSKY_SFC_SW_DWN: [18, 20, 22, 23, 20, 17, 16, 16, 17, 18, 18, 17]
  };
  const aez = clusterAgroEcologicalSeasons(monthly, 3);
  assert.strictEqual(aez.cluster_profiles.length, 3);
  assert.strictEqual(aez.labels.length, 12);
});

test("Thuật toán 10: Random Forest phân loại thử nghiệm trên dữ liệu synthetic", () => {
  const { X, y } = createSyntheticCropDataset("Rice");
  const rf = new AgroRandomForestClassifier(8, 3);
  rf.fit(X, y);

  // Vector 7 chiều chuẩn: [T_mean, T_min, T_max, P_accum, Soil_Moisture, Rad, NDVI]
  const idealRice = [27.0, 22.0, 31.0, 450.0, 0.75, 18.0, 0.65];
  const pred = rf.predictViability(idealRice);
  assert.ok(pred.viability_score >= 0 && pred.viability_score <= 100);

  // Kiểm tra bắt lỗi khi vector đầu vào thiếu chiều
  assert.throws(() => {
    rf.predictViability([27.0, 180.0, 0.75]);
  }, /length 7/);
});

test("Thuật toán 11: FAO EcoCrop hình thang mờ liên tục", () => {
  const mu = fuzzyTrapezoid(25, 10, 20, 30, 40);
  assert.strictEqual(mu, 1.0); // Trong khoảng tối ưu [20, 30]

  const env = { tempAvg: 28, rainSeasonAccum: 600, soilMoistureAvg: 0.75, maxTs: 32 };
  const riceSuit = computeCropSeasonSuitability("Rice", env);
  assert.ok(riceSuit.suitability_score > 60);
  assert.strictEqual(riceSuit.crop, "Rice");
});

test("Thuật toán 12: AHP & TOPSIS tính trọng số nhất quán và xếp hạng kịch bản", () => {
  const { deriveAHPWeightsFromPreferences } = require("../src/algorithms/12_mcda_ahp_topsis");
  const ahpPref = deriveAHPWeightsFromPreferences([0.5, 0.3, 0.2]);
  assert.strictEqual(ahpPref.pairwise_elicited, false);
  assert.strictEqual(ahpPref.consistency_ratio, null);
  assert.deepStrictEqual(ahpPref.weights,[0.5,0.3,0.2]);

  // Kiểm tra thanh trượt = 0: [0, 1, 0] phải giữ nguyên đúng tỷ lệ [0, 1, 0]
  const zeroSliderPref = deriveAHPWeightsFromPreferences([0, 1, 0]);
  assert.deepStrictEqual(zeroSliderPref.weights, [0, 1, 0]);

  const pairwise = [
    [1.0, 1.0, 2.0],
    [1.0, 1.0, 2.0],
    [0.5, 0.5, 1.0]
  ];
  const ahp = solveAHPWeights(pairwise);
  assert.strictEqual(ahp.is_consistent, true);

  const scenarios = [
    { id: "s1", soil_hp: 40, water_hp: 40, profit_hp: 50 },
    { id: "s2", soil_hp: 85, water_hp: 80, profit_hp: 85 }
  ];
  const ranked = rankScenariosTOPSIS(scenarios, ahp.weights);
  assert.strictEqual(ranked[0].id, "s2");
  assert.strictEqual(ranked[0].rank, 1);

  // Kiểm tra trường hợp 1 kịch bản đơn lẻ (không thể so sánh khoảng cách tương đối)
  const singleRanked = rankScenariosTOPSIS([scenarios[0]], ahp.weights);
  assert.strictEqual(singleRanked[0].unrankable, true);
});

test("Thuật toán 13: Exact Classical vs QAOA Optimizer giải bài toán luân canh", () => {
  const testMonthly = {
    T2M: [25, 26, 28, 30, 29, 28, 28, 27, 27, 26, 25, 24],
    PRECTOTCORR: [10, 5, 0, 15, 90, 210, 260, 240, 180, 95, 40, 15],
    GWETROOT: [0.35, 0.28, 0.22, 0.25, 0.48, 0.75, 0.82, 0.79, 0.70, 0.55, 0.42, 0.36],
    TS: [28, 30, 33, 36, 32, 29, 28, 28, 29, 28, 27, 26]
  };
  const seasonEnvs = buildSeasonEnvironments(testMonthly);
  const classical = solveClassicalExactOptimizer(seasonEnvs);
  assert.strictEqual(classical.best_rotation.length, 3);
  assert.strictEqual(classical.total_space_searched, 216);
  assert.ok(classical.feasible_count > 0);

  const quantum = solveQuantumQAOA(seasonEnvs, { soil: 0.33, water: 0.33, profit: 0.34 }, classical);
  assert.strictEqual(quantum.ok, true);
  assert.strictEqual(quantum.best_rotation.length, 3);
  assert.ok(typeof quantum.feasibility_rate_pct === "number");
  assert.ok(typeof quantum.optimality_gap_pct === "number");
  assert.ok(quantum.feasibility_rate_pct >= 0 && quantum.feasibility_rate_pct <= 100);
});

test("Thuật toán 14: Validation Suite đo lường RMSE và kiểm tra Robustness", () => {
  const actual = [10, 20, 30];
  const pred = [12, 18, 31];
  const rmse = calculateRMSE(actual, pred);
  const mae = calculateMAE(actual, pred);
  assert.ok(rmse > 0 && rmse < 3);
  assert.ok(mae > 0 && mae < 3);

  const robustness = runSystemRobustnessCheck();
  assert.strictEqual(robustness.all_tests_passed, true);
});
