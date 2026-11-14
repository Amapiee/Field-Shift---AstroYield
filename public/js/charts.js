// ─── Chart Config ─────────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  animation: { duration: 800 },
  plugins: {
    legend: {
      labels: { color: "#94a3b8", font: { size: 10, family: "'Inter',sans-serif" }, boxWidth: 12 }
    },
    tooltip: {
      backgroundColor: "rgba(6,13,22,0.9)",
      borderColor: "rgba(16,185,129,0.3)", borderWidth: 1,
      titleColor: "#38bdf8", bodyColor: "#f1f5f9",
    }
  },
  scales: {
    x: { ticks: { color: "#64748b", font: { size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } },
    y: { ticks: { color: "#64748b", font: { size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } }
  }
};
function destroyChart(ref) {
  if (ref) { try { ref.destroy(); } catch {} }
  return null;
}

// ─── Build / Update Charts ────────────────────────────────────────────────────
function buildCharts(monthly) {
  chartTemp = destroyChart(chartTemp);
  chartTemp = new Chart(document.getElementById("chart-temp"), {
    type: "line",
    data: {
      labels: MONTHS,
      datasets: [
        { label: "T2M (°C)", data: monthly.T2M, borderColor: "#f59e0b", borderWidth: 2,
          backgroundColor: "rgba(245,158,11,0.08)", fill: true, tension: 0.4, pointRadius: 3 },
        { label: "TS (°C)",  data: monthly.TS,  borderColor: "#ef4444", borderWidth: 1.5,
          borderDash: [4,3], tension: 0.4, pointRadius: 2, backgroundColor: "transparent" }
      ]
    },
    options: { ...CHART_DEFAULTS }
  });

  chartRain = destroyChart(chartRain);
  chartRain = new Chart(document.getElementById("chart-rain"), {
    type: "bar",
    data: {
      labels: MONTHS,
      datasets: [
        { label: "Rain (mm)", data: monthly.RAIN,
          backgroundColor: "rgba(56,189,248,0.3)", borderColor: "rgba(56,189,248,0.6)", borderWidth: 1,
          yAxisID: "y" },
        { label: "GWETROOT", data: monthly.GWETROOT, type: "line",
          borderColor: "#10b981", borderWidth: 2, tension: 0.4, pointRadius: 3,
          fill: false, yAxisID: "y1" }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: CHART_DEFAULTS.scales.x,
        y:  { ...CHART_DEFAULTS.scales.y, position: "left" },
        y1: { position: "right", min: 0, max: 1,
              ticks: { color: "#10b981", font: { size: 9 } },
              grid: { drawOnChartArea: false } }
      }
    }
  });

  chartNdvi = destroyChart(chartNdvi);
  chartNdvi = new Chart(document.getElementById("chart-ndvi"), {
    type: "line",
    data: {
      labels: MONTHS,
      datasets: [{
        label: "NDVI", data: monthly.NDVI,
        borderColor: "#10b981", borderWidth: 2, tension: 0.4,
        backgroundColor: "rgba(16,185,129,0.12)", fill: true, pointRadius: 3
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: { x: CHART_DEFAULTS.scales.x, y: { ...CHART_DEFAULTS.scales.y, min: 0, max: 1 } }
    }
  });
}

function buildRadar(scenarios) {
  chartRadar = destroyChart(chartRadar);
  const cats = ["Soil HP","Water HP","Profit HP","Overall"];
  const extract = sc => [sc.soil_hp, sc.water_hp, sc.profit_hp, sc.overall];
  chartRadar = new Chart(document.getElementById("chart-radar"), {
    type: "radar",
    data: {
      labels: cats,
      datasets: [
        { label: "Your Strategy", data: extract(scenarios.user),
          borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.1)",
          borderWidth: 2, pointBackgroundColor: "#38bdf8" },
        { label: "Quantum AI", data: extract(scenarios.quantum),
          borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,0.1)",
          borderWidth: 2, pointBackgroundColor: "#a78bfa" },
        { label: "Baseline", data: extract(scenarios.baseline),
          borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.06)",
          borderWidth: 1.5, borderDash: [4,3], pointBackgroundColor: "#ef4444" }
      ]
    },
    options: {
      responsive: true, animation: { duration: 900 },
      plugins: {
        legend: { labels: { color: "#94a3b8", font: { size: 10 }, boxWidth: 10 } },
        tooltip: { backgroundColor: "rgba(6,13,22,0.9)", titleColor: "#38bdf8", bodyColor: "#f1f5f9" }
      },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { color: "#475569", font: { size: 9 }, stepSize: 25 },
          grid: { color: "rgba(255,255,255,0.07)" },
          pointLabels: { color: "#94a3b8", font: { size: 10 } },
          angleLines: { color: "rgba(255,255,255,0.07)" },
        }
      }
    }
  });
}

