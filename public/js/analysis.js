let analysisInFlight = false;

const LOAD_STEPS = [
  "🌊 Validating location and terrain constraints…",
  "📡 Loading NASA POWER climate data…",
  "💧 Reading MERRA-2 soil-wetness estimates…",
  "🌧️ Processing POWER corrected precipitation…",
  "🌿 Deriving ET0, NDVI/ESI and climate-risk proxies…",
  "❄️ Evaluating seasonal suitability and cold-risk constraints…",
  "⚛️ Running constrained QAOA simulation with an exact classical baseline…",
  "📊 Ranking scenarios with preference-weighted MCDA…",
];
let stepIdx = 0;
let stepTimer = null;

function startLoadingSteps(title) {
  stopLoadingSteps();
  stepIdx = 0;
  const loadingTitle = document.getElementById("loading-title");
  const loadingStep = document.getElementById("loading-step");
  if (loadingTitle) loadingTitle.textContent = title || "FARMSHIFT PLANNING ANALYSIS…";
  if (loadingStep) loadingStep.textContent = LOAD_STEPS[0];
  stepTimer = setInterval(() => {
    stepIdx = (stepIdx + 1) % LOAD_STEPS.length;
    if (loadingStep) loadingStep.textContent = LOAD_STEPS[stepIdx];
  }, 900);
}

function stopLoadingSteps() {
  if (stepTimer !== null) clearInterval(stepTimer);
  stepTimer = null;
}

function resetDashboardUI() {
  if (typeof setAnalysisMessage === "function") setAnalysisMessage("");
  for (const id of ["source-reason", "solver-details", "spi-summary", "ext-api-status", "ext-api-desc"]) {
    const element = document.getElementById(id);
    if (element) element.textContent = "";
  }
  for (const id of ["cold-risk-summary", "terrain-summary"]) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = "Chưa có dữ liệu.";
      element.title = "";
    }
  }
  for (const id of ["cold-risk-months", "user-season-risks", "q-season-risks", "mcda-ranking", "risk-bars"]) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = "";
  }
  for (const id of ["risk-block", "risk-bars", "ext-api-block"]) {
    const element = document.getElementById(id);
    if (element) element.style.display = "none";
  }

  if (typeof destroyChart === "function") {
    chartTemp = destroyChart(chartTemp);
    chartRain = destroyChart(chartRain);
    chartNdvi = destroyChart(chartNdvi);
    chartRadar = destroyChart(chartRadar);
  }

  const resetText = (id, text) => {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  };
  const resetHtml = (id, html) => {
    const element = document.getElementById(id);
    if (element) element.innerHTML = html;
  };
  const resetRank = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = "RANK -";
      element.className = "rank-chip";
    }
  };
  const resetHpBar = (id, title) => resetHtml(id, `
    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px; opacity:0.6;">
      <span>${title}</span>
      <span style="font-weight:bold;">-%</span>
    </div>
    <div style="width:100%; background:rgba(255,255,255,0.1); border-radius:4px; height:6px; overflow:hidden;">
      <div style="width:0%; background:#7f8c8d; height:100%;"></div>
    </div>
  `);

  resetText("match-score", "-%");
  resetText("match-desc", "-");
  resetHtml("user-tags", "-");
  resetRank("user-rank");
  resetHtml("q-tags", "-");
  resetRank("q-rank");
  resetText("q-method", "-");

  resetHpBar("user-hp-soil", "Điểm đất (heuristic)");
  resetHpBar("user-hp-water", "Điểm nước (heuristic)");
  resetHpBar("user-hp-profit", "Điểm lợi ích (heuristic)");
  resetHpBar("q-hp-soil", "Điểm đất (heuristic)");
  resetHpBar("q-hp-water", "Điểm nước (heuristic)");
  resetHpBar("q-hp-profit", "Điểm lợi ích (heuristic)");

  const alertsWrap = document.getElementById("alerts-wrap");
  if (alertsWrap) alertsWrap.style.display = "none";
  resetHtml("alerts-list", "");

  for (const id of [
    "sv-temp", "sv-temp-rng", "sv-gwet", "sv-gwet-sub", "sv-rain",
    "sv-rain-sub", "sv-ts", "sv-esi", "sv-ndvi", "sv-ndvi-sub",
  ]) {
    resetText(id, "-");
  }
  const sourceBadge = document.getElementById("data-source-badge");
  if (sourceBadge) {
    sourceBadge.textContent = "Source: -";
    sourceBadge.title = "";
  }
  for (const row of document.querySelectorAll(".sat-row")) {
    const description = row.querySelector(".sat-desc");
    if (description) description.textContent = "Chưa có dữ liệu tại điểm chọn.";
    row.title = "";
  }
}

async function runAnalysis() {
  if (analysisInFlight) return;

  const value = (id) => document.getElementById(id)?.value ?? "";
  const latText = value("inp-lat").trim();
  const lonText = value("inp-lon").trim();
  const inputLat = Number(latText);
  const inputLon = Number(lonText);
  if (
    !latText || !lonText ||
    !Number.isFinite(inputLat) || !Number.isFinite(inputLon) ||
    Math.abs(inputLat) > 90 || Math.abs(inputLon) > 180
  ) {
    alert("Vui lòng nhập vĩ độ [-90,90] và kinh độ [-180,180] hợp lệ.");
    return;
  }

  const lat = Number(inputLat.toFixed(4));
  const lon = Number(inputLon.toFixed(4));
  farmLat = lat;
  farmLon = lon;
  placeMarker(lat, lon);
  map.flyTo([lat, lon], Math.max(map.getZoom(), 7), { duration: 0.8 });

  const geo = typeof cachedLocation === "function" ? cachedLocation(lat, lon) : null;
  if (geo?.is_water || geo?.is_ice || geo?.requires_verification) {
    resetDashboardUI();
    if (geo.is_ice && typeof showIceAlert === "function") showIceAlert(geo.message);
    else if (geo.requires_verification && typeof showCoastalAlert === "function") showCoastalAlert(geo.message);
    else if (typeof showWaterAlert === "function") showWaterAlert(geo.message);
    if (typeof setAnalysisMessage === "function") setAnalysisMessage(geo.message);
    return;
  }

  const inputs = [
    "inp-lat", "inp-lon", "sl-soil", "sl-water", "sl-profit",
    "crop-s1", "crop-s2", "crop-s3",
  ];
  const snapshot = inputs.map(value);
  const selection = typeof locationSelection === "number" ? locationSelection : null;
  const isCurrent = () => (
    inputs.every((id, index) => value(id) === snapshot[index]) &&
    farmLat === lat &&
    farmLon === lon &&
    (selection === null || selection === locationSelection)
  );
  const payload = {
    lat,
    lon,
    w_soil: Number(value("sl-soil")),
    w_water: Number(value("sl-water")),
    w_profit: Number(value("sl-profit")),
    user_crops: ["crop-s1", "crop-s2", "crop-s3"].map(value),
  };

  analysisInFlight = true;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timedOut = false;
  let deadline = null;
  try {
    resetDashboardUI();
    document.getElementById("loading")?.classList.add("show");
    for (const id of ["btn-run", "btn-run-footer"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = true;
    }
    startLoadingSteps();
    if (typeof closeWaterAlert === "function") closeWaterAlert();

    deadline = setTimeout(() => {
      timedOut = true;
      if (controller) controller.abort();
    }, 60000);

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const data = await response.json();

    if (!isCurrent()) {
      const description = document.getElementById("match-desc");
      if (description) description.textContent = "Vị trí hoặc lựa chọn đã thay đổi; hãy phân tích lại.";
      return;
    }
    if (!data || typeof data !== "object") throw new Error("Phản hồi API không hợp lệ.");
    if (
      data.ok &&
      (
        data.contract_version !== "terrain-v2-objective-v5" ||
        !data.objective_version ||
        !data.scenarios?.classical
      )
    ) {
      throw new Error(
        typeof RESTART_MESSAGE === "string"
          ? RESTART_MESSAGE
          : "Backend đang chạy phiên bản cũ. Hãy khởi động lại server rồi tải lại trang."
      );
    }

    if (data.ok && response.ok !== false) {
      if (typeof updateUI === "function") updateUI(data);
      return;
    }

    resetDashboardUI();
    const sourceBadge = document.getElementById("data-source-badge");
    if (sourceBadge) {
      sourceBadge.textContent = `Source: ${data.source || "Nguồn chưa khả dụng"} · ${data.data_mode || data.source_status || "unavailable"} · Không có khuyến nghị`;
    }
    const message = data.error || data.reason || "Không có đủ dữ liệu.";
    const description = document.getElementById("match-desc");
    if (description) description.textContent = message;
    if (typeof renderColdRisk === "function") renderColdRisk(data);
    if (typeof renderAlerts === "function") renderAlerts(data.alerts || []);
    const reason = document.getElementById("source-reason");
    if (reason) reason.textContent = data.reason || "";

    const terrainMessage = data.terrain?.high_elevation
      ? ` Địa hình cao khoảng ${Math.round(data.terrain.site_elevation_m)} m; cần kiểm tra điều kiện địa phương.`
      : "";
    if (typeof setAnalysisMessage === "function") setAnalysisMessage(message + terrainMessage);
    if (data.is_ice && typeof showIceAlert === "function") showIceAlert(data.error);
    else if (data.is_water && typeof showWaterAlert === "function") showWaterAlert(data.error);
    else if (data.location?.requires_verification && typeof showCoastalAlert === "function") showCoastalAlert(data.error);
  } catch (error) {
    if (!isCurrent()) return;
    resetDashboardUI();
    const sourceBadge = document.getElementById("data-source-badge");
    if (sourceBadge) sourceBadge.textContent = "Source: unavailable";
    const message = timedOut
      ? "Phân tích quá thời gian chờ 60 giây; vui lòng thử lại."
      : `Không thể tải phân tích: ${error.message}`;
    const description = document.getElementById("match-desc");
    if (description) description.textContent = message;
    if (typeof setAnalysisMessage === "function") setAnalysisMessage(message);
  } finally {
    if (deadline !== null && typeof clearTimeout === "function") clearTimeout(deadline);
    stopLoadingSteps();
    document.getElementById("loading")?.classList.remove("show");
    for (const id of ["btn-run", "btn-run-footer"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = false;
    }
    analysisInFlight = false;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
    event.preventDefault();
    runAnalysis();
  }
});
