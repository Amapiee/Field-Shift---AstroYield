const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const H = require("../public/js/heatmap-core");

const gridFile = path.join(__dirname, "../public/data/climate-grid.json");
const raw = JSON.parse(fs.readFileSync(gridFile, "utf8"));

// lưới nhỏ 2×4 để test nội suy: hàng Bắc = 0..3, hàng Nam = 10..13
const tiny = { step: 90, lat0: 45, lon0: -135, nLat: 2, nLon: 4, missing: -1 };
const tinyData = Float32Array.from([0, 1, 2, 3, 10, 11, 12, 13]);

test("buildLUT: đầu xanh đậm, giữa vàng, cuối đỏ đậm; invert đảo ngược", () => {
  const lut = H.buildLUT(false);
  const at = (i) => [lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]];
  assert.deepStrictEqual(at(0), [0, 104, 55]);
  assert.deepStrictEqual(at(255), [165, 0, 38]);
  const mid = at(128);
  assert.ok(mid[0] > 240 && mid[1] > 220 && mid[2] < 130, `giữa phải là vàng, got ${mid}`);
  const inv = H.buildLUT(true);
  assert.deepStrictEqual([inv[0], inv[1], inv[2]], [165, 0, 38]);
});

test("sample: trả đúng giá trị tại tâm ô và nội suy ở giữa", () => {
  const o = { v: 0, w: 0 };
  H.sample(tiny, tinyData, 45, -135, o);
  assert.strictEqual(o.v, 0);
  H.sample(tiny, tinyData, 45, -45, o);          // giữa ô (0,0) và (0,1)... lon -45 = tâm ô 1
  assert.strictEqual(o.v, 1);
  H.sample(tiny, tinyData, 45, -90, o);          // giữa 0 và 1
  assert.ok(Math.abs(o.v - 0.5) < 1e-6);
  H.sample(tiny, tinyData, 0, -135, o);          // giữa hàng Bắc và Nam
  assert.ok(Math.abs(o.v - 5) < 1e-6);
});

test("sample: bọc kinh độ (±180) và kẹp vĩ độ ở cực", () => {
  const o = { v: 0, w: 0 };
  H.sample(tiny, tinyData, 45, 179, o);          // gần biên Đông → trộn ô 3 với ô 0
  assert.ok(o.v >= 0 && o.v <= 3);
  H.sample(tiny, tinyData, 89, 0, o);            // vượt hàng Bắc → vẫn hữu hạn
  assert.ok(Number.isFinite(o.v) && o.w > 0.99);
  H.sample(tiny, tinyData, -89.9, -135, o);
  assert.strictEqual(o.v, 10);
});

test("sample: ô thiếu (NaN) bị bỏ qua, không kéo giá trị về 0", () => {
  const d = Float32Array.from([NaN, 4, NaN, NaN, NaN, 4, NaN, NaN]);
  const o = { v: 0, w: 0 };
  H.sample(tiny, d, 45, -90, o);                 // giữa ô NaN và ô =4
  assert.strictEqual(o.v, 4);
  assert.ok(o.w > 0.4 && o.w < 0.6);
  H.sample(tiny, d, 45, 100, o);                 // toàn NaN
  assert.ok(Number.isNaN(o.v) && o.w === 0);
});

test("Mercator: tâm pixel ↔ (0,0), đối xứng vĩ độ, bọc kinh độ", () => {
  const ws = 256 * 2 ** 3;
  assert.ok(Math.abs(H.latAtPixelY(ws / 2, ws)) < 1e-9);
  assert.ok(Math.abs(H.lonAtPixelX(ws / 2, ws)) < 1e-9);
  assert.ok(Math.abs(H.latAtPixelY(ws * 0.25, ws) + H.latAtPixelY(ws * 0.75, ws)) < 1e-9);
  assert.ok(Math.abs(H.latAtPixelY(0, ws) - 85.0511) < 1e-3);
  const wrapped = H.lonAtPixelX(ws * 1.25, ws);   // 1 vòng + 90°
  assert.ok(Math.abs(wrapped - (-90)) < 1e-9);
});

test("decodeLayer: file lưới thật giải mã đúng kích thước, min/max hợp lý", () => {
  assert.strictEqual(H.validateGrid(raw), null);
  const t = H.decodeLayer(raw, "T2M");
  assert.strictEqual(t.months.length, 12);
  assert.strictEqual(t.months[0].length, raw.nLat * raw.nLon);
  assert.ok(t.min > -80 && t.max < 60, `T range ${t.min}..${t.max}`);
  const rh = H.decodeLayer(raw, "RH2M");
  assert.ok(rh.min >= 0 && rh.max <= 100);
  const soil = H.decodeLayer(raw, "GWETROOT");
  assert.ok(soil.min >= 0 && soil.max <= 1);
  assert.ok(soil.annual.some(Number.isNaN), "đại dương phải là NaN");
  assert.strictEqual(H.decodeLayer(raw, "KHONG_CO"), null);
});

test("dữ liệu mẫu: logic khí hậu cơ bản (xích đạo nóng hơn cực, đảo mùa 2 bán cầu)", () => {
  const t = H.decodeLayer(raw, "T2M");
  const o = { v: 0, w: 0 };
  const at = (arr, lat, lon) => H.sample(raw, arr, lat, lon, o).v;
  assert.ok(at(t.annual, 0, 20) > at(t.annual, 70, 20) + 20);
  assert.ok(at(t.months[6], 45, 10) > at(t.months[0], 45, 10));     // NH: tháng 7 > tháng 1
  assert.ok(at(t.months[0], -35, 20) > at(t.months[6], -35, 20));   // SH ngược lại
});

test("paint: ghi đúng màu, pixel ngoài vùng/NaN trong suốt, không ném lỗi", () => {
  const w = 4, h = 3;
  const img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(7) };
  const lonAt = Float32Array.from([-135, -90, -45, 0]);
  const latAt = Float32Array.from([45, 0, NaN]);
  H.paint(img, tiny, tinyData, lonAt, latAt, { min: 0, max: 13 }, H.buildLUT(false));
  assert.strictEqual(img.data[3], 255);                       // (0,0) có màu
  assert.deepStrictEqual([img.data[0], img.data[1], img.data[2]], [0, 104, 55]);  // giá trị 0 = min = xanh đậm
  for (let i = 0; i < w; i++) assert.strictEqual(img.data[(2 * w + i) * 4 + 3], 0);  // hàng NaN trong suốt
  const allNaN = new Float32Array(8).fill(NaN);
  H.paint(img, tiny, allNaN, lonAt, latAt, { min: 0, max: 1 }, H.buildLUT(false));
  assert.strictEqual(img.data[3], 0);
});
