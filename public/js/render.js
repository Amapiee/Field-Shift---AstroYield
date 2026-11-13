// ─── Update UI ────────────────────────────────────────────────────────────────
function updateUI(data) {
  const sat = data.satellite;
  const sc  = data.scenarios;

  document.getElementById("data-source-badge").textContent = "Source: " + data.source;

  const setVal = (id, v, suffix = "") => {
    const el = document.getElementById(id);
    if (el) el.textContent = (v !== null && v !== undefined && v !== 0) ? v + suffix : "N/A";
  };
  setVal("sv-temp",    sat.POWER.temp_avg, " °C");
  document.getElementById("sv-temp-rng").textContent =
    `${sat.POWER.temp_min}°C – ${sat.POWER.temp_max}°C · Rad ${sat.POWER.rad_avg} MJ/m²`;

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

  // Alerts
  const alertsList = document.getElementById("alerts-list");
  alertsList.innerHTML = "";
  data.alerts.forEach(a => {
    const cls = a.level === "danger" ? "alert-danger"
              : a.level === "warning" ? "alert-warning" : "alert-ok";
    alertsList.innerHTML += `<div class="alert-box ${cls}">${a.msg}</div>`;
  });
  document.getElementById("alerts-wrap").style.display = "block";

  // Charts
  buildCharts(data.monthly);

  // Match score
  document.getElementById("match-score").textContent = data.match_pct + "%";
  const matchDesc = data.match_pct >= 85 ? "🏆 Excellent — Very close to quantum optimal!"
    : data.match_pct >= 65 ? "👍 Good — Room for further optimization"
    : data.match_pct >= 45 ? "⚠️ Fair — Consider the quantum recommendation"
    : "🔴 Low — Quantum suggests a significantly better rotation";
  document.getElementById("match-desc").textContent = matchDesc;

  // User block
  document.getElementById("user-tags").innerHTML = cropTagsHTML(sc.user.crop_info);
  document.getElementById("user-rank").textContent = "RANK " + sc.user.rank;
  document.getElementById("user-rank").className = "rank-chip rank-" + sc.user.rank;
  document.getElementById("user-hp-soil").innerHTML   = hpBarHTML("🌱 Soil & Nitrogen HP",  sc.user.soil_hp);
  document.getElementById("user-hp-water").innerHTML  = hpBarHTML("💧 Water Budget HP",     sc.user.water_hp);
  document.getElementById("user-hp-profit").innerHTML = hpBarHTML("💰 Economic HP",         sc.user.profit_hp);

  // Quantum block
  document.getElementById("q-tags").innerHTML = cropTagsHTML(sc.quantum.crop_info);
  document.getElementById("q-rank").textContent = "RANK " + sc.quantum.rank;
  document.getElementById("q-rank").className = "rank-chip rank-" + sc.quantum.rank;
  document.getElementById("q-method").textContent = "⚛️ " + sc.quantum.method;
  document.getElementById("q-hp-soil").innerHTML   = hpBarHTML("🌱 Soil & Nitrogen HP",  sc.quantum.soil_hp);
  document.getElementById("q-hp-water").innerHTML  = hpBarHTML("💧 Water Budget HP",     sc.quantum.water_hp);
  document.getElementById("q-hp-profit").innerHTML = hpBarHTML("💰 Economic HP",         sc.quantum.profit_hp);

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

