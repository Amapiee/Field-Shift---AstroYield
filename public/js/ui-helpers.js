// ─── Random Coords (fallback về danh sách nông trại cứng nếu API lỗi) ───────
const FALLBACK_FARMS = [
  [10.04, 105.78], [12.66, 108.03], [20.45, 106.33], [16.05, 108.20],
  [36.77, -119.41], [-34.28, 142.06], [14.69, -17.44], [-15.78, -47.93],
  [23.72, 90.41], [30.03, 31.23], [-1.29, 36.82],
];

async function randomCoords() {
  let lat = NaN, lon = NaN;
  try {
    const r = await fetch("/api/random_coords", { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    if (Number.isFinite(d?.lat) && Number.isFinite(d?.lon)) {
      lat = d.lat; lon = d.lon;
    }
  } catch (e) {
    console.warn("random_coords api failed:", e.message);
  }
  // Nếu API fail → chọn từ danh sách nông trại đã kiểm duyệt (không rơi vào biển)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const f = FALLBACK_FARMS[Math.floor(Math.random() * FALLBACK_FARMS.length)];
    lat = f[0]; lon = f[1];
  }
  farmLat = lat; farmLon = lon;
  placeMarker(lat, lon, true, 8);
  // Nhất quán với search: tự động chạy analysis
  setTimeout(() => { if (typeof runAnalysis === "function") runAnalysis(); }, 400);
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  const tabEl = document.getElementById("tab-" + name);
  if (tabEl) tabEl.classList.add("active");
  if (btn) btn.classList.add("active");
}

// ─── HP Bar HTML ──────────────────────────────────────────────────────────────
function hpBarHTML(label, pct) {
  const v = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  const color = v >= 70
    ? "linear-gradient(90deg,#059669,#10b981)"
    : v >= 40
      ? "linear-gradient(90deg,#d97706,#f59e0b)"
      : "linear-gradient(90deg,#dc2626,#ef4444)";
  return `
    <div class="hp-wrap" style="margin-bottom:6px">
      <div class="hp-row">
        <span class="hp-label">${label}</span>
        <span class="hp-pct">${v.toFixed(0)}%</span>
      </div>
      <div class="hp-track">
        <div class="hp-fill" style="width:${v}%;background:${color}"></div>
      </div>
    </div>`;
}

// ─── Crop Tags ────────────────────────────────────────────────────────────────
function cropTagsHTML(cropInfoArr) {
  if (!Array.isArray(cropInfoArr) || cropInfoArr.length === 0) {
    return `<span style="font-size:0.7rem;color:var(--dim)">—</span>`;
  }
  return cropInfoArr.map((c, i) => {
    const safeLabel = typeof fixCropLabel === "function" ? fixCropLabel(c.label) : (c.label || "?");
    const color = c.color || "#64748b";
    const seasonName = (typeof SEASON_NAMES !== "undefined" && SEASON_NAMES[i]) || `S${i + 1}`;
    return `
      <span class="crop-tag"
        style="background:${color}1a;border-color:${color}55;color:${color}">
        <span class="season-num">[${seasonName}]</span>
        ${safeLabel}
      </span>`;
  }).join("");
}