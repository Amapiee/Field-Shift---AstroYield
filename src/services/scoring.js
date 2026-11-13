// Chấm điểm một kịch bản 3 vụ (đất / nước / lợi nhuận)
const { CROPS, SEASON_IDX } = require("../config/crops");
const { clamp, round, meanAt } = require("../utils/helpers");

function scoreScenario(cropTrio, data, wWater, wSoil, wProfit) {
  let soilHp = 60, waterHp = 70, profitHp = 50;
  const alerts = [];

  cropTrio.forEach((ckey, si) => {
    const sidx = SEASON_IDX[si];
    const cd = CROPS[ckey] || CROPS.Fallow;
    const gw = meanAt(data.GWETROOT, sidx);
    const tmp = meanAt(data.TS, sidx);
    const prp = meanAt(data.PRECTOTCORR, sidx);
    const ndv = meanAt(data.NDVI, sidx);

    // Soil
    let soilDelta = cd.soil * 0.55;
    if (ckey === "Fallow" && prp > 100) {
      soilDelta -= 14;
      alerts.push(`Vụ ${si + 1}: Bỏ trống + GPM ${prp.toFixed(0)}mm → Xói mòn nặng!`);
    }
    soilHp += soilDelta;

    // Water
    let droughtPenalty = 1.0; // Hệ số sinh tồn mặc định là 100%
    
    if (gw < 0.38 && cd.water < -18) {
      waterHp += cd.water * 1.6;
      alerts.push(`Vụ ${si + 1}: SMAP khô (${gw.toFixed(2)}) + ${ckey} háo nước → Hạn hán!`);
      
      // ÁP DỤNG NHÂN QUẢ: Đất khô + Cây háo nước = Chết khô (mất 80% năng suất)
      droughtPenalty = 0.2; 
    } else {
      waterHp += cd.water * 0.5;
    }

    // Profit
    let profitDelta = cd.profit * 0.5;
    if (tmp > 34 && cd.heat_tol < 0.4) {
      profitDelta *= 0.52; // Sốc nhiệt làm giảm 48% năng suất
      alerts.push(`Vụ ${si + 1}: ECOSTRESS TS=${tmp.toFixed(1)}°C → ${ckey} giảm năng suất!`);
    }
    
    // => TRỪ LỢI NHUẬN NẾU THIẾU NƯỚC
    profitDelta *= droughtPenalty; 
    if (droughtPenalty < 1.0) {
        alerts.push(`Vụ ${si + 1}: Thiếu nước làm bốc hơi ${(1 - droughtPenalty)*100}% lợi nhuận của ${ckey}!`);
    }

    profitHp += profitDelta;
    // Legume bonus
    if (ckey === "Soybean" || ckey === "Peanut") {
      soilHp += 5 * (0.5 + ndv);
      waterHp += 2;
    }
  });

  soilHp = clamp(soilHp, 0, 100);
  waterHp = clamp(waterHp, 0, 100);
  
  // === THÊM LOGIC PHẠT LỢI NHUẬN DỰA TRÊN NGUỒN NƯỚC ===
  // Nếu waterHp < 40%, cây bắt đầu chết khô. 
  // waterHp = 0 thì profitHp cũng sẽ về 0.
  if (waterHp < 40) {
      // Hệ số phạt tuyến tính: từ 40% nước (giữ nguyên) xuống 0% nước (mất trắng)
      const survivalFactor = Math.max(waterHp / 40.0, 0); 
      profitHp *= survivalFactor;
      alerts.push("📉 Hệ thống tưới tiêu cạn kiệt! Mất trắng mùa màng.");
  }
  
  profitHp = clamp(profitHp, 0, 100);

  const totalW = Math.max(wWater + wSoil + wProfit, 1e-6);
  const overall = (wSoil * soilHp + wWater * waterHp + wProfit * profitHp) / totalW;
  const rank = overall >= 72 ? "S" : overall >= 58 ? "A" : overall >= 44 ? "B" : "C";

  return {
    soil_hp: round(soilHp, 1),
    water_hp: round(waterHp, 1),
    profit_hp: round(profitHp, 1),
    overall: round(overall, 1),
    rank,
    alerts: alerts.slice(0, 4),
    crops: cropTrio,
  };
}

module.exports = { scoreScenario };