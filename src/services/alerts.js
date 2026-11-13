// Sinh cảnh báo thời tiết cực đoan từ dữ liệu NASA
function generateAlerts(data) {
  const alerts = [];
  const T = (i) => `T${i + 1}`;
  const maxTs = Math.max(...data.TS);
  const maxRain = Math.max(...data.PRECTOTCORR);
  const minGwet = Math.min(...data.GWETROOT);

  if (maxTs > 34)
    alerts.push({ level: "danger", msg: `🔴 ECOSTRESS: TS đỉnh ${maxTs.toFixed(1)}°C (${T(data.TS.indexOf(maxTs))}) — Stress nhiệt cực cao!` });
  if (maxRain > 160 && soilNearSaturation) {
    alerts.push({ level: "danger", msg: `🔴 LŨ/Ngập úng: ...` });
  } else if (maxRain > 160) {
    alerts.push({ level: "warning", msg: `🟠 Mưa lớn — Xói mòn: ...` });
  }
  if (minGwet < 0.33)
    alerts.push({ level: "warning", msg: `🟡 SMAP: Độ ẩm rễ ${minGwet.toFixed(2)} (${T(data.GWETROOT.indexOf(minGwet))}) — Hạn hán canh tác!` });
  if (!alerts.length) alerts.push({ level: "ok", msg: "🟢 Không phát hiện sự kiện thời tiết cực đoan." });
  return alerts;
}

module.exports = { generateAlerts };
