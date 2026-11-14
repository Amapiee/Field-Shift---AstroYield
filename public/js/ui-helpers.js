// ─── Terrain & Location Warning Alerts ──────────────────────────────────────
function showWaterAlert(customMsg) {
  const el = document.getElementById("water-alert");
  if (!el) return;
  const title = el.querySelector(".water-alert-title");
  const desc = el.querySelector(".water-alert-desc");
  if (title) title.innerHTML = '<span class="hazard-icon">⚠️</span> CẢNH BÁO VÙNG BIỂN / ĐẠI DƯƠNG';
  if (desc) {
    desc.textContent = customMsg || "Tọa độ này nằm trên đại dương/vùng biển (ví dụ: Vịnh Bắc Bộ). Vệ tinh nông nghiệp không hỗ trợ vùng nước!";
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
  const isAlpine = customMsg && (customMsg.includes("🏔️") || customMsg.includes("núi cao") || customMsg.includes("đỉnh núi") || customMsg.includes("Himalaya"));
  if (title) {
    title.innerHTML = isAlpine 
      ? '<span class="hazard-icon">🏔️</span> CẢNH BÁO ĐỊA HÌNH NÚI CAO TUYẾT PHỦ'
      : '<span class="hazard-icon">🧊</span> CẢNH BÁO BĂNG ĐẢO / BĂNG HÀ';
  }
  if (desc) {
    desc.textContent = customMsg || "Tọa độ này nằm trên dải băng tuyết vĩnh cửu. Nhiệt độ quanh năm dưới 0°C, không có tầng đất canh tác nông nghiệp!";
  }
  el.classList.add("show");
  const hint = document.getElementById("map-hint");
  if (hint) hint.style.opacity = "0";
}

function closeWaterAlert() {
  const el = document.getElementById("water-alert");
  if (el) el.classList.remove("show");
}

// ─── Random Coords ────────────────────────────────────────────────────────────
async function randomCoords() {
  closeWaterAlert();
  try {
    const r = await fetch("/api/random_coords");
    const d = await r.json();
    farmLat = d.lat; farmLon = d.lon;
    placeMarker(farmLat, farmLon, true, 8);
  } catch {
    farmLat = +(Math.random() * 120 - 55).toFixed(4);
    farmLon = +(Math.random() * 360 - 180).toFixed(4);
    placeMarker(farmLat, farmLon, true, 8);
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
  pct = Math.max(0, Math.min(100, pct));
  const color = pct >= 70 ? "#10b981" : pct >= 45 ? "#f59e0b" : "#ef4444";
  return `
    <div class="hp-row">
      <span class="hp-label">${label}</span>
      <span class="hp-val" style="color:${color}">${pct.toFixed(0)}%</span>
    </div>
    <div class="hp-bar-wrap">
      <div class="hp-bar-fill" style="width:${pct}%; background:${color}"></div>
    </div>
  `;
}

// ─── Crop Tags HTML ───────────────────────────────────────────────────────────
function cropTagsHTML(crops) {
  if (!Array.isArray(crops)) return "";
  const seasonLabels = ["🌸 Xuân", "☀️ Hè Thu", "❄️ Đông"];
  return crops.map((c, i) =>
    `<span class="crop-tag" style="border-color:${c.color}; color:${c.color}">
      [${seasonLabels[i] || "Vụ " + (i+1)}] ${c.label}
    </span>`
  ).join("");
}
