const test = require("node:test");
const assert = require("node:assert/strict");
const climates = require("./fixtures/climates.json");
const { CROP_KEYS } = require("../src/config/crops");
const { buildCostMatrix, runQuantum } = require("../src/quantum/qaoa");

const data = {
  ...climates[0],
  ET0: Array(12).fill(100),
  NDVI: Array(12).fill(0.5),
};

test("QAOA adapter returns the exact baseline and a valid simulated rotation", () => {
  const result = runQuantum(data, 0.33, 0.33, 0.34, { seed: 17 });
  assert.equal(result.quantum_available, true);
  assert.equal(result.classical_baseline.length, 3);
  assert.equal(result.crops.length, 3);
  assert.ok(result.crops.every((crop) => CROP_KEYS.includes(crop)));
});

test("QAOA adapter exposes the exact classical result when simulation is disabled", () => {
  const result = runQuantum(data, 0.33, 0.33, 0.34, { disabled: true });
  assert.equal(result.fallback_used, true);
  assert.deepEqual(result.crops, result.classical_baseline);
});

test("legacy cost matrix continues to apply external suitability and market multipliers", () => {
  const defaultCosts = buildCostMatrix(data, 0.33, 0.33, 0.34);
  const adjustedCosts = buildCostMatrix(data, 0.33, 0.33, 0.34, { Rice: 1 }, { Rice: 2 });
  const riceIndex = CROP_KEYS.indexOf("Rice");
  assert.ok(adjustedCosts[0][riceIndex] > defaultCosts[0][riceIndex]);
});

test("legacy map arguments retain the legacy simulator path", () => {
  const result = runQuantum(data, 0.33, 0.33, 0.34, { Rice: 0.8 });
  assert.match(result.method, /Legacy Node\.js statevector simulator|Classical Greedy/);
  assert.equal(result.crops.length, 3);
  assert.ok(result.crops.every((crop) => CROP_KEYS.includes(crop)));
});

test("legacy external scoring can produce reproducible seeded samples", () => {
  const options = { suitabilityMap: { Rice: 0.8 }, seed: 7 };
  const first = runQuantum(data, 0.33, 0.33, 0.34, options);
  const second = runQuantum(data, 0.33, 0.33, 0.34, options);
  assert.deepEqual(first.crops, second.crops);
  assert.deepEqual(first.probs, second.probs);
});
