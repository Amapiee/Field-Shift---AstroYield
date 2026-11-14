// src/config/transport.js
// =============================================================================
// ⚙️ CẤU HÌNH CHO TÍNH NĂNG TUYẾN ĐƯỜNG THƯƠNG MẠI
// =============================================================================

module.exports = {
  // ── Chi phí vận chuyển ──────────────────────────────────────────────────
  // Chi phí ước tính trên mỗi tấn-km (USD).
  // Giá trị mặc định 0.08 được tham khảo từ các báo cáo của Ngân hàng Thế giới
  // về chi phí logistics nông nghiệp ở các nước đang phát triển.
  // Người dùng có thể thay đổi giá trị này để phù hợp với điều kiện địa phương.
  COST_PER_TON_KM_USD: 0.08,

  // ── Giá thu mua mặc định (dự phòng khi API lỗi) ────────────────────────
  // Giá này được dùng khi không thể lấy dữ liệu từ USDA MARS API.
  // Đơn vị: USD/tấn. Được tính từ trường `profit` trong cấu hình cây trồng
  // nhân với một hệ số để có giá trị hợp lý.
  DEFAULT_PRICE_MULTIPLIER: 10, // profit * 10 = giá mặc định (USD/tấn)

  // ── Tỷ lệ thu mua của các trạm (để tạo sự khác biệt) ───────────────────
  // Hệ số nhân với giá cơ bản để mô phỏng sự chênh lệch giá giữa các trạm.
  MARKET_PRICE_MODIFIERS: {
    high: 1.15,   // Trạm thu mua giá cao (+15%)
    medium: 1.05, // Trạm thu mua giá trung bình (+5%)
    low: 0.95,    // Trạm thu mua giá thấp (-5%)
  },

  // ── Giới hạn và thời gian chờ ──────────────────────────────────────────
  OSRM_API_TIMEOUT_MS: 3000,    // Thời gian chờ tối đa cho OSRM (ms)
  USDA_API_TIMEOUT_MS: 4000,    // Thời gian chờ tối đa cho USDA API (ms)
  CACHE_TTL_MS: 3_600_000,     // Thời gian sống của cache (1 giờ)

  // ── Đơn vị và chuyển đổi ───────────────────────────────────────────────
  // Hệ số chuyển đổi từ dặm sang km (nếu cần)
  MILES_TO_KM: 1.60934,
  NEXTFARM_API_TIMEOUT_MS: 5000, // Thời gian chờ tối đa cho NextFarm API (ms)
  ORS_API_TIMEOUT_MS: 3000,      // Thời gian chờ tối đa cho OpenRouteService API (ms)
};