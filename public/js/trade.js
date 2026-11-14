// public/js/trade.js

let tradeRouteLines = [];
let tradeMarkers = [];

// ─── 1. Hiển thị Modal Kết Quả (Giao diện mới) ─────────────────────────────
function showTradeModal(routes) {
  let modal = document.getElementById("trade-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "trade-modal";
    modal.className = "modal-trade";
    document.body.appendChild(modal);
  }

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 20px;">
      <div>
        <h3 style="margin:0; color:#a78bfa; font-family:'Plus Jakarta Sans',sans-serif; font-size:1.3rem;">🚚 Phân Tích Kinh Tế & Logistics</h3>
        <p style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">Dữ liệu giá từ NextFarm & Khoảng cách thực tế từ OpenRouteService</p>
      </div>
      <button onclick="document.getElementById('trade-modal').classList.remove('show')" 
              style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; cursor:pointer; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; transition:0.2s;" 
              onmouseover="this.style.background='rgba(239,68,68,0.2)'; this.style.color='#ef4444'" 
              onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='#94a3b8'">✖</button>
    </div>
  `;

  // Lặp qua từng loại cây được đánh giá
  routes.forEach(r => {
    if (!r.best_market) {
      html += `
        <div class="trade-crop-card" style="--crop-color: ${r.color}; opacity: 0.6;">
          <div class="trade-crop-header"><div class="trade-crop-title">${r.label}</div></div>
          <p style="font-size: 0.8rem; padding-left: 8px; margin: 0;">Không tìm thấy trạm thu mua nào trong bán kính hỗ trợ.</p>
        </div>
      `;
      return;
    }

    const bm = r.best_market;
    const isLive = bm.price_source === "nextfarm_live" || bm.price_source === "usda_live";
    const sourceBadge = isLive 
      ? `<span class="badge-live live">● Dữ liệu thực</span>`
      : `<span class="badge-live fallback">● Ước tính</span>`;

    // Lấy ra 2 trạm tốt tiếp theo (nếu có) để làm phương án dự phòng
    const altMarkets = r.buyers.slice(1, 3).map(b => `
      <div class="trade-alt-row">
        <span>📍 ${b.name} (${b.distance_km} km)</span>
        <span>Lợi nhuận: $${b.net_profit}/tấn</span>
      </div>
    `).join('');

    html += `
      <div class="trade-crop-card" style="--crop-color: ${r.color};">
        <div class="trade-crop-header">
          <div class="trade-crop-title">${r.label}</div>
          ${sourceBadge}
        </div>
        
        <div class="trade-stats-grid">
          <div class="trade-stat-box">
            <div class="trade-stat-label">Giá bán (Tốt nhất)</div>
            <div class="trade-stat-val text-cyan">$${bm.sell_price}</div>
          </div>
          <div class="trade-stat-box">
            <div class="trade-stat-label">Vận chuyển</div>
            <div class="trade-stat-val text-red">-$${bm.transport_cost}</div>
          </div>
          <div class="trade-stat-box" style="border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.05);">
            <div class="trade-stat-label" style="color:#10b981">Lợi nhuận ròng</div>
            <div class="trade-stat-val text-green" style="font-size:1.1rem;">$${bm.net_profit}</div>
          </div>
        </div>

        <div style="padding-left: 8px; margin-bottom: 12px; font-size: 0.8rem; color: #cbd5e1;">
          🏭 <b>Trạm thu mua tối ưu:</b> ${bm.name} <span style="color:#38bdf8">(${bm.distance_km} km)</span>
        </div>

        ${altMarkets ? `
          <div class="trade-alternatives">
            <div class="trade-alt-title">Các phương án khác (Top 2):</div>
            ${altMarkets}
          </div>
        ` : ''}
      </div>
    `;
  });

  modal.innerHTML = html;
  modal.classList.add("show");
}

// ─── 2. Vẽ Đường Đi Trên Bản Đồ (Có Animation) ──────────────────────────────
function drawTradeRoutes(routes) {
  // Xóa đường và marker cũ
  tradeRouteLines.forEach(line => map.removeLayer(line));
  tradeMarkers.forEach(marker => map.removeLayer(marker));
  tradeRouteLines = [];
  tradeMarkers = [];

  // Icon Nông trại (Custom)
  const farmIcon = L.divIcon({
    className: "",
    html: `<div class="map-icon-farm">🌱</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12]
  });
  
  // Đặt lại Marker Nông trại để nó nổi bật
  const currentFarmMarker = L.marker([farmLat, farmLon], { icon: farmIcon }).addTo(map);
  tradeMarkers.push(currentFarmMarker);

  // Lặp qua các route để vẽ
  routes.forEach(r => {
    if (!r.best_market) return;
    const bm = r.best_market;
    
    // 1. Vẽ đường nối có Animation (Marching Ants)
    const latlngs = [[farmLat, farmLon], [bm.lat, bm.lon]];
    const polyline = L.polyline(latlngs, {
      color: r.color || "#38bdf8",
      weight: 4,
      opacity: 0.8,
      className: 'animated-route-line' // Class CSS tạo hiệu ứng chuyển động
    }).addTo(map);

    polyline.bindTooltip(`<b>${r.label}</b> -> ${bm.name}`, {sticky: true});
    tradeRouteLines.push(polyline);

    // 2. Đánh dấu trạm thu mua bằng icon Nhà máy
    const marketIcon = L.divIcon({
      className: "",
      html: `<div class="map-icon-market" style="background:${r.color}">🏭</div>`,
      iconSize: [20, 20], iconAnchor: [10, 10]
    });
    
    const marker = L.marker([bm.lat, bm.lon], { icon: marketIcon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:'Inter',sans-serif; text-align:center;">
        <b style="color:${r.color}; font-size:1rem;">${bm.name}</b><br>
        <span style="font-size:0.8rem; color:#94a3b8;">Thu mua: ${r.label}</span><br>
        <hr style="border-color:rgba(255,255,255,0.1); margin: 6px 0;">
        <span style="color:#10b981; font-weight:bold; font-size:1.1rem;">$${bm.net_profit} / tấn</span>
      </div>
    `);
    tradeMarkers.push(marker);
  });

  // 3. Tự động zoom bản đồ để thấy toàn bộ tuyến đường
  if (tradeRouteLines.length > 0) {
    const group = L.featureGroup(tradeRouteLines);
    map.fitBounds(group.getBounds().pad(0.3), { maxZoom: 11 });
  }
}

// ─── 3. Hàm Gọi API (Giữ nguyên) ─────────────────────────────────────────────
async function runTradeAnalysis() {
  const btn = document.getElementById("btn-trade-route");
  const originalText = btn.innerHTML;
  btn.innerHTML = "⏳ Đang tính toán...";
  btn.disabled = true;

  try {
    const res = await fetch("/api/trade_routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: farmLat, lon: farmLon, crops: ["Rice", "Soybean", "Maize", "Peanut", "Veggies"] })
    });
    const data = await res.json();
    
    if (data.ok) {
      showTradeModal(data.routes);
      drawTradeRoutes(data.routes);
      if (data.price_source === "fallback" && typeof showCustomToast === "function") {
        showCustomToast("⚠️ Không thể lấy giá từ NextFarm. Đang dùng giá ước tính.");
      }
    } else {
      alert("Lỗi từ server: " + data.error);
    }
  } catch (e) {
    alert("Lỗi khi lấy dữ liệu thương mại: " + e.message);
  } finally {
    // LUÔN chạy khối này dù thành công hay thất bại
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ─── 4. Khởi tạo sự kiện ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-trade-route");
  if (btn) btn.addEventListener("click", runTradeAnalysis);
});