#!/usr/bin/env node
// Dựng lưới khí hậu toàn cầu từ NASA POWER (climatology) → public/data/climate-grid.json
//
//   npm run build:grid                       # lưới 5°, ~2500 điểm, mất vài phút
//   node scripts/build-climate-grid.js --step 10 --concurrency 3
//   node scripts/build-climate-grid.js --resume   # tiếp tục sau khi bị ngắt
//
// Biến: T2M (°C), RH2M (%), GWETROOT (0..1; -999 ở đại dương → bỏ trống = "mặt nạ đất liền").
// Chạy 1 lần rồi commit file JSON — trình duyệt chỉ đọc file tĩnh, không gọi NASA mỗi lần mở trang.
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : def;
};
const STEP = Number(opt("step", 5));
const CONCURRENCY = Math.max(1, Math.min(8, Number(opt("concurrency", 4))));
const OUT = path.resolve(opt("out", path.join(__dirname, "../public/data/climate-grid.json")));
const CACHE = path.join(__dirname, ".cache", `grid-progress-${STEP}.json`);
const BASE = process.env.NASA_POWER_URL || "https://power.larc.nasa.gov/api/temporal/climatology/point";
const RESUME = args.includes("--resume");
const MAX_FAIL_RATIO = 0.1;

const PARAMS = ["T2M", "RH2M", "GWETROOT"];
const SCALE = { T2M: 10, RH2M: 10, GWETROOT: 1000 };
const UNIT = { T2M: "°C", RH2M: "%", GWETROOT: "" };
const MISSING = -32768;
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

if (!(STEP > 0) || 180 % STEP !== 0 || 360 % STEP !== 0) {
  console.error(`--step phải chia hết 180 và 360 (vd 2.5, 5, 10). Nhận: ${STEP}`);
  process.exit(1);
}
const nLat = Math.round(180 / STEP), nLon = Math.round(360 / STEP);
const lat0 = 90 - STEP / 2, lon0 = -180 + STEP / 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POWER có thể trả khoá tháng là "JAN".."DEC" hoặc "1".."12"/"01".."12" → chấp nhận cả hai
function monthValues(obj) {
  if (!obj) return null;
  const out = [];
  for (let m = 0; m < 12; m++) {
    let v = obj[MON[m]];
    if (v === undefined) v = obj[String(m + 1)];
    if (v === undefined) v = obj[String(m + 1).padStart(2, "0")];
    out.push(Number.isFinite(v) && v > -900 ? v : null);
  }
  return out;
}

async function fetchPoint(lat, lon) {
  const url = `${BASE}?parameters=${PARAMS.join(",")}&community=AG&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&format=JSON`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);   // 4xx khác: vẫn thử lại 1-2 lần phòng lỗi tạm
      const p = (await r.json()).properties.parameter;
      const res = {};
      for (const k of PARAMS) res[k] = monthValues(p[k]);
      if (!res.T2M || res.T2M.every((v) => v === null)) throw new Error("T2M rỗng/không đọc được khoá tháng");
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(800 * 2 ** attempt + Math.random() * 400);
    }
  }
  throw lastErr;
}

async function main() {
  const points = [];
  for (let j = 0; j < nLat; j++) for (let i = 0; i < nLon; i++) points.push({ idx: j * nLon + i, lat: lat0 - j * STEP, lon: lon0 + i * STEP });

  let done = {};
  if (RESUME && fs.existsSync(CACHE)) {
    done = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    console.log(`Resume: đã có ${Object.keys(done).length}/${points.length} điểm`);
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });

  const todo = points.filter((p) => !(p.idx in done));
  let next = 0, ok = 0, fail = 0;
  const failed = [];
  const t0 = Date.now();

  async function worker() {
    while (next < todo.length) {
      const p = todo[next++];
      try {
        done[p.idx] = await fetchPoint(p.lat, p.lon);
        ok++;
      } catch (e) {
        fail++;
        failed.push(`${p.lat},${p.lon}: ${e.message}`);
      }
      const n = ok + fail;
      if (n % 25 === 0 || n === todo.length) {
        fs.writeFileSync(CACHE, JSON.stringify(done));
        const eta = ((Date.now() - t0) / n) * (todo.length - n) / 1000;
        process.stdout.write(`\r${n}/${todo.length}  ok=${ok} lỗi=${fail}  ETA ~${Math.round(eta)}s   `);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log();

  if (fail / Math.max(1, todo.length) > MAX_FAIL_RATIO) {
    console.error(`Quá nhiều điểm lỗi (${fail}/${todo.length}) → KHÔNG ghi đè ${OUT}.`);
    console.error(failed.slice(0, 5).join("\n"));
    console.error("Chạy lại với --resume (tiến độ đã được lưu).");
    process.exit(2);
  }

  const layers = {};
  for (const k of PARAMS) {
    const months = Array.from({ length: 12 }, () => new Array(nLat * nLon).fill(MISSING));
    for (const p of points) {
      const d = done[p.idx];
      if (!d || !d[k]) continue;
      d[k].forEach((v, m) => { if (v !== null) months[m][p.idx] = Math.round(v * SCALE[k]); });
    }
    layers[k] = { unit: UNIT[k], scale: SCALE[k], months };
  }

  const out = {
    version: 1, source: "nasa-power", step: STEP, lat0, lon0, nLat, nLon, missing: MISSING,
    generated: new Date().toISOString().slice(0, 10), layers,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Đã ghi ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB). Điểm lỗi/bỏ qua: ${fail}`);
  if (fail) console.log("Các ô lỗi sẽ hiển thị là 'không có dữ liệu'.");
}

main().catch((e) => { console.error(e); process.exit(1); });
