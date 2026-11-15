// Định nghĩa cây trồng, mùa vụ và danh sách biến NASA POWER
const CROPS = {
  Rice:    { label: "🌾 Lúa Nước",  water: -35, soil: -25, profit: 75, shield: 20, drought_tol: 0.2, heat_tol: 0.5, flood_tol: 0.9, color: "#38bdf8" },
  Soybean: { label: "🫘 Đậu Tương", water: -12, soil:  35, profit: 65, shield: 40, drought_tol: 0.6, heat_tol: 0.6, flood_tol: 0.3, color: "#10b981" },
  Peanut:  { label: "🥜 Lạc/Đậu",  water:  -8, soil:  30, profit: 70, shield: 55, drought_tol: 0.9, heat_tol: 0.8, flood_tol: 0.2, color: "#f59e0b" },
  Maize:   { label: "🌽 Ngô",        water: -20, soil: -20, profit: 80, shield: 60, drought_tol: 0.5, heat_tol: 0.7, flood_tol: 0.4, color: "#a78bfa" },
  Veggies: { label: "🥬 Rau Màu",   water: -15, soil: -10, profit: 85, shield: 25, drought_tol: 0.4, heat_tol: 0.3, flood_tol: 0.3, color: "#fb923c" },
  Fallow:  { label: "🏜️ Bỏ Trống", water:   0, soil: -25, profit:  0, shield: 10, drought_tol: 1.0, heat_tol: 1.0, flood_tol: 0.1, color: "#64748b" },
};
const CROP_KEYS = Object.keys(CROPS);
const SEASON_IDX = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
];
const NASA_KEYS = ["T2M", "TS", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "GWETTOP", "GWETROOT"];

// Existing agronomic coefficients are project assumptions, not measurements or calibrated probabilities.
const OBJECTIVE_VERSION = 'planning_rotation_v5';
const SCORING_PARAMETERS = {
  soil_base:50,soil_coefficient:1.8,water_base:60,water_coefficient:2.4,
  suitability_weight:0.3,display_offset:40,display_scale:0.5,
  transition_legume:15,transition_rice_repeat:-20,transition_after_fallow:8,
  transition_fallow_repeat:-8,transition_other:2,
};
const CALENDAR = {id:'illustrative_four_month_blocks',months:SEASON_IDX,
  labels:['T1–T4','T5–T8','T9–T12'],region_scope:'Illustrative planning only; no validated regional crop calendar',
  assumptions:'Three full four-month blocks; no hemisphere-specific sowing dates, cultivar or irrigation management is inferred.',
  locally_validated:false};
const PARAMETER_REGISTRY = [
  ...Object.entries(SCORING_PARAMETERS).map(([name,value])=>({name,value,unit:'heuristic planning score units',
    source:'Existing project objective; display_offset/display_scale are an affine mapping of the theoretical [-40,160] score to [0,100]',
    reference:null,region_scope:'No calibrated region',confidence:'uncalibrated',verified:false})),
  ...Object.entries(CROPS).flatMap(([crop,p])=>['water','soil','profit','shield','drought_tol','heat_tol','flood_tol'].map(key=>({
    name:`${crop}.${key}`,value:p[key],unit:'legacy heuristic units; not measured soil chemistry, water volume or currency',
    source:'Existing project crop configuration',reference:null,region_scope:'No calibrated cultivar/region',verified:false,confidence:'uncalibrated'}))),
  {name:'calendar',value:SEASON_IDX,unit:'zero-based calendar months',source:'Illustrative UI blocks',reference:null,
    region_scope:CALENDAR.region_scope,verified:false,confidence:'unvalidated'},
  {name:'rank_boundaries',value:{S:72,A:55,B:35},unit:'presentation score thresholds',source:'Existing project labels; infeasible/no-planting scenarios are C',
    reference:null,region_scope:'Not agronomic success classes',verified:false,confidence:'uncalibrated'},
  {name:'fuzzy_global_coefficients',value:{arid_season_rain_mm:35,arid_wetness:.20,skin_heat_start_c:35,heat_decline_per_c:.12,
      heat_min_factor:.2,temperature_weight:.35,moisture_weight:.35,rain_weight:.30,limiting_base:.5,limiting_weight:.5},
    unit:'Mixed units explicitly named in each key',source:'Existing experimental fuzzy model, not a verified FAO profile',
    reference:null,region_scope:'No calibrated region or cultivar',verified:false,confidence:'uncalibrated'}
];
module.exports = { CROPS, CROP_KEYS, SEASON_IDX, NASA_KEYS, OBJECTIVE_VERSION, SCORING_PARAMETERS, PARAMETER_REGISTRY, CALENDAR };
