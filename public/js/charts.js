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
  const values = key => Array.from({length:12}, (_, index) => Number.isFinite(monthly?.[key]?.[index]) ? monthly[key][index] : null);
  chartTemp = destroyChart(chartTemp);
  chartTemp = new Chart(document.getElementById("chart-temp"), {
    type: "line",
    data: {
      labels: MONTHS,
      datasets: [
        { label: "T2M trung bình (°C)", data: values("T2M"), borderColor: "#f59e0b", borderWidth: 2, spanGaps: false,
          backgroundColor: "rgba(245,158,11,0.08)", fill: true, tension: 0.4, pointRadius: 3 },
        { label: "TS bề mặt (°C)", data: values("TS"), borderColor: "#ef4444", borderWidth: 1.5, spanGaps: false,
          borderDash: [4,3], tension: 0.4, pointRadius: 2, backgroundColor: "transparent" },
        { label: "Tmin khí hậu (°C)", data: values("T2M_MIN"), borderColor: "#38bdf8", borderWidth: 1.5,
          tension: 0, pointRadius: 2, spanGaps: false },
        { label: "Tmin thấp nhất trong lịch sử (°C)", data: values("T2M_MIN_HISTORY"), borderColor: "#c084fc", borderWidth: 2,
          tension: 0, pointRadius: 3, spanGaps: false },
        { label: "Mốc 0°C", data: Array(12).fill(0), borderColor: "#94a3b8", borderWidth: 1,
          borderDash: [3,3], pointRadius: 0, fill: false }
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
  const extract = sc => [sc.soil_hp, sc.water_hp, sc.profit_hp, sc.overall].map(value => Number.isFinite(value) ? value : null);
  const dataset = (key, label, color, backgroundColor) => scenarios[key] ? [{label,
    data:extract(scenarios[key]),borderColor:color,backgroundColor,borderWidth:2,pointBackgroundColor:color}] : [];
  chartRadar = new Chart(document.getElementById("chart-radar"), {
    type: "radar",
    data: {
      labels: cats,
      datasets: [
        ...dataset("user", "Your Strategy", "#38bdf8", "rgba(56,189,248,0.1)"),
        ...dataset("quantum", scenarios.quantum?.fallback_used ? "Classical fallback" : "Quantum AI", "#a78bfa", "rgba(167,139,250,0.1)"),
        ...dataset("baseline", "Baseline", "#ef4444", "rgba(239,68,68,0.06)"),
        ...dataset("classical", "Classical Exact", "#10b981", "rgba(16,185,129,0.06)")
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


let seasonCropCharts = [];
function buildSeasonCropCharts(seasons) {
  seasonCropCharts.forEach(destroyChart);
  seasonCropCharts = [];
  const status = document.getElementById('q-crop-chart-status');
  if (status) status.textContent = seasons.length ? '' : 'Chưa có dữ liệu điểm theo vụ. Hãy chạy phân tích.';
  for (let index = 0; index < 3; index++) {
    const canvas = document.getElementById(`q-crops-${index+1}`);
    if (!canvas) continue;
    const season = seasons.find(item => item.season === index+1);
    const rows = (season?.rows || []).filter(row => Number.isFinite(row.score))
      .slice().sort((a,b) => b.score-a.score || a.crop.localeCompare(b.crop));
    canvas.setAttribute?.('aria-label', rows.length
      ? `Vụ ${index+1}: ${rows.map(row=>`${row.label}: ${row.score.toFixed(1)} điểm`).join('; ')}`
      : `Vụ ${index+1}: chưa có dữ liệu`);
    if (!rows.length) continue;
    seasonCropCharts.push(new Chart(canvas, {
      type: 'bar',
      data: {labels: rows.map(row=>row.label), datasets: [{label:'Mức phù hợp khí hậu',
        data:rows.map(row=>row.score), backgroundColor:rows.map(row=>row.color), borderRadius:3}]},
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{
          label:context=>`${context.parsed.y.toFixed(1)} / 100 điểm`,
          afterLabel:context=>rows[context.dataIndex].reason || ''
        }}},
        scales:{
          x:{ticks:{color:'#94a3b8',font:{size:10},minRotation:35,maxRotation:35},grid:{display:false}},
          y:{min:0,max:100,title:{display:true,text:'Mức phù hợp (điểm)',color:'#94a3b8'},
            ticks:{color:'#94a3b8',stepSize:25},grid:{color:'rgba(148,163,184,0.12)'}}
        }
      }
    }));
  }
}
