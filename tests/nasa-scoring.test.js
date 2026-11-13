const test = require("node:test");
const assert = require("node:assert");
const { mockNasa, computeDerived, buildSatelliteSummary } = require("../src/services/nasa");
const { scoreScenario } = require("../src/services/scoring");
const { generateAlerts } = require("../src/services/alerts");
const { NASA_KEYS } = require("../src/config/crops");

const data = () => computeDerived(mockNasa(10.04, 105.78));

test("mockNasa trả đủ 12 tháng cho mọi biến", () => {
  const d = mockNasa(10.04, 105.78);
  for (const k of NASA_KEYS) assert.strictEqual(d[k].length, 12, k);
});

test("computeDerived thêm NDVI/ESI/EROSION trong khoảng hợp lệ", () => {
  const d = data();
  for (const k of ["NDVI", "ESI", "EROSION"]) {
    assert.strictEqual(d[k].length, 12);
    assert.ok(d[k].every((v) => v >= 0 && v <= 1), k);
  }
});

test("buildSatelliteSummary có đủ 5 vệ tinh", () => {
  const s = buildSatelliteSummary(data());
  for (const k of ["POWER", "SMAP", "GPM", "ECOSTRESS", "MODIS"]) assert.ok(s[k], k);
});

test("scoreScenario: điểm 0-100 và rank hợp lệ", () => {
  const r = scoreScenario(["Rice", "Soybean", "Maize"], data(), 0.33, 0.33, 0.34);
  for (const k of ["soil_hp", "water_hp", "profit_hp", "overall"]) assert.ok(r[k] >= 0 && r[k] <= 100, k);
  assert.ok(["S", "A", "B", "C"].includes(r.rank));
});

test("generateAlerts luôn có ít nhất 1 cảnh báo", () => {
  assert.ok(generateAlerts(data()).length >= 1);
});
