const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createBrowser() {
  const elements = new Map();
  const timers = [];
  const tabContent = ["tab-telemetry", "tab-arena"].map((id) => ({
    id,
    classList: { active: false, add() { this.active = true; }, remove() { this.active = false; } },
  }));
  const tabButtons = [0, 1].map(() => ({
    classList: { active: false, add() { this.active = true; }, remove() { this.active = false; } },
  }));
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        textContent: "",
        innerHTML: "",
        hidden: false,
        style: {},
        classList: { active: false, add() { this.active = true; }, remove() { this.active = false; } },
        querySelector(selector) {
          if (id !== "water-alert") return null;
          if (!elements.has(selector)) {
            elements.set(selector, { textContent: "", innerHTML: "" });
          }
          return elements.get(selector);
        },
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    document: {
      getElementById: (id) => id.startsWith("tab-")
        ? tabContent.find((tab) => tab.id === id) || null
        : element(id),
      querySelectorAll: (selector) => selector === ".tab-content" ? tabContent : tabButtons,
    },
    AbortController,
    console: { warn() {} },
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
    setInterval,
    clearInterval,
    farmLat: 10,
    farmLon: 105,
    placeMarker(lat, lon) { this.farmLat = lat; this.farmLon = lon; },
    Math: deterministicMath,
    infoIcon: (key) => `<i data-tip="${key}"></i>`,
    fixCropLabel: (label) => label,
    SEASON_NAMES: ["Spring", "Summer", "Winter"],
  });
  vm.runInContext(fs.readFileSync("public/js/ui-helpers.js", "utf8"), context);
  return { context, element, timers, tabContent, tabButtons };
}

test("merged HP and crop tags use existing UI classes, tooltips, and escaped text", () => {
  const { context } = createBrowser();
  const hp = vm.runInContext('hpBarHTML("<label>", NaN, "soil_hp")', context);
  assert.match(hp, /hp-track/);
  assert.match(hp, /-%/);
  assert.match(hp, /&lt;label&gt;/);
  assert.match(hp, /data-tip="soil_hp"/);
  assert.doesNotMatch(hp, /hp-bar-wrap/);

  const tags = vm.runInContext(
    'cropTagsHTML([{label:"<Rice>",color:"#10b981"},{label:"Soybean",color:"red"}])',
    context
  );
  assert.match(tags, /&lt;Rice&gt;/);
  assert.match(tags, /background:#64748b1a/);
  assert.match(tags, /\[Spring\]/);
});

test("tab switching is safe when target tab or button is missing", () => {
  const { context, tabContent, tabButtons } = createBrowser();
  vm.runInContext('switchTab("arena", null)', context);
  assert.equal(tabContent[1].classList.active, true);
  assert.equal(tabContent[0].classList.active, false);
  assert.equal(tabButtons.every((button) => !button.classList.active), true);
  assert.doesNotThrow(() => vm.runInContext('switchTab("missing", null)', context));
});

test("random coordinates fall back to predefined farms and run location check before analysis", async () => {
  const { context, timers } = createBrowser();
  const order = [];
  context.fetch = async () => ({ ok: false, status: 503 });
  context.placeMarker = (lat, lon) => {
    context.farmLat = lat;
    context.farmLon = lon;
    order.push("place");
  };
  context.checkSelectedLocation = async () => { order.push("check"); };
  context.runAnalysis = () => { order.push("analyze"); };

  await vm.runInContext("randomCoords()", context);
  assert.deepEqual(order, ["place", "check"]);
  assert.deepEqual([context.farmLat, context.farmLon], [10.04, 105.78]);
  timers.at(-1)();
  assert.deepEqual(order, ["place", "check", "analyze"]);
});

test("valid API coordinates are checked before analysis; invalid coordinates are rejected", async () => {
  const { context, timers } = createBrowser();
  const order = [];
  context.fetch = async () => ({ ok: true, json: async () => ({ lat: 0, lon: -100 }) });
  context.placeMarker = (lat, lon) => {
    context.farmLat = lat;
    context.farmLon = lon;
    order.push(["place", lat, lon]);
  };
  context.checkSelectedLocation = async () => { order.push(["check"]); };
  context.runAnalysis = () => { order.push(["analyze"]); };

  await vm.runInContext("randomCoords()", context);
  assert.deepEqual(order, [["place", 0, -100], ["check"]]);
  timers.at(-1)();
  assert.deepEqual(order[2], ["analyze"]);

  context.fetch = async () => ({ ok: true, json: async () => ({ lat: 91, lon: 500 }) });
  order.length = 0;
  await vm.runInContext("randomCoords()", context);
  assert.deepEqual(order[0], ["place", 10.04, 105.78]);
});

test("location warning uses text content for caller-provided messages", () => {
  const { context, element } = createBrowser();
  vm.runInContext('showIceAlert("<script>bad()</script>")', context);
  assert.equal(element(".water-alert-desc").textContent, "<script>bad()</script>");
  assert.equal(element("water-alert").classList.active, true);
  vm.runInContext("closeWaterAlert()", context);
  assert.equal(element("water-alert").classList.active, false);
});
