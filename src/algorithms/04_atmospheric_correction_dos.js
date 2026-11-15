/**
 * ==============================================================================
 * THUẬT TOÁN 04: ATMOSPHERIC CORRECTION — DOS1 & RADIOMETRIC CALIBRATION (V2)
 * ==============================================================================
 * 
 * 1. BỐI CẢNH KHOA HỌC & KIỂM CHỨNG:
 *    Phương pháp Dark Object Subtraction (DOS1 - Chavez 1988, 1996) và Hiệu chuẩn bức xạ
 *    chuyển đổi độ chói đỉnh khí quyển (TOA Radiance) thành hệ số phản xạ bề mặt đáy khí quyển
 *    (Bottom-of-Atmosphere - BOA Surface Reflectance).
 * 
 * 2. CÔNG THỨC TOÁN HỌC HOÀN CHỈNH:
 *    $$\rho_\lambda = \frac{\pi \cdot (L_\lambda - L_{\text{path}})}{T_v \cdot [ESUN_\lambda \cdot \cos(\theta_s) \cdot d^{-2} \cdot T_z + E_{\text{down}}]}$$
 *    Trong đó:
 *    - $L_\lambda$: Độ chói phổ TOA ($W \cdot m^{-2} \cdot sr^{-1} \cdot \mu m^{-1}$).
 *    - $L_{\text{path}}$: Độ chói tán xạ khí quyển (Path Radiance / Haze).
 *    - $ESUN_\lambda$: Hằng số bức xạ mặt trời ngoài khí quyển trung bình (Mean Exoatmospheric Solar Irradiance).
 *    - $\theta_s$: Góc thiên đỉnh mặt trời (Solar Zenith Angle).
 *    - $d$: Khoảng cách Trái Đất - Mặt Trời (Astronomical Units).
 *    - $T_z, T_v$: Độ truyền qua của khí quyển theo hướng chiếu mặt trời và hướng nhìn cảm biến:
 *      $$T_z = \exp(-\tau_\lambda / \cos\theta_s), \quad T_v = \exp(-\tau_\lambda / \cos\theta_v)$$
 *      Với $\tau_\lambda$ là độ dày quang học Rayleigh: $\tau_\lambda \approx 0.008569 \cdot \lambda^{-4} \cdot (1 + 0.0113 \lambda^{-2})$.
 * 
 * 3. BẢNG HẰNG SỐ ESUN THEO CẢM BIẾN (W/m²/µm):
 *    - Sentinel-2A MSI: Blue (B2, 492nm): 1959.77; Green (B3, 560nm): 1824.93; Red (B4, 665nm): 1512.79; NIR (B8, 842nm): 1041.63.
 *    - Landsat 8/9 OLI: Blue (B2): 2004.57; Green (B3): 1820.75; Red (B4): 1549.49; NIR (B5): 951.19.
 */

const ESUN_CONSTANTS = {
  "Sentinel-2A": {
    Blue: 1959.77,
    Green: 1824.93,
    Red: 1512.79,
    NIR: 1041.63,
    SWIR1: 247.08
  },
  "Landsat-8": {
    Blue: 2004.57,
    Green: 1820.75,
    Red: 1549.49,
    NIR: 951.19,
    SWIR1: 247.55
  }
};

/**
 * Tính khoảng cách tương đối Trái Đất - Mặt Trời d (AU) theo ngày trong năm (DOY)
 */
function calculateEarthSunDistance(dayOfYear) {
  const theta = (2 * Math.PI * (dayOfYear - 1)) / 365.25;
  const d2 = 1.000110 + 0.034221 * Math.cos(theta) + 0.001280 * Math.sin(theta)
             + 0.000719 * Math.cos(2 * theta) + 0.000077 * Math.sin(2 * theta);
  return 1.0 / Math.sqrt(d2);
}

/**
 * Tính độ dày quang học Rayleigh (Rayleigh Optical Thickness) theo bước sóng lambda (micromet)
 */
function calculateRayleighOpticalThickness(wavelengthMicrons) {
  const l = wavelengthMicrons;
  return 0.008569 * Math.pow(l, -4) * (1 + 0.0113 * Math.pow(l, -2) + 0.00013 * Math.pow(l, -4));
}

/**
 * Hiệu chỉnh khí quyển DOS1 toàn diện cho dải phổ quang học
 * Hỗ trợ các kiểu dữ liệu đầu vào: "TOA_REFLECTANCE", "RADIANCES", "SCALED_INTEGER"
 */
function applyDarkObjectSubtraction(bandPixels, options = {}) {
  const {
    sensor = "Sentinel-2A",
    band = "Red",
    sunZenithDeg = 35.0,
    dayOfYear = 180,
    assumedMinSurfaceReflectance = 0.01, // Giả định vật thể tối (Dark Object) có phản xạ thực 1%
    inputType = "AUTO", // "TOA_REFLECTANCE" | "RADIANCES" | "SCALED_INTEGER" | "AUTO"
    scaleFactor = 10000.0,
    productLevel = "Level-1C TOA",
    isSurfaceReflectance = false
  } = options;

  // BẢO VỆ DỮ LIỆU: Không tái hiệu chỉnh sản phẩm Level-2 Surface Reflectance đã được hiệu chỉnh khí quyển
  if (isSurfaceReflectance || productLevel.toLowerCase().includes("level-2") || productLevel.toLowerCase().includes("surface reflectance")) {
    throw new TypeError("Cannot apply Dark Object Subtraction: Product is already Level-2 Surface Reflectance.");
  }

  if (!bandPixels || bandPixels.length === 0) {
    return { corrected_pixels: [], haze_radiance: 0 };
  }

  // Tiền xử lý theo kiểu dữ liệu (input type)
  let rawPixels = bandPixels;
  if (inputType === "SCALED_INTEGER") {
    rawPixels = bandPixels.map(p => (typeof p === "number" && !isNaN(p)) ? p / scaleFactor : p);
  }

  const sunZenithRad = (sunZenithDeg * Math.PI) / 180.0;
  const cosZenith = Math.max(0.1, Math.cos(sunZenithRad));
  const d = calculateEarthSunDistance(dayOfYear);
  const esun = ESUN_CONSTANTS[sensor]?.[band] || 1512.79;

  // 1. Tìm giá trị tối nhất trong ảnh (1st percentile để loại trừ pixel lỗi âm)
  const valid = rawPixels.filter(p => typeof p === "number" && !isNaN(p) && p > 0);
  if (valid.length === 0) return { corrected_pixels: rawPixels.slice(), haze_radiance: 0 };

  const sorted = [...valid].sort((a, b) => a - b);
  const darkVal = sorted[Math.floor(sorted.length * 0.01)];

  const wavelengthMap = { Blue: 0.492, Green: 0.560, Red: 0.665, NIR: 0.842, SWIR1: 1.610 };
  const tau = calculateRayleighOpticalThickness(wavelengthMap[band] || 0.665);
  const Tz = Math.exp(-tau / cosZenith);

  const isReflectance = inputType === "TOA_REFLECTANCE" || inputType === "SCALED_INTEGER" || (inputType === "AUTO" && Math.max(...valid) <= 2.0);

  let hazeRadiance = 0;
  let corrected = [];

  if (isReflectance) {
    // Trường hợp đầu vào là TOA Reflectance (0.0 - 1.0)
    hazeRadiance = Math.max(0, darkVal - assumedMinSurfaceReflectance);
    corrected = rawPixels.map(val => {
      if (val === null || isNaN(val) || val <= 0) return 0.001;
      const boa = (val - hazeRadiance) / cosZenith;
      return Math.max(0.001, Math.min(1.0, Math.round(boa * 10000) / 10000));
    });
  } else {
    // Trường hợp đầu vào là Radiance (W/m2/sr/um)
    const exoSolar = (esun * cosZenith) / (Math.PI * d * d);
    hazeRadiance = Math.max(0, darkVal - assumedMinSurfaceReflectance * exoSolar);
    corrected = rawPixels.map(val => {
      if (val === null || isNaN(val) || val <= 0) return 0.001;
      const boa = (val - hazeRadiance) / (exoSolar * Tz);
      return Math.max(0.001, Math.min(1.0, Math.round(boa * 10000) / 10000));
    });
  }

  return {
    sensor,
    band,
    inputType: isReflectance ? "TOA_REFLECTANCE" : "RADIANCES",
    corrected_pixels: corrected,
    haze_radiance: Math.round(hazeRadiance * 1000) / 1000,
    haze_value: Math.round(hazeRadiance * 1000) / 1000,
    dark_object_radiance: Math.round(darkVal * 1000) / 1000,
    atmospheric_transmittance: Math.round(Tz * 1000) / 1000,
    earth_sun_distance: Math.round(d * 1000) / 1000,
    cos_zenith: Math.round(cosZenith * 1000) / 1000,
    processing_level: "Prototype DOS1 Bottom-of-Atmosphere (BOA) Reflectance"
  };
}

module.exports = {
  ESUN_CONSTANTS,
  calculateEarthSunDistance,
  calculateRayleighOpticalThickness,
  applyDarkObjectSubtraction
};

// ─── Test kiểm chứng ───
if (require.main === module) {
  console.log("=== KIỂM CHỨNG THUẬT TOÁN 04: DOS1 RADIOMETRIC CORRECTION ===");
  const sampleTOA = [15.2, 16.8, 22.5, 45.0, 78.2, 14.9, 19.3];
  const res = applyDarkObjectSubtraction(sampleTOA, { sensor: "Sentinel-2A", band: "Red", sunZenithDeg: 30, dayOfYear: 150 });
  console.log("Kết quả hiệu chỉnh khí quyển:", res);
}
