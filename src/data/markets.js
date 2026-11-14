const MARKETS = [
  // ══════════════════════════════════════════════════════════════════
  // 🇻🇳 VIỆT NAM (Giữ nguyên)
  // ══════════════════════════════════════════════════════════════════
  { id: "vn-01", name: "Chợ đầu mối Hóc Môn (TP.HCM)", lat: 10.88, lon: 106.59, crops: ["Rice", "Veggies", "Maize"], price_mod: 1.05 },
  { id: "vn-02", name: "Chợ đầu mối Thủ Đức (TP.HCM)", lat: 10.87, lon: 106.73, crops: ["Veggies", "Maize"], price_mod: 1.02 },
  { id: "vn-03", name: "Trung tâm Nông sản Cần Thơ", lat: 10.03, lon: 105.78, crops: ["Rice", "Soybean", "Peanut"], price_mod: 1.10 },
  { id: "vn-04", name: "Chợ nông sản Đà Lạt (Lâm Đồng)", lat: 11.94, lon: 108.45, crops: ["Veggies", "Maize"], price_mod: 1.25 },
  { id: "vn-05", name: "Cảng xuất khẩu nông sản Cái Mép (Bà Rịa - Vũng Tàu)", lat: 10.55, lon: 107.03, crops: ["Rice", "Peanut", "Maize"], price_mod: 1.15 },
  { id: "vn-06", name: "Nhà máy Tinh bột Ngô (Đồng Nai)", lat: 10.95, lon: 106.82, crops: ["Maize", "Soybean"], price_mod: 0.95 },
  { id: "vn-07", name: "Nhà máy chế biến Đậu nành (Bình Dương)", lat: 11.17, lon: 106.65, crops: ["Soybean"], price_mod: 1.08 },
  { id: "vn-08", name: "Hợp tác xã Lúa gạo An Giang", lat: 10.38, lon: 105.43, crops: ["Rice"], price_mod: 1.05 },
  { id: "vn-09", name: "Chợ đầu mối Nông sản Hà Nội (Long Biên)", lat: 21.05, lon: 105.87, crops: ["Veggies", "Rice"], price_mod: 1.02 },
  { id: "vn-10", name: "Cảng Hải Phòng (Xuất khẩu gạo)", lat: 20.86, lon: 106.68, crops: ["Rice", "Maize"], price_mod: 1.12 },

  // ══════════════════════════════════════════════════════════════════
  // 🌏 CHÂU Á (Mở rộng - Địa điểm thực tế)
  // ══════════════════════════════════════════════════════════════════
  // Ấn Độ
  { id: "in-01", name: "Direct Paddy Procurement Centre (Aiyyur, Tamil Nadu)", lat: 11.314517, lon: 79.318039, crops: ["Rice"], price_mod: 1.00 }, // Nguồn: tncsc.tn.gov.in [5†L16-L18]
  { id: "in-02", name: "Paddy & Maize Procurement Center (Mylar, Karnataka)", lat: 14.8089558, lon: 75.6936822, crops: ["Rice", "Maize"], price_mod: 1.00 }, // Nguồn: rurban.gov.in [6†L8]
  // Trung Quốc
  { id: "cn-01", name: "Beijing Xinfadi Agricultural Products Wholesale Market", lat: 39.8116, lon: 116.3420, crops: ["Veggies", "Rice", "Maize"], price_mod: 1.05 }, // Nguồn: Wikipedia [11†L9-L10]
  { id: "cn-02", name: "Nandabao Vegetable Wholesale Market (Hebei)", lat: 36.665783, lon: 114.752386, crops: ["Veggies"], price_mod: 1.02 }, // Nguồn: bigemap.net [10†L2-L3]
  { id: "cn-03", name: "China Co-op Agricultural Products (Shenyang) Distribution Center", lat: 41.77816, lon: 123.56201, crops: ["Veggies", "Maize"], price_mod: 1.08 }, // Nguồn: mapcarta.com [0†L14-L15]
  { id: "cn-04", name: "Lanzhou International Highland Summer Vegetable Procurement Center", lat: 35.97106, lon: 104.01717, crops: ["Veggies"], price_mod: 1.05 }, // Nguồn: mapcarta.com [0†L19-L20]
  // Thái Lan
  { id: "th-01", name: "Talaad Thai Wholesale Market (Pathum Thani)", lat: 14.081939, lon: 100.624919, crops: ["Veggies", "Rice", "Maize"], price_mod: 1.10 }, // Nguồn: Google Maps [8†L4-L5]
  // Myanmar
  { id: "mm-01", name: "Bayinnaung Market (Yangon)", lat: 16.86639, lon: 96.10722, crops: ["Rice", "Soybean", "Peanut"], price_mod: 1.05 }, // Nguồn: Wikipedia [7†L8-L9]
  // Hồng Kông
  { id: "hk-01", name: "Cheung Sha Wan Wholesale Vegetable Market", lat: 22.33298, lon: 114.15388, crops: ["Veggies"], price_mod: 1.15 }, // Nguồn: Mapcarta [12†L40]
  // UAE
  { id: "ae-01", name: "Dubai Central Fruit and Vegetable Market (Al Aweer)", lat: 25.1716703, lon: 55.3886453, crops: ["Veggies", "Rice"], price_mod: 1.20 }, // Nguồn: Wikipedia [9†L8]

  // ══════════════════════════════════════════════════════════════════
  // 🌎 CHÂU MỸ (Mở rộng - Địa điểm thực tế)
  // ══════════════════════════════════════════════════════════════════
  // Hoa Kỳ - Nhà máy chế biến ngô
  { id: "us-05", name: "Cargill Corn Milling (Cedar Rapids, Iowa)", lat: 41.96959, lon: -91.64755, crops: ["Maize"], price_mod: 1.05 }, // Nguồn: EPA [16†L16-L17]
  { id: "us-06", name: "ADM Corn Processing (Clinton, Iowa)", lat: 41.820611, lon: -90.209611, crops: ["Maize"], price_mod: 1.05 }, // Nguồn: EPA [4†L14-L16]
  { id: "us-07", name: "Corn Products Intl Inc (Bedford Park, Illinois)", lat: 41.774868, lon: -87.820587, crops: ["Maize"], price_mod: 1.08 }, // Nguồn: ejmap.org [15†L8-L9]
  { id: "us-08", name: "Little Sioux Corn Processors (Marcus, Iowa)", lat: 42.82048, lon: -95.75988, crops: ["Maize"], price_mod: 1.02 }, // Nguồn: Iowa DNR [4†L24-L25]
  // Argentina - Nhà máy ép dầu đậu nành/lạc
  { id: "ar-01", name: "T6 Industrial (Puerto General San Martín, Santa Fe)", lat: -32.7167, lon: -60.7333, crops: ["Soybean", "Peanut"], price_mod: 1.12 }, // Nguồn: AGD [14†L10-L11] (Tọa độ ước tính từ vị trí cảng)
  { id: "ar-02", name: "Dalmacio Vélez Sarsfield Plant (Córdoba)", lat: -32.6167, lon: -63.5833, crops: ["Soybean", "Peanut"], price_mod: 1.10 }, // Nguồn: AGD [13†L4-L5] (Tọa độ ước tính từ tên thị trấn)

  // ══════════════════════════════════════════════════════════════════
  // 🌍 CHÂU ÂU & CHÂU ÚC (Giữ nguyên)
  // ══════════════════════════════════════════════════════════════════
  { id: "eu-01", name: "Paris Grain Hub (Pháp)", lat: 48.85, lon: 2.35, crops: ["Maize", "Veggies"], price_mod: 1.15 },
  { id: "eu-02", name: "Ukraine Black Sea Port (Odesa)", lat: 46.48, lon: 30.73, crops: ["Maize", "Soybean"], price_mod: 1.20 },
  { id: "eu-03", name: "Rotterdam Food Port (Hà Lan)", lat: 51.92, lon: 4.47, crops: ["Veggies", "Maize", "Rice"], price_mod: 1.25 },
  { id: "au-01", name: "Mildura Produce Market (Úc)", lat: -34.28, lon: 142.06, crops: ["Veggies", "Peanut"], price_mod: 1.08 },
  { id: "au-02", name: "Queensland Peanut Company (Úc)", lat: -27.47, lon: 153.02, crops: ["Peanut", "Maize"], price_mod: 1.05 },

  // ══════════════════════════════════════════════════════════════════
  // 🌍 CHÂU PHI (Giữ nguyên)
  // ══════════════════════════════════════════════════════════════════
  { id: "af-01", name: "Nairobi Veggie Export Hub (Kenya)", lat: -1.29, lon: 36.82, crops: ["Veggies", "Maize"], price_mod: 1.10 },
  { id: "af-02", name: "Lagos Grain Market (Nigeria)", lat: 6.52, lon: 3.37, crops: ["Maize", "Rice"], price_mod: 0.95 },
];

module.exports = { MARKETS };