const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAlerts } = require("../src/services/alerts");

const climate = (overrides = {}) => ({
  T2M: Array(12).fill(25),
  TS: Array(12).fill(28),
  GWETROOT: Array(12).fill(0.5),
  PRECTOTCORR: Array(12).fill(80),
  ...overrides,
});

test("combines precomputed SPI and cold alerts with drought and flood indices", () => {
  const alerts = generateAlerts(
    climate({ DRI: [0.8, ...Array(11).fill(0)], FRI: [0.9, ...Array(11).fill(0)] }),
    {
      alerts: [
        { level: "warning", satellite: "WMO SPI-3", msg: "SPI rainfall deficit" },
        { level: "danger", msg: "Băng giá đã được phát hiện trong dữ liệu lịch sử" },
        { level: "ok", msg: "No anomaly" },
      ],
    }
  );
  assert.ok(alerts.some((alert) => alert.satellite === "WMO SPI-3"));
  assert.ok(alerts.some((alert) => alert.msg.includes("Băng giá")));
  assert.ok(alerts.some((alert) => alert.type === "flood" && alert.level === "danger"));
  assert.ok(!alerts.some((alert) => alert.level === "ok"));
  assert.equal(alerts[0].level, "danger");
});

test("uses root-zone wetness and monthly rainfall when DRI and FRI are absent", () => {
  const drought = generateAlerts(
    climate({ GWETROOT: Array(12).fill(0.2) }),
    { alerts: [] }
  );
  assert.ok(drought.some((alert) => alert.type === "drought"));

  const flood = generateAlerts(
    climate({ PRECTOTCORR: [210, ...Array(11).fill(80)] }),
    { alerts: [] }
  );
  assert.ok(flood.some((alert) => alert.type === "flood" && alert.level === "warning"));
});

test("rejects malformed monthly inputs rather than returning misleading alerts", () => {
  assert.throws(() => generateAlerts({}), /data\.T2M/);
  assert.throws(() => generateAlerts(climate({ TS: [25] })), /data\.TS/);
});
