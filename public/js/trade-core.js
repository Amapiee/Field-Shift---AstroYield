// ─── Trade core (Pure calculation, no DOM/Leaflet dependencies) ──────────────
(function (root) {
  "use strict";

  const RAD = Math.PI / 180, DEG = 180 / Math.PI;

  // Tọa độ đầu mối NỘI LỤC (Inland Hubs) cho đường bộ thay vì lấy Cảng biển (Port)
  const INLAND_HUBS = {
    VN: { lat: 21.0285, lon: 105.8542, n: "Hanoi Inland Hub" },
    CN: { lat: 22.8170, lon: 108.3665, n: "Nanning / Kunming Hub" },
    TH: { lat: 13.7563, lon: 100.5018, n: "Bangkok Inland Hub" },
    KH: { lat: 11.5564, lon: 104.9282, n: "Phnom Penh Hub" },
    LA: { lat: 17.9757, lon: 102.6331, n: "Vientiane Hub" },
    MM: { lat: 21.9588, lon: 96.0891,  n: "Mandalay Hub" },
    MY: { lat: 3.1390,  lon: 101.6869, n: "Kuala Lumpur Hub" },
    SG: { lat: 1.3521,  lon: 103.8198, n: "Singapore Causeway" },
    IN: { lat: 23.8315, lon: 91.2868,  n: "Northeast India Hub" },
    US: { lat: 39.0997, lon: -94.5786, n: "Kansas City Rail/Road Hub" },
    CA: { lat: 49.8951, lon: -97.1384, n: "Winnipeg Hub" },
    MX: { lat: 25.6866, lon: -100.3161,n: "Monterrey Hub" },
    BR: { lat: -15.7975,lon: -47.8919, n: "Brasilia Inland Hub" },
    AR: { lat: -31.4201,lon: -64.1888, n: "Cordoba Inland Hub" },
    DE: { lat: 50.1109, lon: 8.6821,   n: "Frankfurt Logistics Hub" },
    FR: { lat: 45.7640, lon: 4.8357,   n: "Lyon Inland Hub" },
    NL: { lat: 51.8426, lon: 5.8528,   n: "Nijmegen Border Hub" },
    PL: { lat: 52.2297, lon: 21.0122,  n: "Warsaw Hub" },
    UA: { lat: 49.8397, lon: 24.0297,  n: "Lviv Overland Hub" },
    RU: { lat: 55.7558, lon: 37.6173,  n: "Moscow Rail Hub" },
  };

  // Các điểm trung chuyển biên giới đất liền (Waypoints) tránh cắt qua vịnh/biển
  const LAND_WAYPOINTS = {
    "VN-CN": [[21.0285, 105.8542], [21.9735, 106.7578], [22.8170, 108.3665]], // Hà Nội -> Lạng Sơn -> Nam Ninh
    "VN-TH": [[21.0285, 105.8542], [18.6796, 105.6813], [16.6267, 106.5900], [16.5449, 104.7235], [14.9799, 102.0978], [13.7563, 100.5018]], // Qua Cầu Hữu Nghị 2 (Lào)
    "VN-KH": [[10.8231, 106.6297], [11.0686, 106.1664], [11.5564, 104.9282]], // TP.HCM -> Mộc Bài -> Phnom Penh
    "VN-LA": [[21.0285, 105.8542], [18.6796, 105.6813], [18.3814, 105.1481], [17.9757, 102.6331]], // Hà Nội -> Cầu Treo -> Vientiane
    "TH-MY": [[13.7563, 100.5018], [9.1382, 99.3217], [6.5411, 100.4286], [3.1390, 101.6869]], // Chạy dọc bán đảo Mã Lai
    "TH-CN": [[13.7563, 100.5018], [18.7883, 98.9853], [20.2350, 100.4046], [22.0088, 100.7972], [25.0389, 102.7183]], // Bangkok -> Chiang Rai -> Côn Minh
    "US-MX": [[39.0997, -94.5786], [32.7767, -96.7970], [27.5036, -99.5076], [25.6866, -100.3161]], // Qua Laredo
    "US-CA": [[39.0997, -94.5786], [46.8772, -96.7898], [49.8951, -97.1384]],
  };

  function greatCircle(lat1, lon1, lat2, lon2, n = 48) {
    const φ1 = lat1 * RAD, λ1 = lon1 * RAD, φ2 = lat2 * RAD, λ2 = lon2 * RAD;
    const d = 2 * Math.asin(Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
    if (!(d > 1e-9)) return [[lat1, lon1], [lat2, lon2]];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      pts.push([Math.atan2(z, Math.sqrt(x * x + y * y)) * DEG, Math.atan2(y, x) * DEG]);
    }
    return unwrapLon(pts);
  }

  // Tạo đường cong vòm cao (Bezier Arc) cho tuyến Hàng không để tách biệt khỏi đường biển/bộ
  function airArc(lat1, lon1, lat2, lon2, n = 48) {
    const base = greatCircle(lat1, lon1, lat2, lon2, n);
    if (base.length < 3) return base;
    const dLat = lat2 - lat1, dLon = base[base.length - 1][1] - base[0][1];
    const dist = Math.hypot(dLat, dLon);
    const archOffset = Math.min(12, dist * 0.16); // Độ vồng lên của đường bay
    return base.map(([lat, lon], idx) => {
      const t = idx / (base.length - 1);
      const parabola = 4 * t * (1 - t); // Đạt đỉnh ở giữa đường bay (t = 0.5)
      return [Math.max(-85, Math.min(85, lat + archOffset * parabola)), lon];
    });
  }

  // Nội suy mượt qua chuỗi các điểm biên giới trên đất liền
  function interpolateLandChain(waypoints, stepsPerSeg = 12) {
    if (!waypoints || waypoints.length < 2) return waypoints || [];
    const out = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [la1, lo1] = waypoints[i];
      const [la2, lo2] = waypoints[i + 1];
      for (let s = 0; s < stepsPerSeg; s++) {
        const t = s / stepsPerSeg;
        out.push([la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t]);
      }
    }
    out.push(waypoints[waypoints.length - 1]);
    return out;
  }

  function unwrapLon(pts) {
    const out = [];
    let off = 0, prev = null;
    for (const [lat, lon] of pts) {
      if (prev !== null) {
        const d = lon - prev;
        if (d > 180) off -= 360; else if (d < -180) off += 360;
      }
      prev = lon;
      out.push([lat, lon + off]);
    }
    return out;
  }

  function centerPath(pts) {
    if (!pts.length) return pts;
    let sum = 0;
    for (const p of pts) sum += p[1];
    const k = Math.round(sum / pts.length / 360);
    return k === 0 ? pts : pts.map(([la, lo]) => [la, lo - 360 * k]);
  }

  function widthFor(kt, max, min = 1.6, span = 5.5) {
    if (!(max > 0) || !(kt > 0)) return min;
    return min + span * Math.sqrt(Math.min(1, kt / max));
  }

  function fmtKt(kt) {
    if (!Number.isFinite(kt)) return "—";
    if (kt >= 1000) return (kt / 1000).toFixed(kt >= 10000 ? 0 : 1) + " Mt";
    return (kt >= 100 ? kt.toFixed(0) : kt.toFixed(1)) + " kt";
  }

  function selectFlows(data, hubs, sel) {
    const byCrop = {};
    const wanted = sel.crop === "all" ? null : new Set(Array.isArray(sel.crop) ? sel.crop : [sel.crop]);
    for (const f of data.flows) {
      if (wanted && !wanted.has(f.crop)) continue;
      if (!hubs[f.from] || !hubs[f.to]) continue;
      const any = ["sea", "air", "land"].some((m) => sel.modes[m] && f.modes[m]);
      if (!any) continue;
      (byCrop[f.crop] = byCrop[f.crop] || []).push(f);
    }
    const items = [];
    for (const crop of Object.keys(byCrop)) {
      const list = byCrop[crop].sort((a, b) => b.kt - a.kt).slice(0, Math.max(1, sel.topN | 0));
      let max = 0;
      for (const f of list) for (const m of ["sea", "air", "land"]) if (sel.modes[m] && f.modes[m]) max = Math.max(max, f.modes[m].kt);
      for (const f of list) {
        for (const m of ["sea", "air", "land"]) {
          if (!sel.modes[m] || !f.modes[m]) continue;
          items.push({ flow: f, mode: m, kt: f.modes[m].kt, km: f.modes[m].km, max, crop });
        }
      }
    }
    items.sort((a, b) => a.kt / a.max - b.kt / b.max);
    return items;
  }

  // Lấy tọa độ đầu cuối của đường bộ (ưu tiên hub nội địa thay vì cảng biển)
  function getLandEndpoints(fromIso, toIso, hubs) {
    const A = INLAND_HUBS[fromIso] || hubs[fromIso]?.land || hubs[fromIso]?.air || hubs[fromIso]?.port;
    const B = INLAND_HUBS[toIso]   || hubs[toIso]?.land   || hubs[toIso]?.air   || hubs[toIso]?.port;
    return { A, B };
  }

  function pathFor(item, hubs) {
    const { flow, mode } = item;
    // 1. Đường biển: Đi theo sea path đã tránh đất liền
    if (mode === "sea" && flow.modes.sea && flow.modes.sea.path) {
      return centerPath(unwrapLon(flow.modes.sea.path));
    }

    // 2. Đường hàng không: Đi từ Sân bay tới Sân bay theo cung vòm cao
    if (mode === "air") {
      const A = hubs[flow.from].air, B = hubs[flow.to].air;
      return centerPath(airArc(A.lat, A.lon, B.lat, B.lon, 56));
    }

    // 3. Đường bộ (Overland): Ưu tiên path có sẵn -> Hành lang biên giới nội địa -> Hub nội địa
    if (mode === "land") {
      if (flow.modes.land && Array.isArray(flow.modes.land.path) && flow.modes.land.path.length >= 2) {
        return centerPath(unwrapLon(flow.modes.land.path));
      }
      const pairKey = `${flow.from}-${flow.to}`;
      const revKey  = `${flow.to}-${flow.from}`;
      if (LAND_WAYPOINTS[pairKey]) {
        return centerPath(unwrapLon(interpolateLandChain(LAND_WAYPOINTS[pairKey])));
      }
      if (LAND_WAYPOINTS[revKey]) {
        return centerPath(unwrapLon(interpolateLandChain([...LAND_WAYPOINTS[revKey]].reverse())));
      }
      const { A, B } = getLandEndpoints(flow.from, flow.to, hubs);
      return centerPath(interpolateLandChain([[A.lat, A.lon], [B.lat, B.lon]], 24));
    }

    const A = hubs[flow.from].port, B = hubs[flow.to].port;
    return centerPath(greatCircle(A.lat, A.lon, B.lat, B.lon, 32));
  }

  function hubUsage(items, hubs) {
    const m = new Map();
    const add = (iso, kind, dir, kt) => {
      const key = `${kind}:${iso}`;
      let e = m.get(key);
      if (!e) {
        let h;
        if (kind === "air") h = hubs[iso].air;
        else if (kind === "land") h = INLAND_HUBS[iso] || hubs[iso].air || hubs[iso].port;
        else h = hubs[iso].port;
        e = { key, iso, kind, lat: h.lat, lon: h.lon, place: h.n || h.name, country: hubs[iso].name, out: 0, in: 0 };
        m.set(key, e);
      }
      e[dir] += kt;
    };
    for (const it of items) {
      const kind = it.mode === "air" ? "air" : (it.mode === "land" ? "land" : "port");
      add(it.flow.from, kind, "out", it.kt);
      add(it.flow.to, kind, "in", it.kt);
    }
    return m;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function snapBounds(b, step = 0.5) {
    return {
      s: Math.max(-90, Math.floor(b.s / step) * step), w: Math.max(-180, Math.floor(b.w / step) * step),
      n: Math.min(90, Math.ceil(b.n / step) * step), e: Math.min(180, Math.ceil(b.e / step) * step),
    };
  }
  function boundsKey(b) { return `${b.s},${b.w},${b.n},${b.e}`; }

  function overpassQuery(b, limit = 400) {
    const bb = `${b.s},${b.w},${b.n},${b.e}`;
    return `[out:json][timeout:25];(` +
      `nwr["amenity"="marketplace"](${bb});` +
      `nwr["shop"="farm"](${bb});` +
      `nwr["shop"="greengrocer"](${bb});` +
      `);out center ${limit};`;
  }

  function classifyMarket(tags) {
    if (!tags) return null;
    if (tags.amenity === "marketplace") return "market";
    if (tags.shop === "farm") return "farm";
    if (tags.shop === "greengrocer") return "greengrocer";
    return null;
  }

  function parseOverpass(json) {
    const out = [];
    const els = json && Array.isArray(json.elements) ? json.elements : [];
    for (const e of els) {
      const lat = e.lat ?? (e.center && e.center.lat), lon = e.lon ?? (e.center && e.center.lon);
      const kind = classifyMarket(e.tags);
      if (!kind || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({ id: `${e.type}/${e.id}`, lat, lon, kind, name: (e.tags && (e.tags.name || e.tags["name:vi"] || e.tags["name:en"])) || "" });
    }
    return out;
  }

  function validateFlows(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.flows)) return "Missing flows array";
    for (const f of d.flows) {
      if (!f.crop || !f.from || !f.to || !f.modes) return "Flow missing required fields";
    }
    return null;
  }

  const api = {
    greatCircle, airArc, unwrapLon, centerPath, widthFor, fmtKt, selectFlows, pathFor, getLandEndpoints, hubUsage, escapeHtml,
    snapBounds, boundsKey, overpassQuery, classifyMarket, parseOverpass, validateFlows,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TradeCore = api;
})(typeof window !== "undefined" ? window : globalThis);