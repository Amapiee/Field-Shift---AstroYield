const test = require("node:test");
const assert = require("node:assert");
const { clamp, round, num, argmax, mean } = require("../src/utils/helpers");

test("clamp giới hạn giá trị", () => {
  assert.strictEqual(clamp(5, 0, 1), 1);
  assert.strictEqual(clamp(-5, 0, 1), 0);
  assert.strictEqual(clamp(0.5, 0, 1), 0.5);
});

test("round làm tròn đúng số chữ số", () => {
  assert.strictEqual(round(3.14159, 2), 3.14);
  assert.strictEqual(round(2.5), 3);
});

test("num trả về mặc định khi không phải số", () => {
  assert.strictEqual(num("abc", 7), 7);
  assert.strictEqual(num(undefined, 7), 7);
  assert.strictEqual(num("3.5", 7), 3.5);
});

test("argmax / mean", () => {
  assert.strictEqual(argmax([1, 9, 3]), 1);
  assert.strictEqual(mean([2, 4]), 3);
});
