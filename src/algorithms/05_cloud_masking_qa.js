/**
 * ==============================================================================
 * THUẬT TOÁN 05: CLOUD MASKING & SCENE CLASSIFICATION (FMASK 4.0 & MULTI-SENSOR QA)
 * ==============================================================================
 *
 * 1. BỐI CẢNH KHOA HỌC:
 *    Tách biệt riêng biệt 3 chuẩn mặt nạ chất lượng viễn thám hàng đầu thế giới:
 *    - USGS Landsat 8/9 Collection-2 QA_PIXEL bitmask.
 *    - NASA MODIS MOD09GA / MOD13Q1 16-bit State QA.
 *    - ESA Sentinel-2 L2A Scene Classification Layer (SCL 20m).
 *    Kết hợp kiểm tra phân loại quang phổ Fmask 4.0 (Zhu & Woodcock 2012, Qiu et al. 2019).
 */

const SCENE_CLASSES = {
  0: "NO_DATA",
  1: "SATURATED_OR_DEFECTIVE",
  2: "DARK_AREA_PIXELS",
  3: "CLOUD_SHADOWS",
  4: "VEGETATION",
  5: "NOT_VEGETATED_BARE_SOIL",
  6: "WATER",
  7: "UNCLASSIFIED",
  8: "CLOUD_MEDIUM_PROBABILITY",
  9: "CLOUD_HIGH_PROBABILITY",
  10: "THIN_CIRRUS",
  11: "SNOW_OR_ICE"
};

/**
 * 1. Giải mã USGS Landsat-8/9 Collection-2 QA_PIXEL (16-bit)
 * Bit 0: Fill (1 = Fill / No Data)
 * Bit 1: Dilated Cloud
 * Bit 2: Cirrus (1 = Cirrus)
 * Bit 3: Cloud (1 = Cloud)
 * Bit 4: Cloud Shadow (1 = Shadow)
 * Bit 5: Snow (1 = Snow)
 * Bit 7: Water (1 = Water)
 * Bits 8-9: Cloud Confidence (00=None, 01=Low, 10=Medium, 11=High)
 */
function decodeLandsatQAPixel(qaInt16) {
  const isFill = (qaInt16 & 0b1) === 1;
  const dilatedCloud = ((qaInt16 >> 1) & 0b1) === 1;
  const cirrus = ((qaInt16 >> 2) & 0b1) === 1;
  const cloud = ((qaInt16 >> 3) & 0b1) === 1;
  const cloudShadow = ((qaInt16 >> 4) & 0b1) === 1;
  const snow = ((qaInt16 >> 5) & 0b1) === 1;
  const water = ((qaInt16 >> 7) & 0b1) === 1;
  const cloudConf = (qaInt16 >> 8) & 0b11;

  const isCloudy = cloud || dilatedCloud || cloudConf >= 2;
  const isClear = !isFill && !isCloudy && !cloudShadow && !cirrus;

  return {
    sensor: "USGS Landsat-8/9 QA_PIXEL",
    raw_code: qaInt16,
    is_fill_nodata: isFill,
    is_clear: isClear,
    is_cloud: isCloudy,
    is_cloud_shadow: cloudShadow,
    is_cirrus: cirrus,
    is_snow: snow,
    is_water: water,
    cloud_confidence: ["None", "Low", "Medium", "High"][cloudConf],
    usable_for_agriculture: isClear && !water && !snow
  };
}

/**
 * 2. Giải mã NASA MODIS MOD09GA 16-bit State QA (Surface Reflectance Quality)
 * [R6] LP DAAC MOD09 User Guide
 * Bits 0-1: Cloud State (00=Clear, 01=Cloudy, 10=Mixed, 11=Not set/Assumed Clear)
 * Bit 2: Cloud Shadow (1 = Yes)
 * Bits 8-9: Cirrus (00=None, 01=Small, 10=Average, 11=High)
 * Bit 10: Internal Cloud Flag (1 = Yes)
 * Bit 12: MOD35 Snow/Ice Flag (1 = Yes)
 */
function decodeMod09GAStateQA(qaInt16) {
  const cloudState = qaInt16 & 0b11;
  const cloudShadow = ((qaInt16 >> 2) & 0b1) === 1;
  const cirrus = ((qaInt16 >> 8) & 0b11) >= 1;
  const internalCloud = ((qaInt16 >> 10) & 0b1) === 1;
  const snowIce = ((qaInt16 >> 12) & 0b1) === 1 || ((qaInt16 >> 15) & 1) === 1;
  const adjacentCloud = ((qaInt16 >> 13) & 1) === 1;
  const landWater = (qaInt16 >> 3) & 7;
  const isWater = landWater !== 1; // MOD09: 001 is land; coast and all water classes are excluded conservatively.

  const isCloud = cloudState === 1 || cloudState === 2 || internalCloud;
  const isClear = cloudState === 0 && !cloudShadow && !cirrus && !internalCloud && !adjacentCloud;

  return {
    sensor: "NASA MODIS MOD09GA StateQA",
    raw_code: qaInt16,
    is_fill_nodata: qaInt16 === 65535,
    quality_unknown: cloudState === 3,
    is_clear: isClear,
    is_cloud: isCloud,
    is_cloud_shadow: cloudShadow,
    is_cirrus: cirrus,
    is_snow: snowIce,
    is_water: isWater,
    adjacent_cloud: adjacentCloud,
    usable_for_agriculture: isClear && !snowIce && !isWater
  };
}

/**
 * 2b. Giải mã NASA MODIS MOD13Q1 Pixel Reliability / Summary QA
 * [R5] LP DAAC MOD13 User Guide
 * Rank:
 * -1 = Fill/No Data
 *  0 = Good Data (Use with confidence)
 *  1 = Marginal Data (Useful, but check detailed QA)
 *  2 = Snow / Ice (Target covered with snow/ice)
 *  3 = Cloudy (Target covered with clouds)
 */
function decodeMod13Q1SummaryQA(pixelReliability) {
  const code = Number(pixelReliability);
  const labels = {
    [-1]: "FILL_NO_DATA",
    0: "GOOD_DATA",
    1: "MARGINAL_DATA",
    2: "SNOW_ICE",
    3: "CLOUDY"
  };

  const isClear = code === 0 || code === 1;
  const isCloud = code === 3;
  const isSnow = code === 2;
  const isFill = code === -1;

  return {
    sensor: "NASA MODIS MOD13Q1 Pixel Reliability Summary QA",
    raw_code: code,
    label: labels[code] || "UNKNOWN",
    is_fill_nodata: isFill,
    is_clear: code === 0,
    is_cloud: isCloud,
    is_cloud_shadow: false,
    is_cirrus: false,
    is_snow: isSnow,
    is_water: false,
    usable_for_agriculture: code === 0
  };
}

const decodeModisStateQA = decodeMod09GAStateQA;

/**
 * 3. Giải mã ESA Sentinel-2 Level-2A Scene Classification Layer (SCL)
 */
function decodeSentinel2SCL(sclVal) {
  const code = Number(sclVal);
  const label = SCENE_CLASSES[code] || "UNKNOWN";

  const isFill = code === 0 || code === 1;
  const isCloud = code === 8 || code === 9; // Medium & High Prob Cloud
  const isCirrus = code === 10;
  const isShadow = code === 3;
  const isSnow = code === 11;
  const isWater = code === 6;
  const isVegetation = code === 4;
  const isBareSoil = code === 5;

  const isClear = isVegetation || isBareSoil;

  return {
    sensor: "ESA Sentinel-2 L2A SCL",
    raw_code: code,
    label,
    is_fill_nodata: isFill,
    is_clear: isClear,
    is_cloud: isCloud,
    is_cloud_shadow: isShadow,
    is_cirrus: isCirrus,
    is_snow: isSnow,
    is_water: isWater,
    usable_for_agriculture: isVegetation || isBareSoil
  };
}

/**
 * Bộ giải mã chất lượng ảnh viễn thám theo sản phẩm cụ thể
 * Yêu cầu khai báo productType rõ ràng để tránh nhầm lẫn giữa SCL và Bitmask
 */
function maskCloudByProduct(value, productType) {
  if (!productType || productType.toUpperCase() === "AUTO") {
    throw new TypeError(
      "maskCloudByProduct: Ambiguous 'AUTO' sensor type is disabled. Explicit productType required ('MOD13Q1', 'MOD09GA', 'LANDSAT_C2', 'SENTINEL2_SCL')."
    );
  }
  const type = productType.toUpperCase();
  const limits = {LANDSAT_C2:[0,65535],MOD13Q1:[-1,3],MOD09GA:[0,65535],SENTINEL2_SCL:[0,11]};
  if (!limits[type]) throw new TypeError(`Unrecognized productType: ${productType}`);
  if (!Number.isInteger(value) || value < limits[type][0] || value > limits[type][1]) throw new TypeError('Invalid or missing product QA value');
  if (type === 'LANDSAT_C2') return decodeLandsatQAPixel(value);
  if (type === 'MOD13Q1') return decodeMod13Q1SummaryQA(value);
  if (type === 'MOD09GA') return decodeMod09GAStateQA(value);
  if (type === 'SENTINEL2_SCL') return decodeSentinel2SCL(value);

  throw new TypeError(`Unrecognized productType: ${productType}`);
}

/**
 * Wrapper tương thích ngược với API cũ
 * @deprecated Sử dụng decodeLandsatQAPixel hoặc decodeMod09GAStateQA trực tiếp.
 */
function decodeQABitmask(qaInt16) {
  const modis = decodeMod09GAStateQA(qaInt16);
  const landsat = decodeLandsatQAPixel(qaInt16);
  return {
    raw_code: qaInt16,
    is_fill_nodata: (qaInt16 & 0b1) === 1 && (qaInt16 >> 3) === 0,
    is_clear: qaInt16 === 0,
    is_cloud: modis.is_cloud || landsat.is_cloud,
    is_cloud_shadow: modis.is_cloud_shadow || landsat.is_cloud_shadow,
    is_cirrus: modis.is_cirrus || landsat.is_cirrus,
    is_snow: modis.is_snow || landsat.is_snow,
    is_water: landsat.is_water,
    usable_for_agriculture: qaInt16 === 0
  };
}

/**
 * Heuristic Spectral Mask (Bộ lọc phân loại quang phổ đơn giản lấy cảm hứng từ Fmask)
 * Ghi chú khoa học: Đây là heuristic lọc phổ nhanh, chưa phải toàn bộ thuật toán Fmask 4.0 đầy đủ.
 */
function heuristicSpectralMask(bands) {
  const { blue, green, red, nir, swir1, swir2 = 0.1, tempKelvin = null } = bands;

  if (blue === null || red === null || nir === null || isNaN(blue) || isNaN(red) || isNaN(nir)) {
    return { class_id: 0, label: SCENE_CLASSES[0], valid: false };
  }

  // 1. Tính toán các chỉ số phổ cơ bản
  const ndvi = (nir - red) / Math.max(nir + red, 1e-5);
  const ndsi = (green - swir1) / Math.max(green + swir1, 1e-5);
  const meanVis = (blue + green + red) / 3.0;
  const whiteness = (Math.abs(blue - meanVis) + Math.abs(green - meanVis) + Math.abs(red - meanVis)) / Math.max(meanVis, 1e-4);

  // 2. Kiểm tra mặt nước (Water Test)
  if ((ndvi < 0.01 && nir < 0.11) || (nir < 0.05 && swir1 < 0.05)) {
    return {
      class_id: 6,
      label: SCENE_CLASSES[6],
      valid: false,
      reason: "Đặc trưng phản xạ hấp thụ mạnh ở NIR và SWIR phù hợp với mặt nước / biển"
    };
  }

  // 3. Kiểm tra Tuyết và Băng (Snow/Ice Test)
  if (ndsi > 0.40 && green > 0.25 && (tempKelvin === null || tempKelvin < 275.0)) {
    return {
      class_id: 11,
      label: SCENE_CLASSES[11],
      valid: false,
      reason: "Chỉ số NDSI cao kết hợp hấp thụ SWIR đặc trưng của băng tuyết vĩnh cửu"
    };
  }

  // 4. Kiểm tra Mây Dày (Thick Cloud Test - Fmask)
  if (ndsi < 0.40 && meanVis > 0.20 && swir1 > 0.15 && whiteness < 0.70) {
    if (tempKelvin === null || tempKelvin < 285.0) {
      return {
        class_id: 9,
        label: SCENE_CLASSES[9],
        valid: false,
        reason: "Phản xạ quang phổ khả kiến đồng đều cao kết hợp nhiệt độ đỉnh mây thấp"
      };
    }
  }

  // 5. Kiểm tra Mây Mỏng / Mây Ti (Cirrus Test)
  if (swir2 > 0.12 && blue > 0.22 && ndvi < 0.2) {
    return {
      class_id: 10,
      label: SCENE_CLASSES[10],
      valid: false,
      reason: "Phát hiện mây ti quang học mỏng qua tán xạ Rayleigh dải bước sóng ngắn"
    };
  }

  // 6. Phân biệt Đất trống và Thực vật
  if (ndvi >= 0.25) {
    return {
      class_id: 4,
      label: SCENE_CLASSES[4],
      valid: true,
      ndvi: Math.round(ndvi * 1000) / 1000,
      reason: "Đặc trưng phản xạ thảm thực vật diệp lục khỏe mạnh"
    };
  }

  return {
    class_id: 5,
    label: SCENE_CLASSES[5],
    valid: true,
    ndvi: Math.round(ndvi * 1000) / 1000,
    reason: "Đất trống hoặc thảm thực vật thưa thớt"
  };
}

module.exports = {
  SCENE_CLASSES,
  decodeLandsatQAPixel,
  decodeModisStateQA,
  decodeMod09GAStateQA,
  decodeMod13Q1SummaryQA,
  decodeSentinel2SCL,
  maskCloudByProduct,
  decodeQABitmask,
  heuristicSpectralMask,
  classifyPixelSpectra: heuristicSpectralMask
};
