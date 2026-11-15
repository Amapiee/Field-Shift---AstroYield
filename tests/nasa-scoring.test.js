const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/climates.json")[0];
const { NASA_KEYS } = require("../src/config/crops");
const optimizer = require("../src/algorithms/13_crop_rotation_optimization_qaoa_milp");
const {
  mockNasa,
  computeDerived,
  buildSatelliteSummary,
} = require("../src/services/nasa");
const { scoreScenario } = require("../src/services/scoring");

test("demo climate is repeatable, labeled, and retains legacy derived indices", () => {
  const first = mockNasa(10.04, 105.78);
  const second = mockNasa(10.04, 105.78);
  for (const key of NASA_KEYS) {
    assert.equal(first[key].length, 12);
    assert.deepEqual(first[key], second[key]);
  }
  assert.equal(first.source_status, "demo");
  assert.equal(first.recommendation_allowed, false);

  const data = computeDerived(first);
  for (const key of ["ET0", "NDVI", "ESI", "EROSION", "DRI", "FRI"]) {
    assert.equal(data[key].length, 12);
    assert.ok(data[key].every(Number.isFinite), key);
  }
});

test("satellite summary preserves risk groups and labels climate-derived proxies", () => {
  const summary = buildSatelliteSummary(computeDerived(mockNasa(10.04, 105.78)));
  for (const group of ["POWER", "SMAP", "GPM", "ECOSTRESS", "MODIS", "RISK"]) {
    assert.ok(summary[group], group);
  }
  assert.match(summary.SMAP.source, /not SMAP observations/);
  assert.match(summary.GPM.source, /not GPM IMERG observations/);
  assert.match(summary.MODIS.source, /proxy/);
});

test("default scenario score exactly matches the optimizer objective", () => {
  const data = computeDerived({ ...fixture });
  const exact = optimizer.solveClassicalExactOptimizer(
    optimizer.buildSeasonEnvironments(data)
  );
  const result = scoreScenario(exact.best_rotation, data, 0.33, 0.33, 0.34);
  assert.equal(result.objective_version, exact.objective_version);
  assert.equal(result.overall, exact.best_score);
  assert.equal(result.objective_score, exact.best_score);
  assert.equal(result.score_kind, "heuristic_planning_score");
});

test("external suitability overlays keep a separately labeled legacy score", () => {
  const data = computeDerived({ ...fixture });
  const result = scoreScenario(
    ["Rice", "Soybean", "Maize"],
    data,
    0.33,
    0.33,
    0.34,
    { Rice: 0.8 }
  );
  assert.equal(result.score_kind, "legacy_external_overlay");
  assert.equal(result.crops.length, 3);
  assert.ok(result.overall >= 0 && result.overall <= 100);
});

test("extreme desert conditions exclude unsuitable crop plans from the modern objective", () => {
  const data = computeDerived({
    ...fixture,
    PRECTOTCORR: Array(12).fill(5),
    GWETROOT: Array(12).fill(0.1),
    T2M: [-5, 0, 8, 16, 22, 28, 30, 28, 22, 14, 3, -4],
    TS: [-3, 2, 10, 19, 25, 32, 34, 32, 25, 16, 5, -2],
  });
  const result = scoreScenario(
    ["Soybean", "Soybean", "Soybean"],
    data,
    0.33,
    0.33,
    0.34
  );
  assert.equal(result.rank, "C");
  assert.equal(result.water_hp, 0);
  assert.equal(result.profit_hp, 0);
});

test("scenario validation rejects unknown crops and invalid external scores", () => {
  const data = computeDerived({ ...fixture });
  assert.throws(
    () => scoreScenario(["Rice", "bad", "Rice"], data, 0.33, 0.33, 0.34),
    /known crops/
  );
  assert.throws(
    () => scoreScenario(
      ["Rice", "Rice", "Rice"],
      data,
      0.33,
      0.33,
      0.34,
      { Rice: 1.5 }
    ),
    /between 0 and 1/
  );
});