// =============================================================================
// 🛰️ FARMSHIFT — Entry point
// NASA Space Apps Challenge 2026 · "Field Shift: Adapting Farms with NASA Data"
//
//   server.js            ← file này: cấu hình Express + khởi động
//   src/routes/api.js    ← các endpoint /api/*
//   src/services/        ← nasa.js · scoring.js · alerts.js
//   src/quantum/         ← statevector.js · qaoa.js
//   src/config/crops.js  ← dữ liệu cây trồng
//   public/              ← giao diện (html/css/js)
// =============================================================================
const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRoutes = require("./src/routes/api");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ── Request logger (chỉ log /api/* để giữ console sạch) ──
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    const t0 = Date.now();
    res.on("finish", () => {
      console.log(`[${req.method}] ${req.path} ${res.statusCode} ${Date.now() - t0}ms`);
    });
  }
  next();
});

// ── Health check (dùng để verify deploy) ──
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
});

// ── API ──
app.use("/api", apiRoutes);

// ── Static ──
app.use(express.static(path.join(__dirname, "public")));

// ── Global error handler ──
// Bắt RangeError từ scoring/nasa → trả JSON 400 thay vì HTML 500.
// LƯU Ý Express 4: async throws trong route handler KHÔNG tự rơi vào đây.
//   → Trong src/routes/api.js, handler async cần try/catch và:
//     • res.status(400).json({ ok:false, error: e.message })   (khuyến nghị)
//     • hoặc next(e) để middleware này xử lý
app.use((err, req, res, _next) => {
  console.error("[ERROR]", req.method, req.path, "→", err.message);
  const status = err instanceof RangeError ? 400 : (err.status || 500);
  res.status(status).json({ ok: false, error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🛰️  FarmShift Server starting on http://localhost:${PORT}`);
  if (process.env.DEBUG) console.log("  🐞 DEBUG mode: ON");
  console.log("");
});