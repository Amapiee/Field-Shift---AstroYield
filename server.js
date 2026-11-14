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

app.use("/api", apiRoutes);
// Prevent fresh HTML/JS being paired with a cached older implementation.
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  setHeaders(res,file) { if (/\.(html|js|css)$/.test(file)) res.setHeader('Cache-Control','no-store'); }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🛰️  FarmShift Server starting on http://localhost:${PORT}`);
  if (process.env.DEBUG) console.log("  🐞 DEBUG mode: ON");
  console.log("");
});
