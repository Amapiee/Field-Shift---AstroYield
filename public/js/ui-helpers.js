// ─── Random Coords ────────────────────────────────────────────────────────────
async function randomCoords() {
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
  const color = pct >= 70
    ? "linear-gradient(90deg,#059669,#10b981)"
    : pct >= 40
      ? "linear-gradient(90deg,#d97706,#f59e0b)"
      : "linear-gradient(90deg,#dc2626,#ef4444)";
  return `
    <div class="hp-wrap" style="margin-bottom:6px">
      <div class="hp-row">
        <span class="hp-label">${label}</span>
        <span class="hp-pct">${pct.toFixed(0)}%</span>
      </div>
      <div class="hp-track">
        <div class="hp-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
}

// ─── Crop Tags ────────────────────────────────────────────────────────────────
function cropTagsHTML(cropInfoArr) {
  return cropInfoArr.map((c, i) => {
    const safeLabel = fixCropLabel(c.label);
    return `
      <span class="crop-tag"
        style="background:${c.color}1a;border-color:${c.color}55;color:${c.color}">
        <span class="season-num">[${SEASON_NAMES[i]}]</span>
        ${safeLabel}
      </span>`;
  }).join("");
}

