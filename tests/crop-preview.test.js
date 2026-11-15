const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
function browser() {
  const elements=new Map(),events={},timers=new Map();let sequence=0;
  const el=id=>{if(!elements.has(id))elements.set(id,{textContent:"",innerHTML:"",checked:true,addEventListener(){}});return elements.get(id);};
  const context=vm.createContext({AbortController,console,farmLat:10.04,farmLon:105.78,
    document:{getElementById:el},map:{on(name,fn){events[name]=fn;}},
    setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync("public/js/crop-recommendations.js","utf8"),context);
  vm.runInContext("CropRecommendations.cancel();CropRecommendations.activeKey=null",context);
  return {context,el,events,timers,run:code=>vm.runInContext(code,context),timer(ms){const [id,timer]=[...timers].find(([,timer])=>timer.ms===ms);timers.delete(id);return timer.fn();}};
}
const response=(lat,label="Rice")=>({ok:true,json:async()=>({ok:true,coords:{lat,lon:105},crop_rankings:{status:"available",note:"Relative score",rows:[{rank:1,label,score_pct:70,months:[5,6,7,8]}]}})});

test("table sorts untrusted row order by precise score, numbers ranks again and preserves input",()=>{
  const b=browser();
  const rows=[{crop:"Rice",label:"Rice",rank:1,raw_score_pct:80.1,score_pct:80},
    {crop:"Maize",label:"Maize",rank:2,raw_score_pct:99.6,score_pct:100},
    {crop:"Peanut",label:"Peanut",rank:3,raw_score_pct:80.4,score_pct:80},
    {crop:"Unknown",label:"Unknown",score_pct:null}];
  b.context.result={status:"available",rows};
  b.run("CropRecommendations.render(result,{lat:10,lon:105})");
  const html=b.el("crop-ranking-body").innerHTML;
  assert.match(html,/<td>1<\/td><td>Maize/);
  assert.ok(html.indexOf("Maize")<html.indexOf("Peanut") && html.indexOf("Peanut")<html.indexOf("Rice"));
  assert.ok(html.indexOf("Rice")<html.indexOf("Unknown"));
  assert.match(html,/99\.6%/);assert.doesNotMatch(html,/100\.0%/);assert.match(html,/-\%/);
  assert.deepEqual(rows.map(row=>row.crop),["Rice","Maize","Peanut","Unknown"]);
});
test("pointer debounce keeps one request and stale responses never replace the latest region",async()=>{
  const b=browser(),pending=[];let calls=0;
  b.context.fetch=async(url,options)=>{calls++;return new Promise(resolve=>pending.push({resolve,options,url}));};
  for(let lat=10;lat<15;lat++)b.run(`CropRecommendations.schedule(${lat},105,true)`);
  assert.equal(b.timers.size,1);const first=b.timer(900);assert.equal(calls,1);
  b.run("CropRecommendations.schedule(20,105,true)");const second=b.timer(900);assert.equal(calls,2);
  assert.equal(pending[0].options.signal.aborted,true);
  pending[1].resolve(response(20));await second;
  pending[0].resolve(response(14,"old region"));await first;
  assert.match(b.el("crop-ranking-status").textContent,/20.000/);assert.doesNotMatch(b.el("crop-ranking-body").innerHTML,/old region/);
  b.run("CropRecommendations.activeKey=null;CropRecommendations.schedule(20,105,true)");await b.timer(900);assert.equal(calls,2);
});
test("selected-point preview survives pointer exit, escapes table labels and retries after map movement",async()=>{
  const b=browser();b.context.fetch=async()=>response(10,"<img src=x onerror=alert(1)>");
  b.run("CropRecommendations.select(10,105)");b.events.mouseout();await b.timer(250);
  assert.match(b.el("crop-ranking-body").innerHTML,/&lt;img/);assert.doesNotMatch(b.el("crop-ranking-body").innerHTML,/<img/);
  b.events.movestart();b.events.moveend();assert.ok([...b.timers.values()].some(timer=>timer.ms===250));
  b.events.movestart();b.run("CropRecommendations.schedule(15,105,true)");b.events.moveend();
  assert.equal(b.run("CropRecommendations.activeKey"),"15,105");
  assert.ok([...b.timers.values()].some(timer=>timer.ms===900));
  b.run("CropRecommendations.cancel()");b.el("crop-ranking-hover").checked=false;
  b.run("CropRecommendations.schedule(15,105,true)");assert.equal(b.timers.size,0);
});
