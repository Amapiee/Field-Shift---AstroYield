/**
 * ==============================================================================
 * BỘ PHÂN LOẠI ĐỊA HÌNH VÀ VÙNG NƯỚC / BĂNG TUYẾT TOÀN CẦU (GEO-CLASSIFIER)
 * ==============================================================================
 * 
 * Xác định chính xác tọa độ địa lý (Lat, Lon) thuộc:
 * 1. "OCEAN": Biển, đại dương, vịnh, biển nội địa (ví dụ: Vịnh Bắc Bộ, Biển Đông, Thái Bình Dương).
 * 2. "ICE_SHEET": Dải băng tuyết vĩnh cửu, sông băng, băng đảo (ví dụ: Greenland, Nam Cực).
 * 3. "HYPER_ARID_DESERT": Sa mạc cát trắng cực hạn / bãi muối (ví dụ: Lõi Sahara, Rub' al Khali).
 * 4. "LAND": Đất liền có tiềm năng canh tác nông nghiệp.
 */

/**
 * Thuật toán Ray-Casting kiểm tra điểm nằm trong đa giác (Point-in-Polygon)
 */
function isPointInPolygon(point, polygon) {
  const [lat, lon] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];

    const intersect = ((lonI > lon) !== (lonJ > lon)) &&
      (lat < (latJ - latI) * (lon - lonI) / (lonJ - lonI) + latI);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Đa giác các vùng biển / vịnh ven bờ quan trọng ──────────────────────────
// 1. Vịnh Bắc Bộ (Gulf of Tonkin) - Tọa độ bao bọc vùng nước giữa bờ biển miền Bắc VN và đảo Hải Nam
const GULF_OF_TONKIN_POLYGON = [
  // Bờ biển phía Tây: Mép nước biển Việt Nam từ Quảng Trị lên Móng Cái
  [17.0, 107.25], // Ngoài khơi Quảng Trị
  [17.5, 106.65], // Bờ biển Đồng Hới (Quảng Bình)
  [18.0, 106.45], // Bờ biển Kỳ Anh (Hà Tĩnh)
  [18.3, 106.10], // Bờ biển Thạch Hà (Hà Tĩnh)
  [18.7, 105.82], // Bờ biển Cửa Lò (Nghệ An)
  [19.2, 105.75], // Bờ biển Quỳnh Lưu (Nghệ An)
  [19.5, 105.86], // Bờ biển Nghi Sơn (Thanh Hóa)
  [19.8, 105.95], // Bờ biển Sầm Sơn (Thanh Hóa)
  [20.0, 106.12], // Bờ biển Kim Sơn (Ninh Bình)
  [20.15, 106.40],// Bờ biển Hải Hậu (Nam Định)
  [20.28, 106.60],// Mũi Ba Lạt / Giao Thủy (Nam Định)
  [20.38, 106.64],// Bờ biển Cồn Vành / Tiền Hải (Thái Bình)
  [20.55, 106.65],// Bờ biển Diêm Điền / Thái Thụy (Thái Bình)
  [20.70, 106.83],// Bờ biển Đồ Sơn (Hải Phòng)
  [20.80, 106.95],// Cát Hải (Hải Phòng)
  [20.73, 107.08],// Đảo Cát Bà
  [20.95, 107.12],// Vịnh Hạ Long (Quảng Ninh)
  [21.05, 107.42],// Cẩm Phả (Quảng Ninh)
  [21.25, 107.65],// Tiên Yên (Quảng Ninh)
  [21.49, 108.02],// Mũi Trà Cổ / Móng Cái (Quảng Ninh)

  // Bờ biển phía Bắc và Đông: Nam Trung Quốc & Đảo Hải Nam
  [21.8, 108.6],  // Khâm Châu / Phòng Thành Cảng
  [21.5, 109.2],  // Bắc Hải
  [20.5, 109.8],  // Bán đảo Lôi Châu Tây
  [20.1, 109.7],  // Hải Khẩu Tây
  [19.3, 108.6],  // Đảo Hải Nam Tây (Đông Phương)
  [18.2, 108.7],  // Đảo Hải Nam Tây Nam (Tam Á)
  [17.0, 107.6]   // Khép góc về phía Nam ngoài khơi Quảng Trị
];

// 2. Vịnh Thái Lan (Gulf of Thailand)
const GULF_OF_THAILAND_POLYGON = [
  [13.5, 100.5],
  [12.5, 101.5],
  [11.0, 103.0],
  [9.0, 104.5],
  [7.0, 103.5],
  [6.5, 101.5],
  [8.0, 100.0],
  [10.0, 99.2],
  [12.0, 99.8],
  [13.5, 100.1]
];

// ─── Đa giác Đảo Băng Greenland ──────────────────────────────────────────────
const GREENLAND_POLYGON = [
  [59.5, -43.5], // Mũi cực Nam
  [65.0, -39.0],
  [70.0, -22.0],
  [76.0, -18.0],
  [82.0, -25.0],
  [83.8, -35.0], // Mũi cực Bắc (Cape Morris Jesup)
  [82.0, -50.0],
  [78.0, -70.0],
  [76.0, -68.0],
  [70.0, -55.0],
  [65.0, -52.0],
  [60.0, -46.0]
];

// ─── Các hộp giới hạn đại dương mở (Open Oceans Bounding Boxes) ──────────────
const MAJOR_OCEAN_BOXES = [
  // Thái Bình Dương trung tâm & Đông
  { minLat: -55, maxLat: 55, minLon: -179, maxLon: -125 },
  // Thái Bình Dương Tây
  { minLat: -20, maxLat: 15, minLon: 140, maxLon: 180 },
  // Biển Đông trung tâm (South China Sea Deep Basin)
  { minLat: 11.0, maxLat: 18.0, minLon: 111.5, maxLon: 118.5 },
  // Đại Tây Dương trung tâm (Mid Atlantic)
  { minLat: -50, maxLat: 60, minLon: -45, maxLon: -18 },
  // Ấn Độ Dương (Indian Ocean)
  { minLat: -55, maxLat: 10, minLon: 55, maxLon: 95 },
  // Nam Đại Dương (Southern Ocean)
  { minLat: -85, maxLat: -60, minLon: -180, maxLon: 180 },
  // Bắc Băng Dương (Arctic Ocean)
  { minLat: 82, maxLat: 90, minLon: -180, maxLon: 180 },
  // Địa Trung Hải (Mediterranean Deep Basin)
  { minLat: 33, maxLat: 39, minLon: 15, maxLon: 28 },
  // Biển Ả Rập (Arabian Sea)
  { minLat: 12, maxLat: 22, minLon: 60, maxLon: 70 },
  // Vịnh Bengal (Bay of Bengal)
  { minLat: 10, maxLat: 19, minLon: 84, maxLon: 92 },
];

/**
 * Phân loại địa lý toàn diện cho một điểm tọa độ (lat, lon)
 * Kết hợp đa giác địa lý, giới hạn khí hậu và dữ liệu nhiệt độ/băng tuyết
 */
function classifyCoordinates(lat, lon, climateData = null) {
  // 1. Kiểm tra Băng đảo Greenland
  if (lat >= 59.5 && lat <= 84.0 && lon >= -75.0 && lon <= -15.0) {
    if (isPointInPolygon([lat, lon], GREENLAND_POLYGON)) {
      return {
        type: "ICE_SHEET",
        name: "Greenland Ice Sheet (Băng đảo Greenland)",
        is_water: false,
        is_ice: true,
        can_cultivate: false,
        message: "🧊 Tọa độ thuộc dải băng tuyết vĩnh cửu Greenland. Nhiệt độ quanh năm dưới -15°C, không có tầng đất hữu cơ và cây trồng nông nghiệp không thể tồn tại."
      };
    }
  }

  // 2. Kiểm tra Nam Cực (Antarctica)
  if (lat <= -60.0) {
    return {
      type: "ICE_SHEET",
      name: "Antarctica (Nam Cực)",
      is_water: false,
      is_ice: true,
      can_cultivate: false,
      message: "🧊 Tọa độ thuộc lục địa băng Nam Cực. Điều kiện băng giá vĩnh cửu không thể canh tác cây trồng."
    };
  }

  // 3. Kiểm tra Vịnh Bắc Bộ (Gulf of Tonkin)
  if (lat >= 17.0 && lat <= 22.0 && lon >= 105.8 && lon <= 110.0) {
    if (isPointInPolygon([lat, lon], GULF_OF_TONKIN_POLYGON)) {
      return {
        type: "OCEAN",
        name: "Vịnh Bắc Bộ (Gulf of Tonkin)",
        is_water: true,
        is_ice: false,
        can_cultivate: false,
        message: "🌊 Tọa độ nằm trên vùng biển Vịnh Bắc Bộ. Vui lòng chọn vị trí trên đất liền để canh tác nông nghiệp!"
      };
    }
  }

  // 4. Kiểm tra Vịnh Thái Lan
  if (lat >= 6.5 && lat <= 13.5 && lon >= 99.0 && lon <= 104.5) {
    if (isPointInPolygon([lat, lon], GULF_OF_THAILAND_POLYGON)) {
      return {
        type: "OCEAN",
        name: "Vịnh Thái Lan (Gulf of Thailand)",
        is_water: true,
        is_ice: false,
        can_cultivate: false,
        message: "🌊 Tọa độ nằm trên vùng biển Vịnh Thái Lan. Vui lòng chọn vị trí trên đất liền!"
      };
    }
  }

  // 5. Kiểm tra các vùng biển sâu & đại dương mở
  for (const box of MAJOR_OCEAN_BOXES) {
    if (lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon) {
      return {
        type: "OCEAN",
        name: "Đại dương / Biển mở",
        is_water: true,
        is_ice: false,
        can_cultivate: false,
        message: "🌊 Tọa độ nằm ngoài đại dương/vùng biển mở. Vệ tinh nông nghiệp SMAP/GPM không hỗ trợ vùng nước!"
      };
    }
  }

  // 6. Kiểm tra dựa trên dữ liệu khí hậu (nếu được cung cấp)
  if (climateData) {
    const { T2M, PRECTOTCORR, GWETROOT } = climateData;

    if (T2M && Array.isArray(T2M)) {
      const annualMeanT2M = T2M.reduce((a, b) => a + b, 0) / T2M.length;
      const maxSummerT2M = Math.max(...T2M);

      const minWinterT2M = Math.min(...T2M);

      // 1) Băng hà / Đóng băng vĩnh cửu vùng cực (Permafrost / Polar Glacier)
      if (annualMeanT2M < -5.0 && maxSummerT2M < 4.0) {
        return {
          type: "ICE_SHEET",
          name: "Vùng Băng hà / Đóng băng vĩnh cửu (Permafrost / Tundra Glacier)",
          is_water: false,
          is_ice: true,
          can_cultivate: false,
          message: "🧊 Nhiệt độ quanh năm đóng băng (T2M TB: " + annualMeanT2M.toFixed(1) + "°C). Đất đóng băng vĩnh cửu (Permafrost), không có mùa sinh trưởng cho cây trồng."
        };
      }

      // 2) Đỉnh núi băng tuyết vĩnh cửu (Perpetual Alpine Glacier / Snow Peak)
      if (annualMeanT2M < -2.0 && maxSummerT2M < 6.5) {
        return {
          type: "ICE_SHEET",
          name: "Đỉnh núi tuyết phủ / Sông băng vĩnh cửu (Alpine Glacier / Snow Peak)",
          is_water: false,
          is_ice: true,
          is_alpine: true,
          can_cultivate: false,
          message: "🏔️ Tọa độ thuộc đỉnh núi tuyết phủ / sông băng vĩnh cửu (Nhiệt độ mùa hè cực đại chỉ " + maxSummerT2M.toFixed(1) + "°C, mùa đông đóng băng " + minWinterT2M.toFixed(1) + "°C). Không có tầng đất trồng trọt!"
        };
      }
    }

    if (PRECTOTCORR && GWETROOT) {
      const annualRain = PRECTOTCORR.reduce((a, b) => a + b, 0);
      const avgGwet = GWETROOT.reduce((a, b) => a + b, 0) / GWETROOT.length;

      // Lõi Sa mạc cực khô hạn (Hyper-Arid Core)
      if (annualRain < 45.0 && avgGwet < 0.18) {
        return {
          type: "HYPER_ARID_DESERT",
          name: "Sa mạc khô hạn cực đoan (Hyper-Arid Desert / Salt Flat)",
          is_water: false,
          is_ice: false,
          can_cultivate: false,
          message: "🏜️ Tọa độ thuộc vùng hoang mạc / bãi muối cực khô hạn (Mưa < 45mm/năm, ẩm đất rễ < 0.18). Không thể trồng trọt nếu không có hệ thống tưới tiêu nhân tạo quy mô lớn."
        };
      }
    }
  }

  // Mặc định là đất liền có thể phân tích
  return {
    type: "LAND",
    name: "Đất liền nông nghiệp",
    is_water: false,
    is_ice: false,
    can_cultivate: true,
    message: "Đất liền canh tác"
  };
}

module.exports = {
  isPointInPolygon,
  GULF_OF_TONKIN_POLYGON,
  GREENLAND_POLYGON,
  MAJOR_OCEAN_BOXES,
  classifyCoordinates
};

// ─── Test nhanh ───
if (require.main === module) {
  console.log("=== KIỂM THỬ BỘ PHÂN LOẠI ĐỊA HÌNH GEO-CLASSIFIER ===");
  console.log("1. Vịnh Bắc Bộ (19.5308, 106.6433):", classifyCoordinates(19.5308, 106.6433));
  console.log("2. Greenland (76.1513, -42.3889):", classifyCoordinates(76.1513, -42.3889));
  console.log("3. ĐBSCL Cần Thơ (10.04, 105.78):", classifyCoordinates(10.04, 105.78));
  console.log("4. Phú Thọ (21.18, 105.23):", classifyCoordinates(21.18, 105.23));
}
