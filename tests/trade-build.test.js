const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const B = require("../scripts/lib/trade-build");

const hubFile = B.loadHubs(path.join(__dirname, "../public/data/trade-hubs.json"));
const ZERO = Object.fromEntries(Object.keys(B.AIR_SHARE).map((k) => [k, 0]));

test("buildFlows: chung biên giới → land; khác → sea có đường đi nối đúng 2 cảng", () => {
  const { flows } = B.buildFlows([
    { crop: "Tomato", from: "MEX", to: "USA", kt: 100 },
    { crop: "Rice", from: "VNM", to: "PHL", kt: 500 },
  ], hubFile, { airShare: ZERO });
  assert.deepStrictEqual(Object.keys(flows[0].modes), ["land"]);
  const sea = flows[1].modes.sea;
  assert.ok(sea.km > 1000 && sea.km < 3000, `km=${sea.km}`);
  assert.deepStrictEqual(sea.path[0], [10.53, 107.03]);
  assert.deepStrictEqual(sea.path[sea.path.length - 1], [14.58, 120.96]);
});

test("buildFlows: tách hàng không theo airKt hoặc AIR_SHARE; cây hàng rời không có hàng không", () => {
  const rows = [
    { crop: "Asparagus", from: "PER", to: "USA", kt: 100 },
    { crop: "Rice", from: "IND", to: "SAU", kt: 1000 },
    { crop: "Beans", from: "KEN", to: "GBR", kt: 50, airKt: 30 },
  ];
  const { flows } = B.buildFlows(rows, hubFile);
  const asp = flows.find((f) => f.crop === "Asparagus");
  assert.strictEqual(asp.modes.air.kt, 30);                 // 30% mặc định
  assert.strictEqual(asp.modes.sea.kt, 70);
  assert.strictEqual(flows.find((f) => f.crop === "Rice").modes.air, undefined);
  const beans = flows.find((f) => f.crop === "Beans");
  assert.strictEqual(beans.modes.air.kt, 30);
  assert.strictEqual(beans.modes.sea.kt, 20);
  const over = B.buildFlows([rows[0]], hubFile, { airShare: { Asparagus: 0.5 } }).flows[0];
  assert.strictEqual(over.modes.air.kt, 50);
});

test("buildFlows: giữ trường year khi có; báo nước thiếu hub; bỏ luồng khối lượng 0 và from=to", () => {
  const { flows, missing } = B.buildFlows([
    { crop: "Maize", from: "USA", to: "JPN", kt: 100, year: 2024 },
    { crop: "Maize", from: "USA", to: "ZZZ", kt: 700 },
    { crop: "Maize", from: "USA", to: "USA", kt: 5 },
    { crop: "Maize", from: "USA", to: "MEX", kt: 0 },
  ], hubFile, { airShare: ZERO });
  assert.strictEqual(flows.length, 1);
  assert.strictEqual(flows[0].year, 2024);
  assert.deepStrictEqual(missing, { ZZZ: 700 });
});

test("tuyến xuyên Thái Bình Dương không bị vòng qua Đại Tây Dương (lỗi searoute-js ở kinh tuyến 180°)", () => {
  const { flows } = B.buildFlows([{ crop: "Soybean", from: "CAN", to: "CHN", kt: 1000 }], hubFile, { airShare: ZERO });
  const km = flows[0].modes.sea.km;
  assert.ok(km < 14000, `Vancouver→Thượng Hải phải ~10.000 km, got ${km}`);
});

test("simplify giữ 2 đầu và giảm số điểm trên đường gần thẳng", () => {
  const pts = Array.from({ length: 50 }, (_, i) => [i * 0.1, i * 0.1 + (i % 2) * 0.001]);
  const out = B.simplify(pts, 0.15);
  assert.deepStrictEqual(out[0], pts[0]);
  assert.deepStrictEqual(out[out.length - 1], pts[49]);
  assert.ok(out.length <= 3);
});
