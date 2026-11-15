// Real Chrome + Leaflet/Chart.js, controlled local climate and optional-API outage.
// Does not exercise NASA/third-party availability or change production data.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawn}=require("node:child_process");
const assert=require("node:assert/strict"),express=require("express");
const {createApiRouter}=require("../src/routes/api");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const fixture=require("../tests/fixtures/climates.json")[0];
  const app=express();app.use(express.json());app.use("/api",createApiRouter({
    climateProvider:async()=>({...fixture,T2M:Array(12).fill(25),TS:Array(12).fill(28),T2M_MIN:Array(12).fill(8),_mock:false,_raw_catalog:{},source_status:"climatology"}),
    coldHistoryProvider:async()=>({status:"unavailable",records:[]}),historyProvider:async()=>({status:"unavailable",records:[]}),
    elevationProvider:async()=>({status:"dem",value:100}),externalProvider:async()=>({ok:false,source:"fallback",data:{}})}));
  app.use(express.static(path.join(__dirname,"../public")));
  const server=await new Promise(resolve=>{const server=app.listen(0,"127.0.0.1",()=>resolve(server));});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"farmshift-feature-browser-"));
  const chrome=spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",[
    "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"
  ],{windowsHide:true,stdio:"ignore"});
  let socket,closed=false,launchError;
  chrome.on("error",error=>{launchError=error;});chrome.on("exit",()=>{closed=true;});
  try{
    const portFile=path.join(profile,"DevToolsActivePort");
    for(let i=0;i<100 && !fs.existsSync(portFile) && !launchError;i++)await pause(100);
    if(launchError)throw launchError;
    if(!fs.existsSync(portFile))throw Error("Chrome did not open its debugging port");
    const port=Number(fs.readFileSync(portFile,"utf8").split("\n")[0]);
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket=new WebSocket(targets.find(target=>target.type==="page").webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const pending=new Map(),exceptions=[];let sequence=0;
    socket.onmessage=event=>{const message=JSON.parse(event.data);
      if(message.method==="Runtime.exceptionThrown")exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if(pending.has(message.id)){const {resolve,reject,timer}=pending.get(message.id);pending.delete(message.id);clearTimeout(timer);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);}};
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout: "+method));},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);return result.result.value;};
    const until=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error("Browser condition timed out: "+expression);};
    await call("Runtime.enable");await call("Page.enable");
    await call("Emulation.setDeviceMetricsOverride",{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await call("Page.navigate",{url:`http://127.0.0.1:${server.address().port}`});
    await until('typeof CropRecommendations!=="undefined" && typeof GlobalTradeFlows!=="undefined" && document.getElementById("crop-ranking-body").children.length===5');
    assert.equal(await evaluate('document.getElementById("match-score").textContent'),"-%");
    await evaluate('runAnalysis()');
    assert.match(await evaluate('document.getElementById("match-score").textContent'),/^\d+%$/);
    const score=await evaluate('document.getElementById("match-score").textContent');
    const optionalStatus=await evaluate('document.getElementById("ext-api-status").textContent');assert.match(optionalStatus,/Nội bộ/);
    await evaluate('void map.fire("mousemove",{latlng:L.latLng(20.45,106.33)})');
    await until('document.getElementById("crop-ranking-status").textContent.includes("20.450") && document.getElementById("crop-ranking-body").children.length===5');
    const trade=await evaluate('(async()=>{CropRecommendations.cancel(); const start=performance.now();await GlobalTradeFlows.enable();await new Promise(resolve=>{const next=()=>GlobalTradeFlows.drawFrame?requestAnimationFrame(next):resolve();next();});return {elapsed_ms:Math.round(performance.now()-start),renderer:GlobalTradeFlows.renderer instanceof L.Canvas,paths:GlobalTradeFlows.routeLayer.getLayers().length,canvases:document.querySelectorAll("canvas.leaflet-zoom-animated").length,svgPaths:document.querySelectorAll(".route-line-sea,.route-line-air").length};})()');
    assert.equal(trade.renderer,true);assert.ok(trade.paths>0);assert.equal(trade.svgPaths,0);
    const tradeShot=await call("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(__dirname,"../docs/browser-trade-canvas.png"),Buffer.from(tradeShot.data,"base64"));
    await evaluate('(async()=>{document.getElementById("trade-animation").checked=true;GlobalTradeFlows.refresh();while(GlobalTradeFlows.drawFrame)await new Promise(resolve=>requestAnimationFrame(resolve));})()');
    assert.equal(await evaluate('GlobalTradeFlows.renderer instanceof L.SVG'),true);
    await evaluate('(async()=>{document.getElementById("trade-animation").checked=false;GlobalTradeFlows.refresh();while(GlobalTradeFlows.drawFrame)await new Promise(resolve=>requestAnimationFrame(resolve));})()');
    assert.equal(await evaluate('GlobalTradeFlows.renderer instanceof L.Canvas'),true);
    await evaluate('document.getElementById("trade-land").checked=true;GlobalTradeFlows.refresh()');
    await pause(200);
    await evaluate('GlobalTradeFlows.disable()');
    assert.equal(await evaluate('GlobalTradeFlows.drawFrame===null && GlobalTradeFlows.routeLayer===null'),true);
    assert.deepEqual(exceptions,[]);
    const shot=await call("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(__dirname,"../docs/browser-seasonal-features.png"),Buffer.from(shot.data,"base64"));
    console.log(JSON.stringify({browser:"Headless Chrome, real Leaflet and Chart.js",climate:"controlled fixture",score,optionalStatus,hoverRows:5,trade,exceptions}));
  }finally{
    if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:999999,method:"Browser.close"}));await pause(500);socket.close();}
    if(!closed)chrome.kill();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error.stack || error);process.exitCode=1;});
