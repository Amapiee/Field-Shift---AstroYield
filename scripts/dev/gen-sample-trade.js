#!/usr/bin/env node
// Sinh dữ liệu luồng thương mại MINH HOẠ → public/data/trade-flows.json
// Số liệu (nghìn tấn/năm) là ƯỚC LƯỢNG THÔ theo hiểu biết chung về các luồng lớn, KHÔNG phải thống kê chính thức.
// Dùng để demo giao diện. Dữ liệu thật: `npm run build:trade` (UN Comtrade).
const path = require("node:path");
const B = require("../lib/trade-build");

const R = (crop, from, to, kt, airKt) => ({ crop, from, to, kt, airKt });
const rows = [
  // Gạo
  R("Rice","IND","SAU",1100), R("Rice","IND","BEN",1000), R("Rice","IND","SEN",900), R("Rice","IND","CIV",800),
  R("Rice","IND","IRN",900), R("Rice","IND","BGD",700), R("Rice","VNM","PHL",2800), R("Rice","VNM","CHN",800),
  R("Rice","VNM","GHA",600), R("Rice","VNM","MYS",500), R("Rice","THA","IRQ",900), R("Rice","THA","JPN",600),
  R("Rice","THA","ZAF",650), R("Rice","PAK","KEN",500), R("Rice","PAK","ARE",400), R("Rice","USA","MEX",800),
  R("Rice","USA","HTI",400), R("Rice","MMR","CHN",600), R("Rice","KHM","CHN",250),
  // Đậu tương
  R("Soybean","BRA","CHN",60000), R("Soybean","USA","CHN",25000), R("Soybean","BRA","TUR",2500), R("Soybean","BRA","THA",2500),
  R("Soybean","BRA","ESP",2000), R("Soybean","BRA","NLD",1800), R("Soybean","USA","MEX",5000), R("Soybean","USA","EGY",2200),
  R("Soybean","USA","NLD",2500), R("Soybean","USA","JPN",2200), R("Soybean","USA","IDN",2300), R("Soybean","USA","KOR",1000),
  R("Soybean","USA","TWN",2000), R("Soybean","URY","CHN",2000), R("Soybean","CAN","CHN",1000), R("Soybean","ARG","CHN",4000),
  // Ngô
  R("Maize","USA","MEX",17000), R("Maize","USA","JPN",11000), R("Maize","USA","COL",4500), R("Maize","USA","KOR",2000),
  R("Maize","UKR","CHN",8000), R("Maize","UKR","ESP",3500), R("Maize","UKR","EGY",2500), R("Maize","UKR","NLD",3000),
  R("Maize","BRA","IRN",6500), R("Maize","BRA","VNM",3500), R("Maize","BRA","EGY",3500), R("Maize","ARG","VNM",3500),
  R("Maize","ARG","EGY",3000), R("Maize","ARG","DZA",3000), R("Maize","ROU","ESP",1500),
  // Lạc
  R("Peanut","ARG","NLD",140), R("Peanut","IND","IDN",130), R("Peanut","IND","VNM",90), R("Peanut","IND","PHL",50),
  R("Peanut","SDN","SAU",100), R("Peanut","SDN","EGY",80), R("Peanut","USA","CAN",90), R("Peanut","USA","MEX",70),
  R("Peanut","USA","NLD",60), R("Peanut","BRA","NLD",50), R("Peanut","SEN","CHN",300), R("Peanut","CHN","JPN",60),
  // Rau củ theo từng nhóm HS (tham số thứ 5 = phần chở bằng máy bay, khai báo tường minh)
  // Khoai tây 0701
  R("Potato","NLD","BEL",900), R("Potato","FRA","BEL",600), R("Potato","FRA","ITA",350), R("Potato","NLD","GBR",250),
  R("Potato","CAN","USA",800), R("Potato","USA","MEX",300), R("Potato","EGY","RUS",300), R("Potato","EGY","GBR",200),
  R("Potato","IND","BGD",200), R("Potato","PAK","ARE",250), R("Potato","CHN","MYS",100),
  // Cà chua 0702
  R("Tomato","MEX","USA",1800), R("Tomato","ESP","FRA",250), R("Tomato","ESP","DEU",300), R("Tomato","MAR","FRA",350),
  R("Tomato","MAR","GBR",80), R("Tomato","TUR","RUS",250), R("Tomato","NLD","DEU",450), R("Tomato","NLD","GBR",130),
  R("Tomato","CAN","USA",150),
  // Hành, tỏi 0703
  R("Onion","IND","BGD",700), R("Onion","IND","MYS",350), R("Onion","IND","ARE",400,15), R("Onion","IND","LKA",150),
  R("Onion","CHN","MYS",150), R("Onion","CHN","JPN",200), R("Onion","EGY","SAU",150), R("Onion","NLD","BRA",150),
  R("Onion","PAK","ARE",100), R("Onion","ESP","GBR",80), R("Onion","USA","MEX",100), R("Onion","MEX","USA",200),
  // Bắp cải, súp lơ, bông cải xanh 0704
  R("Cabbage","MEX","USA",400), R("Cabbage","USA","CAN",150), R("Cabbage","ESP","GBR",150), R("Cabbage","ESP","FRA",100),
  R("Cabbage","ESP","DEU",120), R("Cabbage","CHN","JPN",150), R("Cabbage","CHN","KOR",100), R("Cabbage","CHN","MYS",120),
  R("Cabbage","NLD","GBR",100), R("Cabbage","BEL","FRA",90),
  // Đậu & đậu Hà Lan tươi 0708 (nhiều luồng đi máy bay: đậu cô ve Kenya…)
  R("Beans","KEN","GBR",40,30), R("Beans","KEN","NLD",35,25), R("Beans","EGY","GBR",25,8), R("Beans","GTM","USA",40,8),
  R("Beans","MEX","USA",200), R("Beans","CHN","JPN",40), R("Beans","ETH","SAU",20,15), R("Beans","MAR","FRA",60),
  R("Beans","PER","USA",40,10),
  // Ớt chuông, ớt 070960
  R("Pepper","MEX","USA",900), R("Pepper","ESP","DEU",450), R("Pepper","ESP","FRA",150), R("Pepper","NLD","DEU",300),
  R("Pepper","NLD","GBR",100), R("Pepper","CAN","USA",100), R("Pepper","TUR","DEU",80), R("Pepper","MAR","FRA",50),
  R("Pepper","CHN","JPN",50), R("Pepper","ESP","GBR",100),
  // Măng tây 070920 (một phần lớn đi máy bay)
  R("Asparagus","PER","USA",70,30), R("Asparagus","PER","ESP",15,4), R("Asparagus","PER","NLD",20,8), R("Asparagus","PER","GBR",8,4),
  R("Asparagus","MEX","USA",90), R("Asparagus","ESP","DEU",25), R("Asparagus","ESP","FRA",10), R("Asparagus","CHN","JPN",20),
];

const hubs = B.loadHubs(path.join(__dirname, "../../public/data/trade-hubs.json"));
const { flows, missing, failedRoutes } = B.buildFlows(rows, hubs, { airShare: Object.fromEntries(Object.keys(B.AIR_SHARE).map((k) => [k, 0])) });   // sample: chỉ dùng airKt khai báo tường minh
if (failedRoutes.length) console.warn("Không dựng được tuyến biển:", failedRoutes.join(", "));
if (Object.keys(missing).length) console.warn("Thiếu hub cho:", missing);
const kb = B.writeFlows(path.join(__dirname, "../../public/data/trade-flows.json"), {
  source: "sample", year: null, unit: "kt",
  note: "Số liệu MINH HOẠ (ước lượng thô), không phải thống kê chính thức.",
  crops: { Rice: { hs: "1006" }, Soybean: { hs: "1201" }, Peanut: { hs: "1202" }, Maize: { hs: "1005" }, Potato: { hs: "0701" }, Tomato: { hs: "0702" }, Onion: { hs: "0703" }, Cabbage: { hs: "0704" }, Beans: { hs: "0708" }, Pepper: { hs: "070960" }, Asparagus: { hs: "070920" } },
}, flows);
const by = {};
for (const f of flows) for (const m of Object.keys(f.modes)) by[m] = (by[m] || 0) + 1;
console.log(`Đã ghi ${flows.length} luồng (${kb} KB). Theo phương thức:`, by);
