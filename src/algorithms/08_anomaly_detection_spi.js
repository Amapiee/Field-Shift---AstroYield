const {assessColdRisk,coldRiskAlerts}=require('../services/coldRisk');
// SPI uses continuous dated monthly history with at least 30 samples per calendar month.
// This implementation requests 31 complete years for SPI-3. No history is synthesized.
function round(v, dec = 2) {
  const p = Math.pow(10, dec);
  return Math.round(v * p) / p;
}

/**
 * Xấp xỉ Lanczos cho ln(Gamma(x)) với sai số tuyệt đối < 1e-11
 */
function logGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.138571095836524,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < c.length; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Hàm phân phối tích lũy Gamma không đầy đủ quy chuẩn P(a, x) = gamma(a, x) / Gamma(a)
 * Tính chính xác theo chuỗi số (x < a + 1) hoặc liên phân số Lentz (x >= a + 1)
 */
function regularizedGammaP(a, x) {
  if (x <= 0) return 0.0;
  if (a <= 0) return 1.0;

  if (x < a + 1.0) {
    // Khai triển chuỗi Taylor
    let sum = 1.0 / a;
    let term = 1.0 / a;
    for (let n = 1; n < 120; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    return Math.max(0.0, Math.min(1.0, sum * Math.exp(-x + a * Math.log(x) - logGamma(a))));
  } else {
    // Liên phân số Lentz cho Q(a, x) = 1 - P(a, x)
    let b = x + 1.0 - a;
    let c = 1e30;
    let d = 1.0 / b;
    let h = d;
    for (let n = 1; n < 120; n++) {
      const an = -n * (n - a);
      b += 2.0;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1.0 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1.0) < 1e-12) break;
    }
    const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
    return Math.max(0.0, Math.min(1.0, 1.0 - q));
  }
}

/**
 * Ước lượng tham số Phân phối Gamma bằng phương pháp Hợp lý cực đại (Thom, 1958)
 */
function fitGammaDistribution(values) {
  const positive = values.filter(x => Number.isFinite(x) && x > 0);
  const n = values.length;
  if (n === 0) return { q: 1.0, alpha: 1.0, beta: 1.0, mean: 0.0, isDefault: true };

  const zeroCount = n - positive.length;
  const q = zeroCount / n; // Tần suất không mưa

  if (positive.length < 3) {
    const fallbackMean = positive.length > 0 ? positive[0] : 10.0;
    return { q, alpha: 1.0, beta: fallbackMean, mean: fallbackMean, isDefault: true };
  }

  const mean = positive.reduce((a, b) => a + b, 0) / positive.length;
  const sumLn = positive.reduce((a, b) => a + Math.log(b), 0);
  const A = Math.log(mean) - (sumLn / positive.length);

  if (A <= 1e-6) {
    return { q, alpha: null, beta: null, mean, isDefault: true };
  }

  const alpha = (1.0 + Math.sqrt(1.0 + (4.0 * A) / 3.0)) / (4.0 * A);
  const beta = mean / alpha;

  return { q, alpha, beta, mean, isDefault: false };
}

/**
 * Biến đổi xác suất tích lũy sang biến ngẫu nhiên chuẩn tắc Z (Abramowitz & Stegun 1965)
 */
function cdfToStandardNormal(p) {
  if (p <= 0.00001) return -3.5;
  if (p >= 0.99999) return 3.5;

  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;

  if (p < 0.5) {
    const t = Math.sqrt(-2.0 * Math.log(p));
    const z = -(t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0));
    return Math.max(-3.5, Math.min(3.5, z));
  } else {
    const t = Math.sqrt(-2.0 * Math.log(1.0 - p));
    const z = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0);
    return Math.max(-3.5, Math.min(3.5, z));
  }
}

/**
 * Tính SPI trên chuỗi thời gian nhiều năm (Multi-Year Series) theo chuẩn WMO
 * @param {Array<{year: number, month: number, rain_mm: number}>|Array<number>} series Chuỗi mưa nhiều năm liên tục
 * @param {number} timescale Thang đo thời gian (1 = SPI-1, 3 = SPI-3, 6 = SPI-6)
 */
function validateRainfallHistory(series) {
  if (!Array.isArray(series) || series.length < 31*12) return {ok:false,reason:'At least 31 complete years are required (30 samples per ending month for SPI-3).'};
  for (let i=0;i<series.length;i++) {
    const r=series[i],p=series[i-1];
    if (!r || !Number.isInteger(r.year) || !Number.isInteger(r.month) || r.month<1 || r.month>12 || !Number.isFinite(r.rain_mm) || r.rain_mm<0)
      return {ok:false,reason:'Invalid dated monthly rainfall record'};
    if(r.date!==undefined && r.date!==`${r.year}-${String(r.month).padStart(2,'0')}-01`)
      return {ok:false,reason:'Monthly date does not match its year/month'};
    if (p && r.year*12+r.month !== p.year*12+p.month+1) return {ok:false,reason:'Monthly history must be chronological, continuous and unique'};
  }
  return {ok:true};
}
function calculateMultiYearSPI(series, timescale = 1) {
  if (!Number.isInteger(timescale) || timescale < 1) throw new RangeError('Invalid SPI timescale');
  if (!Array.isArray(series) || !series.length) return [];
  const validation = validateRainfallHistory(series);
  if (!validation.ok) return series.map(rec => ({...rec,spi:null,status:'unavailable',reason:validation.reason,timescale}));
  // Chuẩn hóa định dạng mảng
  const rainRecords = typeof series[0] === "number"
    ? series.map((r, idx) => ({ index: idx, month: (idx % 12) + 1, rain_mm: r }))
    : series;

  const n = rainRecords.length;
  if (n < timescale) return [];

  // 1. Tính lượng mưa tích lũy không dùng modulo xoay vòng
  const accumRain = [];
  for (let i = 0; i < n; i++) {
    if (i < timescale - 1) {
      accumRain.push(null); // Không đủ dữ liệu lịch sử đầu chuỗi
    } else {
      let sum = 0;
      for (let k = 0; k < timescale; k++) {
        sum += rainRecords[i - k].rain_mm;
      }
      accumRain.push(sum);
    }
  }

  // 2. Gom nhóm theo từng tháng kết thúc (1 đến 12) để khớp 12 phân phối Gamma riêng biệt
  const monthlyDistributions = {};
  for (let m = 1; m <= 12; m++) {
    const monthValues = [];
    for (let i = 0; i < n; i++) {
      if (rainRecords[i].month === m && accumRain[i] !== null) {
        monthValues.push(accumRain[i]);
      }
    }
    monthlyDistributions[m] = monthValues.length >= 30 ? fitGammaDistribution(monthValues) : {isDefault:true};
  }

  // 3. Tính SPI cho từng bản ghi bằng phân phối Gamma chính xác
  return rainRecords.map((rec, i) => {
    const accum = accumRain[i];
    if (accum === null) {
      return {
        ...rec,
        accum_rain: null,
        spi: null,
        status:'unavailable',
        reason:'Insufficient preceding accumulation months',
        category: "Chưa đủ chuỗi tích lũy",
        timescale
      };
    }

    const { alpha, beta, q, isDefault } = monthlyDistributions[rec.month];
    if (isDefault) return {...rec,accum_rain:accum,spi:null,status:'unavailable',reason:'Insufficient or degenerate monthly distribution',timescale};
    let H;
    if (accum === 0) {
      H = q;
    } else {
      const gammaP = regularizedGammaP(alpha, accum / beta);
      H = q + (1.0 - q) * gammaP;
    }

    const spiValue = round(cdfToStandardNormal(H), 2);
    let category = "Gần mức bình thường";
    if (spiValue <= -2.0) category = "Hạn hán cực kỳ nghiêm trọng (Extreme Drought)";
    else if (spiValue <= -1.5) category = "Hạn hán nặng (Severe Drought)";
    else if (spiValue <= -1.0) category = "Hạn hán vừa (Moderate Drought)";
    else if (spiValue >= 2.0) category = "Mưa lũ cực đoan (Extreme Wet)";
    else if (spiValue >= 1.5) category = "Rất ẩm ướt (Very Wet)";

    return {
      ...rec,
      accum_rain: round(accum, 1),
      spi: spiValue,
      status:'available',
      category,
      timescale
    };
  });
}




// A climatological mean has no interannual distribution: it cannot provide SPI.
function calculateSPI(rainMonthly) {
  return rainMonthly.map((rain,idx)=>({month:idx+1,rain_mm:rain,spi_value:null,status:'unavailable',
    reason:'SPI requires dated multi-year monthly history, not 12 climatological means.'}));
}

/**
 * Phát hiện bất thường khí hậu tổng hợp (Multi-Year SPI, Sốc nhiệt, Băng tuyết và Khô hạn sa mạc)
 * Kết nối trực tiếp WMO Multi-Year SPI vào luồng chính
 */
function detectEnvironmentalAnomalies(monthlyData, multiYearRainSeries = null) {
  const { TS, GWETROOT, PRECTOTCORR, T2M } = monthlyData;

  // Sử dụng chuỗi lịch sử nhiều năm để tính WMO SPI-1 và SPI-3 chuẩn xác
  const history = multiYearRainSeries || [];
  const validation = validateRainfallHistory(history);
  const spi3 = validation.ok ? calculateMultiYearSPI(history,3).slice(-12) : [];
  const spi1 = validation.ok ? calculateMultiYearSPI(history,1).slice(-12) : [];
  const spi6 = validation.ok ? calculateMultiYearSPI(history,6).slice(-12) : [];
  const available = validation.ok && spi3.every(r=>r.spi !== null) && spi1.every(r=>r.spi !== null) && spi6.every(r=>r.spi!==null);
  const reason = available ? null : validation.reason || 'Insufficient nondegenerate monthly rainfall distributions';
  const spiResults = Array.from({length:12},(_,idx)=>({
    year:spi3[idx]?.year || null,month:spi3[idx]?.month || idx+1,
    rain_mm:available ? spi3[idx].rain_mm : null,
    accum_rain_3m:spi3[idx]?.accum_rain ?? null,
    spi_value:available ? spi3[idx].spi : null,spi_1m:available ? spi1[idx].spi : null,
    spi_3m:available ? spi3[idx].spi : null,spi_6m:available ? spi6[idx].spi : null,
    timescales:[1,3,6],type:'historical_spi',
    status:available ? 'available' : 'unavailable',reason,
    category:available ? spi3[idx].category : 'Unavailable',
    alert_level:available && spi3[idx].spi <= -1.5 ? 'danger' : available && spi3[idx].spi <= -1 ? 'warning' : 'ok'
  }));

  const alerts = coldRiskAlerts(monthlyData._cold_risk || assessColdRisk(monthlyData),monthlyData._terrain);
  const annualRain = PRECTOTCORR.reduce((a, b) => a + b, 0);
  const minT2M = T2M ? Math.min(...T2M) : 10;
  const maxTs = Math.max(...TS);
  const minGwet = Math.min(...GWETROOT);

  // 2. Cảnh báo Sa mạc cực khô hạn (Hyper-Arid Anomaly)
  if (annualRain < 120.0 && minGwet < 0.22) {
    alerts.push({
      level: "danger",
      satellite: "NASA POWER Climatology",
      msg: `🔴 NASA POWER: Khí hậu sa mạc cực khô hạn (Mưa cả năm chỉ ${annualRain.toFixed(0)}mm) — Đất trơ sỏi cát dưới điểm héo vĩnh viễn!`
    });
  }

  // 3. Cảnh báo Hạn hán nông nghiệp theo Multi-Year SPI-3
  const droughtMonths = spiResults.filter(s => s.spi_value !== null && s.spi_value <= -1.2);
  if (droughtMonths.length > 0 && annualRain >= 120.0) {
    const monthsStr = droughtMonths.map(s => `T${s.month}`).join(", ");
    alerts.push({
      level: "warning",
      satellite: "WMO SPI-3 Multi-Year",
      msg: `🟠 WMO SPI-3: Chỉ số hạn hán tích lũy báo động (${monthsStr}) — Thiếu hụt nghiêm trọng lượng mưa so với chuỗi lịch sử nhiều năm có nguồn!`
    });
  }

  // 4. Cảnh báo Sốc nhiệt mặt đất
  if (maxTs >= 35.0) {
    const tsMonth = TS.indexOf(maxTs) + 1;
    alerts.push({
      level: maxTs >= 40.0 ? "danger" : "warning",
      satellite: "MERRA-2 Skin Thermal",
      msg: `🔴 MERRA-2: Nhiệt độ bề mặt đất đỉnh ${maxTs.toFixed(1)}°C (T${tsMonth}) — Stress nhiệt nghiêm trọng, tổn thương sinh khối rễ!`
    });
  }

  // 5. Cảnh báo Suy kiệt ẩm đất rễ
  if (minGwet < 0.25 && annualRain >= 120.0) {
    const gwetMonth = GWETROOT.indexOf(minGwet) + 1;
    alerts.push({
      level: "warning",
      satellite: "NASA POWER Catchment LSM",
      msg: `🟡 Catchment LSM: Độ ẩm rễ chạm ngưỡng héo ${minGwet.toFixed(2)} (T${gwetMonth}) — Đòi hỏi tưới tiêu bổ sung khẩn cấp.`
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: "ok",
      satellite: "NASA Integrated",
      msg: "🟢 Không phát hiện cực đoan trong các biến khí hậu đã tải; chưa xác nhận an toàn canh tác tại ruộng."
    });
  }

  return {
    spi_status: available ? "available" : "unavailable",
    spi_reason: reason,
    spi_details: spiResults,
    multi_year_history_length: history.length,
    alerts
  };
}

module.exports = {
  logGamma,
  regularizedGammaP,
  fitGammaDistribution,
  cdfToStandardNormal,
  validateRainfallHistory,
  calculateSPI,
  calculateMultiYearSPI,
  detectEnvironmentalAnomalies
};
