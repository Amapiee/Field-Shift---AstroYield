// ─── Multi-Engine High Precision Geocoder (ArcGIS + Photon + Nominatim) ──────
// Timeout chung cho mọi external fetch (mạng hackathon thường kém)
const GEO_TIMEOUT_MS = 4500;

async function queryArcGIS(q) {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(q)}&maxLocations=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
  if (!res.ok) throw new Error("ArcGIS HTTP " + res.status);
  const data = await res.json();
  if (data.candidates && data.candidates.length > 0 && data.candidates[0].score >= 35) {
    const c = data.candidates[0];
    return { lat: c.location.y, lon: c.location.x, name: c.address || q };
  }
  return null;
}

async function queryPhoton(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
  if (!res.ok) throw new Error("Photon HTTP " + res.status);
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    const feat = data.features[0];
    const [lon, lat] = feat.geometry.coordinates;
    const p = feat.properties;
    const parts = [p.name, p.district, p.city, p.state, p.country].filter(Boolean);
    return { lat, lon, name: parts.join(", ") || q };
  }
  return null;
}

async function queryNominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=vi,en&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "FarmShift-NASA-SpaceApps/2026" },
    signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
  const list = await res.json();
  if (list && list.length > 0) {
    return {
      lat: parseFloat(list[0].lat),
      lon: parseFloat(list[0].lon),
      name: list[0].display_name,
    };
  }
  return null;
}

async function smartGeocodeQuery(q) {
  try { const r = await queryArcGIS(q);    if (r) return r; } catch (e) { console.warn("ArcGIS:", e.message); }
  try { const r = await queryPhoton(q);    if (r) return r; } catch (e) { console.warn("Photon:", e.message); }
  try { const r = await queryNominatim(q); if (r) return r; } catch (e) { console.warn("Nominatim:", e.message); }
  return null;
}

// ─── Water detection: keyword (sync) + Nominatim reverse (async) ─────────────
const WATER_KEYWORDS = /\b(ocean|sea|gulf|bay|strait|biển|đại dương|vịnh|atlantic|pacific|indian\s+ocean|arctic)\b/i;

function isWaterByName(name) {
  return !!name && WATER_KEYWORDS.test(name);
}

// Trả true (nước) / false (đất) / null (không xác định được)
async function checkNominatimWater(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=8`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FarmShift-NASA-SpaceApps/2026" },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error === "Unable to geocode") return true;
    if (data.category === "natural" &&
        ["sea", "ocean", "bay", "strait", "water", "wetland"].includes(data.type)) return true;
    return false;
  } catch {
    return null; // Không chặn user khi API lỗi
  }
}

// Fire-and-forget: không chặn UI, chỉ hiện toast nếu phát hiện biển
async function warnIfWaterAsync(lat, lon) {
  const isWater = await checkNominatimWater(lat, lon);
  if (isWater === true) showWaterToast(lat, lon);
}

function showWaterToast(lat, lon) {
  let el = document.getElementById("farmshift-water-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "farmshift-water-toast";
    el.style.cssText = `
      position:fixed;top:72px;left:50%;transform:translateX(-50%);
      z-index:120;padding:10px 18px;border-radius:10px;
      background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.5);
      color:#fcd34d;font-size:0.78rem;font-family:'Inter',sans-serif;
      box-shadow:0 4px 20px rgba(0,0,0,0.45);max-width:80vw;
      transition:opacity 0.4s;opacity:0;pointer-events:none;`;
    document.body.appendChild(el);
  }
  el.innerHTML = `⚠️ Toạ độ (${lat.toFixed(3)}, ${lon.toFixed(3)}) có thể nằm trên biển — dữ liệu nông nghiệp có thể không chính xác.`;
  el.style.opacity = "1";
  el.style.pointerEvents = "auto";
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  }, 8000);
}

// ─── Main search flow ────────────────────────────────────────────────────────
async function smartGeocode() {
  const raw = document.getElementById("search-input").value.trim();
  if (!raw) return;

  const resultEl = document.getElementById("search-result");
  const errorEl  = document.getElementById("search-error");
  const btn      = document.getElementById("btn-search");

  resultEl.style.display = "none";
  errorEl.style.display  = "none";
  btn.disabled = true;
  btn.textContent = "⏳";

  let found = null;
  try {
    found = await smartGeocodeQuery(raw);
    if (!found && raw.includes(",")) {
      const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
      while (parts.length > 1 && !found) {
        parts.shift();
        found = await smartGeocodeQuery(parts.join(", "));
      }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "🔍 Tìm";  // ← khôi phục emoji
  }

  if (!found) {
    errorEl.textContent = `❌ Không tìm thấy: "${raw}". Vui lòng thử từ khóa khác (ví dụ: Phú Xuyên, Hà Nội, Cần Thơ, California).`;
    errorEl.style.display = "block";
    return;
  }

  // ── Fast path: tên chứa từ khoá biển → từ chối ngay, không call network ──
  if (isWaterByName(found.name)) {
    errorEl.textContent = `❌ Vị trí "${found.name}" nằm trên biển/đại dương. Vui lòng chọn vùng đất liền.`;
    errorEl.style.display = "block";
    return;
  }

  // ── Chấp nhận: đặt marker NGAY (không chờ water check) ──
  placeMarker(found.lat, found.lon, true, 13);
  resultEl.innerHTML = `📍 <strong>${found.name}</strong><br><span style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--cyan)">(${found.lat.toFixed(4)}°N, ${found.lon.toFixed(4)}°E)</span>`;
  resultEl.style.display = "block";

  // ── Chạy song song: Nominatim reverse check (nếu là biển → toast) ──
  warnIfWaterAsync(found.lat, found.lon);

  // ── Analysis độc lập, chạy song song ──
  setTimeout(() => { if (typeof runAnalysis === "function") runAnalysis(); }, 600);
}

document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); smartGeocode(); }
});


function showWaterToast(lat, lon) {
  showCustomToast(`⚠️ Toạ độ (${lat.toFixed(3)}, ${lon.toFixed(3)}) có thể nằm trên biển — dữ liệu nông nghiệp có thể không chính xác.`);
}

// Hàm Toast tổng quát (dùng chung cho cả cảnh báo nước và cảnh báo API)
function showCustomToast(msg) {
  let el = document.getElementById("farmshift-water-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "farmshift-water-toast";
    el.style.cssText = `
      position:fixed;top:72px;left:50%;transform:translateX(-50%);
      z-index:120;padding:10px 18px;border-radius:10px;
      background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.5);
      color:#fcd34d;font-size:0.78rem;font-family:'Inter',sans-serif;
      box-shadow:0 4px 20px rgba(0,0,0,0.45);max-width:80vw;
      transition:opacity 0.4s;opacity:0;pointer-events:none;`;
    document.body.appendChild(el);
  }
  el.innerHTML = msg;
  el.style.opacity = "1";
  el.style.pointerEvents = "auto";
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  }, 8000);
}
