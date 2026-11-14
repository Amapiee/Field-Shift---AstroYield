// UI/API adapter: a single objective and the same crop/season constraints as both optimizers.
const {SEASON_IDX,CROP_KEYS}=require('../config/crops');
const {computeCropSeasonSuitability}=require('../algorithms/11_crop_suitability_fuzzy_ecocrop');
const {buildSeasonEnvironments,evaluateRotationObjective}=require('../algorithms/13_crop_rotation_optimization_qaoa_milp');
function scoreScenario(cropTrio,data,wWater,wSoil,wProfit){
  const envs=buildSeasonEnvironments(data);
  const matrix=envs.map(env=>Object.fromEntries(CROP_KEYS.map(c=>[c,computeCropSeasonSuitability(c,env)])));
  const result=evaluateRotationObjective(cropTrio,matrix,{soil:wSoil,water:wWater,profit:wProfit});
  const seasons=cropTrio.map((crop,s)=>({season:s+1,months:SEASON_IDX[s].map(m=>m+1),...matrix[s][crop]}));
  const alerts=seasons.filter(s=>s.is_lethal || s.model_excluded).map(s=>`Vụ ${s.season}: ${s.reason || 'Bị loại theo ràng buộc mô hình'}; không xác nhận thiệt hại thực địa.`);
  if(result.no_planting)alerts.unshift('Nghỉ đất cả ba vụ; đây không phải phương án sản xuất hoặc xác suất thành công.');
  if(!result.is_feasible)alerts.unshift('Rank C: có vụ vi phạm ràng buộc của mô hình; toàn bộ kế hoạch không được xếp hạng như phương án khả thi.');
  return {...result,objective_score:result.is_feasible?result.objective_score:null,
    model_status:'experimental_unvalidated',score_kind:'heuristic_planning_score',
    score_units:'0–100 heuristic points; not measured soil fertility, water availability or profit',
    alerts,season_results:seasons,crops:cropTrio};
}
module.exports={scoreScenario};
