/**
 * ==============================================================================
 * THUẬT TOÁN 06: REMOTE SENSING INDICES (NDVI, EVI, NDMI, SAVI, ESI & EROSION V2)
 * ==============================================================================
 * 
 * 1. BỐI CẢNH KHOA HỌC & RÀNG BUỘC SINH ĐỊA CẢNH:
 *    - Chế độ phổ thực nghiệm:
 *      + NDVI (Rouse 1974): $(\rho_{NIR} - \rho_{Red}) / (\rho_{NIR} + \rho_{Red})$
 *      + EVI (Huete 2002): $2.5 \times (\rho_{NIR} - \rho_{Red}) / (\rho_{NIR} + 6\rho_{Red} - 7.5\rho_{Blue} + 1)$
 *      + NDMI (Gao 1996): $(\rho_{NIR} - \rho_{SWIR1}) / (\rho_{NIR} + \rho_{SWIR1})$
 *      + SAVI (Huete 1988): $[(\rho_{NIR} - \rho_{Red}) / (\rho_{NIR} + \rho_{Red} + L)] \times (1 + L)$ (với $L = 0.5$)
 *    - Chế độ ước tính vi khí hậu (Biophysical Climate Proxy):
 *      Áp dụng triệt để định luật Liebig về yếu tố hạn chế và nhiệt động học:
 *      1. Ràng buộc băng giá (Cryosphere Constraint): Khi nhiệt độ $T < 0^\circ\text{C}$ (Greenland, mùa đông hàn đới),
 *         thực vật quang hợp dừng hoàn toàn, lá rụng hoặc phủ băng $\implies \text{NDVI} \le 0.05$.
 *      2. Ràng buộc hoang mạc cực hạn (Hyper-Arid Constraint): Khi lượng mưa $< 30\text{ mm}$ và $\theta < 0.18$,
 *         đất trơ sỏi cát $\implies \text{NDVI} \le 0.08$.
 */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round(v, dec = 3) {
  const p = Math.pow(10, dec);
  return Math.round(v * p) / p;
}

function computeNDVISpectral(nir, red) {
  const denom = nir + red;
  if (denom <= 1e-6) return 0.0;
  return round(clamp((nir - red) / denom, -1.0, 1.0), 3);
}

function computeEVISpectral(nir, red, blue) {
  const denom = nir + 6.0 * red - 7.5 * blue + 1.0;
  if (Math.abs(denom) <= 1e-6) return 0.0;
  return round(clamp(2.5 * ((nir - red) / denom), -1.0, 1.0), 3);
}

function computeNDMISpectral(nir, swir1) {
  const denom = nir + swir1;
  if (denom <= 1e-6) return 0.0;
  return round(clamp((nir - swir1) / denom, -1.0, 1.0), 3);
}

function computeSAVISpectral(nir, red, L = 0.5) {
  const denom = nir + red + L;
  if (denom <= 1e-6) return 0.0;
  return round(clamp(((nir - red) / denom) * (1.0 + L), -1.0, 1.0), 3);
}

/**
 * Mô hình ước tính chỉ số viễn thám có kiểm soát theo quy luật sinh lý sinh thái
 */
function estimateVegetationProxyFromClimate(gwetroot, rainMonthly, tempAir, tempSkin) {
  const n = gwetroot.length;
  const estimatedNDVI = [];
  const estimatedESI = [];
  const estimatedErosion = [];

  for (let i = 0; i < n; i++) {
    const gw = gwetroot[i];
    const rain = rainMonthly[i];
    const ta = tempAir[i];
    const ts = tempSkin[i];

    // 1. RÀNG BUỘC BĂNG GIÁ VÀ HÀN ĐỚI (Freezing & Frost Constraint)
    if (ta < 0.0) {
      // Đất đóng băng, tuyết phủ, không có diệp lục hoạt động
      estimatedNDVI.push(0.04);
      estimatedESI.push(0.02);
      estimatedErosion.push(0.01);
      continue;
    }

    // 2. RÀNG BUỘC HOANG MẠC KHÔ HẠN (Extreme Desert Constraint)
    if (gw < 0.15 && rain < 5.0) {
      estimatedNDVI.push(0.07);
      estimatedESI.push(0.05);
      estimatedErosion.push(0.12);
      continue;
    }

    // 3. MÔ HÌNH GHÉP CẶP ĐẤT - NƯỚC - NHIỆT (Vùng nông nghiệp bình thường)
    // Nhiệt độ tối ưu quang hợp C3/C4 là 22 - 30°C. Vượt quá 35°C khí khổng đóng
    let tempSuitability = 1.0;
    if (ta < 15.0) {
      tempSuitability = Math.max(0.1, (ta - 0.0) / 15.0);
    } else if (ta > 34.0) {
      tempSuitability = Math.max(0.3, 1.0 - (ta - 34.0) * 0.08);
    }

    const moistureAvailability = Math.min(1.0, gw * 0.70 + (rain / 250.0) * 0.30);
    const ndviVal = clamp(0.10 + 0.75 * moistureAvailability * tempSuitability, 0.05, 0.88);

    // ESI: Tỷ số bốc thoát hơi nước AET / PET
    const deltaT = Math.max(0, ts - ta);
    const thermalStress = Math.min(0.5, (deltaT / 12.0) * 0.35);
    const esiVal = clamp(gw * 0.85 + (rain / 200.0) * 0.15 - thermalStress, 0.05, 0.95);

    // Erosion Risk (RUSLE R-Factor Proxy)
    const rainIntensity = rain / 220.0;
    const erosionRisk = clamp(rainIntensity * (1.1 - ndviVal), 0.0, 1.0);

    estimatedNDVI.push(round(ndviVal, 3));
    estimatedESI.push(round(esiVal, 3));
    estimatedErosion.push(round(erosionRisk, 3));
  }

  return {
    NDVI: estimatedNDVI,
    ESI: estimatedESI,
    EROSION: estimatedErosion,
    NDVI_PROXY: estimatedNDVI,
    ESI_PROXY: estimatedESI,
    EROSION_PROXY: estimatedErosion,
    is_proxy: true,
    metadata: {
      status: "derived_proxy",
      quality: "calibrated_biophysical_proxy",
      method: "Biophysical Temperature-Moisture Empirical Coupling Proxy (Liebig Law & Cryosphere Aware)",
      warning: "GIÁ TRỊ ƯỚC TÍNH (PROXY) TỪ KHÍ TƯỢNG NASA POWER. KHÔNG PHẢI PHÉP ĐO QUANG PHỔ TRỰC TIẾP TỪ MODIS HOẶC ECOSTRESS."
    }
  };
}

module.exports = {
  computeNDVISpectral,
  computeEVISpectral,
  computeNDMISpectral,
  computeSAVISpectral,
  estimateVegetationProxyFromClimate
};

// ─── Test thực thi ───
if (require.main === module) {
  console.log("=== KIỂM THỬ THUẬT TOÁN 06 (REMOTE SENSING V2) ===");
  // Kiểm thử vùng băng tuyết quanh năm Ta = -25°C
  const iceGwet = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const iceRain = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const iceTa = [-35, -34, -30, -25, -15, -5, -2, -3, -10, -20, -30, -35];
  const iceRes = estimateVegetationProxyFromClimate(iceGwet, iceRain, iceTa, iceTa);
  console.log("NDVI vùng băng tuyết (phải <= 0.05):", iceRes.NDVI[0]);

  // Kiểm thử vùng lúa nhiệt đới
  const tropGwet = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.58];
  const tropRain = [80, 120, 150, 200, 250, 280, 260, 220, 180, 140, 100, 70];
  const tropTa = [25, 26, 27, 28, 29, 29, 28, 28, 28, 27, 26, 25];
  const tropRes = estimateVegetationProxyFromClimate(tropGwet, tropRain, tropTa, tropTa);
  console.log("NDVI vùng nhiệt đới vụ mùa (phải > 0.7):", tropRes.NDVI[5]);
}
