#!/usr/bin/env node
// Dựng luồng thương mại nông sản toàn cầu từ UN Comtrade → public/data/trade-flows.json
//
//   npm run build:trade                                  # năm mặc định = năm trước, key lấy từ .env (COMTRADE_KEY)
//   npm run build:trade -- --year 2024 --keep 50
//   npm run build:trade -- --no-fallback                 # không lùi về năm trước khi nước xuất chưa báo cáo
//   npm run build:trade -- --resume                      # tiếp tục sau khi bị ngắt
//
// Key: đăng ký miễn phí tại https://comtradedeveloper.un.org → tạo file `.env` ở thư mục gốc:
//        COMTRADE_KEY=xxxxxxxxxxxxxxxx
// Không có key → dùng endpoint "preview" công khai (không cần đăng ký, tối đa 500 dòng/lần – đủ cho
// 1 nước xuất khẩu × 1 mặt hàng, nhưng có thể bị giới hạn tần suất chặt hơn).
//
// Mặt hàng (HS): Gạo 1006 · Đậu tương 1201 · Lạc 1202 · Ngô 1005 · và 7 nhóm rau củ cụ thể
// (khoai tây 0701, cà chua 0702, hành tỏi 0703, bắp cải/súp lơ 0704, đậu & đậu Hà Lan tươi 0708,
//  ớt 070960, măng tây 070920) — xem bảng CROPS bên dưới.
// LƯU Ý: Comtrade không tách đáng tin cậy theo phương thức vận tải → tỷ lệ hàng không là ƯỚC LƯỢNG
// (xem AIR_SHARE trong scripts/lib/trade-build.js); đường bộ = 2 nước chung biên giới.
const fs = require("node:fs");
const path = require("node:path");
const B = require("./lib/trade-build");

// ── .env tối giản (không thêm dependency) ────────────────────────────────────
try {
  for (const line of fs.readFileSync(path.join(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* không có .env → bỏ qua */ }

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const YEAR = Number(opt("year", new Date().getFullYear() - 1));
// Nhiều nước báo cáo Comtrade trễ: nếu 1 nước xuất chưa có số liệu năm YEAR thì lùi về YEAR-1 (ghi rõ năm trong luồng)
const FALLBACK = !args.includes("--no-fallback");
const KEEP = Number(opt("keep", 40));            // số luồng giữ lại / cây trồng
const OUT = path.resolve(opt("out", path.join(__dirname, "../public/data/trade-flows.json")));
const HUBS = path.join(__dirname, "../public/data/trade-hubs.json");
const RESUME = args.includes("--resume");
const KEY = process.env.COMTRADE_KEY || "";
const BASE = process.env.COMTRADE_BASE ||
  (KEY ? "https://comtradeapi.un.org/data/v1/get/C/A/HS" : "https://comtradeapi.un.org/public/v1/preview/C/A/HS");
const DELAY_MS = Number(process.env.COMTRADE_DELAY_MS || (KEY ? 1200 : 2500));
const MAX_FAIL_RATIO = 0.25;
const CACHE = path.join(__dirname, ".cache", `trade-progress-${YEAR}.json`);

// airShare override: --air-share Veggies=0.05
const airShare = {};
const as = opt("air-share", "");
if (as) for (const kv of as.split(",")) { const [k, v] = kv.split("="); airShare[k] = Number(v); }

const CROPS = {
  Rice:      { hs: "1006",   exporters: ["IND", "THA", "VNM", "PAK", "USA", "MMR", "KHM", "CHN", "URY", "ITA", "ESP", "BRA"] },
  Soybean:   { hs: "1201",   exporters: ["BRA", "USA", "ARG", "PRY", "URY", "CAN", "UKR", "RUS"] },
  Peanut:    { hs: "1202",   exporters: ["ARG", "IND", "CHN", "USA", "BRA", "SEN", "SDN", "NGA", "ZAF"] },
  Maize:     { hs: "1005",   exporters: ["USA", "BRA", "ARG", "UKR", "ROU", "RUS", "FRA", "CAN", "MEX", "ZAF", "PRY"] },
  // Rau củ tách theo mã HS cụ thể (thay cho chương 07 gộp chung)
  Potato:    { hs: "0701",   exporters: ["NLD", "FRA", "DEU", "BEL", "CAN", "USA", "EGY", "CHN", "IND", "ESP"] },
  Tomato:    { hs: "0702",   exporters: ["MEX", "ESP", "NLD", "MAR", "TUR", "CAN", "BEL", "ITA"] },
  Onion:     { hs: "0703",   exporters: ["CHN", "IND", "NLD", "EGY", "ESP", "USA", "TUR", "PAK", "MEX"] },   // hành, tỏi, hành tây, tỏi tây
  Cabbage:   { hs: "0704",   exporters: ["CHN", "NLD", "ESP", "USA", "MEX", "ITA", "BEL", "FRA"] },          // bắp cải, súp lơ, bông cải xanh
  Beans:     { hs: "0708",   exporters: ["KEN", "CHN", "EGY", "GTM", "MEX", "ETH", "ESP", "NLD", "MAR"] },   // đậu & đậu Hà Lan tươi
  Pepper:    { hs: "070960", exporters: ["MEX", "ESP", "NLD", "CHN", "TUR", "MAR", "CAN"] },                 // ớt chuông & ớt (Capsicum)
  Asparagus: { hs: "070920", exporters: ["PER", "MEX", "ESP", "USA", "CHN", "GTM", "NLD"] },
};
// Mã số Comtrade (reporterCode) của các nước xuất khẩu ở trên. Script kiểm tra lại với reporterISO trả về.
const CODE = {
  IND: 699, THA: 764, VNM: 704, PAK: 586, USA: 842, MMR: 104, KHM: 116, CHN: 156, URY: 858, ITA: 381, ESP: 724,
  BRA: 76, ARG: 32, PRY: 600, CAN: 124, UKR: 804, RUS: 643, SEN: 686, SDN: 729, NGA: 566, ZAF: 710, ROU: 642,
  FRA: 251, MEX: 484, NLD: 528, MAR: 504, EGY: 818, TUR: 792, PER: 604, BEL: 56, KEN: 404, GTM: 320, COL: 170, ECU: 218,
  DEU: 276, ETH: 231,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchExports(iso, hs, year) {
  const url = `${BASE}?reporterCode=${CODE[iso]}&period=${year}&cmdCode=${hs}&flowCode=X&motCode=0&partner2Code=0&customsCode=C00&includeDesc=true`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, {
        headers: KEY ? { "Ocp-Apim-Subscription-Key": KEY } : {},
        signal: AbortSignal.timeout(30000),
      });
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`HTTP ${r.status} — key sai hoặc không đủ quyền`), { fatal: true });
      if (r.status === 429) {
        const wait = (Number(r.headers.get("retry-after")) || 20) * 1000;
        await sleep(wait);
        throw new Error("HTTP 429 (bị giới hạn tần suất)");
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j.data)) throw new Error("phản hồi không có mảng data");
      return j.data;
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

async function main() {
  const hubFile = B.loadHubs(HUBS);
  console.log(`UN Comtrade · năm ${YEAR} · ${KEY ? "có key" : "KHÔNG có key → dùng endpoint preview công khai"} · ${BASE}`);

  let cache = {};
  if (RESUME && fs.existsSync(CACHE)) { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); console.log(`Resume: ${Object.keys(cache).length} yêu cầu đã có`); }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });

  const jobs = [];
  for (const [crop, c] of Object.entries(CROPS)) for (const iso of c.exporters) jobs.push({ crop, iso, hs: c.hs, key: `${crop}:${iso}` });
  let ok = 0, fail = 0, done = 0, fellBack = 0;
  const failures = [], mismatches = [];

  for (const j of jobs) {
    done++;
    if (j.key in cache) { ok++; continue; }
    if (!CODE[j.iso]) { fail++; failures.push(`${j.key}: chưa có mã Comtrade`); continue; }
    try {
      const slim = (data) => data
        .filter((d) => d.partnerCode !== 0 && d.partnerISO && d.partnerISO !== "W00")
        .map((d) => ({ r: d.reporterISO, p: d.partnerISO, w: d.netWgt ?? null, v: d.primaryValue ?? null }));
      let y = YEAR, rows = slim(await fetchExports(j.iso, j.hs, y));
      if (FALLBACK && !rows.some((d) => d.w > 0)) {       // chưa báo cáo năm YEAR → thử năm trước
        await sleep(DELAY_MS);
        y = YEAR - 1; rows = slim(await fetchExports(j.iso, j.hs, y));
        if (rows.some((d) => d.w > 0)) fellBack++;
      }
      cache[j.key] = { y, rows };                          // rút gọn trường → file cache nhỏ
      ok++;
    } catch (e) {
      if (e.fatal) { console.error("\n" + e.message); process.exit(3); }
      fail++; failures.push(`${j.key}: ${e.message}`);
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    process.stdout.write(`\r${done}/${jobs.length}  ok=${ok} lỗi=${fail}  (${j.key})        `);
    await sleep(DELAY_MS);
  }
  console.log();

  if (fail / jobs.length > MAX_FAIL_RATIO) {
    console.error(`Quá nhiều yêu cầu lỗi (${fail}/${jobs.length}) → KHÔNG ghi đè ${OUT}.`);
    console.error(failures.slice(0, 6).join("\n"));
    console.error("Chạy lại với --resume (tiến độ đã lưu).");
    process.exit(2);
  }

  // Gộp: mỗi (crop, from, to) → kt. Bỏ dòng không có khối lượng (netWgt) — báo lại số lượng.
  const rows = [];
  let noWeight = 0;
  for (const j of jobs) {
    const entry = cache[j.key];
    if (!entry) continue;
    const list = Array.isArray(entry) ? entry : entry.rows;        // tương thích cache định dạng cũ
    const usedYear = Array.isArray(entry) ? YEAR : entry.y;
    const agg = new Map();
    for (const d of list) {
      if (d.r && d.r !== j.iso) { mismatches.push(`${j.key}: reporterISO=${d.r}`); break; }
      if (!(d.w > 0)) { noWeight++; continue; }
      agg.set(d.p, (agg.get(d.p) || 0) + d.w / 1e6);      // kg → kt
    }
    for (const [to, kt] of agg) rows.push({ crop: j.crop, from: j.iso, to, kt, ...(usedYear !== YEAR ? { year: usedYear } : {}) });
  }
  if (mismatches.length) console.warn("⚠️ Mã Comtrade có thể sai (reporterISO không khớp):", [...new Set(mismatches)].slice(0, 5).join("; "));

  // Chỉ giữ top-N mỗi cây TRƯỚC khi dựng tuyến biển (tốn thời gian nhất)
  const kept = [];
  for (const crop of Object.keys(CROPS)) {
    kept.push(...rows.filter((r) => r.crop === crop).sort((a, b) => b.kt - a.kt).slice(0, KEEP * 2));
  }
  console.log(`Dựng tuyến cho ${kept.length} luồng (có thể mất vài phút do tính tuyến biển)…`);
  const { flows, missing, failedRoutes } = B.buildFlows(kept, hubFile, { airShare });
  const final = [];
  for (const crop of Object.keys(CROPS)) final.push(...flows.filter((f) => f.crop === crop).sort((a, b) => b.kt - a.kt).slice(0, KEEP));

  const kb = B.writeFlows(OUT, {
    source: "un-comtrade", year: YEAR, unit: "kt",
    note: "UN Comtrade (xuất khẩu, khối lượng tịnh). Tỷ lệ hàng không là ước lượng; đường bộ = chung biên giới.",
    crops: Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [k, { hs: c.hs }])),
  }, final);

  console.log(`Đã ghi ${OUT} — ${final.length} luồng, ${kb} KB. Dòng không có khối lượng bị bỏ: ${noWeight}.`);
  if (fellBack) console.log(`Lùi về năm ${YEAR - 1} cho ${fellBack} cặp (nước xuất × mặt hàng) chưa có số liệu ${YEAR}; năm được ghi trong từng luồng.`);
  const miss = Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (miss.length) console.log("Nước chưa có trong trade-hubs.json (nên thêm, xếp theo khối lượng):", miss.map(([c, kt]) => `${c} (${Math.round(kt)} kt)`).join(", "));
  if (failedRoutes.length) console.log("Không dựng được tuyến biển:", failedRoutes.join(", "));
  if (failures.length) console.log(`Yêu cầu lỗi bị bỏ qua (${failures.length}):`, failures.slice(0, 5).join("; "));
}

main().catch((e) => { console.error(e); process.exit(1); });
