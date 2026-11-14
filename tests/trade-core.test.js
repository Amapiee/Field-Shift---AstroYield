const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../public/js/trade-core");

const dataDir = path.join(__dirname, "../public/data");
const flows = JSON.parse(fs.readFileSync(path.join(dataDir, "trade-flows.json"), "utf8"));
const hubFile = JSON.parse(fs.readFileSync(path.join(dataDir, "trade-hubs.json"), "utf8"));
const hubs = hubFile.hubs;
const ALL = { sea: true, air: true, land: true };

test("greatCircle: đầu/cuối đúng, dọc xích đạo giữ vĩ độ 0, cắt kinh tuyến 180 liên tục", () => {
  const a = T.greatCircle(0, 10, 0, 50, 10);
  assert.ok(Math.abs(a[0][1] - 10) < 1e-6 && Math.abs(a[10][1] - 50) < 1e-6);
  assert.ok(a.every(([lat]) => Math.abs(lat) < 1e-6));
  const b = T.greatCircle(35, 170, 35, -170, 20);          // qua 180°
  for (let i = 1; i < b.length; i++) assert.ok(Math.abs(b[i][1] - b[i - 1][1]) < 20, "kinh độ phải liên tục");
  assert.ok(b[20][1] > 180 || b[0][1] < -180 || Math.abs(b[20][1] - 190) < 1e-6);
  const same = T.greatCircle(10, 10, 10, 10);
  assert.strictEqual(same.length, 2);
});

test("greatCircle: điểm giữa Hà Nội–Seattle-ish bay vòng lên phía Bắc (lệch khỏi đường thẳng)", () => {
  const p = T.greatCircle(21, 105, 47, -122, 40);
  const mid = p[20];
  assert.ok(mid[0] > 47, `điểm giữa phải ở vĩ độ cao hơn cả 2 đầu, got ${mid[0]}`);
});

test("unwrapLon: bỏ bước nhảy 360", () => {
  const u = T.unwrapLon([[0, 170], [0, 179], [0, -179], [0, -170]]);
  assert.deepStrictEqual(u.map((x) => x[1]), [170, 179, 181, 190]);
});

test("widthFor / fmtKt", () => {
  assert.ok(T.widthFor(100, 100) > T.widthFor(25, 100));
  assert.strictEqual(T.widthFor(0, 100), 1.2);
  assert.strictEqual(T.widthFor(5, 0), 1.2);
  assert.strictEqual(T.fmtKt(60000), "60 Mt");
  assert.strictEqual(T.fmtKt(2800), "2.8 Mt");
  assert.strictEqual(T.fmtKt(150), "150 kt");
  assert.strictEqual(T.fmtKt(NaN), "—");
});

test("dữ liệu: mọi luồng có hub, tuyến biển bắt đầu/kết thúc tại cảng, không có đoạn nhảy bất thường", () => {
  assert.strictEqual(T.validateFlows(flows), null);
  for (const f of flows.flows) {
    assert.ok(hubs[f.from] && hubs[f.to], `thiếu hub ${f.from}/${f.to}`);
    const s = f.modes.sea;
    if (!s) continue;
    const p = s.path, A = hubs[f.from].port, B = hubs[f.to].port;
    assert.deepStrictEqual(p[0], [A.lat, A.lon].map((x) => Math.round(x * 100) / 100));
    assert.deepStrictEqual(p[p.length - 1], [B.lat, B.lon].map((x) => Math.round(x * 100) / 100));
    const u = T.unwrapLon(p);
    for (let i = 1; i < u.length; i++) assert.ok(Math.abs(u[i][1] - u[i - 1][1]) < 120, `${f.from}>${f.to} nhảy kinh độ`);
    assert.ok(s.km > 0);
  }
});

test("dữ liệu: hàng không chỉ ở rau quả tươi; đường bộ chỉ giữa 2 nước chung biên giới", () => {
  const NO_AIR = ["Rice", "Soybean", "Peanut", "Maize", "Potato", "Tomato", "Cabbage"];
  const nb = new Set(hubFile.borders.flatMap((p) => { const [a, b] = p.split("-"); return [`${a}-${b}`, `${b}-${a}`]; }));
  for (const f of flows.flows) {
    if (f.modes.air) assert.ok(!NO_AIR.includes(f.crop), `${f.crop} ${f.from}>${f.to} không nên có hàng không`);
    if (f.modes.land) assert.ok(nb.has(`${f.from}-${f.to}`), `${f.from}>${f.to} không chung biên giới`);
  }
});

test("selectFlows: lọc cây, phương thức, topN riêng từng cây, sắp luồng lớn vẽ sau", () => {
  const rice = T.selectFlows(flows, hubs, { crop: "Rice", modes: { sea: true, air: false, land: false }, topN: 5 });
  assert.ok(rice.length <= 5 && rice.length > 0);
  assert.ok(rice.every((i) => i.crop === "Rice" && i.mode === "sea"));
  for (let i = 1; i < rice.length; i++) assert.ok(rice[i].kt >= rice[i - 1].kt);
  assert.strictEqual(rice[rice.length - 1].flow.from, "VNM");       // luồng gạo lớn nhất mẫu: VNM→PHL
  const all = T.selectFlows(flows, hubs, { crop: "all", modes: ALL, topN: 3 });
  const crops = new Set(all.map((i) => i.crop));
  assert.strictEqual(crops.size, 11);
  assert.ok(!crops.has("Veggies"), "nhóm Veggies gộp đã được tách");
  const none = T.selectFlows(flows, hubs, { crop: "Rice", modes: { sea: false, air: false, land: false }, topN: 10 });
  assert.strictEqual(none.length, 0);
  const noAirRice = T.selectFlows(flows, hubs, { crop: "Rice", modes: { sea: false, air: true, land: false }, topN: 10 });
  assert.strictEqual(noAirRice.length, 0);
});

test("pathFor + hubUsage: air dùng sân bay, sea dùng cảng, land không tạo hub", () => {
  const items = T.selectFlows(flows, hubs, { crop: ["Asparagus", "Beans"], modes: ALL, topN: 40 });
  const air = items.find((i) => i.mode === "air");
  const p = T.pathFor(air, hubs);
  assert.ok(Math.abs(p[0][0] - hubs[air.flow.from].air.lat) < 1e-6);
  const usage = T.hubUsage(items, hubs);
  assert.ok([...usage.values()].some((u) => u.kind === "air"));
  const landOnly = T.selectFlows(flows, hubs, { crop: ["Asparagus", "Beans"], modes: { sea: false, air: false, land: true }, topN: 40 });
  assert.strictEqual(T.hubUsage(landOnly, hubs).size, 0);
});

test("escapeHtml chặn XSS từ tên OSM", () => {
  assert.strictEqual(T.escapeHtml(`<img src=x onerror="alert(1)">'&`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;");
  assert.strictEqual(T.escapeHtml(null), "");
});

test("Overpass: snapBounds, query, parse (node/way center, bỏ phần tử sai)", () => {
  const sb = T.snapBounds({ s: 10.04, w: 105.2, n: 10.61, e: 106.01 });
  assert.deepStrictEqual(sb, { s: 10, w: 105, n: 11, e: 106.5 });
  assert.strictEqual(T.boundsKey(sb), "10,105,11,106.5");
  const q = T.overpassQuery(sb);
  assert.ok(q.includes('"amenity"="marketplace"') && q.includes("(10,105,11,106.5)") && q.includes("out center 400"));
  const edge = T.snapBounds({ s: -91, w: -181, n: 91, e: 181 });
  assert.deepStrictEqual(edge, { s: -90, w: -180, n: 90, e: 180 });
  const out = T.parseOverpass({ elements: [
    { type: "node", id: 1, lat: 10, lon: 105, tags: { amenity: "marketplace", name: "Chợ Cần Thơ" } },
    { type: "way", id: 2, center: { lat: 11, lon: 106 }, tags: { shop: "farm" } },
    { type: "node", id: 3, lat: 12, lon: 107, tags: { shop: "bakery" } },
    { type: "node", id: 4, tags: { shop: "greengrocer" } },
  ] });
  assert.deepStrictEqual(out.map((x) => [x.id, x.kind, x.name]), [["node/1", "market", "Chợ Cần Thơ"], ["way/2", "farm", ""]]);
  assert.deepStrictEqual(T.parseOverpass(null), []);
  assert.deepStrictEqual(T.parseOverpass({}), []);
});

test("selectFlows: crop là mảng (nhóm rau củ) chỉ trả đúng các cây trong mảng, topN tính riêng từng cây", () => {
  const veg = ["Potato", "Tomato", "Onion", "Cabbage", "Beans", "Pepper", "Asparagus"];
  const items = T.selectFlows(flows, hubs, { crop: veg, modes: ALL, topN: 2 });
  assert.ok(items.length > 0 && items.every((i) => veg.includes(i.crop)));
  for (const c of veg) {
    const n = new Set(items.filter((i) => i.crop === c).map((i) => i.flow)).size;
    assert.ok(n <= 2, `${c} có ${n} luồng > topN`);
  }
  assert.strictEqual(T.selectFlows(flows, hubs, { crop: [], modes: ALL, topN: 5 }).length, 0);
});

test("dữ liệu: các nhóm rau củ có mã HS cụ thể, không còn nhóm gộp chương 07", () => {
  assert.strictEqual(flows.crops.Veggies, undefined);
  assert.strictEqual(flows.crops.Asparagus.hs, "070920");
  assert.strictEqual(flows.crops.Pepper.hs, "070960");
  assert.strictEqual(flows.crops.Potato.hs, "0701");
});
