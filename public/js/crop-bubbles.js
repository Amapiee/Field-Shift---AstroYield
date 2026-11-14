
const CROP_POINTS_URL = "/data/crop-points.json";

const CROP_COLORS = {
  Rice:    { hex: "#38bdf8", rgb: "56, 189, 248" },
  Maize:   { hex: "#f59e0b", rgb: "245, 158, 11" },
  Soybean: { hex: "#10b981", rgb: "16, 185, 129" },
  Peanut:  { hex: "#a855f7", rgb: "167, 139, 250" },
  Veggies: { hex: "#ef4444", rgb: "239, 68, 68" }
};

let cropData = null;
let bubbleLayerGroup = null;
// Renderer canvas dùng chung để tối ưu việc vẽ
let canvasRenderer = null;

async function loadCropData() {
  if (cropData) return cropData;
  try {
    const res = await fetch(CROP_POINTS_URL);
    if (!res.ok) throw new Error("Không tải được dữ liệu");
    cropData = await res.json();
    return cropData;
  } catch (e) {
    console.error("[CropBubbles] Lỗi tải dữ liệu:", e);
    return null;
  }
}

// Tối ưu: Gom nhóm các điểm có cùng giá trị cao vào một "bong bóng" tổng hợp
// Thay vì vẽ 800 chấm nhỏ, ta vẽ 20-50 chấm to có độ mờ (opacity) cao hơn
// Điều này giảm tải Canvas đáng kể mà vẫn giữ được ý nghĩa dữ liệu.
function aggregatePoints(points, maxBubbles = 50) {
  if (points.length <= maxBubbles) return points;
  
  // Sắp xếp theo giá trị để giữ lại các điểm quan trọng nhất
  points.sort((a, b) => b.val - a.val);
  
  const aggregated = [];
  const gridSize = 0.5; // Lưới gom nhóm kích thước 0.5 độ
  
  for (let i = 0; i < points.length && aggregated.length < maxBubbles; i++) {
    const p = points[i];
    // Kiểm tra xem điểm này đã gần điểm nào trong danh sách gom chưa
    const isDuplicate = aggregated.some(a => {
      const dLat = Math.abs(a.lat - p.lat);
      const dLon = Math.abs(a.lon - p.lon);
      return dLat < gridSize && dLon < gridSize;
    });

    if (!isDuplicate) {
      // Gom giá trị của các điểm lân cận (nếu có)
      let totalVal = p.val;
      let count = 1;
      
      // Duyệt xem còn điểm nào khác gần đây chưa được gom không
      for (let j = i + 1; j < points.length; j++) {
        const dLat = Math.abs(points[j].lat - p.lat);
        const dLon = Math.abs(points[j].lon - p.lon);
        if (dLat < gridSize && dLon < gridSize) {
          totalVal += points[j].val;
          count++;
        }
      }
      
      aggregated.push({
        lat: p.lat,
        lon: p.lon,
        val: totalVal / count, // Giá trị trung bình
        weight: count          // Số điểm được gom
      });
    }
  }
  return aggregated;
}

function getGlowSize(val, maxVal, minR = 10, maxR = 60) {
  if (maxVal === 0 || !Number.isFinite(val)) return minR;
  // Dùng căn bậc hai để độ tăng kích thước có sự "giảm dần" (taper) tự nhiên
  const ratio = Math.sqrt(val) / Math.sqrt(maxVal);
  return minR + ratio * (maxR - minR);
}

async function drawCropBubbles(cropKey) {
  // 1. Dọn dẹp layer cũ (quan trọng để tránh leak bộ nhớ)
  if (bubbleLayerGroup && map.hasLayer(bubbleLayerGroup)) {
    map.removeLayer(bubbleLayerGroup);
  }

  if (!cropKey || cropKey === "none") {
    bubbleLayerGroup = null;
    return;
  }

  const data = await loadCropData();
  if (!data || !data.crops[cropKey]) return;

  // Tạo layer group và renderer canvas
  bubbleLayerGroup = L.layerGroup();
  // Sử dụng canvas renderer chung nếu chưa có, hoặc tạo mới
  if (!canvasRenderer) {
    canvasRenderer = L.canvas({ padding: 0.5 });
  }

  let points = data.crops[cropKey];
  
  // Tối ưu 1: Giới hạn số điểm đầu vào
  points = points.slice(0, 500);
  
  // Tối ưu 2: Gom nhóm (Aggregation)
  const aggregatedPoints = aggregatePoints(points, 40);
  
  if (aggregatedPoints.length === 0) return;

  const maxVal = Math.max(...aggregatedPoints.map(p => p.val));
  const colorHex = CROP_COLORS[cropKey]?.hex || CROP_COLORS.Rice.hex;
  const colorRGB = CROP_COLORS[cropKey]?.rgb || CROP_COLORS.Rice.rgb;

  aggregatedPoints.forEach(p => {
    const size = getGlowSize(p.val, maxVal);
    
    // Dùng CircleMarker thay vì Marker + DivIcon
    // Canvas sẽ xử lý việc vẽ các vòng tròn này hiệu quả hơn HTML
    const marker = L.circleMarker([p.lat, p.lon], {
      renderer: canvasRenderer,
      radius: size,
      color: colorHex,
      weight: 2,
      opacity: 0.8,
      fillColor: colorHex,
      fillOpacity: 0.4 + (p.weight / 10) * 0.4, // Càng nhiều điểm được gom, màu càng đậm
      interactive: true,
      bubblingMouseEvents: true
    });

    // Tooltip chỉ hiện khi hover (không render sẵn tất cả)
    marker.bindTooltip(
      `<b>${cropKey}</b><br/>Diện tích: ${p.val.toLocaleString()} ha<br/><i style="font-size:0.7rem">(Gom từ ${p.weight} vùng)</i>`,
      { direction: 'top', className: 'bubble-tooltip', sticky: true }
    );

    bubbleLayerGroup.addLayer(marker);
  });

  bubbleLayerGroup.addTo(map);
}

// Gắn sự kiện
document.addEventListener("DOMContentLoaded", () => {
  const bubbleToggle = document.getElementById("bubble-toggle");
  const bubbleSelect = document.getElementById("bubble-crop");
  if (!bubbleToggle || !bubbleSelect) return;

  bubbleSelect.innerHTML = `
    <option value="none">-- Chọn cây trồng --</option>
    <option value="Rice">🌾 Lúa (Rice)</option>
    <option value="Maize">🌽 Ngô (Maize)</option>
    <option value="Soybean">🫘 Đậu Tương (Soybean)</option>
    <option value="Peanut">🥜 Lạc (Peanut)</option>
    <option value="Veggies">🥬 Rau Màu (Veggies)</option>
  `;

  const updateBubbles = () => {
    if (bubbleToggle.checked) {
      bubbleSelect.disabled = false;
      drawCropBubbles(bubbleSelect.value);
    } else {
      bubbleSelect.disabled = true;
      drawCropBubbles("none");
    }
  };

  bubbleToggle.addEventListener("change", updateBubbles);
  bubbleSelect.addEventListener("change", updateBubbles);
});