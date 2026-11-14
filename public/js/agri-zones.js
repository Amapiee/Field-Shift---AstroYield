// =============================================================================
// 💼 FARMSHIFT — Vietnam Agricultural Economic Zones & Farm Investment Advisor
// File: public/js/agri-zones.js (Standalone Modular Script)
// =============================================================================

const CROP_LABELS_MAP = {
  vi: {
    Rice: "🌾 Lúa Nước",
    Soybean: "🌱 Đậu Tương",
    Peanut: "🥜 Lạc/Đậu",
    Maize: "🌽 Ngô",
    Veggies: "🥬 Rau Màu",
    Fallow: "🏜️ Nghỉ Đất"
  },
  en: {
    Rice: "🌾 Rice",
    Soybean: "🌱 Soybean",
    Peanut: "🥜 Peanut",
    Maize: "🌽 Maize",
    Veggies: "🥬 Veggies",
    Fallow: "🏜️ Fallow"
  }
};

const ZONES_I18N = {
  vi: {
    tab_btn: "💼 Đầu tư",
    region_label: "🗺️ Chọn Vùng Kinh tế Sinh thái (Việt Nam)",
    layer_toggle: "Hiển thị Khu NNCNC trên bản đồ",
    top_pick: "ĐỀ XUẤT ĐẦU TƯ",
    area_core: "Quy mô lõi",
    area_cluster: "Vùng vệ tinh",
    roi_label: "ROI kỳ vọng",
    rotation_label: "🌱 Gợi ý Luân canh 3 vụ tối ưu:",
    season_short: ["Vụ Xuân", "Hè Thu", "Vụ Đông"],
    btn_apply: "🎯 Chọn Đầu tư tại đây",
    btn_apply_run: "⚛️ Chọn & Chạy Quantum",
    applied_toast: "✅ Đã chọn tọa độ & cấu hình cây trồng tại: "
  },
  en: {
    tab_btn: "💼 Invest Zones",
    region_label: "🗺️ Select Agro-Economic Region (Vietnam)",
    layer_toggle: "Show Agri-Zones on Map",
    top_pick: "TOP INVESTMENT",
    area_core: "Core Area",
    area_cluster: "Cluster Area",
    roi_label: "Est. ROI",
    rotation_label: "🌱 Recommended 3-Season Rotation:",
    season_short: ["Spring", "Summer", "Winter"],
    btn_apply: "🎯 Select & Apply Farm",
    btn_apply_run: "⚛️ Select & Run Quantum",
    applied_toast: "✅ Applied coordinates & crop rotation for: "
  }
};

const AgriZones = {
  data: null,
  currentRegion: "all",
  selectedZoneId: null,
  layerGroup: null,
  showOnMap: true,

  async init() {
    this.injectStyles();
    this.injectTabUI();
    this.patchSwitchTab();
    this.hookLanguageChange();

    try {
      const res = await fetch("/data/vn-agri-zones.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.data = await res.json();
      this.renderRegionOptions();
      this.renderZonesList();
      this.initMapLayer();
    } catch (err) {
      console.error("[AgriZones] Không thể tải vn-agri-zones.json:", err);
      const listEl = document.getElementById("az-list");
      if (listEl) {
        listEl.innerHTML = `<div style="padding:12px;color:#fca5a5;font-size:0.75rem;">⚠️ Không tải được data/vn-agri-zones.json (${err.message})</div>`;
      }
    }
  },

  getLang() {
    if (window.AppSettings && window.AppSettings.state && window.AppSettings.state.lang) {
      return window.AppSettings.state.lang;
    }
    return document.documentElement.lang === "en" ? "en" : "vi";
  },

  // 1. Tự động chèn CSS riêng cho Tab Đầu tư
  injectStyles() {
    if (document.getElementById("agri-zones-css")) return;
    const style = document.createElement("style");
    style.id = "agri-zones-css";
    style.textContent = `
      #right-panel .tab-bar { display: flex; gap: 4px; }
      #right-panel .tab-btn { flex: 1; padding: 9px 6px; font-size: 0.73rem; white-space: nowrap; }
      .az-controls {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(var(--primary-rgb, 16, 185, 129), 0.25);
        border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .az-region-summary {
        font-size: 0.72rem; color: var(--dim, #94a3b8); line-height: 1.45;
        padding: 8px 10px; border-radius: 8px;
        background: rgba(var(--primary-rgb, 16, 185, 129), 0.07);
        border-left: 3px solid var(--teal, #10b981);
      }
      .az-list { display: flex; flex-direction: column; gap: 10px; padding-bottom: 12px; }
      .az-card {
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 12px; padding: 12px;
        transition: all 0.2s ease; position: relative;
      }
      .az-card:hover {
        border-color: rgba(var(--primary-rgb, 16, 185, 129), 0.45);
        background: rgba(255, 255, 255, 0.055);
      }
      .az-card.selected {
        border-color: var(--teal, #10b981);
        box-shadow: 0 0 16px rgba(var(--primary-rgb, 16, 185, 129), 0.25);
      }
      .az-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
      .az-title { font-size: 0.82rem; font-weight: 700; color: var(--text, #f8fafc); line-height: 1.3; }
      .az-sub { font-size: 0.68rem; color: var(--cyan, #38bdf8); margin-top: 2px; font-weight: 500; }
      .az-score-badge {
        background: rgba(var(--primary-rgb, 16, 185, 129), 0.18);
        border: 1px solid var(--teal, #10b981);
        color: var(--teal, #10b981); font-family: var(--font-mono, monospace);
        font-size: 0.72rem; font-weight: 700; padding: 3px 7px; border-radius: 6px;
        white-space: nowrap; flex-shrink: 0;
      }
      .az-metrics {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
        margin: 8px 0; padding: 6px 8px; border-radius: 8px;
        background: rgba(0, 0, 0, 0.25); font-size: 0.68rem;
      }
      .az-metric-item span { display: block; color: var(--dim, #94a3b8); font-size: 0.6rem; }
      .az-metric-item strong { color: var(--text, #fff); font-family: var(--font-mono, monospace); }
      .az-desc { font-size: 0.72rem; color: #cbd5e1; line-height: 1.45; margin-bottom: 8px; }
      .az-meta-line { font-size: 0.68rem; color: var(--dim, #94a3b8); margin-bottom: 4px; display: flex; gap: 6px; align-items: flex-start; }
      .az-rot-box {
        margin-top: 8px; padding: 7px 9px; border-radius: 8px;
        background: rgba(56, 189, 248, 0.07); border: 1px solid rgba(56, 189, 248, 0.2);
      }
      .az-rot-title { font-size: 0.66rem; color: var(--cyan, #38bdf8); font-weight: 600; margin-bottom: 5px; }
      .az-rot-chips { display: flex; gap: 5px; flex-wrap: wrap; }
      .az-rot-chip {
        font-size: 0.66rem; padding: 3px 7px; border-radius: 6px;
        background: rgba(255, 255, 255, 0.06); color: var(--text, #fff);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .az-actions { display: flex; gap: 6px; margin-top: 10px; }
      .az-btn {
        flex: 1; padding: 7px 8px; border-radius: 8px; font-size: 0.71rem;
        font-weight: 600; cursor: pointer; border: 1px solid transparent;
        transition: all 0.18s ease; text-align: center;
      }
      .az-btn-primary {
        background: rgba(var(--primary-rgb, 16, 185, 129), 0.18);
        border-color: var(--teal, #10b981); color: var(--teal, #10b981);
      }
      .az-btn-primary:hover { background: var(--teal, #10b981); color: #06101e; }
      .az-btn-quantum {
        background: rgba(168, 85, 247, 0.16);
        border-color: rgba(168, 85, 247, 0.5); color: #c084fc;
      }
      .az-btn-quantum:hover { background: #a855f7; color: #fff; }
      .az-map-pin {
        width: 28px; height: 28px; border-radius: 50%;
        background: rgba(6, 13, 22, 0.9); border: 2px solid var(--teal, #10b981);
        box-shadow: 0 0 12px rgba(var(--primary-rgb, 16, 185, 129), 0.7);
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; cursor: pointer; transition: transform 0.2s;
      }
      .az-map-pin:hover { transform: scale(1.2); }
      .az-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: rgba(6, 13, 22, 0.95); border: 1px solid var(--teal, #10b981);
        color: var(--text, #fff); padding: 10px 18px; border-radius: 999px;
        font-size: 0.78rem; font-weight: 600; z-index: 9500;
        box-shadow: 0 8px 25px rgba(0,0,0,0.6); pointer-events: none;
        opacity: 0; transition: opacity 0.25s ease;
      }
      .az-toast.show { opacity: 1; }
    `;
    document.head.appendChild(style);
  },

  // 2. Tự động gắn Tab thứ 3 vào #right-panel
  injectTabUI() {
    const rightPanel = document.getElementById("right-panel");
    if (!rightPanel) return;

    const lang = this.getLang();
    const t = ZONES_I18N[lang];

    // Thêm nút Tab thứ 3 nếu chưa có
    const tabBar = rightPanel.querySelector(".tab-bar");
    if (tabBar && !document.getElementById("tab-btn-zones")) {
      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.id = "tab-btn-zones";
      btn.setAttribute("onclick", "switchTab('zones', this)");
      btn.textContent = t.tab_btn;
      tabBar.appendChild(btn);
    }

    // Thêm nội dung #tab-zones nếu chưa có
    if (!document.getElementById("tab-zones")) {
      const pane = document.createElement("div");
      pane.className = "tab-content";
      pane.id = "tab-zones";
      pane.innerHTML = `
        <div class="az-controls">
          <div class="select-group">
            <div class="select-label" id="az-region-label">${t.region_label}</div>
            <select id="az-region-select" onchange="AgriZones.onRegionChange(this.value)"></select>
          </div>
          <label class="heat-check" style="font-size:0.73rem; cursor:pointer;">
            <input type="checkbox" id="az-layer-toggle" checked onchange="AgriZones.toggleMapLayer(this.checked)"/>
            <span id="az-layer-label">${t.layer_toggle}</span>
          </label>
          <div class="az-region-summary" id="az-region-summary"></div>
        </div>
        <div class="az-list" id="az-list"></div>
      `;
      rightPanel.appendChild(pane);
    }

    if (!document.getElementById("az-toast")) {
      const toast = document.createElement("div");
      toast.id = "az-toast";
      toast.className = "az-toast";
      document.body.appendChild(toast);
    }
  },

  // 3. Đảm bảo switchTab hỗ trợ mọi số lượng Tab trong #right-panel
  patchSwitchTab() {
    window.switchTab = function (tabName, btnEl) {
      document.querySelectorAll("#right-panel .tab-content").forEach((el) => {
        el.classList.toggle("active", el.id === `tab-${tabName}`);
      });
      document.querySelectorAll("#right-panel .tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn === btnEl);
      });
    };
  },

  // 4. Render danh sách Vùng miền
  renderRegionOptions() {
    if (!this.data) return;
    const select = document.getElementById("az-region-select");
    if (!select) return;
    const lang = this.getLang();

    select.innerHTML = this.data.regions
      .map((r) => `<option value="${r.id}">${lang === "en" ? r.name_en : r.name_vi}</option>`)
      .join("");
    select.value = this.currentRegion;
    this.updateRegionSummary();
  },

  updateRegionSummary() {
    if (!this.data) return;
    const lang = this.getLang();
    const reg = this.data.regions.find((r) => r.id === this.currentRegion) || this.data.regions[0];
    const sumEl = document.getElementById("az-region-summary");
    if (sumEl && reg) {
      sumEl.textContent = lang === "en" ? reg.summary_en : reg.summary_vi;
    }
  },

  onRegionChange(regionId) {
    this.currentRegion = regionId;
    this.updateRegionSummary();
    this.renderZonesList();
    this.renderMapMarkers();

    // SỬA LỖI Ở ĐÂY: Kiểm tra có hàm flyTo mới thực thi
    if (window.map && typeof window.map.flyTo === "function" && this.data) {
      const filtered = this.getFilteredZones();
      if (filtered.length > 0 && regionId !== "all") {
        const latAvg = filtered.reduce((s, z) => s + z.lat, 0) / filtered.length;
        const lonAvg = filtered.reduce((s, z) => s + z.lon, 0) / filtered.length;
        window.map.flyTo([latAvg, lonAvg], 7, { duration: 1.0 });
      } else if (regionId === "all") {
        window.map.flyTo([16.0, 106.5], 5, { duration: 1.0 });
      }
    }
  },
  
  getFilteredZones() {
    if (!this.data || !this.data.zones) return [];
    const list =
      this.currentRegion === "all"
        ? [...this.data.zones]
        : this.data.zones.filter((z) => z.region === this.currentRegion);
    return list.sort((a, b) => b.score - a.score);
  },

  // 5. Render danh sách Khu kinh tế nông nghiệp & gợi ý đầu tư
  renderZonesList() {
    const listEl = document.getElementById("az-list");
    if (!listEl || !this.data) return;

    const lang = this.getLang();
    const t = ZONES_I18N[lang];
    const cropMap = CROP_LABELS_MAP[lang];
    const zones = this.getFilteredZones();

    listEl.innerHTML = zones
      .map((z, idx) => {
        const isTop = idx === 0;
        const isSelected = z.id === this.selectedZoneId;
        const name = lang === "en" ? z.name_en : z.name_vi;
        const desc = lang === "en" ? z.desc_en : z.desc_vi;
        const infra = lang === "en" ? z.infra_en : z.infra_vi;
        const incentive = lang === "en" ? z.incentive_en : z.incentive_vi;

        const rotHtml = z.recommended_crops
          .map((cKey, sIdx) => `<span class="az-rot-chip"><b>${t.season_short[sIdx]}:</b> ${cropMap[cKey] || cKey}</span>`)
          .join("");

        return `
          <div class="az-card ${isSelected ? "selected" : ""}" id="az-card-${z.id}">
            <div class="az-card-head">
              <div>
                <div class="az-title">${isTop ? "🏆 " : ""}${name}</div>
                <div class="az-sub">📍 ${z.province} · 📜 ${z.legal}</div>
              </div>
              <div class="az-score-badge">${isTop ? t.top_pick + " · " : ""}${z.score}/100</div>
            </div>

            <div class="az-metrics">
              <div class="az-metric-item">
                <span>${t.area_core}</span>
                <strong>${z.area_ha.toLocaleString()} ha</strong>
              </div>
              <div class="az-metric-item">
                <span>${t.area_cluster}</span>
                <strong>${z.cluster_area_ha.toLocaleString()} ha</strong>
              </div>
              <div class="az-metric-item">
                <span>${t.roi_label}</span>
                <strong style="color:var(--teal, #10b981)">${z.roi_est}</strong>
              </div>
            </div>

            <div class="az-desc">${desc}</div>
            <div class="az-meta-line"><span>🚚</span><span>${infra}</span></div>
            <div class="az-meta-line"><span>💎</span><span>${incentive}</span></div>

            <div class="az-rot-box">
              <div class="az-rot-title">${t.rotation_label}</div>
              <div class="az-rot-chips">${rotHtml}</div>
            </div>

            <div class="az-actions">
              <button class="az-btn az-btn-primary" onclick="AgriZones.selectZone('${z.id}', false)">
                ${t.btn_apply}
              </button>
              <button class="az-btn az-btn-quantum" onclick="AgriZones.selectZone('${z.id}', true)">
                ${t.btn_apply_run}
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  },

  // 6. Vẽ Marker & Vùng quy hoạch lên bản đồ Leaflet
  initMapLayer() {
    // SỬA LỖI Ở ĐÂY: Phải kiểm tra window.map có hàm addLayer không 
    // để tránh nhầm với thẻ <div id="map"> của HTML
    if (!window.L || !window.map || typeof window.map.addLayer !== "function") {
      setTimeout(() => this.initMapLayer(), 400);
      return;
    }
    this.layerGroup = L.layerGroup().addTo(window.map);
    this.renderMapMarkers();
  },

  toggleMapLayer(checked) {
    this.showOnMap = Boolean(checked);
    if (!this.layerGroup || !window.map) return;
    if (this.showOnMap) {
      this.layerGroup.addTo(window.map);
      this.renderMapMarkers();
    } else {
      this.layerGroup.remove();
    }
  },

  renderMapMarkers() {
    if (!this.layerGroup || !this.data) return;
    this.layerGroup.clearLayers();
    if (!this.showOnMap) return;

    const lang = this.getLang();
    const t = ZONES_I18N[lang];
    const cropMap = CROP_LABELS_MAP[lang];
    const zones = this.getFilteredZones();

    zones.forEach((z, idx) => {
      const isSelected = z.id === this.selectedZoneId;
      const color = isSelected ? "#f59e0b" : idx === 0 ? "#10b981" : "#38bdf8";

      // Vòng tròn phạm vi vùng nông nghiệp tập trung
      L.circle([z.lat, z.lon], {
        radius: z.radius_m || 15000,
        color: color,
        weight: isSelected ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: isSelected ? 0.22 : 0.1,
        dashArray: isSelected ? null : "4 4"
      }).addTo(this.layerGroup);

      // Marker Icon
      const icon = L.divIcon({
        className: "",
        html: `<div class="az-map-pin" style="border-color:${color}">${idx === 0 ? "🏆" : "🏞️"}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const name = lang === "en" ? z.name_en : z.name_vi;
      const rotStr = z.recommended_crops.map((c) => cropMap[c] || c).join(" → ");

      const popupHtml = `
        <div style="min-width:220px; font-family:Inter,sans-serif; color:#0f172a;">
          <div style="font-weight:700; font-size:0.85rem; margin-bottom:2px;">${name}</div>
          <div style="font-size:0.72rem; color:#475569; margin-bottom:6px;">
            📍 ${z.province} · <b>Score: ${z.score}/100</b> · ROI: ${z.roi_est}
          </div>
          <div style="font-size:0.72rem; background:#f1f5f9; padding:5px 7px; border-radius:6px; margin-bottom:8px;">
            <b>Luân canh:</b> ${rotStr}
          </div>
          <button onclick="AgriZones.selectZone('${z.id}', false)"
            style="width:100%; padding:6px 10px; border:none; border-radius:6px; background:#10b981; color:#fff; font-weight:600; font-size:0.74rem; cursor:pointer;">
            ${t.btn_apply}
          </button>
        </div>
      `;

      L.marker([z.lat, z.lon], { icon }).bindPopup(popupHtml).addTo(this.layerGroup);
    });
  },

  // 7. Hành động khi người dùng bấm "Chọn Đầu tư tại đây"
  selectZone(zoneId, autoRunAnalysis = false) {
    if (!this.data) return;
    const zone = this.data.zones.find((z) => z.id === zoneId);
    if (!zone) return;

    this.selectedZoneId = zoneId;
    const lang = this.getLang();
    const t = ZONES_I18N[lang];
    const name = lang === "en" ? zone.name_en : zone.name_vi;

    // 7.1. Điền tọa độ vào #inp-lat và #inp-lon
    const latInput = document.getElementById("inp-lat");
    const lonInput = document.getElementById("inp-lon");
    if (latInput) {
      latInput.value = zone.lat.toFixed(4);
      latInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (lonInput) {
      lonInput.value = zone.lon.toFixed(4);
      lonInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 7.2. Điền tự động 3 vụ cây trồng thế mạnh (#crop-s1, #crop-s2, #crop-s3)
    const cropIds = ["crop-s1", "crop-s2", "crop-s3"];
    cropIds.forEach((id, idx) => {
      const sel = document.getElementById(id);
      const targetCrop = zone.recommended_crops[idx];
      if (sel && targetCrop) {
        sel.value = targetCrop;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // 7.3. Cập nhật biến trạng thái toàn cục & di chuyển Marker nông trại + flyTo trên bản đồ
    if (window.STATE) {
      window.STATE.lat = zone.lat;
      window.STATE.lon = zone.lon;
    }
    if (typeof window.setMarker === "function") {
      window.setMarker(zone.lat, zone.lon);
    } else if (typeof window.placeMarker === "function") {
      window.placeMarker(zone.lat, zone.lon);
    } else if (window.farmMarker && typeof window.farmMarker.setLatLng === "function") {
      window.farmMarker.setLatLng([zone.lat, zone.lon]);
    }

    if (window.map && typeof window.map.flyTo === "function") {
      window.map.flyTo([zone.lat, zone.lon], 10, { duration: 1.2 });
    }

    // 7.4. Cập nhật UI thẻ được chọn & thông báo Toast
    this.renderZonesList();
    this.renderMapMarkers();
    this.showToast(`${t.applied_toast}${name}`);

    // 7.5. Nếu bấm nút "Chọn & Chạy Quantum", gọi luôn runAnalysis()
    if (autoRunAnalysis && typeof window.runAnalysis === "function") {
      setTimeout(() => window.runAnalysis(), 400);
    }
  },

  showToast(msg) {
    const toast = document.getElementById("az-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  },

  // 8. Tự động đồng bộ khi người dùng đổi ngôn ngữ trong Settings
  hookLanguageChange() {
    if (window.AppSettings && typeof window.AppSettings.setLanguage === "function") {
      const origSetLang = window.AppSettings.setLanguage.bind(window.AppSettings);
      window.AppSettings.setLanguage = (lang) => {
        origSetLang(lang);
        this.refreshLanguage();
      };
    }
  },

  refreshLanguage() {
    const lang = this.getLang();
    const t = ZONES_I18N[lang];
    const btn = document.getElementById("tab-btn-zones");
    if (btn) btn.textContent = t.tab_btn;
    const regLabel = document.getElementById("az-region-label");
    if (regLabel) regLabel.textContent = t.region_label;
    const layerLabel = document.getElementById("az-layer-label");
    if (layerLabel) layerLabel.textContent = t.layer_toggle;

    this.renderRegionOptions();
    this.renderZonesList();
    this.renderMapMarkers();
  }
};

document.addEventListener("DOMContentLoaded", () => AgriZones.init());