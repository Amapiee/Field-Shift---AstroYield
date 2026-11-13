// Sinh cảnh báo thiên tai: CHỈ HẠN HÁN và LŨ LỤT (theo yêu cầu đề tài).
// Ưu tiên DRI/FRI; fallback sang GWET/PRECTOTCORR thô nếu thiếu.
const { THRESHOLDS } = require("../utils/helpers");

const T = (i) => `T${i + 1}`;

// Tìm max/min kèm index gốc, bỏ qua NaN / ±Infinity
function extremumWithIdx(arr, sign /* +1 max, -1 min */) {
  let best = sign > 0 ? -Infinity : Infinity, idx = -1;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (sign > 0 ? v > best : v < best) { best = v; idx = i; }
  }
  return { value: best, idx };
}

function generateAlerts(data) {
  const alerts = [];
  const dri  = Array.isArray(data.DRI)        ? data.DRI        : null;
  const fri  = Array.isArray(data.FRI)        ? data.FRI        : null;
  const rain = Array.isArray(data.PRECTOTCORR)? data.PRECTOTCORR: [];
  const gwet = Array.isArray(data.GWETROOT)   ? data.GWETROOT   : [];

  // ── HẠN HÁN ──────────────────────────────────────────
  if (dri && dri.length) {
    const { value: maxDri, idx } = extremumWithIdx(dri, +1);
    if (idx >= 0 && maxDri >= 0.75) {
      alerts.push({ level: "danger", type: "drought",
        msg: `🔴 HẠN HÁN CỰC ĐOAN: ${T(idx)} — chỉ số rủi ro ${maxDri.toFixed(2)}. Đất thiếu nước nghiêm trọng.` });
    } else if (idx >= 0 && maxDri >= 0.6) {
      alerts.push({ level: "warning", type: "drought",
        msg: `🟡 HẠN HÁN: ${T(idx)} — chỉ số rủi ro ${maxDri.toFixed(2)}. Cần tưới bổ sung.` });
    }
  } else if (gwet.length) {
    const { value: minG, idx } = extremumWithIdx(gwet, -1);
    if (idx >= 0 && minG < THRESHOLDS.DROUGHT_GWET) {
      alerts.push({ level: "warning", type: "drought",
        msg: `🟡 SMAP: độ ẩm rễ ${minG.toFixed(2)} (${T(idx)}) — hạn hán canh tác.` });
    }
  }

  // ── LŨ LỤT ───────────────────────────────────────────
  if (fri && fri.length) {
    const { value: maxFri, idx } = extremumWithIdx(fri, +1);
    if (idx >= 0 && maxFri >= 0.85) {
      alerts.push({ level: "danger", type: "flood",
        msg: `🔴 LŨ/NGẬP ÚNG: ${T(idx)} — chỉ số rủi ro ${maxFri.toFixed(2)}. Mưa lớn + đất bão hoà.` });
    } else if (idx >= 0 && maxFri >= 0.7) {
      alerts.push({ level: "warning", type: "flood",
        msg: `🟠 LŨ CỤC BỘ: ${T(idx)} — chỉ số rủi ro ${maxFri.toFixed(2)}. Nguy cơ xói mòn / ngập úng.` });
    }
  } else if (rain.length) {
    const { value: maxR, idx } = extremumWithIdx(rain, +1);
    if (idx >= 0 && maxR > THRESHOLDS.FLOOD_RAIN_MM) {
      alerts.push({ level: "warning", type: "flood",
        msg: `🟠 GPM: mưa ${maxR.toFixed(0)} mm/tháng (${T(idx)}) — nguy cơ ngập úng.` });
    }
  }

  if (!alerts.length) {
    alerts.push({ level: "ok", type: "none",
      msg: "🟢 Không phát hiện rủi ro hạn hán / lũ lụt đáng kể trong năm." });
  }
  return alerts;
}

module.exports = { generateAlerts };