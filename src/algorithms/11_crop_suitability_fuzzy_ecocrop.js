/**
 * ==============================================================================
 * THUẬT TOÁN 11: CONTINUOUS CROP SUITABILITY — FAO ECOCROP & FUZZY LOGIC (HIỆU CHỈNH V2)
 * ==============================================================================
 * 
 * 1. BỐI CẢNH KHOA HỌC & HIỆU CHỈNH CỐT LÕI:
 *    - Khắc phục lỗ hổng sương giá (Cold Kill) & Sa mạc (Arid Kill):
 *      Nếu nhiệt độ trung bình mùa vụ rơi xuống dưới ngưỡng sinh tồn tuyệt đối (như Greenland,
 *      Bắc Cực quanh năm âm độ, hoặc vùng núi tuyết), điểm thích ứng nông học BẮT BUỘC PHẢI VỀ 0.
 *      Không một loại cây trồng nhiệt đới hay ôn đới nào (Lúa, Đậu tương, Ngô, Rau) có thể
 *      sống sót trong điều kiện đóng băng vĩnh cửu.
 *    - Tương tự, nếu lượng mưa tích lũy cả vụ dưới 30mm và đất khô dưới điểm héo vĩnh viễn (PWP),
 *      cây trồng chết héo nếu không có hệ thống thủy lợi $\implies \text{Suitability} = 0$.
 */

const SCIENTIFIC_CROP_PROFILES = {
  Rice: {
    scientific_name: "Oryza sativa (Lúa nước)",
    fao_ecocrop_code: 1530,
    source_reference: "FAO EcoCrop Database & IRRI Rice Knowledge Bank",
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
    fao_ecocrop_code: 1140,
    source_reference: "FAO EcoCrop Database & USDA Soybean Production Guide",
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
    fao_ecocrop_code: 480,
    source_reference: "FAO EcoCrop Database & ICRISAT Groundnut Compendium",
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
    fao_ecocrop_code: 2240,
    source_reference: "FAO EcoCrop Database & CIMMYT Maize Agronomy",
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
    fao_ecocrop_code: 3000,
    source_reference: "AVRDC World Vegetable Center Technical Guidelines",
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
    fao_ecocrop_code: 9999,
    source_reference: "Agronomic standard practice for soil health regeneration",
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
function fuzzyTrapezoid(x, a, b, c, d) {
  if (x <= a || x >= d) return 0.0;
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

  // 1. KIỂM TRA ĐIỀU KIỆN TỬ HÌNH BĂNG GIÁ (Freezing Death Penalty)
  // Nếu nhiệt độ trung bình dưới ngưỡng chết buốt (ví dụ lúa < 12°C, hoặc mùa vụ < 0°C)
  if (tempAvg < crop.temp_limits.kill_min) {
    return {
      crop: cropKey,
      scientific_name: crop.scientific_name,
      suitability_score: 0.0,
      yield_factor: 0.0,
      linguistic_grade: "Bị sương giá hủy diệt hoàn toàn (Frozen / Lethal Cold)",
      is_lethal: true,
      reason: `Nhiệt độ ${tempAvg.toFixed(1)}°C thấp hơn ngưỡng sinh tồn ${crop.temp_limits.kill_min}°C.`
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
    scientific_name: crop.scientific_name,
    suitability_score: suitabilityScore,
    yield_factor: Math.round(compositeScore * 100) / 100,
    linguistic_grade: linguisticGrade,
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
