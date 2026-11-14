// src/services/trade.js
const { MARKETS } = require("../data/markets");
const { CROPS } = require("../config/crops");
const { round } = require("../utils/helpers");
const { debug } = require("../utils/logger");
const {
  COST_PER_TON_KM_USD,
  DEFAULT_PRICE_MULTIPLIER,
  NEXTFARM_API_TIMEOUT_MS,
  ORS_API_TIMEOUT_MS,
  CACHE_TTL_MS,
} = require("../config/transport");

const priceCache = new Map();

// ── Lấy giá từ NextFarm ──────────────────────────────────────────────────
async function fetchNextFarmPrice(cropKey) {
  const apiKey = process.env.NEXTFARM_API_KEY;
  if (!apiKey) {
    debug("NEXTFARM_API_KEY chưa được cấu hình, dùng giá fallback.");
    return getFallbackPrice(cropKey);
  }

  const cached = priceCache.get(cropKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const url = new URL("https://api-prod.nextfarm.vn/api/v1/harvest/market-prices");
    // Lưu ý: Bạn có thể cần điều chỉnh tham số lọc theo loại cây trồng
    // dựa trên tài liệu thực tế của NextFarm. Ví dụ: url.searchParams.append("crop_type", cropKey);
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(NEXTFARM_API_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`NextFarm API HTTP ${res.status}`);

    const data = await res.json();
    // Cấu trúc phản hồi cần được điều chỉnh theo tài liệu thực tế.
    // Giả sử API trả về một mảng các bản ghi giá trong `data.items`.
    const priceRecord = data.items?.find(item => item.crop_type_name === cropKey);
    if (!priceRecord || !priceRecord.price) {
      throw new Error(`Không tìm thấy giá cho ${cropKey} từ NextFarm`);
    }

    // Giả sử đơn vị là VND/kg, chuyển sang USD/tấn (tỷ giá ví dụ)
    const VND_TO_USD = 1 / 25000;
    const pricePerTon = priceRecord.price * 1000 * VND_TO_USD;

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
  const fallbackPrice = CROPS[cropKey].profit * DEFAULT_PRICE_MULTIPLIER;
  priceCache.set(cropKey, {
    price: fallbackPrice,
    timestamp: Date.now(),
    source: "fallback",
  });
  return fallbackPrice;
}

// ── Tính khoảng cách đường bộ bằng OpenRouteService ──────────────────────
async function getRoadDistance(lat1, lon1, lat2, lon2) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    debug("ORS_API_KEY chưa được cấu hình, dùng khoảng cách chim bay.");
    return getHaversineDistance(lat1, lon1, lat2, lon2);
  }

  try {
    // ORS yêu cầu tọa độ dạng [lon, lat]
    const coords = `${lon1},${lat1};${lon2},${lat2}`;
    const url = `https://api.openrouteservice.org/v2/directions/driving-hgv/geojson?api_key=${apiKey}&start=${lon1},${lat1}&end=${lon2},${lat2}`;
    
    const res = await fetch(url, { signal: AbortSignal.timeout(ORS_API_TIMEOUT_MS) });

    if (!res.ok) throw new Error(`ORS API HTTP ${res.status}`);

    const data = await res.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].properties.segments[0].distance / 1000; // mét -> km
    } else {
      throw new Error("ORS không trả về tuyến đường hợp lệ");
    }
  } catch (error) {
    debug(`ORS error: ${error.message}, falling back to Haversine.`);
    return getHaversineDistance(lat1, lon1, lat2, lon2);
  }
}

function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Hàm chính (giữ nguyên logic, chỉ thay đổi nguồn dữ liệu) ──────────────
async function calculateTradeRoutes(farmLat, farmLon, cropsToEvaluate) {
  const results = [];
  for (const cropKey of cropsToEvaluate) {
    if (cropKey === "Fallow") continue;
    const cd = CROPS[cropKey];
    const basePricePerTon = await fetchNextFarmPrice(cropKey);

    const buyers = MARKETS.filter((m) => m.crops.includes(cropKey));
    if (buyers.length === 0) {
      results.push({ crop: cropKey, label: cd.label, buyers: [], best_market: null });
      continue;
    }

    const buyerOptions = await Promise.all(
      buyers.map(async (b) => {
        const distanceKm = await getRoadDistance(farmLat, farmLon, b.lat, b.lon);
        const transportCostPerTon = distanceKm * COST_PER_TON_KM_USD;
        const sellPrice = basePricePerTon * (b.price_mod || 1.0);
        const netProfitPerTon = sellPrice - transportCostPerTon;
        return {
          id: b.id, name: b.name, lat: b.lat, lon: b.lon,
          distance_km: round(distanceKm, 1),
          transport_cost: round(transportCostPerTon, 2),
          sell_price: round(sellPrice, 2),
          net_profit: round(netProfitPerTon, 2),
          price_source: priceCache.get(cropKey)?.source || "fallback",
        };
      })
    );

    buyerOptions.sort((a, b) => b.net_profit - a.net_profit);
    results.push({
      crop: cropKey, label: cd.label, color: cd.color,
      buyers: buyerOptions, best_market: buyerOptions[0],
    });
  }
  return results;
}

module.exports = { calculateTradeRoutes };