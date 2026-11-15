const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const TradeCore=require("../public/js/trade-core");
function browser(fetch=async()=>({ok:false})) {
  const frames=new Map(),timers=new Map(),lines=[],elements=new Map();let sequence=0,canvasCount=0;
  const el=id=>{if(!elements.has(id))elements.set(id,{value:"",checked:false,textContent:"",innerHTML:"",style:{},classList:{add(){},remove(){}},addEventListener(){}});return elements.get(id);};
  el("trade-crop").value="all";el("trade-sea").checked=true;el("trade-air").checked=true;el("trade-topn").value="12";
  const group=()=>({layers:[],clearLayers(){this.layers=[];}});
  const context=vm.createContext({window:{TradeCore},TradeCore,console,AbortSignal,fetch,document:{getElementById:el,addEventListener(){}},
    requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    map:{hasLayer:()=>false,removeLayer(){}},L:{canvas:()=>{canvasCount++;return {type:"canvas"};},svg:()=>({type:"svg"}),
      polyline:(points,options)=>{const line={points,options,updated:false,addTo(g){g.layers.push(this);return this;},bindTooltip(){return this;},setLatLngs(){this.updated=true;},setTooltipContent(){}};lines.push(line);return line;},
      circleMarker:()=>({addTo:()=>({bindTooltip(){}})})}});
  context.flows=require("../public/data/trade-flows.json");context.hubs=require("../public/data/trade-hubs.json").hubs;
  context.routes=group();context.hubGroup=group();
  vm.runInContext(fs.readFileSync("public/js/trade.js","utf8"),context);
  vm.runInContext("GlobalTradeFlows.on=true;GlobalTradeFlows.flowsData=flows;GlobalTradeFlows.hubsData=hubs;GlobalTradeFlows.routeLayer=routes;GlobalTradeFlows.hubLayer=hubGroup",context);
  return {context,el,frames,timers,lines,canvasCount:()=>canvasCount,
    flush(){let count=0;while(frames.size){assert.ok(count++<200);const [id,fn]=frames.entries().next().value;frames.delete(id);fn();}}};
}
test("global trade paints in bounded batches with shared Canvas and reuses geometry",()=>{
  const b=browser();let calls=0;
  b.context.TradeCore={...TradeCore,pathFor(...args){calls++;return TradeCore.pathFor(...args);}};
  vm.runInContext("GlobalTradeFlows.refresh()",b.context);
  assert.equal(b.lines.length,0);assert.equal(b.frames.size,1);
  const [id,frame]=b.frames.entries().next().value;b.frames.delete(id);frame();
  assert.ok(b.lines.length<=36);b.flush();assert.ok(b.lines.length>36);
  assert.ok(b.lines.every(line=>line.options.renderer.type==="canvas"));assert.equal(b.canvasCount(),2);
  const count=calls;vm.runInContext("GlobalTradeFlows.refresh()",b.context);b.flush();assert.equal(calls,count);
  b.el("trade-animation").checked=true;vm.runInContext("GlobalTradeFlows.refresh()",b.context);b.flush();
  assert.equal(b.lines.at(-1).options.renderer.type,"svg");
  vm.runInContext("GlobalTradeFlows.refresh();GlobalTradeFlows.disable()",b.context);assert.equal(b.frames.size,0);
});
test("OSRM requests are deduplicated and limited to four concurrent fetches",async()=>{
  let active=0,maximum=0,calls=0;const pending=[];
  const b=browser(async()=>{calls++;active++;maximum=Math.max(maximum,active);await new Promise(resolve=>pending.push(()=>{active--;resolve();}));return {ok:false,status:503};});
  const duplicate=vm.runInContext("Promise.all([fetchGroundRoute(10,105,11,106),fetchGroundRoute(10,105,11,106)])",b.context);
  assert.equal(calls,1);pending.shift()();await duplicate;
  const tasks=vm.runInContext("Promise.all(Array.from({length:10},(_,i)=>fetchGroundRoute(20+i,100,21+i,101)))",b.context);
  assert.equal(maximum,4);
  while(pending.length || active){const batch=pending.splice(0);batch.forEach(resolve=>resolve());await new Promise(resolve=>setImmediate(resolve));}
  await tasks;assert.equal(maximum,4);assert.equal(calls,11);
  await vm.runInContext("fetchGroundRoute(10,105,11,106)",b.context);assert.equal(calls,11);
});

test("queued ground routes from an obsolete selection stop before making network requests",async()=>{
  let calls=0;const pending=[];
  const b=browser(async()=>{calls++;await new Promise(resolve=>pending.push(resolve));return {ok:false,status:503};});
  b.context.current=true;
  const result=vm.runInContext("Promise.all(Array.from({length:8},(_,i)=>fetchGroundRoute(30+i,100,31+i,101,()=>current)))",b.context);
  assert.equal(calls,4);b.context.current=false;pending.splice(0).forEach(resolve=>resolve());await result;
  assert.equal(calls,4);
});
