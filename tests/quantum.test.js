const test = require("node:test");
const assert = require("node:assert");
const { Statevector } = require("../src/quantum/statevector");
const { runQuantum } = require("../src/quantum/qaoa");
const { mockNasa, computeDerived } = require("../src/services/nasa");
const { CROP_KEYS } = require("../src/config/crops");

const probs = (sv) => Array.from(sv.re, (r, i) => r * r + sv.im[i] * sv.im[i]);

test("H trên |0> cho 50/50", () => {
  const sv = new Statevector(1);
  sv.h(0);
  const p = probs(sv);
  assert.ok(Math.abs(p[0] - 0.5) < 1e-12 && Math.abs(p[1] - 0.5) < 1e-12);
});

test("CX lật qubit đích khi qubit điều khiển = 1", () => {
  const sv = new Statevector(2);
  sv.rx(0, Math.PI); // |01>
  sv.cx(0, 1);       // → |11>
  assert.ok(Math.abs(probs(sv)[3] - 1) < 1e-12);
});

test("tổng xác suất luôn = 1 sau chuỗi cổng", () => {
  const sv = new Statevector(6);
  for (let q = 0; q < 6; q++) { sv.h(q); sv.rz(q, 0.7 * q); sv.rx(q, 1.1); }
  sv.cx(0, 1); sv.cx(2, 3);
  const total = probs(sv).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-12, `tổng = ${total}`);
});

test("sample trả đúng 1024 shots", () => {
  const sv = new Statevector(4);
  for (let q = 0; q < 4; q++) sv.h(q);
  const total = [...sv.sample(1024).values()].reduce((a, b) => a + b, 0);
  assert.strictEqual(total, 1024);
});

test("runQuantum trả 3 cây trồng hợp lệ", () => {
  const d = computeDerived(mockNasa(10.04, 105.78));
  const r = runQuantum(d, 0.33, 0.33, 0.34);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.crops.length, 3);
  assert.ok(r.crops.every((c) => CROP_KEYS.includes(c)));
});
