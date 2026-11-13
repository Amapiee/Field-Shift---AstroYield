// ─── Map Initialisation with Clean Esri Hybrid & Google Layers ────────────────
const map = L.map("map", {
  center: [10.04, 105.78],
  zoom: 6,
  zoomControl: true,
});

map.createPane("labelsPane");
map.getPane("labelsPane").style.zIndex = 450;
map.getPane("labelsPane").style.pointerEvents = "none";

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles &copy; Esri", maxZoom: 19 }
).addTo(map);

const esriRoads = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, opacity: 0.85, pane: "labelsPane" }
).addTo(map);

const esriLabels = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Labels &copy; Esri", maxZoom: 19, opacity: 0.98, pane: "labelsPane" }
).addTo(map);

const googleHybrid = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  { attribution: "&copy; Google Maps", maxZoom: 20, subdomains: ["0", "1", "2", "3"] }
);

function switchMapLayer(mode) {
  document.querySelectorAll(".layer-btn").forEach(b => b.classList.remove("active"));
  if (mode === "esri") {
    document.getElementById("btn-layer-esri").classList.add("active");
    if (map.hasLayer(googleHybrid)) map.removeLayer(googleHybrid);
    if (!map.hasLayer(esriSat)) map.addLayer(esriSat);
    if (!map.hasLayer(esriRoads)) map.addLayer(esriRoads);
    if (!map.hasLayer(esriLabels)) map.addLayer(esriLabels);
  } else if (mode === "google") {
    document.getElementById("btn-layer-google").classList.add("active");
    if (map.hasLayer(esriSat)) map.removeLayer(esriSat);
    if (map.hasLayer(esriRoads)) map.removeLayer(esriRoads);
    if (map.hasLayer(esriLabels)) map.removeLayer(esriLabels);
    if (!map.hasLayer(googleHybrid)) map.addLayer(googleHybrid);
  } else if (mode === "pure") {
    document.getElementById("btn-layer-pure").classList.add("active");
    if (map.hasLayer(googleHybrid)) map.removeLayer(googleHybrid);
    if (map.hasLayer(esriRoads)) map.removeLayer(esriRoads);
    if (map.hasLayer(esriLabels)) map.removeLayer(esriLabels);
    if (!map.hasLayer(esriSat)) map.addLayer(esriSat);
  }
}

const farmIcon = L.divIcon({
  className: "",
  html: '<div class="farm-marker">🌱</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function isValidLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
         lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function placeMarker(lat, lon, flyTo = false, zoom = null) {
  if (!isValidLatLon(lat, lon)) {
    console.warn("placeMarker: toạ độ không hợp lệ", lat, lon);
    return false;
  }
  if (farmMarker) map.removeLayer(farmMarker);
  farmMarker = L.marker([lat, lon], { icon: farmIcon }).addTo(map);
  farmMarker.bindPopup(
    `<div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;
      color:#10b981;background:#060d16;padding:6px 10px;border-radius:6px;border:1px solid #10b98144">
      📍 ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E
    </div>`,
    { closeButton: false, offset: [0, -12] }
  );
  document.getElementById("inp-lat").value = lat.toFixed(4);
  document.getElementById("inp-lon").value = lon.toFixed(4);
  farmLat = lat; farmLon = lon;
  if (flyTo) map.flyTo([lat, lon], zoom || Math.max(map.getZoom(), 11), { duration: 1.4 });
  document.getElementById("map-hint").style.opacity = "0";
  return true;
}

// Click map: đặt marker NGAY + check water ASYNC (không chặn UI)
map.on("click", e => {
  const { lat, lng: lon } = e.latlng;
  if (!isValidLatLon(lat, lon)) return;
  placeMarker(lat, lon);
  if (typeof warnIfWaterAsync === "function") warnIfWaterAsync(lat, lon);
});

placeMarker(farmLat, farmLon);