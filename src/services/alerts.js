const { detectEnvironmentalAnomalies } = require("../algorithms/08_anomaly_detection_spi");

const SEVERITY_ORDER = { danger: 0, warning: 1, ok: 2 };
const THRESHOLDS = Object.freeze({
  DROUGHT_GWET: 0.33,
  DROUGHT_DRI_WARNING: 0.6,
  DROUGHT_DRI_DANGER: 0.75,
  FLOOD_RAIN_MM: 160,
  FLOOD_FRI_WARNING: 0.7,
  FLOOD_FRI_DANGER: 0.85,
});
const MONTH = (index) => `T${index + 1}`;

function extremumWithIndex(values, direction) {
  let value = direction > 0 ? -Infinity : Infinity;
  let index = -1;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    if (direction > 0 ? values[i] > value : values[i] < value) {
      value = values[i];
      index = i;
    }
  }
  return { value, index };
}

function normalizeAlert(alert) {
  if (!alert || !["danger", "warning", "ok"].includes(alert.level) || typeof alert.msg !== "string") {
    return null;
  }
  return {
    ...(alert.type ? { type: alert.type } : {}),
    ...(alert.satellite ? { satellite: alert.satellite } : {}),
    level: alert.level,
    msg: alert.msg,
  };
}

function hasRiskMessage(alerts, pattern) {
  return alerts.some((alert) => pattern.test(`${alert.type || ""} ${alert.msg}`));
}

function addDroughtAlerts(data, alerts) {
  if (hasRiskMessage(alerts, /hạn|drought|SPI|thiếu nước|khô hạn|độ ẩm rễ/i)) return;

  const dri = Array.isArray(data.DRI) ? data.DRI : [];
  const maxDri = extremumWithIndex(dri, 1);
  if (maxDri.index >= 0) {
    if (maxDri.value >= THRESHOLDS.DROUGHT_DRI_DANGER) {
      alerts.push({
        level: "danger",
        type: "drought",
        msg: `Hạn hán cực đoan: ${MONTH(maxDri.index)} — chỉ số rủi ro tương đối ${maxDri.value.toFixed(2)}.`,
      });
    } else if (maxDri.value >= THRESHOLDS.DROUGHT_DRI_WARNING) {
      alerts.push({
        level: "warning",
        type: "drought",
        msg: `Hạn hán: ${MONTH(maxDri.index)} — chỉ số rủi ro tương đối ${maxDri.value.toFixed(2)}; cân nhắc kiểm tra nhu cầu tưới.`,
      });
    }
    return;
  }

  const wetness = Array.isArray(data.GWETROOT) ? data.GWETROOT : [];
  const minWetness = extremumWithIndex(wetness, -1);
  if (minWetness.index >= 0 && minWetness.value < THRESHOLDS.DROUGHT_GWET) {
    alerts.push({
      level: "warning",
      type: "drought",
      msg: `Độ ẩm đất vùng rễ theo mô hình thấp (${minWetness.value.toFixed(2)}, ${MONTH(minWetness.index)}); cần kiểm tra điều kiện tại ruộng.`,
    });
  }
}

function addFloodAlerts(data, alerts) {
  if (hasRiskMessage(alerts, /lũ|flood|ngập|mưa lũ|very wet/i)) return;

  const fri = Array.isArray(data.FRI) ? data.FRI : [];
  const maxFri = extremumWithIndex(fri, 1);
  if (maxFri.index >= 0) {
    if (maxFri.value >= THRESHOLDS.FLOOD_FRI_DANGER) {
      alerts.push({
        level: "danger",
        type: "flood",
        msg: `Nguy cơ lũ/ngập theo chỉ số tương đối: ${MONTH(maxFri.index)} — FRI ${maxFri.value.toFixed(2)}.`,
      });
    } else if (maxFri.value >= THRESHOLDS.FLOOD_FRI_WARNING) {
      alerts.push({
        level: "warning",
        type: "flood",
        msg: `Nguy cơ ngập cục bộ theo chỉ số tương đối: ${MONTH(maxFri.index)} — FRI ${maxFri.value.toFixed(2)}.`,
      });
    }
    return;
  }

  const rainfall = Array.isArray(data.PRECTOTCORR) ? data.PRECTOTCORR : [];
  const maxRain = extremumWithIndex(rainfall, 1);
  if (maxRain.index >= 0 && maxRain.value > THRESHOLDS.FLOOD_RAIN_MM) {
    alerts.push({
      level: "warning",
      type: "flood",
      msg: `Mưa hiệu chỉnh từ NASA POWER cao (${maxRain.value.toFixed(0)} mm/tháng, ${MONTH(maxRain.index)}); cần đánh giá nguy cơ ngập tại địa phương.`,
    });
  }
}

function generateAlerts(data, precomputedAnomalies = null) {
  if (!data || typeof data !== "object") {
    throw new TypeError("data phải là object khí hậu");
  }
  for (const field of ["T2M", "TS", "GWETROOT", "PRECTOTCORR"]) {
    if (!Array.isArray(data[field]) || data[field].length !== 12) {
      throw new RangeError(`data.${field} phải là mảng 12 tháng`);
    }
  }

  const anomalies = precomputedAnomalies || detectEnvironmentalAnomalies(data);
  const alerts = Array.isArray(anomalies?.alerts)
    ? anomalies.alerts.map(normalizeAlert).filter(Boolean)
    : [];

  addDroughtAlerts(data, alerts);
  addFloodAlerts(data, alerts);

  const unique = [];
  const seen = new Set();
  for (const alert of alerts) {
    const key = `${alert.level}:${alert.msg.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(alert);
  }

  const nonOk = unique.some((alert) => alert.level !== "ok");
  const result = nonOk ? unique.filter((alert) => alert.level !== "ok") : unique;
  if (!result.length) {
    result.push({
      level: "ok",
      type: "none",
      msg: "Không phát hiện chỉ báo khí hậu cực đoan trong dữ liệu hiện có; điều này không xác nhận an toàn canh tác tại ruộng.",
    });
  }

  return result.sort((a, b) => SEVERITY_ORDER[a.level] - SEVERITY_ORDER[b.level]);
}

module.exports = { generateAlerts };
