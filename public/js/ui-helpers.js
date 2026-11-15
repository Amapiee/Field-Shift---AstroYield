function showWaterAlert(customMessage) {
  const element = document.getElementById("water-alert");
  if (!element) return;
  const title = element.querySelector(".water-alert-title");
  const description = element.querySelector(".water-alert-desc");
  if (title) title.innerHTML = '<span class="hazard-icon">🌊</span> CẢNH BÁO MẶT NƯỚC / BIỂN';
  if (description) {
    description.textContent = customMessage || "Điểm chọn nằm trên mặt nước; vui lòng chọn đất liền để phân tích trồng trọt.";
  }
  element.classList.add("show");
  const hint = document.getElementById("map-hint");
  if (hint) hint.style.opacity = "0";
}

function showIceAlert(customMessage) {
  const element = document.getElementById("water-alert");
  if (!element) return;
  const title = element.querySelector(".water-alert-title");
  const description = element.querySelector(".water-alert-desc");
  if (title) title.innerHTML = '<span class="hazard-icon">🧊</span> CẢNH BÁO VÙNG BĂNG / SÔNG BĂNG';
  if (description) {
    description.textContent = customMessage || "Điểm chọn thuộc vùng băng theo bản đồ; chưa xác nhận tuyết hiện thời. Vui lòng chọn đất canh tác.";
  }
  element.classList.add("show");
  const hint = document.getElementById("map-hint");
  if (hint) hint.style.opacity = "0";
}

function setAnalysisMessage(message) {
  const element = document.getElementById("analysis-message");
  if (element) {
    element.textContent = message || "";
    element.hidden = !message;
  }
}

function closeWaterAlert() {
  const element = document.getElementById("water-alert");
  if (element) element.classList.remove("show");
}

function showCoastalAlert(message) {
  showWaterAlert(message);
  const title = document.getElementById("water-alert")?.querySelector(".water-alert-title");
  if (title) title.textContent = "📍 CẦN KIỂM TRA ĐƯỜNG BỜ";
}

const FALLBACK_FARMS = [
  [10.04, 105.78], [12.66, 108.03], [20.45, 106.33], [16.05, 108.20],
  [36.77, -119.41], [-34.28, 142.06], [14.69, -17.44], [-15.78, -47.93],
  [23.72, 90.41], [30.03, 31.23], [-1.29, 36.82],
];

function isValidCoordinatePair(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

async function randomCoords() {
  closeWaterAlert();
  let coordinates = null;
  let controller = null;
  let deadline = null;

  try {
    if (typeof AbortController === "function") {
      controller = new AbortController();
      deadline = setTimeout(() => controller.abort(), 4000);
    }
    const response = await fetch("/api/random_coords", controller ? { signal: controller.signal } : {});
    if (!response.ok) throw new Error(`random_coords returned HTTP ${response.status}`);
    const result = await response.json();
    const lat = Number(result?.lat);
    const lon = Number(result?.lon);
    if (!isValidCoordinatePair(lat, lon)) {
      throw new Error("random_coords returned invalid coordinates");
    }
    coordinates = [lat, lon];
  } catch (error) {
    console.warn("random_coords API failed; using a predefined farm location:", error.message);
    coordinates = FALLBACK_FARMS[Math.floor(Math.random() * FALLBACK_FARMS.length)];
  } finally {
    if (deadline !== null) clearTimeout(deadline);
  }

  const [lat, lon] = coordinates;
  placeMarker(lat, lon, true, 8);
  if (typeof checkSelectedLocation === "function") {
    await checkSelectedLocation(farmLat, farmLon);
  }
  if (typeof runAnalysis === "function") {
    setTimeout(() => runAnalysis(), 400);
  }
}

function switchTab(name, button) {
  document.querySelectorAll(".tab-content").forEach((element) => {
    element.classList.remove("active");
  });
  document.querySelectorAll(".tab-btn").forEach((element) => {
    element.classList.remove("active");
  });
  const tab = document.getElementById(`tab-${name}`);
  if (tab) tab.classList.add("active");
  if (button) button.classList.add("active");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function hpBarHTML(label, percentage, tipKey, unit = "points") {
  const hasValue = Number.isFinite(percentage);
  const value = hasValue ? Math.max(unit === "percent" ? 0 : 1, Math.min(100, percentage)) : 0;
  const color = value >= 70
    ? "linear-gradient(90deg,#059669,#10b981)"
    : value >= 40
      ? "linear-gradient(90deg,#d97706,#f59e0b)"
      : "linear-gradient(90deg,#dc2626,#ef4444)";
  const tip = tipKey && typeof infoIcon === "function" ? infoIcon(tipKey) : "";

  return `
    <div class="hp-wrap" style="margin-bottom:6px">
      <div class="hp-row">
        <span class="hp-label">${escapeHtml(label)}${tip}</span>
        <span class="hp-pct" title="${hasValue ? `Điểm mô hình: ${percentage}/100; chỉ số tương đối` : "Chưa có điểm"}">${hasValue ? `${Math.round(value)}%` : "-%"}</span>
      </div>
      <div class="hp-track">
        <div class="hp-fill" style="width:${value}%;background:${color}"></div>
      </div>
    </div>`;
}

function cropTagsHTML(cropInfo) {
  if (!Array.isArray(cropInfo) || cropInfo.length === 0) {
    return '<span style="font-size:0.7rem;color:var(--dim)">—</span>';
  }

  return cropInfo.map((crop, index) => {
    const rawLabel = typeof fixCropLabel === "function"
      ? fixCropLabel(crop?.label)
      : crop?.label;
    const label = escapeHtml(rawLabel || "?");
    const color = /^#[\da-f]{6}$/i.test(crop?.color || "") ? crop.color : "#64748b";
    const seasonName = typeof SEASON_NAMES !== "undefined" && SEASON_NAMES[index]
      ? SEASON_NAMES[index]
      : `S${index + 1}`;

    return `
      <span class="crop-tag"
        style="background:${color}1a;border-color:${color}55;color:${color}">
        <span class="season-num">[${escapeHtml(seasonName)}]</span>
        ${label}
      </span>`;
  }).join("");
}
