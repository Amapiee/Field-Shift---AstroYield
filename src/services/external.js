const { debug } = require("../utils/logger");

const CACHE_TTL_MS = 3_600_000; // 1 giờ
const cache = new Map();

// 1. Hàm ước lượng pH từ vĩ độ (Phương án 2B)
function estimateSoilPH(lat, lon) {
  const absLat = Math.abs(lat);
  if (absLat < 23.5) return 5.5; // Nhiệt đới: Đất chua (Laterite)
  if (absLat < 50) return 6.5;   // Ôn đới: Trung tính
  return 7.5;                    // Khô hạn/Cận cực: Kiềm
}

// 2. Hàm ước lượng USDA Zone từ nhiệt độ (Phương án 1A)
function estimateUsdaZone(minTempC) {
  // Công thức quy đổi tương đối từ độ C sang USDA Zone (dựa trên nhiệt độ thấp nhất)
  if (minTempC < -34) return 3;
  if (minTempC < -28) return 4;
  if (minTempC < -23) return 5;
  if (minTempC < -17) return 6;
  if (minTempC < -12) return 7;
  if (minTempC < -6)  return 8;
  if (minTempC < -1)  return 9;
  if (minTempC < 4)   return 10;
  if (minTempC < 10)  return 11;
  return 12;
}

// Map tên cây FarmShift sang tên API hỗ trợ
const CROP_MAP = {
  Rice: "rice", Soybean: "soybean", Peanut: "peanut", 
  Maize: "maize", Veggies: "vegetables", Fallow: "fallow"
};

async function fetchExternalData(lat, lon, nasaData, cropKeys) {
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}:${[...cropKeys].sort().join(",")}`;
  if (cache.has(cacheKey)) {
    const c = cache.get(cacheKey);
    if (Date.now() - c.t < (c.v.ok ? CACHE_TTL_MS : 30000)) return c.v;
  }

  // Chuẩn bị tham số đầu vào từ dữ liệu NASA
  const tempAvg = nasaData.T2M.reduce((a, b) => a + b, 0) / 12;
  const tempMin = Math.min(...nasaData.T2M);
  const rainTotal = nasaData.PRECTOTCORR.reduce((a, b) => a + b, 0);
  const ph = estimateSoilPH(lat, lon);
  const zone = estimateUsdaZone(tempMin);

  const results = { ok: true, source: "live", data: {}, error: null };

  try {
    // Gọi song song cả 2 API với timeout 2.5s
    const parseResponse = response => response.ok ? response.json() : null;
    const fetchCarto = (crop) => fetch(`https://api.cartodrone.com/api/v1/crop-eco-suitability?crop=${CROP_MAP[crop] || crop}&temperature_c=${tempAvg.toFixed(1)}&rainfall_mm=${rainTotal.toFixed(0)}&ph=${ph}`, { signal: AbortSignal.timeout(2500) }).then(parseResponse).catch(() => null);
    const fetchEvery = (crop) => fetch(`https://crops.every.farm/api/v1/recommend?zone=${zone}&crop=${CROP_MAP[crop] || crop}&rainfall=${rainTotal.toFixed(0)}&soil_ph=${ph}`, { signal: AbortSignal.timeout(2500) }).then(parseResponse).catch(() => null);
    const validScore = value => Number.isFinite(value) && value >= 0 && value <= 100;

    const promises = [];
    for (const crop of cropKeys) {
      if (crop === "Fallow") {
        results.data[crop] = { suitability: 1.0, score: 100, source: "static" };
        continue;
      }
      promises.push(
        Promise.allSettled([fetchCarto(crop), fetchEvery(crop)]).then(([cartoRes, everyRes]) => {
          const carto = cartoRes.status === "fulfilled" ? cartoRes.value : null;
          const every = everyRes.status === "fulfilled" ? everyRes.value : null;

          // Hợp nhất kết quả: Ưu tiên CartoDrone (vì nó chuyên về suitability)
          let suitability = 0.5;
          let score = 50;
          let src = "fallback";

          if (carto && validScore(carto.suitability)) {
            suitability = carto.suitability / 100; // Giả sử API trả về 0-100
            score = carto.suitability;
            src = "cartodrone";
          } else if (every && validScore(every.score)) {
            suitability = every.score / 100;
            score = every.score;
            src = "everyfarm";
          }

          results.data[crop] = { suitability, score, source: src };
        })
      );
    }

    await Promise.all(promises);

    // Nếu tất cả các cây đều fallback, đánh dấu là lỗi API
    const hasLiveData = Object.values(results.data).some(d => d.source !== "fallback" && d.source !== "static");
    if (!hasLiveData) {
      results.ok = false;
      results.source = "fallback";
      results.error = "Không thể kết nối API bên thứ ba (CartoDrone/Every.Farm)";
    }

  } catch (err) {
    debug("external API error:", err.message);
    results.ok = false;
    results.source = "fallback";
    results.error = err.message;
    // Gán toàn bộ về fallback để scoring tự xử lý
    cropKeys.forEach(c => results.data[c] = { suitability: 0.5, score: 50, source: "fallback" });
  }

  if(cache.size>=64)cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { t: Date.now(), v: results });
  return results;
}

module.exports = { fetchExternalData, estimateSoilPH };
