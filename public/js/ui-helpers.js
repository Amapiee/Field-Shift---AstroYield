// ─── Terrain & Location Warning Alerts ──────────────────────────────────────
function showWaterAlert(customMsg) {
  const el = document.getElementById("water-alert");
  if (!el) return;
  const title = el.querySelector(".water-alert-title");
  const desc = el.querySelector(".water-alert-desc");
  if (title) title.innerHTML = '<span class="hazard-icon">🌊</span> CẢNH BÁO MẶT NƯỚC / BIỂN';
  if (desc) {
    desc.textContent = customMsg || "Điểm chọn nằm trên mặt nước; vui lòng chọn đất liền để phân tích trồng trọt.";
  }
  el.classList.add("show");
  const hint = document.getElementById("map-hint");
  if (hint) hint.style.opacity = "0";
}

function showIceAlert(customMsg) {
  const el = document.getElementById("water-alert");
  if (!el) return;
  const title = el.querySelector(".water-alert-title");
  const desc = el.querySelector(".water-alert-desc");
  if (title) {
    title.innerHTML = '<span class="hazard-icon">🧊</span> CẢNH BÁO VÙNG BĂNG / SÔNG BĂNG';
  }
  if (desc) {
    desc.textContent = customMsg || "Điểm chọn thuộc vùng băng theo bản đồ; chưa xác nhận tuyết hiện thời. Vui lòng chọn đất canh tác.";
  }
  el.classList.add("show");
  const hint = document.getElementById("map-hint");
  if (hint) hint.style.opacity = "0";
}

function setAnalysisMessage(message) {
  const el = document.getElementById('analysis-message');
  if (el) { el.textContent = message || ''; el.hidden = !message; }
}

function closeWaterAlert() {
  const el = document.getElementById("water-alert");
  if (el) el.classList.remove("show");
}
function showCoastalAlert(message) {
  showWaterAlert(message);
  const title=document.getElementById('water-alert')?.querySelector('.water-alert-title');
  if(title)title.textContent='📍 CẦN KIỂM TRA ĐƯỜNG BỜ';
}

// ─── Random Coords ────────────────────────────────────────────────────────────
async function randomCoords() {
  closeWaterAlert();
  try {
    const r = await fetch("/api/random_coords");
    const d = await r.json();
    farmLat = d.lat; farmLon = d.lon;
    placeMarker(farmLat, farmLon, true, 8);
    checkSelectedLocation(farmLat, farmLon);
  } catch {
    farmLat = +(Math.random() * 120 - 55).toFixed(4);
    farmLon = +(Math.random() * 360 - 180).toFixed(4);
    placeMarker(farmLat, farmLon, true, 8);
    checkSelectedLocation(farmLat, farmLon);
  }
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  btn.classList.add("active");
}

// ─── HP Bar HTML ──────────────────────────────────────────────────────────────
function hpBarHTML(label, pct) {
  if(!Number.isFinite(pct))return `<div class="hp-row"><span class="hp-label">${label}</span><span class="hp-val">N/A</span></div>`;
  pct = Math.max(0, Math.min(100, pct));
  const color = pct >= 70 ? "#10b981" : pct >= 45 ? "#f59e0b" : "#ef4444";
  return `
    <div class="hp-row">
      <span class="hp-label">${label}</span>
      <span class="hp-val" style="color:${color}">${pct.toFixed(1)} / 100</span>
    </div>
    <div class="hp-bar-wrap">
      <div class="hp-bar-fill" style="width:${pct}%; background:${color}"></div>
    </div>
  `;
}

// ─── Crop Tags HTML ───────────────────────────────────────────────────────────
function cropTagsHTML(crops) {
  if (!Array.isArray(crops)) return "";
  const seasonLabels = typeof SEASON_NAMES!=='undefined'?SEASON_NAMES:['T1–T4 (minh họa)','T5–T8 (minh họa)','T9–T12 (minh họa)'];
  return crops.map((c, i) =>
    `<span class="crop-tag" style="border-color:${c.color}; color:${c.color}">
      [${seasonLabels[i] || "Vụ " + (i+1)}] ${c.label}
    </span>`
  ).join("");
}
