const { CROPS, CROP_KEYS } = require("../config/crops");
const { computeCropSeasonSuitability } = require("../algorithms/11_crop_suitability_fuzzy_ecocrop");

// Screening by crop and growing window, rather than treating altitude or a
// historical freezing night as proof that the whole region cannot grow crops.
// Durations, thresholds and penalties remain explicit project heuristics.
function buildCropRanking(data, { terrain = {} } = {}) {
  const required = ["T2M", "TS", "PRECTOTCORR", "GWETROOT"];
  if (data?._mock || data?._unavailable || required.some(key =>
    !Array.isArray(data?.[key]) || data[key].length !== 12 || !data[key].every(Number.isFinite))) {
    return {status:"unavailable", rows:[], reason:"Chưa có đủ dữ liệu khí hậu thực để xếp hạng cây."};
  }
  const rows = CROP_KEYS.filter(key => key !== "Fallow").map(key => {
    const duration = key === "Veggies" ? 3 : 4;
    const windows = Array.from({length:12}, (_, start) => {
      const indices = Array.from({length:duration}, (_, offset) => (start + offset) % 12);
      const average = name => indices.reduce((sum, i) => sum + data[name][i], 0) / duration;
      const environment = {tempAvg:average("T2M"), rainSeasonAccum:average("PRECTOTCORR") * 4,
        soilMoistureAvg:average("GWETROOT"), maxTs:Math.max(...indices.map(i => data.TS[i]))};
      // Existing fuzzy rainfall limits use a four-month reference, even for the
      // shorter illustrative vegetable window. This is not a cultivar calendar.
      const fit = computeCropSeasonSuitability(key, environment, { continuousFit: true });
      const records = indices.map(i => data._cold_risk?.months?.[i]);
      const validDays = records.reduce((sum, r) => sum + (r?.daily?.valid_days || 0), 0);
      const freezingDays = records.reduce((sum, r) => sum + (r?.daily?.freezing_days || 0), 0);
      const coldMonths = indices.filter(i => data._cold_risk?.months?.[i]?.frost_risk === "detected");
      const climateFrost = indices.some(i => Number.isFinite(data.T2M_MIN?.[i]) && data.T2M_MIN[i] < 0);
      const coldFactor = climateFrost ? .35 : validDays ? Math.max(.2, 1 - 4 * freezingDays / validDays) : coldMonths.length ? .5 : 1;
      // This table describes climate fit. External annual API scores previously
      // multiplied this by up to 2 and clipped distinct results to 100%.
      const raw = Math.max(0, Math.min(100, fit.suitability_score * coldFactor));
      const score = Math.round(raw * 10) / 10;
      const unknown = records.some(record => !record || record.frost_risk === "unknown");
      return {months:indices.map(i=>i+1), raw_score_pct:score,
        score_pct:Math.max(1,score), cold_risk:coldMonths.length > 0 || climateFrost,
        score_components:{...fit.sub_scores, climate_fit:fit.suitability_score, cold_factor:coldFactor},
        cold_data_incomplete:unknown, excluded_by_model:!!(fit.is_lethal || fit.model_excluded),
        reason:fit.reason || (climateFrost ? "Tmin khí hậu dưới 0°C; cần chọn giống và biện pháp bảo vệ." :
          coldMonths.length ? "Có rét trong lịch sử; cần tránh đợt lạnh và kiểm tra lịch gieo trồng." :
          "So khớp nhiệt độ, mưa và ẩm đất trong cửa sổ trồng."),
        frost_frequency:validDays ? freezingDays / validDays : null};
    }).sort((a,b)=>b.raw_score_pct-a.raw_score_pct || Number(a.cold_risk)-Number(b.cold_risk));
    const best=windows[0], score=best.raw_score_pct;
    return {crop:key,label:CROPS[key].label,color:CROPS[key].color,...best,
      suitability_class:score>=75?"S1":score>=55?"S2":score>=35?"S3":"N",
      grade:score>=75?"Rất phù hợp":score>=55?"Phù hợp":score>=35?"Có điều kiện":"Tương thích thấp",
      display_floor_applied:score<1, windows};
  }).sort((a,b)=>b.raw_score_pct-a.raw_score_pct || a.crop.localeCompare(b.crop));
  return {status:"available",rows:rows.map((row,index)=>({...row,rank:index+1})),
    method:"seasonal_crop_fit_v2_peaked",score_kind:"relative_climate_suitability_not_survival_probability",
    terrain_caution:terrain.climate_representativeness === "limited_by_elevation_difference",
    note:"Xếp hạng theo mùa thuận lợi nhất, không phải xác suất sống/năng suất. Mốc hiển thị tối thiểu 1% = tương thích rất thấp; không xác nhận đất canh tác. Cần kiểm tra giống, độ dốc, đất và tưới tại chỗ.",
    references:["https://www.fao.org/4/T0715E/t0715e06.htm","https://www.fao.org/4/y7231e/y7231e04.htm"]};
}

module.exports={buildCropRanking};
