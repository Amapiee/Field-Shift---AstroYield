// ─── Auto-inject RISK block nếu HTML chưa có (không cần sửa index.html) ─────
function ensureRiskBlock() {
  if (document.getElementById("risk-block")) return;
  const tab = document.getElementById("tab-telemetry");
  if (!tab) return;

  const block = document.createElement("div");
  block.className = "sat-row";
  block.id = "risk-block";
  block.style.borderColor = "rgba(245,158,11,0.35)";
  block.style.background  = "rgba(245,158,11,0.04)";
  block.innerHTML = `
    <div class="sat-icon">🌊</div>
    <div class="sat-info">
      <div class="sat-name">RỦI RO THIÊN TAI</div>
      <div class="sat-desc">Hạn hán (DRI) · Lũ lụt (FRI)</div>
    </div>
    <div class="sat-values">
      <div class="sat-val-main" style="color:#f59e0b" id="risk-drought">—</div>
      <div class="sat-val-sub" id="risk-flood">—</div>
    </div>`;

  const bars = document.createElement("div");
  bars.id = "risk-bars";
  bars.style.cssText = "padding:0 14px 8px;";

  // Chèn ngay TRƯỚC chart đầu tiên (giữ đúng thứ tự sat-rows → charts)
  const firstChart = tab.querySelector(".mini-chart-wrap");
  if (firstChart) {
    firstChart.parentNode.insertBefore(block, firstChart);
    firstChart.parentNode.insertBefore(bars,  firstChart);
  } else {
    tab.appendChild(block);
    tab.appendChild(bars);
  }
}

function ensureExternalBlock() {
  if (document.getElementById("ext-api-block")) return;
  const tab = document.getElementById("tab-telemetry");
  if (!tab) return;

  const block = document.createElement("div");
  block.className = "sat-row";
  block.id = "ext-api-block";
  block.style.borderColor = "rgba(167,139,250,0.35)"; // Màu tím cho external
  block.style.background  = "rgba(167,139,250,0.04)";
  block.innerHTML = `
    <div class="sat-icon">🌍</div>
    <div class="sat-info">
      <div class="sat-name" id="ext-api-title">CROP SUITABILITY API</div>
      <div class="sat-desc" id="ext-api-desc">CartoDrone + Every.Farm</div>
    </div>
    <div class="sat-values">
      <div class="sat-val-main" style="color:#a78bfa" id="ext-api-status">—</div>
    </div>`;

  // Chèn ngay TRƯỚC khối chart nhiệt độ (giữ đúng thứ tự)
  const chartWrap = tab.querySelector(".mini-chart-wrap");
  if (chartWrap) chartWrap.parentNode.insertBefore(block, chartWrap);
  else tab.appendChild(block);
}

function renderRiskBlock(sat) {
  if (!sat.RISK) {
    const block = document.getElementById("risk-block");
    if (block) block.style.display = "none";
    return;
  }
  ensureRiskBlock();
  const block = document.getElementById("risk-block");
  if (block) block.style.display = "";

  const rd = Number.isFinite(sat.RISK.dri_avg) ? sat.RISK.dri_avg : 0;
  const rf = Number.isFinite(sat.RISK.fri_avg) ? sat.RISK.fri_avg : 0;
  const dm = Array.isArray(sat.RISK.drought_months) ? sat.RISK.drought_months : [];
  const fm = Array.isArray(sat.RISK.flood_months)   ? sat.RISK.flood_months   : [];

  const drEl = document.getElementById("risk-drought");
  const flEl = document.getElementById("risk-flood");
  if (drEl) drEl.textContent = `Hạn ${(rd * 100).toFixed(0)}% · ${dm.length} tháng`;
  if (flEl) flEl.textContent = `Lũ  ${(rf * 100).toFixed(0)}% · ${fm.length} tháng`;

  const bars = document.getElementById("risk-bars");
  if (bars && typeof hpBarHTML === "function") {
    bars.innerHTML =
      hpBarHTML("🌵 Hạn hán (DRI)", rd * 100) +
      hpBarHTML("🌊 Lũ lụt (FRI)",  rf * 100);
  }
}

// ─── Update UI ────────────────────────────────────────────────────────────────
function updateUI(data) {
  const sat = data.satellite || {};
  const sc  = data.scenarios || {};

  document.getElementById("data-source-badge").textContent = "Source: " + (data.source || "unknown");

  // FIX: 0 là giá trị hợp lệ → không được hiển thị "N/A"
  const setVal = (id, v, suffix = "") => {
    const el = document.getElementById(id);
    if (!el) return;
    const n = Number(v);
    el.textContent = Number.isFinite(n) ? n + suffix : "N/A";
  };

  setVal("sv-temp", sat.POWER?.temp_avg, " °C");

  setVal("sv-gwet", sat.SMAP?.gwetroot_avg);
  const gwetSub = document.getElementById("sv-gwet-sub");
  if (gwetSub && sat.SMAP) {
    gwetSub.textContent = `Root zone · ${sat.SMAP.drought_months} drought month(s)`;
  }

  setVal("sv-rain", sat.GPM?.rain_avg, " mm/mo");
  const rainSub = document.getElementById("sv-rain-sub");
  if (rainSub && sat.GPM) {
    rainSub.textContent = `Total ${sat.GPM.rain_total} mm/yr · ${sat.GPM.flood_months} flood risk month(s)`;
  }

  setVal("sv-ts", sat.ECOSTRESS?.ts_max, " °C peak");
  const esiEl = document.getElementById("sv-esi");
  if (esiEl && sat.ECOSTRESS) {
    esiEl.textContent = `ESI avg ${sat.ECOSTRESS.esi_avg} · ${sat.ECOSTRESS.heat_months} heat stress month(s)`;
  }

  setVal("sv-ndvi", sat.MODIS?.ndvi_avg);
  const ndviSub = document.getElementById("sv-ndvi-sub");
  if (ndviSub && sat.MODIS) {
    ndviSub.textContent = `NDVI ${sat.MODIS.ndvi_min} – ${sat.MODIS.ndvi_max}`;
  }

  // NEW: block rủi ro thiên tai (DRI/FRI)
  renderRiskBlock(sat);

  // Xử lý hiển thị API Bên Thứ Ba
  ensureExternalBlock();
  const extStatus = document.getElementById("ext-api-status");
  const extDesc = document.getElementById("ext-api-desc");
  
  if (data.external_api) {
    if (data.external_api.ok) {
      extStatus.innerHTML = `<span style="color:#10b981">● Live</span>`;
      extDesc.textContent = "CartoDrone / Every.Farm (Live)";
    } else {
      extStatus.innerHTML = `<span style="color:#ef4444">● Offline</span>`;
      extDesc.textContent = "Dùng công thức nội bộ (API lỗi)";
      
      // Bắn thông báo nhỏ (Toast) mà không làm đơ app
      if (typeof showWaterToast === "function") {
        // Tái sử dụng hàm toast có sẵn nhưng đổi nội dung
        showCustomToast("⚠️ Không thể kết nối API cây trồng. Hệ thống đang dùng dữ liệu xấp xỉ.");
      }
    }
  }
  // Alerts
  const alertsList = document.getElementById("alerts-list");
  if (alertsList) {
    alertsList.innerHTML = "";
    (data.alerts || []).forEach(a => {
      const cls = a.level === "danger" ? "alert-danger"
                : a.level === "warning" ? "alert-warning" : "alert-ok";
      alertsList.innerHTML += `<div class="alert-box ${cls}">${a.msg || ""}</div>`;
    });
  }
  const alertsWrap = document.getElementById("alerts-wrap");
  if (alertsWrap) alertsWrap.style.display = "block";

  // Charts
  if (data.monthly && typeof buildCharts === "function") buildCharts(data.monthly);

  // Match score
  const mp = Number.isFinite(data.match_pct) ? data.match_pct : 0;
  document.getElementById("match-score").textContent = mp + "%";
  const matchDesc = mp >= 85 ? "🏆 Excellent — Very close to quantum optimal!"
    : mp >= 65 ? "👍 Good — Room for further optimization"
    : mp >= 45 ? "⚠️ Fair — Consider the quantum recommendation"
    : "🔴 Low — Quantum suggests a significantly better rotation";
  document.getElementById("match-desc").textContent = matchDesc;

  // User block
  if (sc.user) {
    document.getElementById("user-tags").innerHTML = cropTagsHTML(sc.user.crop_info);
    document.getElementById("user-rank").textContent = "RANK " + sc.user.rank;
    document.getElementById("user-rank").className = "rank-chip rank-" + sc.user.rank;
    document.getElementById("user-hp-soil").innerHTML   = hpBarHTML("🌱 Soil & Nitrogen HP",  sc.user.soil_hp,   "soil_hp");
    document.getElementById("user-hp-water").innerHTML  = hpBarHTML("💧 Water Budget HP",     sc.user.water_hp,  "water_hp");
    document.getElementById("user-hp-profit").innerHTML = hpBarHTML("💰 Economic HP",         sc.user.profit_hp, "profit_hp");
  }

  // Quantum block
  if (sc.quantum) {
    document.getElementById("q-tags").innerHTML = cropTagsHTML(sc.quantum.crop_info);
    document.getElementById("q-rank").textContent = "RANK " + sc.quantum.rank;
    document.getElementById("q-rank").className = "rank-chip rank-" + sc.quantum.rank;
    const methodSafe = String(sc.quantum.method || "—").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    document.getElementById("q-method").innerHTML = "⚛️ " + methodSafe + (typeof infoIcon === "function" ? infoIcon("quantum_method") : "");
    document.getElementById("q-hp-soil").innerHTML   = hpBarHTML("🌱 Soil & Nitrogen HP",  sc.quantum.soil_hp,   "soil_hp");
    document.getElementById("q-hp-water").innerHTML  = hpBarHTML("💧 Water Budget HP",     sc.quantum.water_hp,  "water_hp");
    document.getElementById("q-hp-profit").innerHTML = hpBarHTML("💰 Economic HP",         sc.quantum.profit_hp, "profit_hp");
  }

  // Radar
  if (typeof buildRadar === "function") buildRadar(sc);

  // Auto-switch sang Arena CHỈ lần đầu (tránh cướp tab khi user đang scroll Telemetry)
  if (!window._fsAutoSwitched) {
    window._fsAutoSwitched = true;
    setTimeout(() => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      const arenaTab = document.getElementById("tab-arena");
      const arenaBtn = document.querySelectorAll(".tab-btn")[1];
      if (arenaTab) arenaTab.classList.add("active");
      if (arenaBtn) arenaBtn.classList.add("active");
    }, 400);
  }
}
