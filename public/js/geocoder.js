// ─── Multi-Engine High Precision Geocoder (ArcGIS + Photon + Nominatim) ──────
const GEO_TIMEOUT_MS = 4500;
let geocodeRequestSequence = 0;

async function queryArcGIS(q) {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(q)}&maxLocations=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
  if (!res.ok) throw new Error("ArcGIS HTTP " + res.status);
  const data = await res.json();
  if (data.candidates && data.candidates.length > 0 && data.candidates[0].score >= 35) {
    const candidate = data.candidates[0];
    return { lat: candidate.location.y, lon: candidate.location.x, name: candidate.address || q };
  }
  return null;
}

async function queryPhoton(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
  if (!res.ok) throw new Error("Photon HTTP " + res.status);
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    const feature = data.features[0];
    const [lon, lat] = feature.geometry.coordinates;
    const properties = feature.properties;
    const parts = [
      properties.name,
      properties.district,
      properties.city,
      properties.state,
      properties.country,
    ].filter(Boolean);
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
  const results = await res.json();
  if (results && results.length > 0) {
    return {
      lat: parseFloat(results[0].lat),
      lon: parseFloat(results[0].lon),
      name: results[0].display_name,
    };
  }
  return null;
}

async function smartGeocodeQuery(q) {
  try {
    const result = await queryArcGIS(q);
    if (result) return result;
  } catch (error) {
    console.warn("ArcGIS search failed:", error.message);
  }

  try {
    const result = await queryPhoton(q);
    if (result) return result;
  } catch (error) {
    console.warn("Photon search failed:", error.message);
  }

  try {
    const result = await queryNominatim(q);
    if (result) return result;
  } catch (error) {
    console.warn("Nominatim search failed:", error.message);
  }

  return null;
}

function isValidGeocodeResult(result) {
  return Number.isFinite(result?.lat) &&
    Number.isFinite(result?.lon) &&
    Math.abs(result.lat) <= 90 &&
    Math.abs(result.lon) <= 180;
}

function escapeGeocoderHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showGeocodeError(errorEl, message) {
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

async function smartGeocode() {
  const raw = document.getElementById("search-input").value.trim();
  if (!raw) return;

  const requestId = ++geocodeRequestSequence;
  const resultEl = document.getElementById("search-result");
  const errorEl = document.getElementById("search-error");
  const button = document.getElementById("btn-search");

  resultEl.style.display = "none";
  errorEl.style.display = "none";
  button.disabled = true;
  button.textContent = "⏳";

  let selectedCoordinates = null;
  try {
    let found = await smartGeocodeQuery(raw);
    if (!found && raw.includes(",")) {
      const parts = raw.split(",").map(part => part.trim()).filter(Boolean);
      while (parts.length > 1 && !found) {
        parts.shift();
        found = await smartGeocodeQuery(parts.join(", "));
        if (requestId !== geocodeRequestSequence) return;
      }
    }

    if (requestId !== geocodeRequestSequence) return;
    if (!found) {
      showGeocodeError(
        errorEl,
        `❌ Không tìm thấy: "${raw}". Vui lòng thử từ khóa khác (ví dụ: Phú Xuyên, Hà Nội, Cần Thơ, California).`
      );
      return;
    }
    if (!isValidGeocodeResult(found)) {
      showGeocodeError(errorEl, "❌ Dịch vụ tìm kiếm trả về tọa độ không hợp lệ.");
      return;
    }
    if (typeof getLocationClassification !== "function" ||
        typeof showLocationWarning !== "function") {
      throw new Error("Không thể kiểm tra vị trí bằng dữ liệu bản đồ.");
    }

    const lat = Number(found.lat.toFixed(4));
    const lon = Number(found.lon.toFixed(4));
    selectedCoordinates = { lat, lon };

    resetDashboardUI();
    closeWaterAlert();
    placeMarker(lat, lon, true, 13);
    button.textContent = "Đang kiểm tra...";
    setAnalysisMessage("Đang kiểm tra vị trí…");

    const location = await getLocationClassification(lat, lon);
    if (requestId !== geocodeRequestSequence || farmLat !== lat || farmLon !== lon) return;

    setAnalysisMessage("");
    if (showLocationWarning(location)) {
      showGeocodeError(errorEl, location.message);
      return;
    }

    resultEl.innerHTML = `📍 <strong>${escapeGeocoderHtml(found.name || raw)}</strong><br><span style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--cyan)">(${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)</span>`;
    resultEl.style.display = "block";
    setTimeout(() => {
      if (requestId === geocodeRequestSequence && farmLat === lat && farmLon === lon &&
          typeof runAnalysis === "function") {
        runAnalysis();
      }
    }, 600);
  } catch (error) {
    if (requestId !== geocodeRequestSequence ||
        (selectedCoordinates &&
          (farmLat !== selectedCoordinates.lat || farmLon !== selectedCoordinates.lon))) return;
    console.error("Location search failed:", error);
    const message = error?.message || "Không thể tìm hoặc xác minh vị trí.";
    showGeocodeError(errorEl, `❌ ${message}`);
    setAnalysisMessage(message);
  } finally {
    if (requestId === geocodeRequestSequence) {
      button.disabled = false;
      button.textContent = "🔍 Tìm";
    }
  }
}

document.getElementById("search-input").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    smartGeocode();
  }
});

function showWaterToast(lat, lon) {
  showCustomToast(`⚠️ Tọa độ (${lat.toFixed(3)}, ${lon.toFixed(3)}) có thể nằm trên biển — dữ liệu nông nghiệp có thể không chính xác.`);
}

function showCustomToast(message) {
  let element = document.getElementById("farmshift-water-toast");
  if (!element) {
    element = document.createElement("div");
    element.id = "farmshift-water-toast";
    element.style.cssText = `
      position:fixed;top:72px;left:50%;transform:translateX(-50%);
      z-index:120;padding:10px 18px;border-radius:10px;
      background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.5);
      color:#fcd34d;font-size:0.78rem;font-family:'Inter',sans-serif;
      box-shadow:0 4px 20px rgba(0,0,0,0.45);max-width:80vw;
      transition:opacity 0.4s;opacity:0;pointer-events:none;`;
    document.body.appendChild(element);
  }
  element.textContent = String(message);
  element.style.opacity = "1";
  element.style.pointerEvents = "auto";
  clearTimeout(element._timer);
  element._timer = setTimeout(() => {
    element.style.opacity = "0";
    element.style.pointerEvents = "none";
  }, 8000);
}
