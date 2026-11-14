function renderColdRisk(data) {
  const terrain=data.terrain,risk=data.cold_risk;
  const terrainEl=document.getElementById('terrain-summary');
  if(terrainEl){
    terrainEl.textContent=terrain?.site_elevation_m!==null && terrain?.site_elevation_m!==undefined
      ? `SRTM: ${Math.round(terrain.site_elevation_m)} m${terrain.high_elevation?' · Địa hình cao':''}`
      : 'Độ cao tại điểm: chưa có dữ liệu DEM.';
    if(terrain?.grid_elevation_m!==null && terrain?.grid_elevation_m!==undefined)terrainEl.textContent+=` · Ô NASA POWER: ${Math.round(terrain.grid_elevation_m)} m`;
    if(terrain?.climate_representativeness==='limited_by_elevation_difference')terrainEl.textContent+=' · Chênh độ cao lớn: nhiệt độ lưới có thể chưa đại diện tại ruộng.';
    terrainEl.title=JSON.stringify(terrain || {},null,2);
  }
  const summary=document.getElementById('cold-risk-summary');
  if(summary){
    summary.textContent=risk ? (risk.frost_months.length ? `Nguy cơ rét dưới 0°C: ${risk.frost_months.map(m=>'T'+m).join(', ')}.`
      : risk.status==='unavailable' ? 'Chưa đủ dữ liệu nhiệt độ tối thiểu để đánh giá rét.'
      : 'Không phát hiện dưới 0°C trong dữ liệu đã tải; chưa bảo đảm không có sương giá tại ruộng.') : 'Chưa đánh giá rét.';
    if(risk?.period)summary.textContent+=` Thời kỳ ${risk.daily_history?.status!=='unavailable'?'lịch sử ngày':'khí hậu'}: ${risk.period.start} – ${risk.period.end}.`;
    summary.textContent+=' Đây là dữ liệu lịch sử/khí hậu, không phải dự báo hoặc xác nhận cây đã chết.';
    summary.textContent+=' Mô hình sàng lọc cây ngoài trời không bảo vệ trong toàn bộ vụ 4 tháng; có thể cần đổi lịch gieo hoặc giống sau kiểm tra tại ruộng.';
  }
  const monthList=document.getElementById('cold-risk-months');
  if(monthList){
    monthList.innerHTML='';
    for(const m of risk?.months || []){
      const row=document.createElement('div');
      const minimum=m.daily?.minimum_tmin_c ?? m.climatology_tmin_c;
      row.className='cold-month '+(m.frost_risk==='detected'?'cold-detected':'');
      row.textContent=`T${m.month}: TB ${m.mean_temperature_c ?? 'N/A'}°C · ${m.daily?.minimum_tmin_c!==null && m.daily?.minimum_tmin_c!==undefined ? 'Tmin lịch sử' : 'Tmin khí hậu'} ${minimum ?? 'N/A'}°C`;
      if(m.daily?.freezing_days)row.textContent+=` · ${m.daily.freezing_days} ngày dưới 0°C · thấp nhất ${m.daily.coldest_date}`;
      else if(m.frost_risk==='unknown')row.textContent+=' · chưa đủ dữ liệu rét';
      if(m.daily?.status==='partial')row.textContent+=` · thiếu ${m.daily.missing_days}/${m.daily.expected_days} ngày`;
      monthList.appendChild(row);
    }
  }
  for(const [key,id] of [['user','user-season-risks'],['quantum','q-season-risks']]){
    const container=document.getElementById(id);if(!container)continue;container.innerHTML='';
    for(const season of data.scenarios?.[key]?.season_results || []){
      const row=document.createElement('div');row.className='season-risk';
      const riskMonths=season.cold_risk?.frost_months || [];
      row.textContent=`Vụ ${season.season} (${season.months.map(m=>'T'+m).join('–')}): `+
        (riskMonths.length && season.crop!=='Fallow' ? season.reason
          : season.is_lethal ? season.reason : season.crop==='Fallow' ? 'Nghỉ đất.'
          : season.cold_risk?.status==='unknown' ? 'Chưa đủ dữ liệu nhiệt độ thấp; cần kiểm tra rét tại ruộng.' : 'Không phát hiện rét trong dữ liệu đã tải; chưa phải bảo đảm an toàn.');
      container.appendChild(row);
    }
  }
}

function renderAlerts(alerts) {
  const list=document.getElementById('alerts-list');
  if(!list)return;
  list.innerHTML='';
  for(const alert of alerts){
    const level=alert?.level || 'warning';
    const box=document.createElement('div');
    box.className='alert-box '+(level==='danger'?'alert-danger':level==='warning'?'alert-warning':'alert-ok');
    box.textContent=typeof alert==='object'?alert.msg:String(alert);list.appendChild(box);
  }
  const wrap=document.getElementById('alerts-wrap');if(wrap)wrap.style.display=alerts.length?'block':'none';
}

// ─── Update UI ────────────────────────────────────────────────────────────────
function updateUI(data) {
  const label=document.querySelector?.('.match-score-label');
  if(label)label.textContent='Điểm tương đồng phương án (heuristic)';
  const title=document.querySelector?.('.quantum-block .arena-label');
  if(title)title.textContent='Classical Exact & QAOA simulated · thử nghiệm';
  const blocked=data?.recommendation_allowed===false;
  const complete=data?.monthly && typeof data.monthly==='object' &&
    ['POWER','SMAP','GPM','ECOSTRESS','MODIS'].every(key=>data?.satellite?.[key]) &&
    ['user','quantum','baseline'].every(key=>Number.isFinite(data?.scenarios?.[key]?.overall));
  if(blocked || !complete){
    if(typeof resetDashboardUI==='function')resetDashboardUI();
    const badge=document.getElementById('data-source-badge');
    if(badge)badge.textContent='Source: '+(data?.source || 'Nguồn chưa khả dụng')+' · '+(data?.data_mode || data?.source_status || 'unavailable')+' · Không có khuyến nghị';
    const desc=document.getElementById('match-desc');
    if(desc)desc.textContent=data?.error || data?.reason || data?.similarity?.reason || data?.match_desc || data?.recommendation_status || 'Payload thiếu dữ liệu; không hiển thị điểm/biểu đồ.';
    if(typeof renderColdRisk==='function' && data)renderColdRisk({...data,scenarios:null});
    renderAlerts(data?.alerts || []);
    const terrainMessage=data?.terrain?.high_elevation?' Địa hình cao khoảng '+Math.round(data.terrain.site_elevation_m)+' m.':'';
    if(typeof setAnalysisMessage==='function')setAnalysisMessage((desc?.textContent || '')+terrainMessage);
    return;
  }
  const sat = data.satellite;
  const sc  = data.scenarios;
  renderColdRisk(data);

  document.getElementById("data-source-badge").textContent = "Source: " + data.source;

  const sourceBadge = document.getElementById('data-source-badge');
  sourceBadge.textContent += ' · ' + (data.data_mode || data.source_status) + ' · KỊCH BẢN LẬP KẾ HOẠCH, KHÔNG PHẢI DỰ BÁO / CHỈ DẪN TẠI RUỘNG · SPI ' + (data.spi?.status || 'unavailable');
  if(data.recommendation_allowed===false)sourceBadge.textContent+=' · Chỉ xem theo ô khí hậu; chưa đủ cơ sở khuyến nghị tại ruộng';
  sourceBadge.title = JSON.stringify({provenance:data.provenance,spi:data.spi?.reason,limitations:data.limitations},null,2);
  const rows = document.querySelectorAll('.sat-row');
  ['POWER','SMAP','GPM','ECOSTRESS','MODIS'].forEach((key,i)=>{
    if (!rows[i]) return;
    const records = Object.values(sat[key].metadata || {}).flat();
    const record = records[0];
    const period = record?.period?.start && record?.period?.end ? record.period.start+' – '+record.period.end : 'Chưa có thời kỳ dữ liệu';
    rows[i].querySelector('.sat-desc').textContent = sat[key].status + ' · ' + period;
    rows[i].title = sat[key].source + '\n' + JSON.stringify(sat[key].metadata,null,2);
  });

  const setVal = (id, v, suffix = "") => {
    const el = document.getElementById(id);
    if (el) el.textContent = (v !== null && v !== undefined) ? v + suffix : "N/A";
  };
  setVal("sv-temp",    sat.POWER.temp_avg, " °C");
  document.getElementById("sv-temp-rng").textContent =
    `TB tháng ${sat.POWER.temp_min}°C – ${sat.POWER.temp_max}°C · Rad ${sat.POWER.rad_avg} MJ/m²`;

  setVal("sv-gwet",    sat.SMAP.gwetroot_avg);
  document.getElementById("sv-gwet-sub").textContent =
    `Root zone · ${sat.SMAP.drought_months} drought month(s)`;

  setVal("sv-rain",    sat.GPM.rain_avg, " mm/mo");
  document.getElementById("sv-rain-sub").textContent =
    `Total ${sat.GPM.rain_total} mm/yr · ${sat.GPM.flood_months} flood risk month(s)`;

  setVal("sv-ts",      sat.ECOSTRESS.ts_max, " °C peak");
  document.getElementById("sv-esi").textContent =
    `ESI avg ${sat.ECOSTRESS.esi_avg} · ${sat.ECOSTRESS.heat_months} heat stress month(s)`;

  setVal("sv-ndvi",    sat.MODIS.ndvi_avg);
  document.getElementById("sv-ndvi-sub").textContent =
    `NDVI ${sat.MODIS.ndvi_min} – ${sat.MODIS.ndvi_max}`;

  renderAlerts(data.alerts || []);

  // Charts
  buildCharts(data.monthly);

  // Match score
  document.getElementById("match-score").textContent = Number.isFinite(data.match_pct) ? data.match_pct + ' / 100' : 'N/A';
  const descEl = document.getElementById("match-desc");
  const similarity=data.similarity || {};
  const score=v=>Number.isFinite(v)?v.toFixed(2):'N/A';
  const matchDesc=(data.match_desc || 'Điểm tương đồng heuristic; không phải xác suất thành công.')+
    ' Classical Exact: '+score(similarity.recommendation_score ?? sc.classical?.overall)+' / 100.'+
    ' Lịch mùa vụ chỉ minh họa; chưa kiểm chứng tại ruộng.';
  const details=document.getElementById('solver-details');
  if(details)details.textContent='User: '+score(similarity.user_score ?? sc.user.overall)+
    ' · Classical Exact: '+score(similarity.recommendation_score ?? sc.classical?.overall)+
    ' · QAOA simulated: '+score(similarity.qaoa_score)+
    ' · Objective: '+(similarity.objective_version || data.objective_version || 'unavailable')+
    ' · Solver: '+(similarity.solver_status || sc.quantum.status || 'unavailable');
  descEl.textContent = matchDesc;
  descEl.style.color = "#94a3b8";
  if (matchDesc.startsWith("🏆")) descEl.style.color = "#34d399";
  else if (matchDesc.startsWith("👍")) descEl.style.color = "#38bdf8";
  else if (matchDesc.startsWith("⚠️")) descEl.style.color = "#fbbf24";
  else if (matchDesc.startsWith("🔴")) descEl.style.color = "#f87171";

  // User block
  document.getElementById("user-tags").innerHTML = cropTagsHTML(sc.user.crop_info);
  document.getElementById("user-rank").textContent = "RANK " + sc.user.rank;
  document.getElementById("user-rank").className = "rank-chip rank-" + sc.user.rank;
  document.getElementById("user-hp-soil").innerHTML   = hpBarHTML("Điểm đất (heuristic)",  sc.user.soil_hp);
  document.getElementById("user-hp-water").innerHTML  = hpBarHTML("Điểm nước (heuristic)",     sc.user.water_hp);
  document.getElementById("user-hp-profit").innerHTML = hpBarHTML("Điểm lợi ích (heuristic)",         sc.user.profit_hp);

  // Quantum block
  document.getElementById("q-tags").innerHTML = cropTagsHTML(sc.quantum.crop_info);
  document.getElementById("q-rank").textContent = "RANK " + sc.quantum.rank;
  document.getElementById("q-rank").className = "rank-chip rank-" + sc.quantum.rank;
  document.getElementById("q-method").textContent = (sc.quantum.fallback_used ? "Classical fallback · " : "Experimental simulation · ") + sc.quantum.method + ' · Classical Exact: ' + score(sc.classical?.overall) + ' (' + (sc.classical?.crops || []).join(' → ') + ')';
  document.getElementById("q-hp-soil").innerHTML   = hpBarHTML("Điểm đất (heuristic)",  sc.quantum.soil_hp);
  document.getElementById("q-hp-water").innerHTML  = hpBarHTML("Điểm nước (heuristic)",     sc.quantum.water_hp);
  document.getElementById("q-hp-profit").innerHTML = hpBarHTML("Điểm lợi ích (heuristic)",         sc.quantum.profit_hp);

  // Radar
  buildRadar(sc);

  // Auto-switch to arena tab
  setTimeout(() => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.getElementById("tab-arena").classList.add("active");
    document.querySelectorAll(".tab-btn")[1].classList.add("active");
  }, 400);
}

