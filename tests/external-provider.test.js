const test=require("node:test"),assert=require("node:assert/strict");
const {fetchExternalData}=require("../src/services/external");
const data={T2M:Array(12).fill(25),PRECTOTCORR:Array(12).fill(100)};
test("optional crop providers only report Live for successful, finite score responses",async t=>{
  const previous=global.fetch;t.after(()=>{global.fetch=previous;});
  global.fetch=async()=>({ok:false,json:async()=>({suitability:90,score:90})});
  const failed=await fetchExternalData(11.1234,106.1234,data,["Rice"]);
  assert.equal(failed.ok,false);assert.equal(failed.data.Rice.source,"fallback");
  global.fetch=async()=>({ok:true,json:async()=>({suitability:200,score:"99"})});
  assert.equal((await fetchExternalData(11.1235,106.1234,data,["Rice"])).ok,false);
  let calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>({suitability:70})};};
  const live=await fetchExternalData(11.1236,106.1234,data,["Rice"]);
  assert.equal(live.ok,true);assert.equal(live.data.Rice.suitability,.7);
  await fetchExternalData(11.1236,106.1234,data,["Rice"]);assert.equal(calls,2);
  const expanded=await fetchExternalData(11.1236,106.1234,data,["Rice","Maize"]);
  assert.equal(expanded.data.Maize.suitability,.7);assert.equal(calls,6);
});
