// src/services/trade.js
const { MARKETS } = require("../data/markets");
const { CROPS } = require("../config/crops");
const { round } = require("../utils/helpers");
const { debug } = require("../utils/logger");

// Import kèm giá trị mặc định an toàn nếu file transport.js thiếu biến
const transportConfig = require("../config/transport") || {};
const TRANSPORT_COST_PER_KM      = transportConfig.TRANSPORT_COST_PER_KM || { TRUCK: 0.12, RAIL: 0.05, SEA: 0.02, AIR: 0.85 };
const AVG_SPEED_KM_PER_DAY       = transportConfig.AVG_SPEED_KM_PER_DAY || { TRUCK: 500, RAIL: 600, SEA: 450, AIR: 8000 };
const PERISHABILITY_RATE_PER_DAY = transportConfig.PERISHABILITY_RATE_PER_DAY || { Rice: 0.002, Maize: 0.003, Soybean: 0.002, Peanut: 0.003, Veggies: 0.04 };
const TERRAIN_DIFFICULTY_FACTOR  = transportConfig.TERRAIN_DIFFICULTY_FACTOR || { FLAT_PAVED: 1.0, HILLY: 1.3, MOUNTAINOUS: 1.7 };
const FUEL_PRICE_INDEX           = transportConfig.FUEL_PRICE_INDEX || 1.05;
const MARKET_PRICE_MODIFIERS     = transportConfig.MARKET_PRICE_MODIFIERS || { LOCAL_MARKET: 0.9, MID_TIER_HUB: 1.0, EXPORT_PORT: 1.15 };
const BASE_PRICE_FALLBACK_USD    = transportConfig.BASE_PRICE_FALLBACK_USD || {
  Rice: 480,
  Soybean: 520,
  Maize: 310,
  Peanut: 890,
  Veggies: 650,
};

// ── KHAI BÁO ĐẦY ĐỦ CÁC HẰNG SỐ BỊ THIẾU TRƯỚC ĐÂY ────────────────────────
const CACHE_TTL_MS              = 60 * 60 * 1000; // Cache 1 giờ
const NEXTFARM_API_TIMEOUT_MS   = 5000;           // Timeout 5s
const ORS_API_TIMEOUT_MS        = 6000;           // Timeout 6s
const DEFAULT_PRICE_MULTIPLIER  = 450;            // Hệ số nhân nếu tính từ CROPS[crop].profit
const COST_PER_TON_KM_USD       = TRANSPORT_COST_PER_KM.TRUCK || 0.12;

const priceCache = new Map();

// Ánh xạ từ cây trồng của FarmShift sang từ khóa tìm kiếm của NextFarm
const NEXTFARM_MAPPING = {
  Rice: "gạo",
  Maize: "ngô",
  Soybean: "đậu tương",
  Peanut: "lạc",
  Veggies: "rau",
};

// ── 1. Lấy giá từ NextFarm API ───────────────────────────────────────────
async function fetchNextFarmPrice(cropKey) {
  const apiKey = process.env.NEXTFARM_API_KEY;
  if (!apiKey) return getFallbackPrice(cropKey);

  const cached = priceCache.get(cropKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const url = new URL("https://api-prod.nextfarm.vn/api/v1/harvest/market-prices");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(NEXTFARM_API_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`NextFarm API HTTP ${res.status}`);
    const data = await res.json();

    if (!data || !data.items || !Array.isArray(data.items)) {
      throw new Error("Cấu trúc dữ liệu NextFarm không hợp lệ.");
    }

    const searchKeyword = NEXTFARM_MAPPING[cropKey] || cropKey.toLowerCase();
    const priceRecord = data.items.find(
      (item) => item.commodity_name && item.commodity_name.toLowerCase().includes(searchKeyword)
    );

    if (!priceRecord || !priceRecord.unit_price) {
      throw new Error(`Không tìm thấy giá cho ${cropKey} từ NextFarm`);
    }

    const VND_TO_USD = 1 / 25000;
    const pricePerTon = priceRecord.unit_price * 1000 * VND_TO_USD;

    priceCache.set(cropKey, {
      price: pricePerTon,
      timestamp: Date.now(),
      source: "nextfarm_live",
    });
    return pricePerTon;
  } catch (error) {
    debug(`NextFarm API error for ${cropKey}: ${error.message}`);
    return getFallbackPrice(cropKey);
  }
}

function getFallbackPrice(cropKey) {
  // Ưu tiên lấy trong bảng giá chuẩn BASE_PRICE_FALLBACK_USD, nếu không có mới nhân từ CROPS.profit
  const cropProfit = CROPS[cropKey]?.profit || 1.0;
  const fallbackPrice = BASE_PRICE_FALLBACK_USD[cropKey] || (cropProfit * DEFAULT_PRICE_MULTIPLIER);

  priceCache.set(cropKey, {
    price: fallbackPrice,
    timestamp: Date.now(),
    source: "fallback",
  });
  return fallbackPrice;
}

// ── 2. Tính khoảng cách đường chim bay (Dùng để lọc trạm gần nhất) ─────────
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 3. Gọi ORS lấy khoảng cách đường bộ chính xác ─────────────────────────
async function getRoadDistance(lat1, lon1, lat2, lon2) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return getHaversineDistance(lat1, lon1, lat2, lon2) * 1.3;

  try {
    const url = `https://api.openrouteservice.org/v2/directions/driving-hgv/geojson?api_key=${apiKey}&start=${lon1},${lat1}&end=${lon2},${lat2}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(ORS_API_TIMEOUT_MS) });

    if (!res.ok) throw new Error(`ORS API HTTP ${res.status}`);
    const data = await res.json();

    if (data.error) throw new Error(data.error.message || "ORS error");
    if (!data.features?.[0]?.properties?.segments?.[0]?.distance) {
      throw new Error("ORS trả về cấu trúc không hợp lệ.");
    }

    return data.features[0].properties.segments[0].distance / 1000;
  } catch (error) {
    debug(`ORS error: ${error.message}, dùng tạm khoảng cách chim bay.`);
    return getHaversineDistance(lat1, lon1, lat2, lon2) * 1.3;
  }
}

// ── 4. Tính chi tiết lợi nhuận ròng, cước vận tải & hao hụt ────────────────
function calculateNetProfit(
  cropKey,
  basePrice,
  distanceKm,
  mode = "TRUCK",
  terrain = "FLAT_PAVED",
  marketTier = "MID_TIER_HUB",
  customPriceMod = null
) {
  const costPerKm = TRANSPORT_COST_PER_KM[mode] ?? COST_PER_TON_KM_USD;
  const speed = AVG_SPEED_KM_PER_DAY[mode] ?? 500;
  const terrainFactor = TERRAIN_DIFFICULTY_FACTOR[terrain] ?? 1.0;

  const fuelMultiplier = mode === "TRUCK" ? FUEL_PRICE_INDEX : 1.0;
  const transportCost = distanceKm * costPerKm * terrainFactor * fuelMultiplier;

  const transitDays = distanceKm / speed;

  const marketModifier = customPriceMod ?? (MARKET_PRICE_MODIFIERS[marketTier] || 1.0);
  const sellPrice = basePrice * marketModifier;

  const perishRate = PERISHABILITY_RATE_PER_DAY[cropKey] ?? 0.01;
  const valueLost = sellPrice * (1 - Math.pow(1 - perishRate, transitDays));

  const netProfit = sellPrice - transportCost - valueLost;

  return {
    sellPrice: round(sellPrice, 2),
    netProfit: round(netProfit, 2),
    transportCost: round(transportCost, 2),
    valueLost: round(valueLost, 2),
    transitDays: round(transitDays, 1),
  };
}

// ── 5. Hàm chính: Tính toán tuyến đường ──────────────────────────────────
async function calculateTradeRoutes(farmLat, farmLon, cropsToEvaluate) {
  const results = [];

  for (const cropKey of cropsToEvaluate) {
    if (cropKey === "Fallow") continue;
    const cd = CROPS[cropKey] || { label: cropKey, color: "#38bdf8" };

    try {
      const basePricePerTon = await fetchNextFarmPrice(cropKey);

      let buyers = (MARKETS || []).filter((m) => Array.isArray(m.crops) && m.crops.includes(cropKey));
      if (buyers.length === 0) {
        results.push({ crop: cropKey, label: cd.label, color: cd.color, buyers: [], best_market: null });
        continue;
      }

      buyers = buyers.map((b) => ({
        ...b,
        estimatedDist: getHaversineDistance(farmLat, farmLon, b.lat, b.lon),
      }));

      buyers.sort((a, b) => a.estimatedDist - b.estimatedDist);
      const topBuyers = buyers.slice(0, 3);

      const buyerOptions = await Promise.all(
        topBuyers.map(async (b) => {
          const distanceKm = await getRoadDistance(farmLat, farmLon, b.lat, b.lon);
          const calc = calculateNetProfit(
            cropKey,
            basePricePerTon,
            distanceKm,
            "TRUCK",
            b.terrain || "FLAT_PAVED",
            b.tier || "MID_TIER_HUB",
            b.price_mod
          );

          return {
            id: b.id,
            name: b.name,
            lat: b.lat,
            lon: b.lon,
            distance_km: round(distanceKm, 1),
            transport_cost: calc.transportCost,
            sell_price: calc.sellPrice,
            net_profit: calc.netProfit,
            value_lost: calc.valueLost,
            transit_days: calc.transitDays,
            price_source: priceCache.get(cropKey)?.source || "fallback",
          };
        })
      );

      buyerOptions.sort((a, b) => b.net_profit - a.net_profit);

      results.push({
        crop: cropKey,
        label: cd.label,
        color: cd.color,
        buyers: buyerOptions,
        best_market: buyerOptions[0] || null,
      });
    } catch (err) {
      console.error(`[TradeService] Lỗi khi xử lý cây ${cropKey}:`, err);
      // Đảm bảo vẫn trả về card báo lỗi nhẹ thay vì làm trắng bảng Modal
      results.push({
        crop: cropKey,
        label: cd.label,
        color: cd.color,
        buyers: [],
        best_market: null,
      });
    }
  }

  return results;
}

module.exports = { calculateTradeRoutes };