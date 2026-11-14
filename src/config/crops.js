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

module.exports = { CROPS, CROP_KEYS, SEASON_IDX, NASA_KEYS };
