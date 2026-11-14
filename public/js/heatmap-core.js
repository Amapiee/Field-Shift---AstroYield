// ─── Heatmap core (thuần tính toán, không đụng DOM/Leaflet) ───────────────────
// Dùng được cả trong trình duyệt (biến toàn cục) lẫn Node (module.exports) để test.
//
// Định dạng lưới (public/data/climate-grid.json):
//   step, lat0, lon0 = toạ độ TÂM ô đầu tiên (Bắc-Tây), nLat × nLon, row-major từ Bắc xuống Nam.
//   layers[KEY] = { unit, scale, months: [12 mảng Int], } ; giá trị = missing → không có dữ liệu.

(function (root) {
  "use strict";

  // ══════════════════════════════════════════════════════════════════
  // CÁC HẰNG SỐ CẤU HÌNH (Thay thế cho Magic Numbers)
  // ══════════════════════════════════════════════════════════════════
  
  // Phân vị mặc định cho dữ liệu khí hậu (bỏ qua 2% cực trị)
  const DEFAULT_PERCENTILE_LOW = 0.02;
  const DEFAULT_PERCENTILE_HIGH = 0.98;
  
  // Phân vị mặc định cho dữ liệu cây trồng (bỏ qua 5% cực trị để màu sắc nổi bật hơn)
  const CROP_PERCENTILE_LOW = 0.05;
  const CROP_PERCENTILE_HIGH = 0.95;

  // Trọng số nội suy tối thiểu để một pixel được coi là có dữ liệu hợp lệ (tránh viền răng cưa)
  const MIN_VALID_WEIGHT = 0.25;
  // Trọng số đạt ngưỡng này thì màu hiển thị đậm hoàn toàn (alpha = 255)
  const FULL_OPACITY_WEIGHT = 0.6;
  // Khoảng đệm để chuyển màu mượt mà từ viền trong suốt sang màu đậm
  const SOFT_EDGE_RANGE = FULL_OPACITY_WEIGHT - MIN_VALID_WEIGHT; // 0.6 - 0.25 = 0.35

  // Thang màu: ít → nhiều = xanh đậm → xanh nhạt → vàng → đỏ nhạt → đỏ đậm
  const HEAT_STOPS = [
    [0.00, [0, 104, 55]],
    [0.25, [140, 210, 110]],
    [0.50, [255, 233, 107]],
    [0.75, [244, 121, 107]],
    [1.00, [165, 0, 38]],
  ];

  function buildLUT(invert = false, size = 256) {
    const lut = new Uint8ClampedArray(size * 3);
    for (let i = 0; i < size; i++) {
      let t = i / (size - 1);
      if (invert) t = 1 - t;
      let k = 0;
      while (k < HEAT_STOPS.length - 2 && t > HEAT_STOPS[k + 1][0]) k++;
      const [t0, c0] = HEAT_STOPS[k], [t1, c1] = HEAT_STOPS[k + 1];
      const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
    }
    return lut;
  }

  // Giải mã 1 layer thành Float32Array [12 tháng + 1 trung bình năm] — NaN = thiếu.
  // Trả thêm min/max toàn cục (qua mọi tháng) để thang màu ổn định khi đổi tháng.
  function decodeLayer(grid, key, options = {}) {
    // Sử dụng biến có tên thay vì magic number, cho phép truyền options từ bên ngoài
    const pLow = options.percentileLow ?? DEFAULT_PERCENTILE_LOW;
    const pHigh = options.percentileHigh ?? DEFAULT_PERCENTILE_HIGH;

    const L = grid.layers && grid.layers[key];
    if (!L || !Array.isArray(L.months) || L.months.length !== 12) return null;
    const n = grid.nLat * grid.nLon;
    const months = [];
    let lo = Infinity, hi = -Infinity;
    
    for (let m = 0; m < 12; m++) {
      const src = L.months[m];
      if (!src || src.length !== n) return null;
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const v = src[i];
        if (v === grid.missing || v === null || !Number.isFinite(v)) { arr[i] = NaN; continue; }
        const x = v / L.scale;
        arr[i] = x;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      months.push(arr);
    }
    
    const annual = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let m = 0; m < 12; m++) { const v = months[m][i]; if (v === v) { s += v; c++; } }
      annual[i] = c === 12 ? s / 12 : NaN;
    }
    
    // Thang màu theo phân vị CÓ TRỌNG SỐ DIỆN TÍCH (cos vĩ độ): ô ở cực nhỏ hơn ô ở xích đạo,
    // nên cực trị như Nam Cực không làm méo thang màu của vùng canh tác.
    const pairs = [];
    let wTot = 0;
    for (let m = 0; m < 12; m++) {
      for (let i = 0; i < n; i++) {
        const v = months[m][i];
        if (v !== v) continue;
        const lat = grid.lat0 - Math.floor(i / grid.nLon) * grid.step;
        const wgt = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
        pairs.push([v, wgt]);
        wTot += wgt;
      }
    }
    pairs.sort((a, b) => a[0] - b[0]);
    
    const q = (p) => {
      let acc = 0;
      for (const [v, wgt] of pairs) { acc += wgt; if (acc >= p * wTot) return v; }
      return pairs.length ? pairs[pairs.length - 1][0] : 0;
    };
    
    // SỬA LỖI: Sử dụng biến pLow và pHigh thay vì hardcode 0.02 và 0.98
    const finalMin = pairs.length ? q(pLow) : lo;
    const finalMax = pairs.length ? q(pHigh) : hi;
    
    return { 
      months, 
      annual, 
      min: finalMin, 
      max: finalMax > finalMin ? finalMax : finalMin + 1, 
      absMin: lo, 
      absMax: hi, 
      unit: L.unit || "" 
    };
  }

  function decodeStaticLayer(grid, key, options = {}) {
    const pLow = options.percentileLow ?? DEFAULT_PERCENTILE_LOW;
    const pHigh = options.percentileHigh ?? DEFAULT_PERCENTILE_HIGH;
    const L = grid.layers && grid.layers[key];
    
    // Yêu cầu cấu trúc: L.data là một mảng 1 chiều
    if (!L || !Array.isArray(L.data)) return null;
    const n = grid.nLat * grid.nLon;
    const src = L.data;
    if (src.length !== n) return null;
    
    const arr = new Float32Array(n);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = src[i];
      // Coi giá trị 0 là không có dữ liệu (để bản đồ không bị nhuộm kín đại dương)
      if (v === grid.missing || v === null || !Number.isFinite(v) || v === 0) { arr[i] = NaN; continue; }
      const x = v / L.scale;
      arr[i] = x;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    
    // Tính phân vị tương tự như dữ liệu khí hậu
    const pairs = [];
    let wTot = 0;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v !== v) continue;
      const lat = grid.lat0 - Math.floor(i / grid.nLon) * grid.step;
      const wgt = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
      pairs.push([v, wgt]);
      wTot += wgt;
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const q = (p) => {
      let acc = 0;
      for (const [v, wgt] of pairs) { acc += wgt; if (acc >= p * wTot) return v; }
      return pairs.length ? pairs[pairs.length - 1][0] : 0;
    };
    const finalMin = pairs.length ? q(pLow) : lo;
    const finalMax = pairs.length ? q(pHigh) : hi;
    
    // Fake mảng months để không lỗi nếu frontend vô tình gọi
    const months = Array(12).fill(arr); 
    
    return { 
      months, 
      annual: arr, 
      min: finalMin, 
      max: finalMax > finalMin ? finalMax : finalMin + 1, 
      absMin: lo, 
      absMax: hi, 
      unit: L.unit || "" 
    };
  }
  
  // Ánh xạ pixel → toạ độ (Web Mercator, EPSG:3857 như Leaflet). worldSize = 256 * 2^zoom
  function lonAtPixelX(X, worldSize) {
    let lon = (X / worldSize) * 360 - 180;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return lon;
  }
  
  function latAtPixelY(Y, worldSize) {
    const n = Math.PI * (1 - (2 * Y) / worldSize);
    return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  }

  // Chuẩn bị chỉ số nội suy cho 1 trục (dùng lại cho mọi pixel cùng hàng/cột)
  function axisIndex(g, n, wrap) {
    if (!wrap) g = g < 0 ? 0 : g > n - 1 ? n - 1 : g;   // ngoài rìa: dùng giá trị hàng gần nhất
    let i0 = Math.floor(g), i1 = i0 + 1;
    const f = g - i0;
    if (wrap) {
      i0 = ((i0 % n) + n) % n;
      i1 = ((i1 % n) + n) % n;
    } else if (i1 > n - 1) i1 = n - 1;
    return [i0, i1, f];
  }

  // Nội suy song tuyến tại (lat, lon). Ô thiếu dữ liệu (NaN) bị bỏ qua và trọng số
  // được chuẩn hoá lại → không "kéo" màu về 0. Trả { v, w } với w = tổng trọng số hợp lệ [0..1].
  const _out = { v: NaN, w: 0 };
  function sample(grid, data, lat, lon, out = _out) {
    const gy = (grid.lat0 - lat) / grid.step;
    const gx = (lon - grid.lon0) / grid.step;
    const [y0, y1, fy] = axisIndex(gy, grid.nLat, false);
    const [x0, x1, fx] = axisIndex(gx, grid.nLon, true);
    return sample4(grid, data, y0, y1, fy, x0, x1, fx, out);
  }
  
  function sample4(grid, data, y0, y1, fy, x0, x1, fx, out) {
    const W = grid.nLon;
    const a = data[y0 * W + x0], b = data[y0 * W + x1];
    const c = data[y1 * W + x0], d = data[y1 * W + x1];
    const wa = (1 - fy) * (1 - fx), wb = (1 - fy) * fx, wc = fy * (1 - fx), wd = fy * fx;
    let s = 0, w = 0;
    if (a === a) { s += a * wa; w += wa; }
    if (b === b) { s += b * wb; w += wb; }
    if (c === c) { s += c * wc; w += wc; }
    if (d === d) { s += d * wd; w += wd; }
    out.v = w > 0 ? s / w : NaN;
    out.w = w;
    return out;
  }

  // Vẽ heatmap vào ImageData (w×h) — mỗi pixel = 1 mẫu.
  //   lonAt[i] / latAt[j]: toạ độ của cột i / hàng j (tính sẵn, chỉ W+H phép lượng giác)
  //   range = {min,max}; lut từ buildLUT
  function paint(imageData, grid, data, lonAt, latAt, range, lut) {
    const w = imageData.width, h = imageData.height, px = imageData.data;
    const span = range.max - range.min || 1;
    const nL = grid.nLat, nO = grid.nLon;

    // Chỉ số trục dọc/ngang tính trước
    const xs = new Array(w);
    for (let i = 0; i < w; i++) xs[i] = axisIndex((lonAt[i] - grid.lon0) / grid.step, nO, true);
    const ys = new Array(h);
    for (let j = 0; j < h; j++) ys[j] = latAt[j] === latAt[j] ? axisIndex((grid.lat0 - latAt[j]) / grid.step, nL, false) : null;

    const o = { v: NaN, w: 0 };
    let p = 0;
    for (let j = 0; j < h; j++) {
      if (!ys[j]) {                                    // hàng nằm ngoài vùng Mercator (lat = NaN)
        for (let i = 0; i < w; i++, p += 4) px[p + 3] = 0;
        continue;
      }
      const [y0, y1, fy] = ys[j];
      for (let i = 0; i < w; i++, p += 4) {
        const [x0, x1, fx] = xs[i];
        sample4(grid, data, y0, y1, fy, x0, x1, fx, o);
        
        // SỬ DỤNG HẰNG SỐ THAY VÌ MAGIC NUMBER
        if (o.w < MIN_VALID_WEIGHT || o.v !== o.v) { 
            px[p + 3] = 0; 
            continue; 
        } 
        
        let t = (o.v - range.min) / span;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const k = ((t * 255 + 0.5) | 0) * 3;
        px[p] = lut[k]; px[p + 1] = lut[k + 1]; px[p + 2] = lut[k + 2];
        
        // Tính độ mờ (Alpha) dựa trên trọng số
        px[p + 3] = o.w >= FULL_OPACITY_WEIGHT 
            ? 255 
            : (255 * (o.w - MIN_VALID_WEIGHT)) / SOFT_EDGE_RANGE;  // Viền mềm ở bờ biển
      }
    }
  }

  function validateGrid(g) {
    if (!g || typeof g !== "object") return "dữ liệu rỗng";
    for (const k of ["step", "lat0", "lon0", "nLat", "nLon"]) {
      if (!Number.isFinite(g[k])) return `thiếu trường ${k}`;
    }
    if (!(g.step > 0) || g.nLat < 2 || g.nLon < 2) return "kích thước lưới không hợp lệ";
    if (!g.layers) return "thiếu layers";
    return null;
  }

  // Xuất các hàm và hằng số ra ngoài
   const api = { 
    HEAT_STOPS, 
    CROP_PERCENTILE_LOW, 
    CROP_PERCENTILE_HIGH, 
    buildLUT, 
    decodeLayer, 
    decodeStaticLayer, // <-- Thêm dòng này
    lonAtPixelX, 
    latAtPixelY, 
    sample, 
    paint, 
    validateGrid 
  };
  
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HeatCore = api;
})(typeof window !== "undefined" ? window : globalThis);