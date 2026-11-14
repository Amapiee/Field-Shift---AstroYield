// ─── Loading Steps ─────────────────────────────────────────────────────────────
const LOAD_STEPS = [
  "🌊 Verifying farm location & terrain boundaries…",
  "📡 Connecting to NASA POWER Agroclimatology API…",
  "💧 Loading MERRA-2 Catchment Land Surface Model…",
  "🌧️ Processing GPCP-calibrated precipitation…",
  "🌡️ Computing surface thermal skin index (TS)…",
  "🌿 Deriving biophysical vegetation proxy (NDVI/ESI)…",
  "⚛️ Initializing Statevector QAOA simulator…",
  "🔮 Running 18-qubit QAOA & classical benchmark…",
  "📊 Scoring rotation strategies with TOPSIS…",
];
let stepIdx = 0, stepTimer = null;
function startLoadingSteps(title) {
  stepIdx = 0;
  document.getElementById("loading-title").textContent = title || "⚛️ QUANTUM ANALYSIS RUNNING…";
  document.getElementById("loading-step").textContent = LOAD_STEPS[0];
  stepTimer = setInterval(() => {
    stepIdx = (stepIdx + 1) % LOAD_STEPS.length;
    document.getElementById("loading-step").textContent = LOAD_STEPS[stepIdx];
  }, 900);
}
function stopLoadingSteps() { if (stepTimer) clearInterval(stepTimer); }

// ─── Bộ Phân Loại Địa Lý Client-Side (Nhanh & Đồng Bộ Chuẩn Xác với Backend) ──
function isPointInPolyClient(point, polygon) {
  const [lat, lon] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersect = ((lonI > lon) !== (lonJ > lon)) &&
      (lat < (latJ - latI) * (lon - lonI) / (lonJ - lonI) + latI);
    if (intersect) inside = !inside;
  }
  return inside;
}

const GULF_OF_TONKIN_CLIENT = [
  // Bờ biển phía Tây: Theo mép nước biển Việt Nam từ Quảng Trị lên Móng Cái
  [17.0, 107.25], [17.5, 106.65], [18.0, 106.45], [18.3, 106.10],
  [18.7, 105.82], [19.2, 105.75], [19.5, 105.86], [19.8, 105.95],
  [20.0, 106.12], [20.15, 106.40], [20.28, 106.60], [20.38, 106.64],
  [20.55, 106.65], [20.70, 106.83], [20.80, 106.95], [20.73, 107.08],
  [20.95, 107.12], [21.05, 107.42], [21.25, 107.65], [21.49, 108.02],
  // Bờ biển phía Bắc & Đông: Nam Trung Quốc & Đảo Hải Nam
  [21.8, 108.6],  [21.5, 109.2],  [20.5, 109.8],  [20.1, 109.7],
  [19.3, 108.6],  [18.2, 108.7],  [17.0, 107.6]
];

const GREENLAND_CLIENT = [
  [59.5, -43.5], [65.0, -39.0], [70.0, -22.0], [76.0, -18.0],
  [82.0, -25.0], [83.8, -35.0], [82.0, -50.0], [78.0, -70.0],
  [76.0, -68.0], [70.0, -55.0], [65.0, -52.0], [60.0, -46.0]
];

function classifyClientLocation(lat, lon) {
  // 1. Greenland Ice Sheet
  if (lat >= 59.5 && lat <= 84.0 && lon >= -75.0 && lon <= -15.0) {
    if (isPointInPolyClient([lat, lon], GREENLAND_CLIENT)) {
      return {
        is_ice: true, is_water: false,
        message: "🧊 Tọa độ thuộc dải băng tuyết vĩnh cửu Greenland. Nhiệt độ quanh năm đóng băng, không có tầng đất trồng trọt!"
      };
    }
  }
  // 2. Nam Cực (Antarctica)
  if (lat <= -60.0) {
    return {
      is_ice: true, is_water: false,
      message: "🧊 Tọa độ thuộc lục địa băng Nam Cực. Điều kiện băng giá vĩnh cửu không thể canh tác!"
    };
  }
  // 3. Vịnh Bắc Bộ (Gulf of Tonkin) - Kiểm tra chuẩn xác theo đa giác bờ biển
  if (lat >= 17.0 && lat <= 22.0 && lon >= 105.7 && lon <= 110.0) {
    if (isPointInPolyClient([lat, lon], GULF_OF_TONKIN_CLIENT)) {
      return {
        is_water: true, is_ice: false,
        message: "🌊 Tọa độ nằm trên vùng biển Vịnh Bắc Bộ. Vui lòng chọn vị trí trên đất liền để canh tác nông nghiệp!"
      };
    }
  }
  // 4. Các đại dương mở chính
  if ((lat >= -50 && lat <= 50 && lon >= -175 && lon <= -130) || // Thái Bình Dương
      (lat >= -45 && lat <= 55 && lon >= -45 && lon <= -20)   || // Đại Tây Dương
      (lat >= -50 && lat <= 10 && lon >= 60 && lon <= 90)) {    // Ấn Độ Dương
    return {
      is_water: true, is_ice: false,
      message: "🌊 Tọa độ nằm ngoài đại dương/vùng biển mở. Vệ tinh nông nghiệp SMAP/GPM không hỗ trợ vùng nước!"
    };
  }

  return { is_water: false, is_ice: false };
}

// ─── Hàm Reset Giao Diện Khi Click Ra Biển Hoặc Băng Tuyết ───────────────────
function resetDashboardUI() {
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

  resetHPBar("user-hp-soil", "🌱 Soil & Nitrogen HP");
  resetHPBar("user-hp-water", "💧 Water Budget HP");
  resetHPBar("user-hp-profit", "💰 Economic HP");
  
  resetHPBar("q-hp-soil", "🌱 Soil & Nitrogen HP");
  resetHPBar("q-hp-water", "💧 Water Budget HP");
  resetHPBar("q-hp-profit", "💰 Economic HP");

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
  if (sourceBadge) sourceBadge.textContent = "Source: -";
}

// ─── Main Analysis Call ────────────────────────────────────────────────────────
async function runAnalysis() {
  farmLat = parseFloat(document.getElementById("inp-lat").value) || farmLat;
  farmLon = parseFloat(document.getElementById("inp-lon").value) || farmLon;
  placeMarker(farmLat, farmLon);
  map.flyTo([farmLat, farmLon], Math.max(map.getZoom(), 7), { duration: 0.8 });

  // 1. Kiểm tra nhanh địa lý Client-side
  const fastCheck = classifyClientLocation(farmLat, farmLon);
  if (fastCheck.is_water) {
    if (typeof showWaterAlert === 'function') showWaterAlert(fastCheck.message);
    resetDashboardUI();
    return;
  }
  if (fastCheck.is_ice) {
    if (typeof showIceAlert === 'function') showIceAlert(fastCheck.message);
    else if (typeof showWaterAlert === 'function') showWaterAlert(fastCheck.message);
    resetDashboardUI();
    return;
  }

  document.getElementById("loading").classList.add("show");
  document.getElementById("btn-run").disabled = true;
  startLoadingSteps();

  try {
    if (typeof closeWaterAlert === 'function') closeWaterAlert();

    const payload = {
      lat:      farmLat,
      lon:      farmLon,
      w_soil:   parseFloat(document.getElementById("sl-soil").value),
      w_water:  parseFloat(document.getElementById("sl-water").value),
      w_profit: parseFloat(document.getElementById("sl-profit").value),
      user_crops: [
        document.getElementById("crop-s1").value,
        document.getElementById("crop-s2").value,
        document.getElementById("crop-s3").value,
      ],
    };

    const res  = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    stopLoadingSteps();
    document.getElementById("loading").classList.remove("show");
    document.getElementById("btn-run").disabled = false;

    if (data.ok) {
      if (typeof updateUI === 'function') updateUI(data);
    } else if (data.is_water) {
      if (typeof showWaterAlert === 'function') showWaterAlert(data.error);
      resetDashboardUI(); 
    } else if (data.is_ice) {
      if (typeof showIceAlert === 'function') showIceAlert(data.error);
      else if (typeof showWaterAlert === 'function') showWaterAlert(data.error);
      resetDashboardUI();
    } else {
      alert("⚠️ " + (data.error || "Server error occurred"));
    }
  } catch (err) {
    stopLoadingSteps();
    document.getElementById("loading").classList.remove("show");
    document.getElementById("btn-run").disabled = false;
    alert("🌐 Network error: " + err.message + "\n\nMake sure the Node server is running (npm start, port 3000).");
  }
}

// Enter key on main page (not inside inputs) triggers analysis
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && !["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName)) {
    runAnalysis();
  }
});
