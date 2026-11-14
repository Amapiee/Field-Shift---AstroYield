const CROPS = {
  Rice:    { label: "🌾 Lúa Nước",   water: -35, soil: -25, profit: 75, Kc: 1.20, T_base: 10, T_opt: 30, T_max: 40, heat_tol: 0.65, drought_tol: 0.20, color: "#38bdf8" },
  Soybean: { label: "🌱 Đậu Tương",  water: -12, soil:  35, profit: 65, Kc: 0.85, T_base: 7,  T_opt: 28, T_max: 38, heat_tol: 0.55, drought_tol: 0.60, color: "#10b981" },
  Peanut:  { label: "🥜 Lạc/Đậu",   water:  -8, soil:  30, profit: 70, Kc: 0.75, T_base: 10, T_opt: 28, T_max: 37, heat_tol: 0.70, drought_tol: 0.75, color: "#f59e0b" },
  Maize:   { label: "🌽 Ngô",         water: -20, soil: -20, profit: 80, Kc: 1.15, T_base: 8,  T_opt: 25, T_max: 35, heat_tol: 0.50, drought_tol: 0.45, color: "#a78bfa" },
  Veggies: { label: "🥬 Rau Màu",    water: -15, soil: -10, profit: 85, Kc: 0.95, T_base: 5,  T_opt: 22, T_max: 32, heat_tol: 0.30, drought_tol: 0.30, color: "#fb923c" },
  Fallow:  { label: "🏜️ Nghỉ Đất",  water:   0, soil: -25, profit:  0, Kc: 0.20, T_base: 0,  T_opt: 50, T_max: 60, heat_tol: 1.00, drought_tol: 1.00, color: "#64748b" },
};

const CROP_KEYS = Object.keys(CROPS);
const SEASON_IDX = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]];
const NASA_KEYS = ["T2M", "TS", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "GWETTOP", "GWETROOT"];

module.exports = { CROPS, CROP_KEYS, SEASON_IDX, NASA_KEYS };