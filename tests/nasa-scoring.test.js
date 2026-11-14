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

test("nhận diện tọa độ biển/đại dương khi NASA SMAP không có dữ liệu đất", () => {
  const months = ["01","02","03","04","05","06","07","08","09","10","11","12"];
  const oceanGwet = Object.fromEntries(months.map(m => [m, -999]));
  const isOcean = months.every(m => oceanGwet[m] <= -900);
  assert.strictEqual(isOcean, true);
});

test("scoreScenario: Đất hoang mạc cực hạn (Taklamakan/Sahara) trả về Rank C và Water HP = 0", () => {
  const desertData = {
    PRECTOTCORR: new Array(12).fill(5.0), // 60mm/năm
    GWETROOT: new Array(12).fill(0.10),   // SMAP 0.10 chạm điểm héo
    T2M: [-5, 0, 8, 16, 22, 28, 30, 28, 22, 14, 3, -4],
    TS: [-3, 2, 10, 19, 25, 32, 34, 32, 25, 16, 5, -2],
    NDVI: new Array(12).fill(0.05),
    GWETTOP: new Array(12).fill(0.08),
    ALLSKY_SFC_SW_DWN: new Array(12).fill(18.0)
  };
  const soyRes = scoreScenario(["Soybean", "Soybean", "Soybean"], desertData, 0.33, 0.33, 0.34);
  assert.strictEqual(soyRes.rank, "C");
  assert.strictEqual(soyRes.water_hp, 0);
  assert.strictEqual(soyRes.profit_hp, 0);

  const riceRes = scoreScenario(["Rice", "Rice", "Rice"], desertData, 0.33, 0.33, 0.34);
  assert.strictEqual(riceRes.rank, "C");
  assert.strictEqual(riceRes.water_hp, 0);
  assert.strictEqual(riceRes.profit_hp, 0);
});
