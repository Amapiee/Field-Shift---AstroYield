// ─── Loading Steps ─────────────────────────────────────────────────────────────
const LOAD_STEPS = [
  "📡 Connecting to NASA POWER API…",
  "💧 Fetching SMAP soil moisture data…",
  "🌧️ Processing GPM IMERG rainfall…",
  "🌡️ Computing ECOSTRESS heat index…",
  "🌿 Deriving NDVI vegetation index…",
  "⚛️ Initializing Qiskit AerSimulator…",
  "🔮 Running 18-qubit QAOA…",
  "📊 Scoring rotation strategies…",
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

// ─── Main Analysis Call ────────────────────────────────────────────────────────
async function runAnalysis() {
  farmLat = parseFloat(document.getElementById("inp-lat").value) || farmLat;
  farmLon = parseFloat(document.getElementById("inp-lon").value) || farmLon;
  placeMarker(farmLat, farmLon);
  map.flyTo([farmLat, farmLon], Math.max(map.getZoom(), 7), { duration: 0.8 });

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

  document.getElementById("loading").classList.add("show");
  document.getElementById("btn-run").disabled = true;
  startLoadingSteps();

  try {
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
      updateUI(data);
    } else {
      alert("⚠️ Server error: " + (data.error || "Unknown"));
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
