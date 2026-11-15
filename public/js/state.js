// ─── State ───────────────────────────────────────────────────────────────────
let farmLat = 10.04, farmLon = 105.78;
let farmMarker = null;
let chartTemp = null, chartRain = null, chartNdvi = null, chartRadar = null;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SEASON_NAMES = ["🌱 Vụ 1 · T1–T4","☀️ Vụ 2 · T5–T8","❄️ Vụ 3 · T9–T12"];

// ─── Emoji sanitizer ─────────────────────────────────────────────────────────
function fixCropLabel(label) {
  if (!label) return label;
  let fixed = label.replace(/[\u{1FAD8}\u{1F33F}]/gu, "🌱");
  if (fixed.includes("Đậu Tương") && !fixed.includes("🌱")) {
    fixed = "🌱 " + fixed.replace(/^[^\w\s\u00C0-\u1EF9]+/u, "").trim();
  }
  fixed = fixed.replace("Bỏ Trống", "Nghỉ Đất");
  return fixed;
}

