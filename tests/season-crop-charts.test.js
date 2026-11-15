const test=require('node:test'), assert=require('node:assert/strict');
const {buildSeasonCropRankings}=require('../src/services/cropRanking');
const {buildSeasonEnvironments}=require('../src/algorithms/13_crop_rotation_optimization_qaoa_milp');
const {computeCropSeasonSuitability}=require('../src/algorithms/11_crop_suitability_fuzzy_ecocrop');
test('three fixed seasons rank all five crops using continuous climate fit',()=>{
 const data=structuredClone(require('./fixtures/climates.json')[0]);
 const seasons=buildSeasonCropRankings(data),envs=buildSeasonEnvironments(data);
 assert.equal(seasons.length,3);
 seasons.forEach((season,i)=>{
  assert.deepEqual(season.months,[1,2,3,4].map(m=>m+i*4));
  assert.equal(season.rows.length,5);
  season.rows.forEach((row,j)=>{
   assert.notEqual(row.crop,'Fallow');
   assert.equal(row.score,computeCropSeasonSuitability(row.crop,envs[i],{continuousFit:true}).suitability_score);
   if(j)assert.ok(season.rows[j-1].score>=row.score);
  });
 });
 assert.deepEqual(buildSeasonCropRankings({...data,_unavailable:true}),[]);
});
test('season charts sort columns, keep zero and destroy old charts on reset',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),configs=[];let destroyed=0;
 const elements=new Map();
 const context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,{setAttribute(){}});return elements.get(id);}},
 Chart:function(canvas,config){configs.push(config);this.destroy=()=>destroyed++;}});
 vm.runInContext(fs.readFileSync('public/js/charts.js','utf8'),context);
 context.seasons=[1,2,3].map(season=>({season,rows:[{crop:'Rice',label:'Rice',score:0},{crop:'Maize',label:'Maize',score:81.2}]}));
 vm.runInContext('buildSeasonCropCharts(seasons)',context);
 assert.equal(configs.length,3);
 for(const config of configs){assert.equal(config.type,'bar');assert.deepEqual(Array.from(config.data.datasets[0].data),[81.2,0]);assert.equal(config.options.scales.y.max,100);}
 vm.runInContext('buildSeasonCropCharts([])',context);assert.equal(destroyed,3);
});
