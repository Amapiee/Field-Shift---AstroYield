// ─── Heatmap toàn cầu (Leaflet custom layer) ──────────────────────────────────
// Phụ thuộc: heatmap-core.js (HeatCore), map.js (map), state.js (MONTHS).

// ══════════════════════════════════════════════════════════════════
// CÁC HẰNG SỐ CẤU HÌNH
// ══════════════════════════════════════════════════════════════════
const HEAT_RES = 4;                       // px màn hình / 1 mẫu
const HEAT_PAD = 0.2;                     // phần canvas thừa quanh khung nhìn
const HEAT_GRID_URL = "/data/climate-grid.json";
const CROP_GRID_URL = "/data/crop-popularity-grid.json"; // <-- Đã thêm ở đây

const PANE_Z_INDEX = 250;                 
const DEFAULT_OPACITY = 0.6;              
const MIN_HOVER_WEIGHT = 0.25;            
const LON_HALF_CIRCLE = 180;
const LON_FULL_CIRCLE = 360;
const PERCENTAGE_MAX = 100;

const HEAT_LAYER_DEFS = [
  { id: "temp", key: "T2M",      label: "🌡️ Nhiệt độ không khí (2 m)",         nice: 5,    fmt: v => v.toFixed(1) + " °C" },
  { id: "rh",   key: "RH2M",     label: "💧 Độ ẩm không khí (RH2M)",            nice: 5,    fmt: v => v.toFixed(0) + " %" },
  { id: "soil", key: "GWETROOT", label: "🌱 Độ ẩm đất vùng rễ (SMAP/GWETROOT)", nice: 0.05, fmt: v => (v * 100).toFixed(0) + " %" },
  { id: "pop_rice",    key: "Rice",    label: "🌾 Độ phổ biến Lúa (Diện tích thu hoạch)",    nice: 1000, fmt: v => v.toFixed(0) + " ha" },
  { id: "pop_maize",   key: "Maize",   label: "🌽 Độ phổ biến Ngô (Diện tích thu hoạch)",    nice: 1000, fmt: v => v.toFixed(0) + " ha" },
  { id: "pop_soy",     key: "Soybean", label: "🫘 Độ phổ biến Đậu Tương (Diện tích thu hoạch)", nice: 1000, fmt: v => v.toFixed(0) + " ha" },
  { id: "pop_peanut",  key: "Peanut",  label: "🥜 Độ phổ biến Lạc (Diện tích thu hoạch)",    nice: 1000, fmt: v => v.toFixed(0) + " ha" },
  { id: "pop_veggies", key: "Veggies", label: "🥬 Độ phổ biến Rau Màu (Diện tích thu hoạch)", nice: 1000, fmt: v => v.toFixed(0) + " ha" },
];

// ── Lớp canvas ────────────────────────────────────────────────────────────────
const HeatCanvasLayer = L.Layer.extend({
  initialize() { this._state = null; this._raf = 0; this._img = null; },
  setState(state) { this._state = state; this._schedule(); },
  setOpacity(o) { if (this._canvas) this._canvas.style.opacity = o; this._opacity = o; },
  onAdd(map) {
    if (!map.getPane("heatPane")) {
      const p = map.createPane("heatPane");
      p.style.zIndex = PANE_Z_INDEX;            
      p.style.pointerEvents = "none";
    }
    this._canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated heat-canvas");
    this._canvas.style.opacity = this._opacity ?? DEFAULT_OPACITY;
    map.getPane("heatPane").appendChild(this._canvas);
    this._draw();
  },
  onRemove() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._canvas) { this._canvas.width = this._canvas.height = 0; L.DomUtil.remove(this._canvas); }
    this._canvas = null; this._img = null;
  },
  getEvents() {
    return { move: this._schedule, zoom: this._schedule, moveend: this._schedule, resize: this._schedule, zoomanim: this._animateZoom };
  },
  _schedule() {
    if (this._raf || !this._canvas) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
  },
  _animateZoom(e) {
    if (!this._canvas || !this._tlLatLng) return;
    const scale = this._map.getZoomScale(e.zoom, this._drawZoom);
    const offset = this._map._latLngToNewLayerPoint(this._tlLatLng, e.zoom, e.center);
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },
  _draw() {
    const map = this._map, c = this._canvas;
    if (!map || !c) return;
    const size = map.getSize();
    const padX = Math.round(size.x * HEAT_PAD), padY = Math.round(size.y * HEAT_PAD);
    const cssW = size.x + 2 * padX, cssH = size.y + 2 * padY;
    const w = Math.max(1, Math.ceil(cssW / HEAT_RES)), h = Math.max(1, Math.ceil(cssH / HEAT_RES));

    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this._img = null; }
    c.style.width = cssW + "px";
    c.style.height = cssH + "px";

    const tl = map.containerPointToLayerPoint([-padX, -padY]);
    L.DomUtil.setPosition(c, tl);
    this._tlLatLng = map.layerPointToLatLng(tl);
    this._drawZoom = map.getZoom();

    const ctx = c.getContext("2d");
    const st = this._state;
    if (!st) { ctx.clearRect(0, 0, w, h); return; }

    const zoom = map.getZoom();
    const worldSize = map.options.crs.scale(zoom);
    const origin = map.getPixelBounds().min;           
    const sx = cssW / w, sy = cssH / h;

    const lonAt = new Float32Array(w), latAt = new Float32Array(h);
    for (let i = 0; i < w; i++) lonAt[i] = HeatCore.lonAtPixelX(origin.x - padX + (i + 0.5) * sx, worldSize);
    for (let j = 0; j < h; j++) {
      const Y = origin.y - padY + (j + 0.5) * sy;
      latAt[j] = Y < 0 || Y > worldSize ? NaN : HeatCore.latAtPixelY(Y, worldSize);   
    }

    if (!this._img) this._img = ctx.createImageData(w, h);
    HeatCore.paint(this._img, st.grid, st.data, lonAt, latAt, st.range, st.lut);
    ctx.putImageData(this._img, 0, 0);
  },
});

// ── Điều khiển (state + UI) ───────────────────────────────────────────────────
const Heat = {
  grid: null,          
  decoded: {},         
  loading: null,
  layer: null,
  on: false,
  defId: "temp",
  month: 0,            
  invert: false,
  opacity: DEFAULT_OPACITY,
  lut: HeatCore.buildLUT(false),
  hoverRaf: 0,

  el(id) { return document.getElementById(id); },
  def() { return HEAT_LAYER_DEFS.find(d => d.id === this.defId); },

  async loadGrid() {
    if (this.grid) return;
    if (!this.loading) {
      this.loading = (async () => {
        // 1. Tải file khí hậu (Bắt buộc phải có)
        const climateRes = await fetch(HEAT_GRID_URL).catch(() => null);
        if (!climateRes || !climateRes.ok) throw new Error("Không tìm thấy file climate-grid.json");
        
        let climateGrid;
        try {
          const text = await climateRes.text();
          if (!text) throw new Error("File rỗng");
          climateGrid = JSON.parse(text);
        } catch (e) {
          throw new Error("File climate-grid.json bị lỗi hoặc rỗng.");
        }

        const err = HeatCore.validateGrid(climateGrid);
        if (err) throw new Error(err);

        // 2. Tải file cây trồng (Có thể lỗi hoặc không có, không được làm sập app)
        let cropGrid = null;
        try {
          const cropRes = await fetch(CROP_GRID_URL);
          if (cropRes && cropRes.ok) {
            const text = await cropRes.text();
            if (text) cropGrid = JSON.parse(text);
          }
        } catch (e) {
          console.warn("Bỏ qua file cây trồng do lỗi:", e.message);
        }

        // 3. Gộp dữ liệu (Nếu có file cây trồng)
        if (cropGrid && cropGrid.layers) {
          Object.assign(climateGrid.layers, cropGrid.layers);
        }

        // 4. Giải mã từng layer
        for (const d of HEAT_LAYER_DEFS) {
          if (!d.key) continue;
          
          // Nếu là layer cây trồng nhưng file JSON bị thiếu, bỏ qua không giải mã
          if (d.id.startsWith("pop_")) {
            if (!climateGrid.layers[d.key]) continue; 

            const dec = HeatCore.decodeStaticLayer(climateGrid, d.key, {
              percentileLow: HeatCore.CROP_PERCENTILE_LOW,
              percentileHigh: HeatCore.CROP_PERCENTILE_HIGH
            });
            if (dec) this.decoded[d.key] = dec;
          } else {
            const dec = HeatCore.decodeLayer(climateGrid, d.key);
            if (dec) this.decoded[d.key] = dec;
          }
        }

        if (!Object.keys(this.decoded).length) throw new Error("không có layer hợp lệ trong file lưới");
        
        const { layers, ...meta } = climateGrid;
        this.grid = meta;
      })().finally(() => { this.loading = null; });
    }
    return this.loading;
  },

  currentState() {
    const d = this.def();
    const dec = d && this.decoded[d.key];
    if (!dec) return null;
    const data = this.month === 0 ? dec.annual : dec.months[this.month - 1];
    const s = d.nice || 1;
    const range = { min: Math.floor(dec.min / s) * s, max: Math.ceil(dec.max / s) * s };
    return { grid: this.grid, data, range, lut: this.lut, def: d };
  },

  refresh() {
    const st = this.currentState();
    if (this.layer) this.layer.setState(st);
    this.updateLegend(st);
    const lbl = this.el("heat-month-val");
    if (lbl) lbl.textContent = this.month === 0 ? "Cả năm (TB)" : `Tháng ${this.month} (${MONTHS[this.month - 1]})`;
  },

  updateLegend(st) {
    const bar = this.el("heat-legend-bar");
    if (!bar) return;
    const stops = HeatCore.HEAT_STOPS.map(([t, c]) => [this.invert ? 1 - t : t, c]).sort((a, b) => a[0] - b[0]);
    bar.style.background = "linear-gradient(90deg," + stops.map(([t, c]) => `rgb(${c}) ${t * PERCENTAGE_MAX}%`).join(",") + ")";
    if (st) {
      this.el("heat-legend-min").textContent = st.def.fmt(st.range.min);
      this.el("heat-legend-max").textContent = st.def.fmt(st.range.max);
    }
  },

  setStatus(msg, kind) {
    const s = this.el("heat-status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "heat-status" + (kind ? " " + kind : "");
    s.style.display = msg ? "block" : "none";
  },

  async enable() {
    this.on = true;
    this.setStatus("Đang tải dữ liệu lưới…");
    try {
      await this.loadGrid();
    } catch (e) {
      console.warn("heatmap: tải lưới lỗi", e);
      this.on = false;
      this.el("heat-toggle").checked = false;
      this.setStatus("Không tải được dữ liệu heatmap: " + e.message, "err");
      return;
    }
    if (!this.on) return;                     
    if (!this.layer) { this.layer = new HeatCanvasLayer(); this.layer.setOpacity(this.opacity); }
    if (!map.hasLayer(this.layer)) this.layer.addTo(map);
    this.el("heat-controls").classList.add("show");
    this.refresh();
    
    if (this.grid.source === "synthetic") {
      this.setStatus("⚠️ Đang dùng dữ liệu MÔ PHỎNG (demo). Chạy `npm run build:grid` để thay bằng NASA POWER thật.", "warn");
    } else {
      this.setStatus(`Nguồn: ${this.grid.source} · lưới ${this.grid.step}°`, "");
    }
  },

  disable() {
    this.on = false;
    if (this.layer && map.hasLayer(this.layer)) map.removeLayer(this.layer);
    this.layer = null;                         
    this.el("heat-controls").classList.remove("show");
    this.el("heat-hover").textContent = "";
    this.setStatus("");
  },

  hover(latlng) {
    const st = this.on && this.currentState();
    const out = this.el("heat-hover");
    if (!st) return;
    const lon = ((latlng.lng + LON_HALF_CIRCLE) % LON_FULL_CIRCLE + LON_FULL_CIRCLE) % LON_FULL_CIRCLE - LON_HALF_CIRCLE;
    const o = HeatCore.sample(this.grid, st.data, latlng.lat, lon, { v: NaN, w: 0 });
    const pos = `${latlng.lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
    out.textContent = o.w >= MIN_HOVER_WEIGHT && o.v === o.v ? `🖱️ ${pos}: ${st.def.fmt(o.v)}` : `🖱️ ${pos}: không có dữ liệu`;
  },

  init() {
    const sel = this.el("heat-layer");
    if (!sel) return;                          
    sel.innerHTML = HEAT_LAYER_DEFS.map(d => `<option value="${d.id}"${d.disabled ? " disabled" : ""}>${d.label}</option>`).join("");
    sel.value = this.defId;

    this.el("heat-toggle").addEventListener("change", e => (e.target.checked ? this.enable() : this.disable()));
    sel.addEventListener("change", () => { this.defId = sel.value; this.refresh(); });
    this.el("heat-month").addEventListener("input", e => { this.month = +e.target.value; this.refresh(); });
    this.el("heat-opacity").addEventListener("input", e => {
      this.opacity = +e.target.value / PERCENTAGE_MAX;
      if (this.layer) this.layer.setOpacity(this.opacity);
    });
    this.el("heat-invert").addEventListener("change", e => {
      this.invert = e.target.checked;
      this.lut = HeatCore.buildLUT(this.invert);
      this.refresh();
    });

    map.on("mousemove", e => {
      if (!this.on || this.hoverRaf) return;
      const ll = e.latlng;
      this.hoverRaf = requestAnimationFrame(() => { this.hoverRaf = 0; this.hover(ll); });
    });
    map.on("mouseout", () => { this.el("heat-hover").textContent = ""; });

    this.updateLegend(null);
    this.refresh();
  },
};

Heat.init();