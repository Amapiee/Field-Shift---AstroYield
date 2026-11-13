// ─── State ───────────────────────────────────────────────────────────────────
let farmLat = 10.04, farmLon = 105.78;
let farmMarker = null;
let chartTemp = null, chartRain = null, chartNdvi = null, chartRadar = null;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SEASON_NAMES = ["🌱 Xuân","☀️ Hè Thu","❄️ Đông"];

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

