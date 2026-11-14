// Experimental fuzzy crop suitability inspired by EcoCrop. Exact thresholds are project heuristics.
// is_lethal means excluded by this model, not experimentally proven crop mortality.
const SCIENTIFIC_CROP_PROFILES = {
  Rice: {
    scientific_name: "Oryza sativa (Lúa nước)",
    fao_ecocrop_code: null,
    source_reference: "Project heuristic; exact thresholds unverified",
    water_regime_assumption: "Lowland irrigated / High rainfed",
    parameter_units: { temp: "°C", rain: "mm/season (4 months)", soil_moisture: "GWETROOT fraction (0-1)" },
    temp_limits: { kill_min: 12.0, opt_min: 22.0, opt_max: 32.0, kill_max: 42.0 },
    rain_limits: { kill_min: 150.0, opt_min: 450.0, opt_max: 1200.0, kill_max: 2500.0 }, // mm/vụ (4 tháng)
    soil_moisture_limits: { kill_min: 0.35, opt_min: 0.65, opt_max: 0.98, kill_max: 1.0 },
    nitrogen_balance: -25,
    water_intensity: -35,
    base_profit: 75,
    frost_sensitive: true,
    color: "#38bdf8"
  },
  Soybean: {
    scientific_name: "Glycine max (Đậu tương)",
    fao_ecocrop_code: null,
    source_reference: "Project heuristic; exact thresholds unverified",
    water_regime_assumption: "Rainfed / Moderate supplemental irrigation",
    parameter_units: { temp: "°C", rain: "mm/season (4 months)", soil_moisture: "GWETROOT fraction (0-1)" },
    temp_limits: { kill_min: 8.0, opt_min: 20.0, opt_max: 30.0, kill_max: 40.0 },
    rain_limits: { kill_min: 120.0, opt_min: 280.0, opt_max: 650.0, kill_max: 1200.0 },
    soil_moisture_limits: { kill_min: 0.25, opt_min: 0.40, opt_max: 0.68, kill_max: 0.88 },
    nitrogen_balance: +35,
    water_intensity: -12,
    base_profit: 65,
    frost_sensitive: true,
    color: "#10b981"
  },
  Peanut: {
    scientific_name: "Arachis hypogaea (Lạc/Đậu phộng)",
    fao_ecocrop_code: null,
    source_reference: "Project heuristic; exact thresholds unverified",
    water_regime_assumption: "Semi-arid rainfed / Light sandy loam",
    parameter_units: { temp: "°C", rain: "mm/season (4 months)", soil_moisture: "GWETROOT fraction (0-1)" },
    temp_limits: { kill_min: 10.0, opt_min: 22.0, opt_max: 32.0, kill_max: 42.0 },
    rain_limits: { kill_min: 100.0, opt_min: 250.0, opt_max: 550.0, kill_max: 950.0 },
    soil_moisture_limits: { kill_min: 0.20, opt_min: 0.35, opt_max: 0.60, kill_max: 0.80 },
    nitrogen_balance: +30,
    water_intensity: -8,
    base_profit: 70,
    frost_sensitive: true,
    color: "#f59e0b"
  },
  Maize: {
    scientific_name: "Zea mays (Ngô)",
    fao_ecocrop_code: null,
    source_reference: "Project heuristic; exact thresholds unverified",
    water_regime_assumption: "Upland rainfed / Sub-surface irrigation",
    parameter_units: { temp: "°C", rain: "mm/season (4 months)", soil_moisture: "GWETROOT fraction (0-1)" },
    temp_limits: { kill_min: 8.0, opt_min: 18.0, opt_max: 30.0, kill_max: 42.0 },
    rain_limits: { kill_min: 120.0, opt_min: 300.0, opt_max: 750.0, kill_max: 1500.0 },
    soil_moisture_limits: { kill_min: 0.26, opt_min: 0.45, opt_max: 0.72, kill_max: 0.90 },
    nitrogen_balance: -20,
    water_intensity: -20,
    base_profit: 80,
    frost_sensitive: true,
    color: "#a78bfa"
  },
  Veggies: {
    scientific_name: "Vegetable complex (Rau màu ngắn ngày)",
    fao_ecocrop_code: null,
    source_reference: "Project heuristic; exact thresholds unverified",
    water_regime_assumption: "Intensive bed / High frequency drip irrigation",
    parameter_units: { temp: "°C", rain: "mm/season (4 months)", soil_moisture: "GWETROOT fraction (0-1)" },
    temp_limits: { kill_min: 5.0, opt_min: 16.0, opt_max: 28.0, kill_max: 38.0 },
    rain_limits: { kill_min: 100.0, opt_min: 220.0, opt_max: 500.0, kill_max: 1000.0 },
    soil_moisture_limits: { kill_min: 0.30, opt_min: 0.48, opt_max: 0.70, kill_max: 0.85 },
    nitrogen_balance: -10,
    water_intensity: -15,
    base_profit: 85,
    frost_sensitive: true,
    color: "#fb923c"
  },
  Fallow: {
    scientific_name: "Cover crop / Fallow (Bỏ trống / Phục hồi đất)",
    fao_ecocrop_code: null,
    source_reference: "Project heuristic; exact thresholds unverified",
    water_regime_assumption: "Natural soil moisture recovery / Zero inputs",
    parameter_units: { temp: "°C", rain: "mm/season (4 months)", soil_moisture: "GWETROOT fraction (0-1)" },
    temp_limits: { kill_min: -50.0, opt_min: 0.0, opt_max: 45.0, kill_max: 60.0 },
    rain_limits: { kill_min: 0.0, opt_min: 0.0, opt_max: 3000.0, kill_max: 5000.0 },
    soil_moisture_limits: { kill_min: 0.0, opt_min: 0.05, opt_max: 1.0, kill_max: 1.0 },
    nitrogen_balance: -5,
    water_intensity: 0,
    base_profit: 0,
    frost_sensitive: false,
    color: "#64748b"
  }
};

/**
 * Hàm liên thuộc hình thang mờ liên tục
 */
for (const profile of Object.values(SCIENTIFIC_CROP_PROFILES)) {
  profile.fao_ecocrop_code = null; // Legacy identifiers were not verified against an authoritative record.
  profile.source_reference = 'Project heuristic; exact numeric thresholds have not been verified against primary crop/variety data';
  profile.validation_status = 'experimental_unvalidated';
  profile.frost_response = profile === SCIENTIFIC_CROP_PROFILES.Fallow ? 'not_applicable'
    : profile === SCIENTIFIC_CROP_PROFILES.Veggies ? 'variety_dependent' : 'frost_sensitive';
  profile.frost_policy_reference = 'https://www.fao.org/4/y7223e/y7223e0a.htm';
  profile.region_scope = 'No calibrated geographic region or variety; fixed four-month seasons';
  profile.parameter_provenance = Object.fromEntries(['temp_limits','rain_limits','soil_moisture_limits','nitrogen_balance','water_intensity','base_profit'].map(key=>[key,{
    origin:'Existing project heuristic',verified:false,reference:null,
    unit:key==='temp_limits' ? '°C seasonal mean' : key==='rain_limits' ? 'mm per four-month season' : key==='soil_moisture_limits' ? 'MERRA-2 wetness fraction; not a physical wilting point' : 'arbitrary score units'
  }]));
}
function fuzzyTrapezoid(x, a, b, c, d) {
  if (x < a || x > d) return 0.0;
  if (x >= b && x <= c) return 1.0;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > c && x < d) return (d - x) / (d - c);
  return 0.0;
}

/**
 * Tính toán độ thích ứng nông học liên tục cho cây trồng trong mùa vụ
 */
function computeCropSeasonSuitability(cropKey, seasonEnv) {
  const crop = SCIENTIFIC_CROP_PROFILES[cropKey] || SCIENTIFIC_CROP_PROFILES.Fallow;
  const { tempAvg, rainSeasonAccum, soilMoistureAvg, maxTs } = seasonEnv;

  if (![tempAvg,rainSeasonAccum,soilMoistureAvg,maxTs].every(Number.isFinite)) throw new TypeError('Missing seasonal environment');
  const exposure=seasonEnv.coldExposure;
  const frostDetected=exposure?.frost_months?.length>0;
  // A single cold month can be hidden by a positive four-month mean. This is a conservative
  // planning exclusion for unprotected sensitive crops, NOT a diagnosis of observed mortality.
  if (frostDetected && crop.frost_response!=='not_applicable') {
    return {crop:cropKey,scientific_name:crop.scientific_name,model_status:'experimental_unvalidated',
      suitability_score:0,yield_factor:0,is_lethal:crop.frost_response==='frost_sensitive',model_excluded:true,mortality_confirmed:false,
      cold_risk:{status:crop.frost_response==='variety_dependent'?'variety_dependent':'high',...exposure},
      linguistic_grade:'Nguy cơ tổn thương/chết rét; loại khỏi kế hoạch ngoài trời không bảo vệ',
      reason:`Vụ có tín hiệu nhiệt độ dưới 0°C ở ${exposure.frost_months.map(m=>'T'+m).join(', ')}. ${crop.frost_response==='variety_dependent'?'Nhóm rau có cả giống chịu lạnh và nhạy rét; cần xác định giống trước khi khuyến nghị.':'Có thể gây tổn thương hoặc chết cây nhạy rét; chưa xác nhận cây đã chết.'}`};
  }
  // 1. KIỂM TRA ĐIỀU KIỆN TỬ HÌNH BĂNG GIÁ (Freezing Death Penalty)
  // Nếu nhiệt độ trung bình dưới ngưỡng chết buốt (ví dụ lúa < 12°C, hoặc mùa vụ < 0°C)
  if (cropKey !== "Fallow" && (tempAvg < crop.temp_limits.kill_min || tempAvg > crop.temp_limits.kill_max)) {
    return {
      crop: cropKey,
      model_status: "experimental_unvalidated",
      mortality_confirmed: false,
      model_excluded: true,
      scientific_name: crop.scientific_name,
      suitability_score: 0.0,
      yield_factor: 0.0,
      linguistic_grade: "Ngoài giới hạn nhiệt của mô hình (experimental)",
      is_lethal: true,
      reason: `Nhiệt độ trung bình ${tempAvg.toFixed(1)}°C nằm ngoài giới hạn mô hình [${crop.temp_limits.kill_min}, ${crop.temp_limits.kill_max}]°C; chưa xác minh theo giống.`
    };
  }

  // 2. KIỂM TRA ĐIỀU KIỆN HẠN HÁN SA MẠC TỬ THẦN (Extreme Aridity Death)
  if (cropKey !== "Fallow" && rainSeasonAccum < 35.0 && soilMoistureAvg < 0.20) {
    return {
      crop: cropKey,
      scientific_name: crop.scientific_name,
      suitability_score: 0.0,
      yield_factor: 0.0,
      linguistic_grade: "Chết khô do thiếu nước cực hạn (Severe Desiccation)",
      mortality_confirmed: false,
      model_excluded: true,
      model_status: "experimental_unvalidated",
      is_lethal: true,
      reason: `Lượng mưa mùa vụ ${rainSeasonAccum.toFixed(0)}mm và ẩm đất ${soilMoistureAvg.toFixed(2)} chạm điểm héo vĩnh viễn.`
    };
  }

  // 3. TÍNH TOÁN LIÊN THUỘC MỜ THEO TỪNG TIÊU CHÍ
  const muTemp = fuzzyTrapezoid(
    tempAvg,
    crop.temp_limits.kill_min,
    crop.temp_limits.opt_min,
    crop.temp_limits.opt_max,
    crop.temp_limits.kill_max
  );

  const muRain = fuzzyTrapezoid(
    rainSeasonAccum,
    crop.rain_limits.kill_min,
    crop.rain_limits.opt_min,
    crop.rain_limits.opt_max,
    crop.rain_limits.kill_max
  );

  const muMoisture = fuzzyTrapezoid(
    soilMoistureAvg,
    crop.soil_moisture_limits.kill_min,
    crop.soil_moisture_limits.opt_min,
    crop.soil_moisture_limits.opt_max,
    crop.soil_moisture_limits.kill_max
  );

  // Phạt sốc nhiệt bề mặt
  let heatPenalty = 1.0;
  if (maxTs > 35.0) {
    heatPenalty = Math.max(0.2, 1.0 - (maxTs - 35.0) * 0.12);
  }

  // Liebig's Law of Minimum: Nếu một yếu tố quá kém, năng suất bị giới hạn bởi yếu tố đó
  const limitingFactor = Math.min(muTemp, muMoisture);
  const compositeScore = (0.35 * muTemp + 0.35 * muMoisture + 0.30 * muRain) * heatPenalty * (0.5 + 0.5 * limitingFactor);
  const suitabilityScore = Math.round(compositeScore * 1000) / 10;

  let linguisticGrade = "Không phù hợp (Unsuitable)";
  if (suitabilityScore >= 75) linguisticGrade = "Rất phù hợp (Highly Suitable - S1)";
  else if (suitabilityScore >= 55) linguisticGrade = "Phù hợp vừa phải (Moderately Suitable - S2)";
  else if (suitabilityScore >= 35) linguisticGrade = "Cận biên (Marginally Suitable - S3)";

  return {
    crop: cropKey,
    model_status: "experimental_unvalidated",
    scientific_name: crop.scientific_name,
    suitability_score: suitabilityScore,
    yield_factor: Math.round(compositeScore * 100) / 100,
    linguistic_grade: frostDetected && crop.frost_response==='variety_dependent' ? 'Nguy cơ rét phụ thuộc giống rau; cần chọn giống chịu lạnh' : linguisticGrade,
    mortality_confirmed:false,
    cold_risk:{status:crop.frost_response==='not_applicable'?'not_applicable':frostDetected?'variety_dependent':exposure?.unknown_months?.length?'unknown':'not_detected_in_available_data',
      ...(exposure || {frost_months:[],unknown_months:[]})},
    is_lethal: false,
    sub_scores: {
      temperature_fit: Math.round(muTemp * 100),
      soil_moisture_fit: Math.round(muMoisture * 100),
      rainfall_fit: Math.round(muRain * 100),
      heat_penalty: Math.round(heatPenalty * 100)
    }
  };
}

module.exports = {
  SCIENTIFIC_CROP_PROFILES,
  fuzzyTrapezoid,
  computeCropSeasonSuitability
};

// ─── Test thực thi ───
if (require.main === module) {
  console.log("=== KIỂM THỬ THUẬT TOÁN 11 (HIỆU CHỈNH V2) ===");
  // Test 1: Băng tuyết Greenland (-25°C) -> Phải về 0 điểm
  const greenlandEnv = { tempAvg: -25.0, rainSeasonAccum: 20.0, soilMoistureAvg: 0.1, maxTs: -15.0 };
  console.log("1. Lúa ở Greenland (phải = 0):", computeCropSeasonSuitability("Rice", greenlandEnv));

  // Test 2: Sa mạc khô hạn cực đoan (38°C, mưa 10mm, ẩm 0.12) -> Phải về 0 điểm
  const desertEnv = { tempAvg: 38.0, rainSeasonAccum: 10.0, soilMoistureAvg: 0.12, maxTs: 48.0 };
  console.log("2. Ngô ở Sa mạc (phải = 0):", computeCropSeasonSuitability("Maize", desertEnv));

  // Test 3: ĐBSCL thuận lợi (28°C, mưa 600mm, ẩm 0.75) -> Phải > 80 điểm
  const mekongEnv = { tempAvg: 28.0, rainSeasonAccum: 600.0, soilMoistureAvg: 0.75, maxTs: 32.0 };
  console.log("3. Lúa ở ĐBSCL:", computeCropSeasonSuitability("Rice", mekongEnv));
}
