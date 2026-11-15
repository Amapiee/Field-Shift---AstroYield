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
      <div class="sat-name">RỦI RO THIÊN TAI<span class="info-q" data-tip-key="risk_dri" tabindex="0" role="button" aria-label="Thông tin">?</span></div>
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
  const firstChart = tab.querySelector(".mini-chart-wrap:not(details)");
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
      <div class="sat-name" id="ext-api-title">CROP SUITABILITY API<span class="info-q" data-tip-key="ext_api" tabindex="0" role="button" aria-label="Thông tin">?</span></div>
      <div class="sat-desc" id="ext-api-desc">CartoDrone + Every.Farm</div>
    </div>
    <div class="sat-values">
      <div class="sat-val-main" style="color:#a78bfa" id="ext-api-status">—</div>
    </div>`;

  // Chèn ngay TRƯỚC khối chart nhiệt độ (giữ đúng thứ tự)
  const chartWrap = tab.querySelector(".mini-chart-wrap:not(details)");
  if (chartWrap) chartWrap.parentNode.insertBefore(block, chartWrap);
  else tab.appendChild(block);
}

function renderRiskBlock(sat) {
  if (!sat.RISK) {
    const block = document.getElementById("risk-block");
    if (block) block.style.display = "none";
    const bars = document.getElementById("risk-bars");
    if (bars) { bars.innerHTML = ""; bars.style.display = "none"; }
    return;
  }
  ensureRiskBlock();
  const block = document.getElementById("risk-block");
  if (block) block.style.display = "";

  const rd = Number.isFinite(sat.RISK.dri_avg) ? sat.RISK.dri_avg : null;
  const rf = Number.isFinite(sat.RISK.fri_avg) ? sat.RISK.fri_avg : null;
  const dm = Array.isArray(sat.RISK.drought_months) ? sat.RISK.drought_months : [];
  const fm = Array.isArray(sat.RISK.flood_months)   ? sat.RISK.flood_months   : [];

  const drEl = document.getElementById("risk-drought");
  const flEl = document.getElementById("risk-flood");
  if (drEl) drEl.textContent = rd === null ? "Hạn: N/A" : `Hạn ${(rd * 100).toFixed(0)}% · ${dm.length} tháng`;
  if (flEl) flEl.textContent = rf === null ? "Lũ: N/A" : `Lũ ${(rf * 100).toFixed(0)}% · ${fm.length} tháng`;

  const bars = document.getElementById("risk-bars");
  if (bars && typeof hpBarHTML === "function") {
    bars.style.display = "";
    bars.innerHTML =
      hpBarHTML("🌵 Hạn hán (DRI)", rd === null ? null : rd * 100, "risk_dri", "percent") +
      hpBarHTML("🌊 Lũ lụt (FRI)", rf === null ? null : rf * 100, "risk_fri", "percent");
  }
}

function renderText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function renderRows(id, rows) {
  const container = document.getElementById(id);
  if (!container) return;
  container.innerHTML = "";
  for (const row of rows) {
    const element = document.createElement("div");
    element.className = row.className || "detail-row";
    element.textContent = row.text;
    container.appendChild(element);
  }
}

function renderAlerts(alerts = []) {
  const rows = (Array.isArray(alerts) ? alerts : []).map(alert => ({
    className: "alert-box " + (alert?.level === "danger" ? "alert-danger" : alert?.level === "warning" ? "alert-warning" : "alert-ok"),
    text: typeof alert === "string" ? alert : String(alert?.msg ?? ""),
  }));
  renderRows("alerts-list", rows);
  const wrap = document.getElementById("alerts-wrap");
  if (wrap) wrap.style.display = rows.length ? "block" : "none";
}

function renderColdRisk(data = {}) {
  const terrain = data.terrain || {};
  const height = value => Number.isFinite(value) ? `${Math.round(value)} m` : "N/A";
  const mismatch = terrain.climate_representativeness === "limited_by_elevation_difference";
  renderText("terrain-summary", `Độ cao tại điểm (DEM): ${height(terrain.site_elevation_m)} · Ô khí hậu POWER: ${height(terrain.grid_elevation_m)}` +
    (mismatch ? " · Chênh độ cao lớn: cần kiểm tra vi khí hậu tại ruộng." : ""));
  const risk = data.cold_risk;
  const frost = Array.isArray(risk?.frost_months) ? risk.frost_months : [];
  const unknown = Array.isArray(risk?.unknown_months) ? risk.unknown_months : [];
  const period = risk?.period ? ` · ${risk.period.start ?? "?"} – ${risk.period.end ?? "?"}` : "";
  renderText("cold-risk-summary", !risk ? "Chưa có dữ liệu đánh giá rét." :
    `${frost.length ? "Phát hiện chỉ báo rét: " + frost.map(month => "T" + month).join(", ") : "Chưa phát hiện chỉ báo rét trong dữ liệu hiện có"}` +
    `${unknown.length ? " · Thiếu dữ liệu: " + unknown.map(month => "T" + month).join(", ") : ""}${period}. Không phải dự báo hoặc xác nhận thiệt hại tại ruộng.`);
  renderRows("cold-risk-months", (Array.isArray(risk?.months) ? risk.months : []).map(month => {
    const daily = month.daily;
    const temperature = value => Number.isFinite(value) ? `${value}°C` : "N/A";
    const status = month.frost_risk === "detected" ? "Có chỉ báo rét" : month.frost_risk === "unknown" ? "Chưa đủ dữ liệu" : "Chưa phát hiện trong dữ liệu hiện có";
    return {className:"cold-month " + (month.frost_risk === "detected" ? "risk-detected" : ""),
      text:`T${month.month}: ${status} · TB ${temperature(month.mean_temperature_c)} · Tmin khí hậu ${temperature(month.climatology_tmin_c)}` +
        (daily ? ` · Tmin lịch sử ${temperature(daily.minimum_tmin_c)}${daily.coldest_date ? " (" + daily.coldest_date + ")" : ""} · ${daily.freezing_days ?? "N/A"} ngày dưới 0°C · ${daily.status || "unavailable"}` : " · Thiếu lịch sử ngày")};
  }));
  for (const [key, id] of [["user", "user-season-risks"], ["quantum", "q-season-risks"]]) {
    const seasons = data.scenarios?.[key]?.season_results;
    renderRows(id, (Array.isArray(seasons) ? seasons : []).map(season => ({
      className:"season-risk " + (season.model_excluded || season.is_lethal ? "risk-detected" : ""),
      text:`Vụ ${season.season} (${(season.months || []).map(month => "T" + month).join(", ")}) · ${season.crop || ""}: ` +
        (season.reason || (season.model_excluded || season.is_lethal ? "Bị loại theo mô hình" : "Không bị loại theo các ràng buộc hiện có")),
    })));
  }
}

function renderAnalysisDetails(data = {}) {
  renderText("source-reason", data.reason || data.provenance?.limitations || (Array.isArray(data.limitations) ? data.limitations.join(" ") : ""));
  renderText("spi-summary", data.spi ? `SPI: ${data.spi.status || "unavailable"} · ${data.spi.source || ""} ${data.spi.reason || ""}` : "SPI: chưa có dữ liệu.");
  const q = data.scenarios?.quantum;
  renderText("solver-details", q ? `${q.method || ""} · ${q.status || ""} · shots ${q.shots ?? "N/A"} · gap ${q.optimality_gap_pct ?? "N/A"} · ${q.runtime_ms ?? "N/A"} ms` : "");
  renderRows("mcda-ranking", (Array.isArray(data.mcda?.topsis) ? data.mcda.topsis : []).map(row => ({
    text:`${row.rank ? row.rank + ". " : ""}${row.label || row.id}: ${Number.isFinite(row.topsis_score) ? row.topsis_score.toFixed(3) : "N/A"}`,
  })));
}

// ─── Update UI ────────────────────────────────────────────────────────────────
function updateUI(data) {
  const sat = data.satellite || {};
  const sc  = data.scenarios || {};

  const blocked = data.planning_allowed === false || data.recommendation_allowed === false;
  if ((blocked || !sc.user || !sc.quantum) && typeof resetDashboardUI === "function") resetDashboardUI();
  renderText("data-source-badge", "Source: " + (data.source || "unknown") + (data.source_status ? " · " + data.source_status : "") +
    (data.forecast === false ? " · KHÔNG PHẢI DỰ BÁO" : ""));
  renderAnalysisDetails(data);

  // FIX: 0 là giá trị hợp lệ → không được hiển thị "N/A"
  const setVal = (id, v, suffix = "") => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = Number.isFinite(v) ? v + suffix : "N/A";
  };

  setVal("sv-temp", sat.POWER?.temp_avg, " °C");
  const number = value => Number.isFinite(value) ? String(value) : "N/A";
  renderText("sv-temp-rng", `${number(sat.POWER?.temp_min)} – ${number(sat.POWER?.temp_max)} °C`);
  for (const [id, key] of [["sv-temp","POWER"],["sv-gwet","SMAP"],["sv-rain","GPM"],["sv-ts","ECOSTRESS"],["sv-ndvi","MODIS"]]) {
    const row = document.getElementById(id)?.closest?.(".sat-row");
    const description = row?.querySelector?.(".sat-desc");
    if (description) description.textContent = sat[key]?.source || "Chưa có dữ liệu.";
  }

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
    const block = document.getElementById("ext-api-block");
    if (block) block.style.display = "";
    if (data.external_api.ok) {
      extStatus.innerHTML = `<span style="color:#10b981">● Live</span>`;
      extDesc.textContent = "CartoDrone / Every.Farm (Live)";
    } else {
      extStatus.innerHTML = `<span style="color:#94a3b8">● Nội bộ</span>`;
      extDesc.textContent = "Đang chấm bằng khí hậu NASA; API cây trồng bổ sung chưa kết nối.";
      
      // Optional provider availability is independent of land/water selection.
    }
  } else {
    const block = document.getElementById("ext-api-block");
    if (block) block.style.display = "none";
  }
  // Alerts
  renderAlerts(data.alerts);
  renderColdRisk(data);
  if (typeof CropRecommendations !== "undefined" && data.crop_rankings) CropRecommendations.accept(data);

  // Charts
  if (typeof buildSeasonCropCharts === "function") buildSeasonCropCharts(data.seasonal_crop_rankings || []);
  if (data.monthly && typeof buildCharts === "function") buildCharts(data.monthly);

  // Match score
  const mp = Number.isFinite(data.match_pct) ? data.match_pct : null;
  renderText("match-score", !blocked && mp !== null ? Math.max(1,Math.round(mp)) + "%" : "-%");
  const blockedReason = data.recommendation_status === "cold_risk_incomplete" ? "Chưa đủ dữ liệu nhiệt độ tối thiểu để đánh giá rét. " : "";
  const matchDesc = blockedReason + (data.match_desc || (blocked ? "Chưa đủ cơ sở hiển thị phương án tại điểm chọn." : "Điểm tương đồng heuristic; không phải xác suất thành công."));
  renderText("match-desc", matchDesc);
  if (typeof setAnalysisMessage === "function") setAnalysisMessage(blocked ? matchDesc : "");

  // User block
  if (!blocked && sc.user) {
    document.getElementById("user-tags").innerHTML = cropTagsHTML(sc.user.crop_info);
    document.getElementById("user-rank").textContent = "RANK " + sc.user.rank;
    document.getElementById("user-rank").className = "rank-chip rank-" + sc.user.rank;
    document.getElementById("user-hp-soil").innerHTML   = hpBarHTML("🌱 Soil & Nitrogen HP",  sc.user.soil_hp,   "soil_hp");
    document.getElementById("user-hp-water").innerHTML  = hpBarHTML("💧 Water Budget HP",     sc.user.water_hp,  "water_hp");
    document.getElementById("user-hp-profit").innerHTML = hpBarHTML("💰 Economic HP",         sc.user.profit_hp, "profit_hp");
  }

  // Quantum block
  if (!blocked && sc.quantum) {
    document.getElementById("q-tags").innerHTML = cropTagsHTML(sc.quantum.crop_info);
    document.getElementById("q-rank").textContent = "RANK " + sc.quantum.rank;
    document.getElementById("q-rank").className = "rank-chip rank-" + sc.quantum.rank;
    const methodSafe = String(sc.quantum.method || "—").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const methodLabel = (sc.quantum.fallback_used ? "Classical fallback · " : "⚛️ ") + (sc.quantum.method || "—");
    renderText("q-method", methodLabel);
    if (typeof infoIcon === "function") document.getElementById("q-method").innerHTML =
      (sc.quantum.fallback_used ? "Classical fallback · " : "⚛️ ") + methodSafe + infoIcon("quantum_method");
    document.getElementById("q-hp-soil").innerHTML   = hpBarHTML("🌱 Soil & Nitrogen HP",  sc.quantum.soil_hp,   "soil_hp");
    document.getElementById("q-hp-water").innerHTML  = hpBarHTML("💧 Water Budget HP",     sc.quantum.water_hp,  "water_hp");
    document.getElementById("q-hp-profit").innerHTML = hpBarHTML("💰 Economic HP",         sc.quantum.profit_hp, "profit_hp");
  }

  // Radar
  if (!blocked && sc.user && sc.quantum && typeof buildRadar === "function") buildRadar(sc);

  // Auto-switch sang Arena CHỈ lần đầu (tránh cướp tab khi user đang scroll Telemetry)
  const scope = typeof window !== "undefined" ? window : globalThis;
  if (!blocked && sc.user && sc.quantum && !scope._fsAutoSwitched) {
    scope._fsAutoSwitched = true;
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
