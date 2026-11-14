const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const apiRouter = require("../src/routes/api");

test("POST /api/analyze trả về dữ liệu đúng chuẩn giao diện cho đất liền nông nghiệp", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 10.04,
        lon: 105.78,
        w_soil: 0.33,
        w_water: 0.33,
        w_profit: 0.34,
        user_crops: ["Rice", "Soybean", "Maize"]
      })
    });

    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.ok(data.source);
    assert.ok(data.satellite);
    assert.strictEqual(data.monthly.T2M.length, 12);
    assert.strictEqual(data.monthly.RAIN.length, 12);
    assert.ok(data.scenarios.user);
    assert.ok(data.scenarios.quantum);
    assert.ok(data.scenarios.baseline);
    assert.ok(data.mcda.ahp);
    assert.ok(data.mcda.topsis);
    assert.ok(data.seasonal_clusters);
    assert.ok(typeof data.scenarios.quantum.feasibility_rate_pct === "number");
    assert.ok(typeof data.scenarios.quantum.optimality_gap_pct === "number");
  } finally {
    server.close();
  }
});

test("POST /api/analyze nhận diện đúng Vịnh Bắc Bộ (19.5308, 106.6433) là BIỂN", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 19.5308,
        lon: 106.6433,
        w_soil: 0.33,
        w_water: 0.33,
        w_profit: 0.34
      })
    });

    const data = await res.json();
    assert.strictEqual(data.ok, false);
    assert.strictEqual(data.is_water, true);
    assert.strictEqual(data.terrain_type, "OCEAN");
  } finally {
    server.close();
  }
});

test("POST /api/analyze nhận diện đúng Thái Bình (20.3864, 106.4196) là ĐẤT LIỀN và phân tích thành công", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 20.3864,
        lon: 106.4196,
        w_soil: 0.33,
        w_water: 0.33,
        w_profit: 0.34,
        user_crops: ["Rice", "Soybean", "Maize"]
      })
    });

    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.is_water, undefined);
    assert.ok(data.scenarios.user);
    assert.ok(data.scenarios.quantum);
  } finally {
    server.close();
  }
});

test("POST /api/analyze nhận diện đúng Greenland (76.1513, -42.3889) là BĂNG ĐẢO (không phải biển)", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 76.1513,
        lon: -42.3889,
        w_soil: 0.33,
        w_water: 0.33,
        w_profit: 0.34
      })
    });

    const data = await res.json();
    assert.strictEqual(data.ok, false);
    assert.strictEqual(data.is_ice, true);
    assert.strictEqual(data.terrain_type, "ICE_SHEET");
  } finally {
    server.close();
  }
});

test("POST /api/analyze xử lý tọa độ Tây Tạng (29.0084, 86.2293) ổn định không bị lỗi a.includes và có cảnh báo băng giá", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 29.0084,
        lon: 86.2293,
        w_soil: 0.33,
        w_water: 0.33,
        w_profit: 0.34,
        user_crops: ["Rice", "Soybean", "Maize"]
      })
    });

    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.scenarios.user.rank, "C");
    assert.ok(Array.isArray(data.alerts));
    assert.ok(data.alerts.length > 0);
    // Phải có cảnh báo băng tuyết từ MERRA-2
    const hasFreezeAlert = data.alerts.some(a => (a.msg || a).includes("Băng giá"));
    assert.strictEqual(hasFreezeAlert, true);
    // Điểm match score phản ánh điều kiện khắc nghiệt, không thể là Excellent (> 85%)
    assert.ok(data.match_pct < 40);
  } finally {
    server.close();
  }
});

test("POST /api/analyze tính Quantum Match Score thực tế cho sa mạc Ả Rập Xê Út (26.2807, 46.8403) không bị gán 98% Excellent", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 26.2807,
        lon: 46.8403,
        w_soil: 0.33,
        w_water: 0.33,
        w_profit: 0.34,
        user_crops: ["Rice", "Soybean", "Maize"]
      })
    });

    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.scenarios.user.rank, "C");
    assert.strictEqual(data.scenarios.quantum.rank, "C");
    // Sa mạc khô cằn cả 2 chiến lược đều Rank C -> match_pct không được là 98% mà phải chiết giảm thực tế
    assert.ok(data.match_pct < 40);
    assert.ok(data.match_desc.includes("Severe Environment") || data.match_desc.includes("Rank C"));
  } finally {
    server.close();
  }
});

test("POST /api/analyze áp dụng Định luật Liebig cho vùng núi cao Kartikswami (30.49, 79.13), kéo Rank về C khi cây bị chết rét", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 30.49,
        lon: 79.13,
        w_soil: 0.33,
        w_water: 0.33,
        w_profit: 0.34,
        user_crops: ["Rice", "Soybean", "Maize"]
      })
    });

    const data = await res.json();
    assert.strictEqual(data.ok, true);
    // Áp dụng định luật Liebig: Cây chết rét 2 vụ -> Rank C
    assert.strictEqual(data.scenarios.user.rank, "C");
    assert.ok(data.scenarios.user.overall <= 34.0);
    // Nước bị trừ điểm do đóng băng
    assert.ok(data.scenarios.user.water_hp < 50.0);
    // Điểm match score không được báo 89.3% Excellent nữa
    assert.ok(data.match_pct < 60.0);
    assert.ok(data.match_desc.includes("High Risk") || data.match_desc.includes("Rank C"));
  } finally {
    server.close();
  }
});
