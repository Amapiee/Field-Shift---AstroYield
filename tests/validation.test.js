const test=require('node:test');
const assert=require('node:assert/strict');
const {runKMeansPlusPlus}=require('../src/algorithms/09_unsupervised_agro_clustering');
const {AgroRandomForestClassifier,createSyntheticCropDataset}=require('../src/algorithms/10_supervised_crop_suitability');
const {calculateMAE,calculateRMSE}=require('../src/algorithms/14_validation_and_benchmarking');
const {deriveAHPWeightsFromPreferences,solveAHPWeights}=require('../src/algorithms/12_mcda_ahp_topsis');
const {SCIENTIFIC_CROP_PROFILES,computeCropSeasonSuitability}=require('../src/algorithms/11_crop_suitability_fuzzy_ecocrop');
test('Experimental clustering and forest reproduce results with a fixed seed',()=>{
  const data=[[1,2],[2,3],[50,55],[51,54]];
  assert.deepEqual(runKMeansPlusPlus(data,2,10,7),runKMeansPlusPlus(data,2,10,7));
  const a=createSyntheticCropDataset('Rice',7),b=createSyntheticCropDataset('Rice',7);
  assert.deepEqual(a,b);assert.equal(a.metadata.status,'synthetic');
  const rf1=new AgroRandomForestClassifier(3,2,{seed:7}),rf2=new AgroRandomForestClassifier(3,2,{seed:7});
  rf1.fit(a.X,a.y);rf2.fit(b.X,b.y);
  const p=rf1.predictViability(a.X[0]);assert.deepEqual(p,rf2.predictViability(b.X[0]));
  assert.equal(p.experimental,true);assert.equal(p.recommendation_allowed,false);
});
test('Validation metrics reject missing/infinite values instead of treating null as zero',()=>{
  for(const metric of [calculateMAE,calculateRMSE]) {
    assert.throws(()=>metric([null],[1]),/valid number/);assert.throws(()=>metric([Infinity],[1]),/valid number/);
  }
});
test('Slider weights are exactly normalized; pairwise AHP remains a separate operation',()=>{
  for(const values of [[0,0,0],[0,1,0],[1,2,7]]) {
    const r=deriveAHPWeightsFromPreferences(values);assert.ok(Math.abs(r.weights.reduce((a,b)=>a+b)-1)<1e-12);
    assert.equal(r.pairwise_elicited,false);assert.equal(r.consistency_ratio,null);
  }
  assert.equal(solveAHPWeights([[1,2],[.5,1]]).consistency_ratio,0);
  assert.throws(()=>solveAHPWeights([[1,2],[1,1]]),/reciprocal/);
});
test('Crop thresholds disclose unverified origin, units and scope; extreme heat and missing inputs are handled',()=>{
  for(const p of Object.values(SCIENTIFIC_CROP_PROFILES)) {
    assert.equal(p.validation_status,'experimental_unvalidated');
    assert.equal(p.parameter_provenance.soil_moisture_limits.verified,false);
    assert.match(p.parameter_provenance.rain_limits.unit,/four-month/);
  }
  assert.throws(()=>computeCropSeasonSuitability('Rice',{tempAvg:null}),/Missing/);
  assert.equal(computeCropSeasonSuitability('Rice',{tempAvg:50,rainSeasonAccum:500,soilMoistureAvg:.7,maxTs:55}).is_lethal,true);
});
