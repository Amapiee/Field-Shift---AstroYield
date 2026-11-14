// Chấm điểm một kịch bản 3 vụ (đất / nước / lợi nhuận) dựa trên FAO EcoCrop, GPM/SMAP và MCDA (V2)
const { CROPS, SEASON_IDX } = require("../config/crops");
const { clamp, round, meanAt } = require("../utils/helpers");
const { computeCropSeasonSuitability } = require("../algorithms/11_crop_suitability_fuzzy_ecocrop");
const { getRotationTransitionBenefit } = require("../algorithms/13_crop_rotation_optimization_qaoa_milp");

function scoreScenario(cropTrio, data, wWater, wSoil, wProfit) {
  const alerts = [];

  // 1. Kiểm tra môi trường tổng thể cực đoan (Băng giá hoặc Sa mạc hoang hóa)
  const annualRain = data.PRECTOTCORR ? data.PRECTOTCORR.reduce((a, b) => a + b, 0) : 500;
  const minTemp = data.T2M ? Math.min(...data.T2M) : 20;
  const avgTemp = data.T2M ? data.T2M.reduce((a, b) => a + b, 0) / data.T2M.length : 25;
  const avgGwet = data.GWETROOT ? data.GWETROOT.reduce((a, b) => a + b, 0) / data.GWETROOT.length : 0.5;
  const avgNdvi = data.NDVI ? data.NDVI.reduce((a, b) => a + b, 0) / data.NDVI.length : 0.3;

  const isPermanentlyFrozen = avgTemp < 0.0 || (avgTemp < 5.0 && minTemp < -12.0);
  const isHyperArid = (annualRain < 120.0 && avgGwet < 0.22) || (annualRain < 150.0 && avgGwet < 0.18);

  if (isPermanentlyFrozen) {
    alerts.push("🧊 Băng giá hủy diệt: Nhiệt độ quanh năm dưới 0°C. Cây trồng không thể nảy mầm hoặc sinh trưởng.");
    return {
      soil_hp: 10.0,
      water_hp: 5.0,
      profit_hp: 0.0,
      overall: 4.8,
      rank: "C",
      alerts: alerts.slice(0, 4),
      crops: cropTrio
    };
  }

  if (isHyperArid) {
    alerts.push("🏜️ Hoang mạc cực khô hạn: Lượng mưa dưới 120mm/năm, ẩm đất dưới điểm héo vĩnh viễn. Mất trắng toàn bộ mùa màng.");
    return {
      soil_hp: 12.0,
      water_hp: 0.0,
      profit_hp: 0.0,
      overall: 3.9,
      rank: "C",
      alerts: alerts.slice(0, 4),
      crops: cropTrio
    };
  }

  // 2. Khởi tạo ngân sách nước và độ phì nhiêu đất cơ sở từ viễn thám thực tế (GPM, SMAP, MODIS)
  // Neo trực tiếp vào dữ liệu vệ tinh, không gán cứng 60% hay 50%
  const baseWater = clamp((annualRain / 1200.0) * 50.0 + (avgGwet / 0.65) * 50.0, 0, 95);
  let waterHp = baseWater;

  // Khấu trừ nước đóng băng (Snow/Ice) không thể hấp thụ sinh học:
  // Khi nhiệt độ rơi xuống dưới 0°C, mưa tuyết và băng giá không thể cung cấp nước lỏng cho rễ
  const freezeMonths = (data.T2M && Array.isArray(data.T2M)) ? data.T2M.filter(t => t < 0).length : 0;
  if (freezeMonths > 0) {
    const usableWaterRatio = Math.max(0.35, 1.0 - freezeMonths * 0.15);
    waterHp *= usableWaterRatio;
  }

  const baseSoil = clamp(20.0 + 50.0 * Math.min(1.0, avgGwet / 0.60) * (0.3 + 0.7 * Math.max(0, avgNdvi)), 5, 85);
  let soilHp = baseSoil;
  let profitHp = 0;
  let lethalCount = 0;

  // 3. Chấm điểm từng mùa vụ bình thường
  cropTrio.forEach((ckey, si) => {
    const sidx = SEASON_IDX[si];
    const cd = CROPS[ckey] || CROPS.Fallow;
    const gw = meanAt(data.GWETROOT, sidx);
    const tmp = meanAt(data.TS, sidx);
    const tAir = meanAt(data.T2M, sidx);
    const prp = sidx.reduce((acc, m) => acc + (data.PRECTOTCORR ? data.PRECTOTCORR[m] : 0), 0);
    const ndv = meanAt(data.NDVI, sidx);

    const seasonEnv = {
      tempAvg: tAir,
      rainSeasonAccum: prp,
      soilMoistureAvg: gw,
      maxTs: Math.max(...sidx.map(m => (data.TS ? data.TS[m] : data.T2M[m] + 3.0)))
    };
    const faoSuit = computeCropSeasonSuitability(ckey, seasonEnv);

    // Water HP: Cây tiêu hao nước từ ngân sách có sẵn
    let waterConsumption = Math.abs(cd.water) * 0.45;
    if (gw < 0.25) {
      waterConsumption *= 1.5;
      alerts.push(`Vụ ${si + 1}: SMAP khô hạn (${gw.toFixed(2)}) + ${cd.label || ckey} → Cạn kiệt nguồn nước!`);
    }
    if (prp > 150) {
      waterConsumption *= 0.6; // Mưa dồi dào bổ sung
    }
    waterHp -= waterConsumption;

    // Soil HP
    if (ckey === "Fallow") {
      if (prp > 150) {
        soilHp -= 8;
        alerts.push(`Vụ ${si + 1}: Bỏ trống + GPM ${prp.toFixed(0)}mm → Xói mòn nặng do thiếu thảm phủ!`);
      }
    } else {
      soilHp += cd.soil * 0.4 * faoSuit.yield_factor;
      // Legume bonus: Chỉ cố định đạm nếu đất có độ ẩm tối thiểu (>= 0.30) VÀ cây thực sự sống sót
      if ((ckey === "Soybean" || ckey === "Peanut") && gw >= 0.30 && faoSuit.suitability_score >= 35 && !faoSuit.is_lethal) {
        soilHp += 6.0;
        waterHp += 2.5;
      }
    }

    // Profit HP: Năng suất vụ * Lợi nhuận cơ bản
    if (!faoSuit.is_lethal) {
      let profitDelta = cd.profit * 0.4 * faoSuit.yield_factor;
      if (tmp > 34 && cd.heat_tol < 0.5) {
        profitDelta *= 0.6;
        alerts.push(`Vụ ${si + 1}: ECOSTRESS TS=${tmp.toFixed(1)}°C → ${cd.label || ckey} giảm năng suất do sốc nhiệt!`);
      }
      profitHp += profitDelta;
    } else {
      if (ckey !== "Fallow") lethalCount++;
      alerts.push(`Vụ ${si + 1}: ${cd.label || ckey} thất thu hoàn toàn (${faoSuit.reason || "Lethal"})!`);
    }
  });

  // Tương tác luân canh chuyển tiếp vụ
  for (let si = 0; si < cropTrio.length - 1; si++) {
    const c1 = cropTrio[si], c2 = cropTrio[si + 1];
    const trans = getRotationTransitionBenefit(c1, c2);
    if (trans > 10) {
      alerts.push(`🌾 Luân canh: Vụ ${si + 1} (${c1}) để lại đạm sinh học dồi dào cho vụ ${si + 2} (${c2})!`);
      soilHp += 5;
    } else if (trans < -10) {
      alerts.push(`⚠️ Cảnh báo độc canh: Trồng lặp lại ${c1} làm gia tăng rủi ro dịch bệnh trong đất.`);
      soilHp -= 6;
    }
  }

  soilHp = clamp(soilHp, 0, 100);
  waterHp = clamp(waterHp, 0, 100);

  // Phạt sụt giảm lợi nhuận nếu thiếu nước trầm trọng (Water stress)
  if (waterHp < 30) {
    const survivalFactor = Math.max(waterHp / 30.0, 0);
    profitHp *= survivalFactor;
    alerts.push("📉 Hệ thống tưới tiêu cạn kiệt! Năng suất sụt giảm mạnh.");
  }
  profitHp = clamp(profitHp, 0, 100);

  const totalW = Math.max(wWater + wSoil + wProfit, 1e-6);
  let overall = (wSoil * soilHp + wWater * waterHp + wProfit * profitHp) / totalW;

  // Áp dụng Định luật Yếu tố Giới hạn Tối thiểu Liebig (Liebig's Law of the Minimum):
  // Nông học thực nghiệm: Năng suất vụ mùa bị giới hạn bởi yếu tố khắc nghiệt/nguy hại nhất.
  // Không thể lấy nước hay đất bù đắp cho cái chết sinh học của cây trồng khi bị rét buốt hoặc chết hạn.
  if (lethalCount >= 2) {
    // Từ 2 vụ trở lên bị mất trắng: Kịch bản sụp đổ hoàn toàn, trần tối đa Rank C
    overall = Math.min(overall, 34.0);
    profitHp = Math.min(profitHp, 15.0);
    alerts.unshift(`⚠️ Định luật Liebig: Có ${lethalCount} vụ mất trắng! Toàn bộ kế hoạch canh tác sụp đổ (Rank C).`);
  } else if (lethalCount === 1) {
    // 1 vụ thất thu hoàn toàn: trần tối đa Rank B
    overall = Math.min(overall, 52.0);
  }

  const rank = overall >= 72 ? "S" : overall >= 55 ? "A" : overall >= 35 ? "B" : "C";

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
