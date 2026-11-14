let analysisInFlight = false;
// ─── Loading Steps ─────────────────────────────────────────────────────────────
const LOAD_STEPS = [
  "🌊 Verifying farm location & terrain boundaries…",
  "📡 Connecting to NASA POWER Agroclimatology API…",
  "💧 Loading MERRA-2 Catchment soil wetness…",
  "🌧️ Processing POWER corrected precipitation…",
  "🌡️ Computing surface thermal skin index (TS)…",
  "🌿 Deriving biophysical vegetation proxy (NDVI/ESI)…",
  "⚛️ Initializing Statevector QAOA simulator…",
  "🔮 Running experimental QAOA simulation & exact classical comparison…",
  "📊 Scoring rotation strategies with TOPSIS…",
];
let stepIdx = 0, stepTimer = null;
function startLoadingSteps(title) {
  stepIdx = 0;
  document.getElementById("loading-title").textContent = title || "KỊCH BẢN LẬP KẾ HOẠCH ĐANG CHẠY…";
  document.getElementById("loading-step").textContent = LOAD_STEPS[0];
  stepTimer = setInterval(() => {
    stepIdx = (stepIdx + 1) % LOAD_STEPS.length;
    document.getElementById("loading-step").textContent = LOAD_STEPS[stepIdx];
  }, 900);
}
function stopLoadingSteps() { if (stepTimer) clearInterval(stepTimer); }

// ─── Hàm Reset Giao Diện Khi Click Ra Biển Hoặc Băng Tuyết ───────────────────
function resetDashboardUI() {
  if(typeof setAnalysisMessage==='function')setAnalysisMessage('');
  for(const id of ['source-reason','solver-details']){
    const el=document.getElementById(id);if(el)el.textContent='';
  }
  for(const id of ['cold-risk-summary','terrain-summary']){
    const el=document.getElementById(id);if(el){el.textContent='Chưa có dữ liệu.';el.title='';}
  }
  for(const id of ['cold-risk-months','user-season-risks','q-season-risks']){
    const el=document.getElementById(id);if(el)el.innerHTML='';
  }
  chartTemp = destroyChart(chartTemp); chartRain = destroyChart(chartRain);
  chartNdvi = destroyChart(chartNdvi); chartRadar = destroyChart(chartRadar);
  const matchScore = document.getElementById("match-score");
  if (matchScore) matchScore.textContent = "-%";

  const matchDesc = document.getElementById("match-desc");
  if (matchDesc) matchDesc.textContent = "-";

  const userTags = document.getElementById("user-tags");
  if (userTags) userTags.innerHTML = "-";

  const userRank = document.getElementById("user-rank");
  if (userRank) {
    userRank.textContent = "RANK -";
    userRank.className = "rank-chip";
  }

  const qTags = document.getElementById("q-tags");
  if (qTags) qTags.innerHTML = "-";

  const qRank = document.getElementById("q-rank");
  if (qRank) {
    qRank.textContent = "RANK -";
    qRank.className = "rank-chip";
  }

  const qMethod = document.getElementById("q-method");
  if (qMethod) qMethod.textContent = "-";

  const resetHPBar = (id, title) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px; opacity:0.6;">
          <span>${title}</span>
          <span style="font-weight:bold;">-%</span>
        </div>
        <div style="width:100%; background:rgba(255,255,255,0.1); border-radius:4px; height:6px; overflow:hidden;">
          <div style="width:0%; background:#7f8c8d; height:100%;"></div>
        </div>
      `;
    }
  };

  resetHPBar("user-hp-soil", "Điểm đất (heuristic)");
  resetHPBar("user-hp-water", "Điểm nước (heuristic)");
  resetHPBar("user-hp-profit", "Điểm lợi ích (heuristic)");

  resetHPBar("q-hp-soil", "Điểm đất (heuristic)");
  resetHPBar("q-hp-water", "Điểm nước (heuristic)");
  resetHPBar("q-hp-profit", "Điểm lợi ích (heuristic)");

  const alertsWrap = document.getElementById("alerts-wrap");
  if (alertsWrap) alertsWrap.style.display = "none";
  const alertsList = document.getElementById("alerts-list");
  if (alertsList) alertsList.innerHTML = "";

  const satIds = [
    "sv-temp", "sv-temp-rng", "sv-gwet", "sv-gwet-sub",
    "sv-rain", "sv-rain-sub", "sv-ts", "sv-esi", "sv-ndvi", "sv-ndvi-sub"
  ];
  satIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "-";
  });

  const sourceBadge = document.getElementById("data-source-badge");
  if (sourceBadge) { sourceBadge.textContent = "Source: -"; sourceBadge.title = ""; }
  for(const row of document.querySelectorAll('.sat-row')){
    const desc=row.querySelector('.sat-desc');if(desc)desc.textContent='Chưa có dữ liệu tại điểm chọn.';
    row.title='';
  }
}

// ─── Main Analysis Call ────────────────────────────────────────────────────────
async function runAnalysis() {
  if(analysisInFlight)return;
  const value=id=>document.getElementById(id)?.value ?? '';
  const latText=value('inp-lat').trim(),lonText=value('inp-lon').trim();
  const inputLat=Number(latText),inputLon=Number(lonText);
  if(!latText || !lonText || !Number.isFinite(inputLat) || !Number.isFinite(inputLon) || Math.abs(inputLat)>90 || Math.abs(inputLon)>180){
    alert('Vui lòng nhập vĩ độ [-90,90] và kinh độ [-180,180] hợp lệ.');return;
  }
  const lat=Number(inputLat.toFixed(4)),lon=Number(inputLon.toFixed(4));
  farmLat=lat;farmLon=lon;placeMarker(lat,lon);
  map.flyTo([lat,lon],Math.max(map.getZoom(),7),{duration:.8});
  const geo=typeof cachedLocation==='function'?cachedLocation(lat,lon):null;
  if(geo?.is_water || geo?.is_ice || geo?.requires_verification){
    resetDashboardUI();
    if(geo.is_ice && typeof showIceAlert==='function')showIceAlert(geo.message);
    else if(geo.requires_verification && typeof showCoastalAlert==='function')showCoastalAlert(geo.message);
    else if(typeof showWaterAlert==='function')showWaterAlert(geo.message);
    if(typeof setAnalysisMessage==='function')setAnalysisMessage(geo.message);
    return;
  }
  const inputs=['inp-lat','inp-lon','sl-soil','sl-water','sl-profit','crop-s1','crop-s2','crop-s3'];
  const snapshot=inputs.map(value);
  const selection=typeof locationSelection==='number'?locationSelection:null;
  const current=()=>inputs.every((id,i)=>value(id)===snapshot[i]) && farmLat===lat && farmLon===lon &&
    (selection===null || selection===locationSelection);
  const payload={lat,lon,w_soil:Number(value('sl-soil')),w_water:Number(value('sl-water')),w_profit:Number(value('sl-profit')),
    user_crops:['crop-s1','crop-s2','crop-s3'].map(value)};
  analysisInFlight=true;
  const controller=typeof AbortController==='function'?new AbortController():null;
  let timedOut=false,deadline;
  try{
    resetDashboardUI();
    document.getElementById('loading')?.classList.add('show');
    const button=document.getElementById('btn-run');if(button)button.disabled=true;
    startLoadingSteps();
    if(typeof closeWaterAlert==='function')closeWaterAlert();
    deadline=setTimeout(()=>{timedOut=true;controller?.abort();},60000);
    const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),...(controller?{signal:controller.signal}:{})});
    const data=await response.json();
    if(!current()){
      document.getElementById('match-desc').textContent='Vị trí hoặc lựa chọn đã thay đổi; hãy phân tích lại.';return;
    }
    if(!data || typeof data!=='object')throw new Error('Phản hồi API không hợp lệ.');
    if(data.ok && (data.contract_version!=='terrain-v2-objective-v5' || !data.objective_version || !data.scenarios?.classical))
      throw new Error(typeof RESTART_MESSAGE==='string'?RESTART_MESSAGE:'Backend đang chạy phiên bản cũ. Dừng server bằng Ctrl+C, chạy lại npm start rồi nhấn Ctrl+F5.');
    if(data.ok && response.ok!==false){if(typeof updateUI==='function')updateUI(data);}
    else{
      resetDashboardUI();
      document.getElementById('data-source-badge').textContent='Source: '+(data.source || 'Nguồn chưa khả dụng')+' · '+(data.data_mode || data.source_status || 'unavailable')+' · Không có khuyến nghị';
      document.getElementById('match-desc').textContent=data.error || data.reason || 'Không có đủ dữ liệu.';
      if(typeof renderColdRisk==='function')renderColdRisk(data);
      if(typeof renderAlerts==='function')renderAlerts(data.alerts || []);
      const reason=document.getElementById('source-reason');if(reason)reason.textContent=data.reason || '';
      const terrainMessage=data.terrain?.high_elevation?' Địa hình cao khoảng '+Math.round(data.terrain.site_elevation_m)+' m; cần kiểm tra rét và tuyết tại điểm.':'';
      if(typeof setAnalysisMessage==='function')setAnalysisMessage((data.error || 'Không có đủ dữ liệu.')+terrainMessage);
      if(data.is_ice && typeof showIceAlert==='function')showIceAlert(data.error);
      else if(data.is_water && typeof showWaterAlert==='function')showWaterAlert(data.error);
      else if(data.location?.requires_verification && typeof showCoastalAlert==='function')showCoastalAlert(data.error);
    }
  }catch(error){
    if(!current())return;
    resetDashboardUI();document.getElementById('data-source-badge').textContent='Source: unavailable';
    const message=timedOut?'Phân tích quá thời gian chờ 60 giây; vui lòng thử lại.':'Không thể tải phân tích: '+error.message;
    document.getElementById('match-desc').textContent=message;
    if(typeof setAnalysisMessage==='function')setAnalysisMessage(message);
  }finally{
    if(typeof clearTimeout==='function')clearTimeout(deadline);
    stopLoadingSteps();document.getElementById('loading')?.classList.remove('show');
    const button=document.getElementById('btn-run');if(button)button.disabled=false;
    analysisInFlight=false;
  }
}

// Enter key on main page (not inside inputs) triggers analysis
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && !["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName)) {
    e.preventDefault();
    runAnalysis();
  }
});
