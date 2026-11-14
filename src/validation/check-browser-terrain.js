// Explicit headless Chrome smoke check of the real map and local server. No extra packages.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'farmshift-browser-'));
  const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{windowsHide:true,stdio:'ignore'});
  let socket;
  try{
    chrome.on('error',e=>{throw e;});
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;!fs.existsSync(portFile) && i<100;i++)await pause(100);
    if(!fs.existsSync(portFile))throw Error('Chrome did not open a debugging port');
    const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
    const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let sequence=0;const pending=new Map(),exceptions=[];
    socket.onmessage=event=>{
      const message=JSON.parse(event.data);
      if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text+': '+(message.params.exceptionDetails.exception?.description || ''));
      if(message.id && pending.has(message.id)){
        const {resolve,reject,timer}=pending.get(message.id);pending.delete(message.id);clearTimeout(timer);
        if(message.error)reject(Error(JSON.stringify(message.error)));else resolve(message.result);
      }
    };
    function call(method,params={}){return new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},70000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });}
    async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result.value;}
    async function until(expression){for(let i=0;i<150;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Browser condition timed out: '+expression);}
    await call('Runtime.enable');await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:process.env.FARMSHIFT_URL || 'http://localhost:3000'});
    await until('typeof runAnalysis==="function" && typeof map!=="undefined" && typeof map.fire==="function"');
    const sourceInHeader=await evaluate('!!document.querySelector("header #data-source-badge")');assert.equal(sourceInHeader,false);
    const results=[];
    for(const [name,lat,lon,word] of [['greenland-sea',74.2174,7.5411,'biển'],['mont-blanc',45.8326,6.8652,'sông băng'],['matterhorn',45.9763,7.6586,'sông băng'],['jungfrau',46.5368,7.9626,'sông băng']]){
      await evaluate(`void map.setView([${lat},${lon}],9,{animate:false})`);
      await evaluate(`void map.fire('click',{latlng:L.latLng(${lat},${lon})})`);
      await until('document.getElementById("water-alert").classList.contains("show")');
      const message=await evaluate('document.querySelector(".water-alert-desc").textContent');assert.ok(message.includes(word));
      await evaluate('runAnalysis()');
      assert.equal(await evaluate('document.getElementById("loading").classList.contains("show")'),false);
      results.push({name,message});
      if(name==='greenland-sea' || name==='mont-blanc'){
        await pause(1000);
        const shot=await call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(__dirname,'browser-'+name+'.png'),Buffer.from(shot.data,'base64'));
      }
    }
    await evaluate("void map.fire('click',{latlng:L.latLng(13.7532,101.6945)})");
    await until('document.getElementById("analysis-message").hidden');
    await evaluate('runAnalysis()');
    const planning=await evaluate('({score:document.getElementById("match-score").textContent,error:document.getElementById("analysis-message").textContent,source:document.getElementById("data-source-badge").textContent,loading:document.getElementById("loading").classList.contains("show")})');
    assert.equal(planning.loading,false);assert.match(planning.score,/\/ 100/);assert.equal(planning.error,'');
    await until('document.getElementById("tab-arena").classList.contains("active")');
    const sourceBox=await evaluate('({header:document.querySelector("header").getBoundingClientRect().height,detailsOpen:document.getElementById("data-details").open})');
    results.push({name:'Thailand real NASA analysis',...planning,...sourceBox});
    const shot=await call('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(__dirname,'browser-thailand.png'),Buffer.from(shot.data,'base64'));
    assert.deepEqual(exceptions,[]);
    const report={checked_at:new Date().toISOString(),browser:'Headless Chrome / real Leaflet map',exceptions,results};
    fs.writeFileSync(path.join(__dirname,'browser-terrain-check.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:results.map(r=>r.name),planning,exceptions}));
  }finally{socket?.close();chrome.kill();}
}
main().catch(e=>{console.error(e.stack || e.message);process.exitCode=1;});
