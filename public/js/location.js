// Map clicks and searches use the backend's local geometry; no reverse-geocoding guesses.
const API_CONTRACT = 'terrain-v2-objective-v5';
const RESTART_MESSAGE = 'Backend đang chạy phiên bản cũ. Hãy dừng server bằng Ctrl+C, chạy lại npm start trong E:\\FarmShiftRemake, rồi nhấn Ctrl+F5 trên trình duyệt.';
const locationCache = new Map();
let locationSelection = 0;
function cachedLocation(lat, lon) { return locationCache.get(lat + ':' + lon) || null; }
async function getLocationClassification(lat, lon) {
  const cached = cachedLocation(lat, lon);
  if (cached) return cached;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/location?lat=' + lat + '&lon=' + lon, { cache: 'no-store', signal: controller.signal });
    if (response.status === 404) throw Error(RESTART_MESSAGE);
    const data = await response.json();
    if (data.contract_version !== API_CONTRACT) throw Error(RESTART_MESSAGE);
    if (!response.ok || !data.ok || !data.location) throw Error(data.error || 'Chưa kiểm tra được vị trí.');
    if (locationCache.size >= 64) locationCache.delete(locationCache.keys().next().value);
    locationCache.set(lat + ':' + lon, data.location);
    return data.location;
  } finally { clearTimeout(deadline); }
}
function showLocationWarning(geo) {
  if (geo?.is_ice) showIceAlert(geo.message);
  else if (geo?.is_water) showWaterAlert(geo.message);
  else if (geo?.requires_verification) showCoastalAlert(geo.message);
  else return false;
  setAnalysisMessage(geo.message);
  return true;
}
async function checkSelectedLocation(lat, lon) {
  const selection = ++locationSelection;
  resetDashboardUI();
  closeWaterAlert();
  setAnalysisMessage('Đang kiểm tra vị trí…');
  try {
    const geo = await getLocationClassification(lat, lon);
    if (selection !== locationSelection || farmLat !== lat || farmLon !== lon) return;
    setAnalysisMessage('');
    showLocationWarning(geo);
  } catch (error) {
    if (selection === locationSelection && farmLat === lat && farmLon === lon)
      setAnalysisMessage(error.message.includes('phiên bản cũ') ? error.message : 'Chưa kiểm tra được bản đồ. Bấm Run để kiểm tra lại tại server.');
  }
}
