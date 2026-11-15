const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createBrowser() {
  const elements = new Map();
  const listeners = {};
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "",
        textContent: "",
        innerHTML: "",
        title: "",
        disabled: false,
        hidden: false,
        style: {},
        className: "",
        classList: { add() {}, remove() {} },
        querySelector() { return null; },
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    alert() {},
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
    AbortController,
    map: { getZoom: () => 7, flyTo() {} },
    placeMarker() {},
    destroyChart: () => null,
    setAnalysisMessage() {},
    updateUI() {},
    farmLat: 10,
    farmLon: 105,
    chartTemp: null,
    chartRain: null,
    chartNdvi: null,
    chartRadar: null,
    locationSelection: 0,
    cachedLocation: () => ({ type: "LAND" }),
  });
  const source = fs.readFileSync("public/js/analysis.js", "utf8");
  vm.runInContext(source, context);
  for (const [id, value] of [
    ["inp-lat", "0"],
    ["inp-lon", "105"],
    ["sl-soil", ".33"],
    ["sl-water", ".33"],
    ["sl-profit", ".34"],
    ["crop-s1", "Rice"],
    ["crop-s2", "Soybean"],
    ["crop-s3", "Maize"],
  ]) {
    element(id).value = value;
  }
  return { context, element, listeners };
}

test("analysis sends valid zero coordinates and displays the no-data response", async () => {
  const { context, element } = createBrowser();
  let payload;
  context.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return {
      ok: false,
      json: async () => ({ ok: false, source_status: "unavailable", error: "No real climate data" }),
    };
  };

  await vm.runInContext("runAnalysis()", context);
  assert.equal(payload.lat, 0);
  assert.equal(payload.lon, 105);
  assert.match(element("match-desc").textContent, /No real climate data/);
  assert.equal(element("btn-run").disabled, false);
});

test("analysis suppresses duplicate requests and ignores responses after input changes", async () => {
  const { context, element } = createBrowser();
  let calls = 0;
  let resolveResponse;
  context.fetch = () => {
    calls++;
    return new Promise((resolve) => { resolveResponse = resolve; });
  };

  const first = vm.runInContext("runAnalysis()", context);
  await vm.runInContext("runAnalysis()", context);
  assert.equal(calls, 1);
  element("inp-lat").value = "1";
  resolveResponse({
    ok: true,
    json: async () => ({
      ok: true,
      contract_version: "terrain-v2-objective-v5",
      objective_version: "planning_rotation_v5",
      scenarios: { classical: {} },
    }),
  });
  await first;
  assert.match(element("match-desc").textContent, /đã thay đổi/);
  assert.equal(element("btn-run").disabled, false);
});

test("Enter outside form fields prevents the browser default and starts analysis", () => {
  const { context, listeners } = createBrowser();
  let prevented = false;
  let started = false;
  context.runAnalysis = () => { started = true; };
  listeners.keydown({
    key: "Enter",
    target: { tagName: "DIV" },
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(started, true);
});
