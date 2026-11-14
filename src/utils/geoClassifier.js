// One offline geographic mask for map selection and every NASA analysis entry point.
// Natural Earth 1:10 million is a generalized map, not a live snow product or field survey.
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const mask = JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname, '../data/terrain-mask.json.gz'))));
const { layers, ...mapProvenance } = mask;

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function findPolygon(layer, lat, lon) {
  return layers[layer].find(({ bbox: [w, s, e, n], rings }) =>
    lon >= w && lon <= e && lat >= s && lat <= n && inRing(lon, lat, rings[0]) &&
    !rings.slice(1).some(ring => inRing(lon, lat, ring)));
}

function nearMappedLand(lat, lon) {
  // A 1 km caution band is an application policy, not a claimed map accuracy.
  // Prevent generalized coastlines from labelling small coastal settlements open ocean.
  const radius=1000, sy=111195, sx=sy*Math.max(.00001,Math.cos(lat*Math.PI/180));
  for(const {bbox:[w,s,e,n],rings} of layers.land){
    if(lat<s-radius/sy || lat>n+radius/sy || lon<w-radius/sx || lon>e+radius/sx)continue;
    for(const ring of rings)for(let i=1;i<ring.length;i++){
      const ax=(ring[i-1][0]-lon)*sx,ay=(ring[i-1][1]-lat)*sy;
      const dx=(ring[i][0]-ring[i-1][0])*sx,dy=(ring[i][1]-ring[i-1][1])*sy;
      const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy || 1)));
      if((ax+t*dx)**2+(ay+t*dy)**2<=radius**2)return true;
    }
  }
  return false;
}

// Retain the public helper's original [lat,lon] convention.
function isPointInPolygon([lat, lon], polygon) {
  return inRing(lon, lat, polygon.map(([y, x]) => [x, y]));
}

function classifyCoordinates(lat, lon, climateData = null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { type: 'UNKNOWN', is_water: false, is_ice: false, can_cultivate: false, message: 'Tọa độ không hợp lệ.' };
  }
  // The source splits Antarctic polygons a few metres before the pole/dateline.
  lon = Math.abs(lon) === 180 ? -179.99998 : lon;
  const queryLat = Math.max(lat, -89.9999);
  const base = { is_water: false, is_ice: false, can_cultivate: false,
    map_source: mapProvenance.source, map_scale: mapProvenance.scale,
    limitations: mapProvenance.limitations, live_snow_observed: false };
  const glacier = findPolygon('glaciated', queryLat, lon);
  if (glacier) return { ...base, type: 'ICE_SHEET', name: glacier.name || 'Vùng băng / sông băng theo bản đồ', is_ice: true,
    message: '🧊 Điểm chọn nằm trong vùng băng / sông băng được lập bản đồ Natural Earth. Không chạy mô hình cây trồng ngoài trời cho vùng này. Bản đồ có thể gồm vùng băng đã rút; chưa xác nhận tuyết hoặc băng hiện thời. Hãy chọn đất canh tác và kiểm tra ảnh thực địa nếu ở sát rìa băng.' };
  const lake = findPolygon('water', queryLat, lon);
  if (lake) return { ...base, type: 'INLAND_WATER', name: lake.name || 'Hồ / vùng nước nội địa', is_water: true,
    message: '🌊 Điểm chọn nằm trên hồ / vùng nước nội địa theo bản đồ. Không thể phân tích trồng trọt trên mặt nước; vui lòng chọn đất liền.' };
  if (!findPolygon('land', queryLat, lon)) {
    if(nearMappedLand(queryLat,lon))return {...base,type:'COASTAL_UNCERTAIN',name:'Sát đường bờ khái quát',requires_verification:true,
      caution_band_m:1000,caution_band_is_map_accuracy:false,
      message:'📍 Điểm chọn ở sát đường bờ khái quát (trong dải thận trọng 1 km phía ngoài đa giác đất). Chưa xác định chắc đất hay nước; không kết luận đây là biển hoặc đất trồng. Hãy phóng to, chọn sâu hơn trong đất liền hoặc kiểm tra bằng bản đồ địa phương.'};
    return { ...base, type: 'OCEAN', name: 'Biển / đại dương', is_water: true,
      message: '🌊 Điểm chọn nằm trên biển / đại dương theo bản đồ. Không thể trồng cây trên mặt biển; vui lòng chọn đất liền. Nếu chọn sát bờ hoặc đảo nhỏ, hãy phóng to và kiểm tra lại vì đường bờ bản đồ được khái quát hóa.' };
  }
  // Preserve climate-based aridity screening; never infer ice from cold air alone.
  if (climateData?.PRECTOTCORR && climateData?.GWETROOT) {
    const annualRain = climateData.PRECTOTCORR.reduce((a, b) => a + b, 0);
    const avgWet = climateData.GWETROOT.reduce((a, b) => a + b, 0) / climateData.GWETROOT.length;
    if (annualRain < 45 && avgWet < .18) return { ...base, type: 'HYPER_ARID_DESERT', name: 'Hoang mạc cực khô hạn',
      message: '🏜️ Mưa dưới 45 mm/năm và ẩm đất rễ dưới 0.18; cần đánh giá nguồn tưới trước khi canh tác.' };
  }
  return { ...base, type: 'LAND', name: 'Đất liền', can_cultivate: true,
    message: 'Đất liền theo bản đồ; khả năng canh tác còn phụ thuộc địa hình, rét và dữ liệu khí hậu.' };
}

module.exports = { classifyCoordinates, isPointInPolygon, mapProvenance };
