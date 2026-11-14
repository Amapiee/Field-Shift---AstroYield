// Dựng file public/data/trade-flows.json từ các hàng {crop, from, to, kt, airKt?}
// Dùng chung cho: build-trade-flows.js (UN Comtrade) và dev/gen-sample-trade.js (dữ liệu minh hoạ).
//
// Quy tắc phân loại phương thức (ƯỚC LƯỢNG – Comtrade không tách chính xác theo phương thức):
//   • Hai nước có chung biên giới đất liền (hubs.borders) → "land" (đường bộ, không vẽ như tuyến biển)
//   • còn lại → "sea" (tuyến biển thật qua searoute-js) với phần (kt − air)
//   • "air" = airKt nếu có, ngược lại kt × AIR_SHARE[crop]; bỏ nếu < minAirKt
const fs = require("node:fs");
const path = require("node:path");

let searoute = null;
function loadSearoute() {
  if (searoute) return searoute;
  try { searoute = require("searoute-js"); }
  catch { throw new Error("Thiếu searoute-js. Chạy: npm install"); }
  return searoute;
}

// Tỷ lệ chở bằng đường hàng không — ƯỚC LƯỢNG THÔ của người viết, KHÔNG phải số liệu Comtrade.
// Hàng rời/củ bền (gạo, đậu tương, lạc, ngô, khoai tây, hành tỏi, bắp cải) = 0.
// Rau quả tươi dễ hỏng, giá trị cao có một phần đi máy bay: măng tây 30%, đậu/đậu Hà Lan tươi 10%, ớt 2%.
// Ghi đè bằng CLI: --air-share Asparagus=0.4,Beans=0.15
const AIR_SHARE = {
  Rice: 0, Soybean: 0, Peanut: 0, Maize: 0,
  Potato: 0, Tomato: 0, Onion: 0, Cabbage: 0, Beans: 0.1, Pepper: 0.02, Asparagus: 0.3,
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Douglas–Peucker (xấp xỉ phẳng trên (lon,lat), đủ cho hiển thị)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ay, ax] = pts[a], [by, bx] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = pts[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Tuyến biển giữa 2 cảng → [[lat,lon],...] đã làm tròn 2 số lẻ. Có cache theo cặp cảng.
// searoute-js đôi khi trả null khi toạ độ cảng "dính" vào nút mạng không nối với mạng chính
// (vd Felixstowe, Colombo). Giải pháp: tìm ĐIỂM NEO ngoài khơi gần nhất (≤ ~110 km) mà đi được
// tới một điểm tham chiếu thuộc mạng chính (Singapore); neo được cache theo cảng.
const PROBE = [103.84, 1.26];
const OFFSETS = [[0, 0]];
for (const r of [0.25, 0.5, 0.75, 1.0]) for (let k = 0; k < 8; k++) {
  const t = (k * Math.PI) / 4;
  OFFSETS.push([r * Math.cos(t), r * Math.sin(t)]);   // [dlon, dlat]
}
function srQuiet(a, b, units) {
  const sr = loadSearoute();
  const log = console.log; console.log = () => {};      // searoute-js in log rác
  try { return sr(a, b, units); } catch { return null; } finally { console.log = log; }
}
const anchorCache = new Map();
function anchor(p) {
  const key = `${p.lat},${p.lon}`;
  if (anchorCache.has(key)) return anchorCache.get(key);
  let found = null;
  for (const [dx, dy] of OFFSETS) {
    const cand = [p.lon + dx, Math.max(-85, Math.min(85, p.lat + dy))];
    if (srQuiet(cand, PROBE, "kilometers")) { found = cand; break; }
  }
  anchorCache.set(key, found);
  return found;
}

// searoute-js KHÔNG nối hai bờ Thái Bình Dương qua kinh tuyến ±180° (hai nửa mạng lưới có nút ở
// lon=-180 và lon=+180 nhưng tách rời) → Canada→Trung Quốc bị vẽ vòng qua Đại Tây Dương.
// Giải pháp: với cặp cảng mà đường ngắn nhất cắt kinh tuyến 180°, thử nối 2 nửa qua các "cầu" ở
// nhiều vĩ độ và lấy phương án ngắn nhất (so với tuyến trực tiếp của searoute).
const BRIDGE_LATS = [40, 30, 20, 10, 0, -10, -20, -30];
function pacificRoute(A, Bn, aLon, bLon) {
  const e = aLon < bLon ? -180 : 180, w = -e;          // A ở phía Mỹ (lon<0) → rời mạng ở -180, vào lại ở +180
  let best = null;
  for (const lat of BRIDGE_LATS) {
    const r1 = srQuiet(A, [e, lat], "kilometers");
    if (!r1) continue;
    const r2 = srQuiet([w, lat], Bn, "kilometers");
    if (!r2) continue;
    const km = r1.properties.length + r2.properties.length;
    if (!best || km < best.km) best = { km, coords: [...r1.geometry.coordinates, ...r2.geometry.coordinates] };
  }
  return best;
}

const routeCache = new Map();
function seaRoute(a, b) {
  const key = `${a.lat},${a.lon}|${b.lat},${b.lon}`;
  if (routeCache.has(key)) return routeCache.get(key);
  const A = anchor(a), Bn = anchor(b);
  if (!A || !Bn) { routeCache.set(key, null); return null; }
  let best = null;
  const direct = srQuiet(A, Bn, "kilometers");
  if (direct) best = { km: direct.properties.length, coords: direct.geometry.coordinates };
  if (Math.abs(a.lon - b.lon) > 180) {                  // đường ngắn nhất cắt kinh tuyến 180°
    const pac = pacificRoute(A, Bn, a.lon, b.lon);
    if (pac && (!best || pac.km < best.km)) best = pac;
  }
  if (!best) { routeCache.set(key, null); return null; }
  let pts = best.coords.map(([lon, lat]) => [lat, lon]);
  pts = [[a.lat, a.lon], ...pts, [b.lat, b.lon]];       // nối đúng toạ độ cảng ở 2 đầu
  pts = simplify(pts, 0.15).map(([la, lo]) => [Math.round(la * 100) / 100, Math.round(lo * 100) / 100]);
  const out = { km: Math.round(best.km), path: pts };
  routeCache.set(key, out);
  return out;
}

const round1 = (x) => Math.round(x * 10) / 10;

// rows: [{crop, from, to, kt, airKt?, year?}] (year chỉ cần khi khác năm chính của file), hubFile: nội dung trade-hubs.json ({hubs, borders})
function buildFlows(rows, hubFile, opt = {}) {
  const hubs = hubFile.hubs;
  const neighbors = new Set((hubFile.borders || []).flatMap((p) => { const [a, b] = p.split("-"); return [`${a}-${b}`, `${b}-${a}`]; }));
  const airShare = { ...AIR_SHARE, ...(opt.airShare || {}) };
  const minAirKt = opt.minAirKt ?? 1;
    const missing = {};
  const failedRoutes = [];
  const flows = [];
  for (const r of rows) {
    const A = hubs[r.from], B = hubs[r.to];
    if (!A || !B || r.from === r.to || !(r.kt > 0)) {
      for (const [c, h] of [[r.from, A], [r.to, B]]) if (!h) missing[c] = (missing[c] || 0) + (r.kt || 0);
      continue;
    }
    const straight = haversineKm(A.port.lat, A.port.lon, B.port.lat, B.port.lon);
    let air = r.airKt ?? r.kt * (airShare[r.crop] ?? 0);
    air = air >= minAirKt ? Math.min(air, r.kt) : 0;
    const rest = r.kt - air;
    const modes = {};
    if (rest > 0) {
      if (neighbors.has(`${r.from}-${r.to}`)) modes.land = { kt: round1(rest), km: Math.round(straight) };
      else {
        const sr = seaRoute(A.port, B.port);
        if (sr) modes.sea = { kt: round1(rest), ...sr };
        else {                                           // không dựng được tuyến biển → bỏ phần này, báo lại
          failedRoutes.push(`${r.from}→${r.to}`);
          if (air <= 0) continue;
        }
      }
    }
    if (air > 0) modes.air = { kt: round1(air), km: Math.round(haversineKm(A.air.lat, A.air.lon, B.air.lat, B.air.lon)) };
    if (Object.keys(modes).length) flows.push({ crop: r.crop, from: r.from, to: r.to, kt: round1(r.kt), ...(r.year ? { year: r.year } : {}), modes });
  }
  return { flows, missing, failedRoutes: [...new Set(failedRoutes)] };
}

function writeFlows(file, meta, flows) {
  const out = { version: 1, ...meta, generated: new Date().toISOString().slice(0, 10), flows };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return (fs.statSync(file).size / 1024).toFixed(0);
}

function loadHubs(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));   // { hubs, borders }
}

module.exports = { AIR_SHARE, haversineKm, simplify, seaRoute, buildFlows, writeFlows, loadHubs };
