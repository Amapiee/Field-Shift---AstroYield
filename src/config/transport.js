// src/config/transport.js
// =============================================================================
// ⚙️ CẤU HÌNH CHO TÍNH NĂNG TUYẾN ĐƯỜNG THƯƠNG MẠI & LOGISTICS
// (Đã nâng cấp để tính đến các yếu tố ngoại cảnh)
// =============================================================================

module.exports = {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CƯỚC PHÍ VẬN TẢI ĐA PHƯƠNG THỨC (USD / Tấn / Km)
  // ═══════════════════════════════════════════════════════════════════════════
  TRANSPORT_COST_PER_KM: {
    // Đường bộ (Xe tải): Chịu ảnh hưởng lớn bởi giá nhiên liệu và chất lượng đường
    TRUCK: 0.08,
    // Đường sắt: Rẻ hơn xe tải cho khối lượng lớn
    TRAIN: 0.04,
    // Đường biển: Rẻ nhất, nhưng chỉ khả dụng giữa các cảng
    SHIP:  0.015,
    // Đường hàng không: Rất đắt, chỉ dùng cho hàng siêu thực phẩm, giá trị cao
    AIR:   0.5
  },

  // Hệ số địa hình (Terrain multiplier) - Ngoại cảnh
  // Ví dụ: Đường đèo dốc hoặc đường xấu sẽ làm tăng chi phí đường bộ lên 40%
  TERRAIN_DIFFICULTY_FACTOR: {
    FLAT_PAVED: 1.0,      // Đồng bằng, đường nhựa
    HILLY_GRAVEL: 1.4,    // Đồi núi, đường sỏi
    MOUNTAINOUS: 1.8      // Đèo dốc, đường xấu
  },

  // Tác động của biến động giá nhiên liệu (Ví dụ: Giá dầu hiện tại cao hơn mức cơ sở 10%)
  // Giá cơ sở được giả định trong hằng số TRUCK ở trên.
  FUEL_PRICE_INDEX: 1.0,  // 1.0 = Bình thường, 1.15 = Giá dầu tăng 15%

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. YẾU TỐ HAO HỤT SINH HỌC (SPOILAGE) & THỜI GIAN VẬN CHUYỂN
  // ═══════════════════════════════════════════════════════════════════════════
  // Tốc độ trung bình (km/ngày) cho từng loại phương tiện
  AVG_SPEED_KM_PER_DAY: {
    TRUCK: 500,
    TRAIN: 800,
    SHIP:  600,
    AIR:   8000
  },

  // Tỷ lệ hao hụt giá trị hàng hóa mỗi ngày vận chuyển (0.02 = mất 2%/ngày)
  PERISHABILITY_RATE_PER_DAY: {
    Rice: 0.001,    // Lúa/ngũ cốc khô: Hao hụt không đáng kể (0.1%/ngày)
    Soybean: 0.001,
    Maize: 0.002,
    Peanut: 0.005,  // Lạc dễ ẩm mốc
    Veggies: 0.05   // Rau củ tươi: Hao hụt rất nhanh (5%/ngày nếu không bảo quản lạnh)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. THỊ TRƯỜNG & GIÁ CẢ (FALLBACK)
  // ═══════════════════════════════════════════════════════════════════════════
  // Khi API lỗi, dùng giá cơ sở (USD/tấn) này thay vì nhân với profit
  BASE_PRICE_FALLBACK_USD: {
    Rice: 500,
    Maize: 250,
    Soybean: 550,
    Peanut: 800,
    Veggies: 1200
  },

  // Hệ số giá theo loại trạm thu mua (Ngoại cảnh: Vựa lớn giá cao, đại lý nhỏ giá thấp)
  MARKET_PRICE_MODIFIERS: {
    HIGH_TIER_HUB: 1.15,  // Cảng xuất khẩu, nhà máy lớn
    MID_TIER_HUB:  1.05,  // Chợ đầu mối, vựa lớn
    LOCAL_DEALER:  0.95   // Thương lái địa phương
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. GIỚI HẠN & CẤU HÌNH HỆ THỐNG
  // ═══════════════════════════════════════════════════════════════════════════
  API_TIMEOUTS: {
    NEXTFARM: 5000, // ms
    ORS:      3000, // ms
    OSRM:     3000  // ms
  },
  CACHE_TTL_MS: 3_600_000, // 1 giờ
  MILES_TO_KM: 1.60934
};