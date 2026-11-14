const TRADE_CROP_DEFS = [
  { id: "all",       label: "🌍 All Commodities",           color: "#38bdf8" },
  { id: "Rice",      label: "🌾 Rice (HS 1006)",            color: "#38bdf8" },
  { id: "Soybean",   label: "🌱 Soybean (HS 1201)",         color: "#10b981" },
  { id: "Peanut",    label: "🥜 Peanut (HS 1202)",          color: "#f59e0b" },
  { id: "Maize",     label: "🌽 Maize / Corn (HS 1005)",    color: "#a78bfa" },
  { id: "Veggies",   label: "🥬 Mixed Vegetables (7 groups)", color: "#fb923c", group: ["Potato", "Tomato", "Onion", "Cabbage", "Beans", "Pepper", "Asparagus"] },
  { id: "Potato",    label: "🥔 Potato (HS 0701)",          color: "#eab308" },
  { id: "Tomato",    label: "🍅 Tomato (HS 0702)",          color: "#ef4444" },
  { id: "Onion",     label: "🧅 Onion & Garlic (HS 0703)",  color: "#ec4899" },
  { id: "Cabbage",   label: "🥦 Cabbage & Brassicas (HS 0704)", color: "#22c55e" },
  { id: "Beans",     label: "🫛 Fresh Beans (HS 0708)",     color: "#14b8a6" },
  { id: "Pepper",    label: "🫑 Bell & Chili Pepper (HS 070960)", color: "#f97316" },
  { id: "Asparagus", label: "🌿 Asparagus (HS 070920)",     color: "#84cc16" },
];

const CROP_COLOR_LOOKUP = Object.fromEntries(TRADE_CROP_DEFS.map(d => [d.id, d.color]));

// Thiết kế thị giác tách biệt hoàn toàn giữa Biển, Hàng không và Đường bộ
const MODE_META = {
  sea: {
    icon: "⚓",
    label: "Maritime (Sea Route)",
    color: "#38bdf8",        // Xanh đại dương sáng
    glowColor: "rgba(56, 189, 248, 0.28)",
    dash: null,              // Nét liền
    opacity: 0.92,
    className: "route-line-sea"
  },
  air: {
    icon: "✈️",
    label: "Air Freight (Flight Arc)",
    color: "#c084fc",        // Tím Hàng không Neon
    glowColor: "rgba(192, 132, 252, 0.25)",
    dash: "10, 8",           // Nét đứt dài trên cao
    opacity: 0.95,
    className: "route-line-air"
  },
  land: {
    icon: "🚚",
    label: "Overland (Ground Highway)",
    color: "#f59e0b",        // Vàng cam Đường bộ
    casingColor: "#451a03",  // Viền mặt đường tối màu bên dưới
    dash: "6, 6",            // Vạch kẻ đường
    opacity: 0.98,
    className: "route-line-land"
  },
};

// Bộ nhớ đệm (Cache) cho đường bộ thực tế lấy từ OSRM
const groundRouteCache = new Map();

/**
 * Lấy hình học tuyến đường bộ thực tế trên mặt đất (OSRM Driving API)
 * Đảm bảo tuyến đường luôn bám theo quốc lộ trên đất liền, không bao giờ cắt qua biển.
 */
async function fetchGroundRoute(lat1, lon1, lat2, lon2) {
  const key = `${lat1.toFixed(3)},${lon1.toFixed(3)}->${lat2.toFixed(3)},${lon2.toFixed(3)}`;
  if (groundRouteCache.has(key)) return groundRouteCache.get(key);

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=simplified&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    if (data.routes && data.routes[0] && data.routes[0].geometry) {
      // Đảo [lon, lat] của GeoJSON sang [lat, lon] của Leaflet
      const coords = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      const distKm = Math.round(data.routes[0].distance / 1000);
      const result = { coords, distKm };
      groundRouteCache.set(key, result);
      return result;
    }
  } catch (err) {
    // Fallback nếu không có đường bộ nối trực tiếp (ví dụ khác châu lục)
    console.warn("OSRM fallback to inland corridor:", err.message);
  }
  return null;
}

const GlobalTradeFlows = {
  flowsData: null,
  hubsData: null,
  loading: null,
  on: false,
  routeLayer: null,
  hubLayer: null,
  osmLayer: null,
  osmCache: new Map(),
  osmTimer: null,

  el(id) { return document.getElementById(id); },

  setStatus(msg, kind = "") {
    const s = this.el("trade-status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "heat-status" + (kind ? " " + kind : "");
    s.style.display = msg ? "block" : "none";
  },

  setMarketStatus(msg, kind = "") {
    const s = this.el("trade-market-status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "heat-status" + (kind ? " " + kind : "");
    s.style.display = msg ? "block" : "none";
  },

  async loadData() {
    if (this.flowsData && this.hubsData) return;
    if (!this.loading) {
      this.loading = (async () => {
        const [fRes, hRes] = await Promise.all([
          fetch("/data/trade-flows.json"),
          fetch("/data/trade-hubs.json")
        ]);
        if (!fRes.ok) throw new Error("Missing /data/trade-flows.json");
        if (!hRes.ok) throw new Error("Missing /data/trade-hubs.json");

        const flowsJson = await fRes.json();
        const hubsJson  = await hRes.json();

        const vErr = window.TradeCore && TradeCore.validateFlows(flowsJson);
        if (vErr) throw new Error(vErr);

        this.flowsData = flowsJson;
        this.hubsData  = hubsJson.hubs || hubsJson;
      })().finally(() => { this.loading = null; });
    }
    return this.loading;
  },

  getSelection() {
    const cropVal = this.el("trade-crop")?.value || "all";
    const def = TRADE_CROP_DEFS.find(d => d.id === cropVal);
    return {
      crop: def && def.group ? def.group : cropVal,
      modes: {
        sea:  Boolean(this.el("trade-sea")?.checked),
        air:  Boolean(this.el("trade-air")?.checked),
        land: Boolean(this.el("trade-land")?.checked),
      },
      topN: Number(this.el("trade-topn")?.value || 12),
      showHubs: Boolean(this.el("trade-hubs")?.checked),
      showMarkets: Boolean(this.el("trade-markets")?.checked),
    };
  },

  async enable() {
    this.on = true;
    this.setStatus("⏳ Loading global maritime, air & overland corridors…");
    try {
      await this.loadData();
    } catch (e) {
      this.on = false;
      if (this.el("trade-toggle")) this.el("trade-toggle").checked = false;
      this.setStatus("❌ Data load error: " + e.message, "err");
      return;
    }
    if (!this.on) return;

    if (!this.routeLayer) this.routeLayer = L.layerGroup().addTo(map);
    if (!this.hubLayer)   this.hubLayer   = L.layerGroup().addTo(map);
    if (!this.osmLayer)   this.osmLayer   = L.layerGroup().addTo(map);

    this.el("trade-controls")?.classList.add("show");

    if (!this.flowsData.flows || this.flowsData.flows.length === 0) {
      this.setStatus("⚠️ trade-flows.json is empty. Run `npm run build:trade:sample`.", "warn");
      return;
    }

    const srcNote = this.flowsData.source === "sample"
      ? "⚠️ Sample Trade Flows. Run `npm run build:trade` for live UN Comtrade."
      : `Source: UN Comtrade (${this.flowsData.year || "latest"}) · ${this.flowsData.flows.length} corridors`;
    this.setStatus(srcNote, this.flowsData.source === "sample" ? "warn" : "");

    this.refresh();
  },

  disable() {
    this.on = false;
    if (this.routeLayer) { this.routeLayer.clearLayers(); map.removeLayer(this.routeLayer); this.routeLayer = null; }
    if (this.hubLayer)   { this.hubLayer.clearLayers();   map.removeLayer(this.hubLayer);   this.hubLayer = null; }
    if (this.osmLayer)   { this.osmLayer.clearLayers();   map.removeLayer(this.osmLayer);   this.osmLayer = null; }
    this.el("trade-controls")?.classList.remove("show");
    this.setStatus("");
    this.setMarketStatus("");
  },

  refresh() {
    if (!this.on || !this.flowsData || !this.hubsData || !window.TradeCore) return;
    const sel = this.getSelection();
    const topLbl = this.el("trade-topn-val");
    if (topLbl) topLbl.textContent = `Top ${sel.topN}`;

    this.routeLayer.clearLayers();
    this.hubLayer.clearLayers();

    const items = TradeCore.selectFlows(this.flowsData, this.hubsData, sel);

    // 1. Vẽ từng tuyến với kiểu dáng tách biệt rõ rệt theo phương thức (Sea / Air / Land)
    for (const it of items) {
      const pts = TradeCore.pathFor(it, this.hubsData);
      if (!pts || pts.length < 2) continue;

      const weight = TradeCore.widthFor(it.kt, it.max);
      const mMeta = MODE_META[it.mode] || MODE_META.sea;
      const cropColor = CROP_COLOR_LOOKUP[it.crop] || "#10b981";
      const fromName = this.hubsData[it.flow.from]?.name || it.flow.from;
      const toName   = this.hubsData[it.flow.to]?.name   || it.flow.to;

      const tooltipHtml = (kmVal) => `
        <div style="font-family:'Inter',sans-serif;font-size:0.75rem;line-height:1.45;">
          <div style="font-weight:700;color:${mMeta.color};margin-bottom:2px;">
            ${mMeta.icon} ${TradeCore.escapeHtml(fromName)} → ${TradeCore.escapeHtml(toName)}
          </div>
          📦 Commodity: <b style="color:${cropColor}">${TradeCore.escapeHtml(it.crop)}</b> · Volume: <b>${TradeCore.fmtKt(it.kt)}</b><br/>
          🛣️ Mode: <b>${mMeta.label}</b> (${kmVal ? kmVal.toLocaleString() + " km" : "—"})
        </div>`;

      if (it.mode === "land") {
        // ĐƯỜNG BỘ: Vẽ lớp vỏ đường cao tốc bên dưới + vạch kẻ đường vàng cam bên trên
        const casingLine = L.polyline(pts, {
          color: mMeta.casingColor,
          weight: weight + 3.5,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(this.routeLayer);

        const mainLine = L.polyline(pts, {
          color: mMeta.color,
          weight: weight,
          opacity: mMeta.opacity,
          dashArray: mMeta.dash,
          className: mMeta.className
        }).addTo(this.routeLayer);

        mainLine.bindTooltip(tooltipHtml(it.km), { sticky: true });

        // Tự động khớp vào quốc lộ mặt đất thực tế qua OSRM (nếu chưa có geometry chi tiết)
        const { A, B } = TradeCore.getLandEndpoints(it.flow.from, it.flow.to, this.hubsData);
        if (A && B) {
          fetchGroundRoute(A.lat, A.lon, B.lat, B.lon).then(route => {
            if (!route || !this.on || !this.routeLayer) return;
            const centered = TradeCore.centerPath(TradeCore.unwrapLon(route.coords));
            casingLine.setLatLngs(centered);
            mainLine.setLatLngs(centered);
            mainLine.setTooltipContent(tooltipHtml(route.distKm || it.km));
          });
        }
      } else {
        // ĐƯỜNG BIỂN & HÀNG KHÔNG: Có lớp hào quang (Glow) mờ bên dưới + đường chính bên trên
        L.polyline(pts, {
          color: mMeta.color,
          weight: weight + 4,
          opacity: 0.22,
          interactive: false
        }).addTo(this.routeLayer);

        const mainLine = L.polyline(pts, {
          color: mMeta.color,
          weight: weight,
          opacity: mMeta.opacity,
          dashArray: mMeta.dash,
          className: mMeta.className
        }).addTo(this.routeLayer);

        mainLine.bindTooltip(tooltipHtml(it.km), { sticky: true });
      }
    }

    // 2. Vẽ các Cảng biển, Sân bay & Trạm cửa khẩu bộ (Hubs)
    if (sel.showHubs) {
      const usage = TradeCore.hubUsage(items, this.hubsData);
      for (const h of usage.values()) {
        const isAir = h.kind === "air";
        const isLand = h.kind === "land";
        const fillColor = isAir ? "#c084fc" : (isLand ? "#f59e0b" : "#38bdf8");
        const iconLabel = isAir ? "✈️ Air Hub" : (isLand ? "🚚 Inland Hub" : "⚓ Sea Port");

        const marker = L.circleMarker([h.lat, h.lon], {
          radius: isAir ? 5 : (isLand ? 5.5 : 6),
          color: "#ffffff",
          weight: 1.8,
          fillColor,
          fillOpacity: 0.95,
        }).addTo(this.hubLayer);

        marker.bindTooltip(
          `<div style="font-family:'Inter',sans-serif;font-size:0.73rem;">
            <b style="color:${fillColor}">${iconLabel}: ${TradeCore.escapeHtml(h.place)} (${TradeCore.escapeHtml(h.country)})</b><br/>
            📤 Export: <b>${TradeCore.fmtKt(h.out)}</b> · 📥 Import: <b>${TradeCore.fmtKt(h.in)}</b>
          </div>`
        );
      }
    }

    // 3. Chú giải trực quan (Legend) phân biệt rõ 3 loại đường
    const legEl = this.el("trade-legend");
    if (legEl) {
      legEl.innerHTML = `
        <div class="trade-legend-visual">
          <div class="tleg-item">
            <span class="tleg-line tleg-sea"></span>
            <span>⚓ <b>Maritime</b> (Cyan Solid)</span>
          </div>
          <div class="tleg-item">
            <span class="tleg-line tleg-air"></span>
            <span>✈️ <b>Air Freight</b> (Violet Arc)</span>
          </div>
          <div class="tleg-item">
            <span class="tleg-line tleg-land"></span>
            <span>🚚 <b>Overland</b> (Amber Highway)</span>
          </div>
        </div>
      `;
    }

    // 4. Chợ & Điểm bán OpenStreetMap
    if (sel.showMarkets) {
      this.loadOsmMarkets();
    } else if (this.osmLayer) {
      this.osmLayer.clearLayers();
      this.setMarketStatus("");
    }
  },

  async loadOsmMarkets() {
    if (!this.on || !this.el("trade-markets")?.checked || !window.TradeCore) return;
    if (map.getZoom() < 8) {
      this.setMarketStatus("🔍 Zoom in (Zoom ≥ 8) to load local OSM markets.", "warn");
      return;
    }

    const b = map.getBounds();
    const snapped = TradeCore.snapBounds({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }, 0.5);
    const key = TradeCore.boundsKey(snapped);

    if (this.osmCache.has(key)) {
      this.renderOsmMarkets(this.osmCache.get(key));
      return;
    }

    this.setMarketStatus("⏳ Fetching agricultural markets from OpenStreetMap…");
    try {
      const q = TradeCore.overpassQuery(snapped, 300);
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = TradeCore.parseOverpass(json);
      this.osmCache.set(key, list);
      this.renderOsmMarkets(list);
    } catch (e) {
      this.setMarketStatus("⚠️ Overpass OSM busy: " + e.message, "err");
    }
  },

  renderOsmMarkets(list) {
    if (!this.osmLayer) return;
    this.osmLayer.clearLayers();
    this.setMarketStatus(`🏪 Showing ${list.length} agricultural markets in current view.`);
    for (const m of list) {
      const mkr = L.circleMarker([m.lat, m.lon], {
        radius: 4,
        color: "#10b981",
        weight: 1,
        fillColor: "#10b981",
        fillOpacity: 0.85,
      }).addTo(this.osmLayer);
      mkr.bindTooltip(`🏪 ${TradeCore.escapeHtml(m.name || "Agricultural Market")} (${m.kind})`);
    }
  },

  init() {
    const sel = this.el("trade-crop");
    if (!sel) return;
    sel.innerHTML = TRADE_CROP_DEFS.map(d => `<option value="${d.id}">${d.label}</option>`).join("");
    sel.value = "all";

    this.el("trade-toggle")?.addEventListener("change", e => (e.target.checked ? this.enable() : this.disable()));
    sel.addEventListener("change", () => this.refresh());
    ["trade-sea", "trade-air", "trade-land", "trade-hubs", "trade-markets"].forEach(id => {
      this.el(id)?.addEventListener("change", () => this.refresh());
    });
    this.el("trade-topn")?.addEventListener("input", () => this.refresh());

    map.on("moveend", () => {
      if (this.on && this.el("trade-markets")?.checked) {
        clearTimeout(this.osmTimer);
        this.osmTimer = setTimeout(() => this.loadOsmMarkets(), 500);
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => GlobalTradeFlows.init());


// ═════════════════════════════════════════════════════════════════════════════
// PART B: FARM-TO-MARKET OVERLAND ROUTING (CALCULATE TRADE ROUTES BUTTON)
// Always calculates real ground road geometry so routes never cut across water
// ═════════════════════════════════════════════════════════════════════════════

let tradeRouteLines = [];
let tradeMarkers = [];

function showTradeModal(routes) {
  let modal = document.getElementById("modal-trade");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-trade";
    modal.className = "modal-trade";
    document.body.appendChild(modal);
  }

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 20px;">
      <div>
        <h3 style="margin:0; color:#a78bfa; font-family:'Plus Jakarta Sans',sans-serif; font-size:1.3rem;">🚚 Commercial Logistics &amp; Ground Routing</h3>
        <p style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">Live market pricing &amp; real overland road distance</p>
      </div>
      <button onclick="document.getElementById('modal-trade').classList.remove('show')" 
              style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; cursor:pointer; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; transition:0.2s;">✖</button>
    </div>
  `;

  routes.forEach(r => {
    if (!r.best_market) {
      html += `
        <div class="trade-crop-card" style="--crop-color: ${r.color}; opacity: 0.6;">
          <div class="trade-crop-header"><div class="trade-crop-title">${r.label}</div></div>
          <p style="font-size: 0.8rem; padding-left: 8px; margin: 0;">No purchasing hub found within supported overland radius.</p>
        </div>
      `;
      return;
    }

    const bm = r.best_market;
    const isLive = bm.price_source === "nextfarm_live" || bm.price_source === "usda_live";
    const sourceBadge = isLive 
      ? `<span class="badge-live live">● Live Market</span>`
      : `<span class="badge-live fallback">● Estimated</span>`;

    const altMarkets = (r.buyers || []).slice(1, 3).map(b => `
      <div class="trade-alt-row">
        <span>📍 ${b.name} (${b.distance_km} km)</span>
        <span>Net Profit: $${b.net_profit}/ton</span>
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
            <div class="trade-stat-label">Best Sell Price</div>
            <div class="trade-stat-val text-cyan">$${bm.sell_price}</div>
          </div>
          <div class="trade-stat-box">
            <div class="trade-stat-label">Road Freight</div>
            <div class="trade-stat-val text-red">-$${bm.transport_cost}</div>
          </div>
          <div class="trade-stat-box" style="border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.05);">
            <div class="trade-stat-label" style="color:#10b981">Net Profit</div>
            <div class="trade-stat-val text-green" style="font-size:1.1rem;">$${bm.net_profit}</div>
          </div>
        </div>

        <div style="padding-left: 8px; margin-bottom: 12px; font-size: 0.8rem; color: #cbd5e1;">
          🏭 <b>Optimal Hub:</b> ${bm.name} <span style="color:#f59e0b">(🚚 ${bm.distance_km} km overland)</span>
        </div>

        ${altMarkets ? `
          <div class="trade-alternatives">
            <div class="trade-alt-title">Alternative Buyers (Top 2):</div>
            ${altMarkets}
          </div>
        ` : ''}
      </div>
    `;
  });

  modal.innerHTML = html;
  modal.classList.add("show");
}

async function drawTradeRoutes(routes) {
  tradeRouteLines.forEach(line => map.removeLayer(line));
  tradeMarkers.forEach(marker => map.removeLayer(marker));
  tradeRouteLines = [];
  tradeMarkers = [];

  const farmIcon = L.divIcon({
    className: "",
    html: `<div class="map-icon-farm">🌱</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12]
  });

  const currentFarmMarker = L.marker([farmLat, farmLon], { icon: farmIcon }).addTo(map);
  tradeMarkers.push(currentFarmMarker);

  for (const r of routes) {
    if (!r.best_market) continue;
    const bm = r.best_market;

    // 1. Ưu tiên lấy hình học đường bộ từ backend trả về, nếu không có thì gọi OSRM lấy đường bộ thực tế trên mặt đất
    let latlngs = null;
    if (Array.isArray(bm.geometry) && bm.geometry.length >= 2) {
      latlngs = bm.geometry;
    } else {
      const roadData = await fetchGroundRoute(farmLat, farmLon, bm.lat, bm.lon);
      if (roadData && roadData.coords && roadData.coords.length >= 2) {
        latlngs = roadData.coords;
        if (roadData.distKm) bm.distance_km = roadData.distKm;
      }
      else {
        // Fallback: Vẽ đường thẳng (Great Circle hoặc đoạn thẳng đơn giản)
        console.warn("OSRM failed, using straight-line fallback");
        latlngs = [[farmLat, farmLon], [bm.lat, bm.lon]];
      }
    }

    // Fallback nếu điểm đặt ở đảo xa không có cầu nối
    if (!latlngs) {
      latlngs = [[farmLat, farmLon], [bm.lat, bm.lon]];
    }

    // Vẽ nền đường nhựa (Casing) giúp nổi bật hoàn toàn trên nền vệ tinh
    const casing = L.polyline(latlngs, {
      color: "#1e293b",
      weight: 7,
      opacity: 0.85,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(map);
    tradeRouteLines.push(casing);

    // Vẽ đường chính chạy theo quốc lộ mặt đất
    const polyline = L.polyline(latlngs, {
      color: r.color || "#f59e0b",
      weight: 4,
      opacity: 0.95,
      className: "animated-route-line"
    }).addTo(map);

    polyline.bindTooltip(
      `<b>🚚 ${r.label}</b> → ${bm.name} (${bm.distance_km} km overland)`,
      { sticky: true }
    );
    tradeRouteLines.push(polyline);

    const marketIcon = L.divIcon({
      className: "",
      html: `<div class="map-icon-market" style="background:${r.color}">🏭</div>`,
      iconSize: [20, 20], iconAnchor: [10, 10]
    });

    const marker = L.marker([bm.lat, bm.lon], { icon: marketIcon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:'Inter',sans-serif; text-align:center;">
        <b style="color:${r.color}; font-size:1rem;">${bm.name}</b><br>
        <span style="font-size:0.8rem; color:#94a3b8;">Buyer: ${r.label} (${bm.distance_km} km)</span><br>
        <hr style="border-color:rgba(255,255,255,0.1); margin: 6px 0;">
        <span style="color:#10b981; font-weight:bold; font-size:1.1rem;">$${bm.net_profit} / ton</span>
      </div>
    `);
    tradeMarkers.push(marker);
  }

  if (tradeRouteLines.length > 0) {
    const group = L.featureGroup(tradeRouteLines);
    map.fitBounds(group.getBounds().pad(0.25), { maxZoom: 11 });
  }
}

async function runTradeAnalysis() {
  const btn = document.getElementById("btn-trade-route");
  if (!btn || btn.disabled) return;

  const originalText = btn.innerHTML;
  btn.innerHTML = "⏳ Routing Overland...";
  btn.disabled = true;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("/api/trade_routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: farmLat,
        lon: farmLon,
        crops: ["Rice", "Soybean", "Maize", "Peanut", "Veggies"]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

    const data = await res.json();
    if (data.ok) {
      showTradeModal(data.routes);       // 1. Hiện bảng kết quả ngay lập tức!
      await drawTradeRoutes(data.routes); // 2. Vẽ tuyến đường bộ lên bản đồ

      if (data.price_source === "fallback" && typeof showCustomToast === "function") {
        showCustomToast("Live price API unavailable. Using estimated market prices.");
      }
    } else {
      alert("Server error: " + (data.error || "Unknown error"));
    }
  } catch (e) {
    if (e.name === "AbortError") {
      alert("⌛ Request timed out (15s). Trade routing API did not respond.");
    } else {
      alert("Failed to calculate trade routes: " + e.message);
    }
  } finally {
    clearTimeout(timeoutId);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}