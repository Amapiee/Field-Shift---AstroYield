// ─── Multi-Engine High Precision Geocoder (ArcGIS + Photon + Nominatim) ──────
async function queryArcGIS(q) {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(q)}&maxLocations=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("ArcGIS HTTP " + res.status);
  const data = await res.json();
  if (data.candidates && data.candidates.length > 0 && data.candidates[0].score >= 35) {
    const c = data.candidates[0];
    return {
      lat: c.location.y,
      lon: c.location.x,
      name: c.address || q
    };
  }
  return null;
}

async function queryPhoton(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Photon HTTP " + res.status);
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    const feat = data.features[0];
    const [lon, lat] = feat.geometry.coordinates;
    const p = feat.properties;
    const parts = [p.name, p.district, p.city, p.state, p.country].filter(Boolean);
    return {
      lat: lat,
      lon: lon,
      name: parts.join(", ") || q
    };
  }
  return null;
}

async function queryNominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=vi,en&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": "FarmShift-NASA-SpaceApps/2026" } });
  if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
  const list = await res.json();
  if (list && list.length > 0) {
    return {
      lat: parseFloat(list[0].lat),
      lon: parseFloat(list[0].lon),
      name: list[0].display_name
    };
  }
  return null;
}

// Ham Async
async function smartGeocodeQuery(q) {
  // 1. ArcGIS World Geocoding (Primary - instant, resolves phu xuyen -> Phú Xuyên, no DNS block)
  try {
    const r = await queryArcGIS(q);
    if (r) return r;
  } catch (e) {
    console.warn("ArcGIS search failed:", e);
  }

  // 2. Photon Komoot OSM Mirror
  try {
    const r = await queryPhoton(q);
    if (r) return r;
  } catch (e) {
    console.warn("Photon search failed:", e);
  }

  // 3. Nominatim OSM
  try {
    const r = await queryNominatim(q);
    if (r) return r;
  } catch (e) {
    console.warn("Nominatim search failed:", e);
  }

  return null;
}

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

  // 1. First search full query
  let found = await smartGeocodeQuery(raw);

  // 2. If not found and input contains commas, fall back recursively
  if (!found && raw.includes(",")) {
    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    while (parts.length > 1 && !found) {
      parts.shift();
      found = await smartGeocodeQuery(parts.join(", "));
    }
  }

  btn.disabled = false;
  btn.textContent = "Tìm";

  if (found) {
    const lat = Number(found.lat.toFixed(4));
    const lon = Number(found.lon.toFixed(4));
    
    // 3. Use the same offline land/water/glacier geometry as manual map selection.
    btn.disabled = true;
    btn.textContent = "Đang kiểm tra...";
    placeMarker(lat, lon, true, 13);
    resetDashboardUI();closeWaterAlert();
    try {
      const geo = await getLocationClassification(lat, lon);
      if (farmLat !== lat || farmLon !== lon) return;
      if (showLocationWarning(geo)) {
        errorEl.textContent = geo.message;
        errorEl.style.display = 'block';
        return;
      }
    } catch (error) {
      setAnalysisMessage(error.message);
      return;
    } finally {
      btn.disabled = false; btn.textContent = 'Tìm';
    }

    // 4. Nếu là đất liền, tiếp tục hiển thị và phân tích
    placeMarker(lat, lon, true, 13);

    resultEl.innerHTML = `📍 <strong>${found.name}</strong><br><span style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--cyan)">(${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)</span>`;
    resultEl.style.display = "block";

    setTimeout(() => { if (farmLat === lat && farmLon === lon) runAnalysis(); }, 600);
  } else {
    errorEl.textContent = `❌ Không tìm thấy: "${raw}". Vui lòng thử từ khóa khác (ví dụ: Phú Xuyên, Hà Nội, Cần Thơ, California).`;
    errorEl.style.display = "block";
  }
}

document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    smartGeocode();
  }
});

