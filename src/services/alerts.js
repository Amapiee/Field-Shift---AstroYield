// Sinh cảnh báo thời tiết cực đoan từ dữ liệu NASA dựa trên WMO SPI và Anomaly Detection
const { detectEnvironmentalAnomalies } = require("../algorithms/08_anomaly_detection_spi");

function generateAlerts(data, precomputedAnomalies = null) {
  const anomalies = precomputedAnomalies || detectEnvironmentalAnomalies(data);
  return (anomalies.alerts || []).map(a => ({
    level: a.level,
    msg: a.msg
  }));
}

module.exports = { generateAlerts };
