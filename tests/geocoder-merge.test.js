const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createBrowser(options = {}) {
  const elements = new Map();
  const listeners = {};
  const scheduled = [];
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "",
        textContent: "",
        innerHTML: "",
        disabled: false,
        style: {},
        addEventListener(name, callback) {
          listeners[name] = callback;
        },
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    AbortSignal,
    document: {
      getElementById: element,
      createElement: (tag) => ({ tagName: tag, style: {} }),
      body: { appendChild() {} },
    },
    console: { warn() {}, error() {} },
    setTimeout: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeout() {},
    farmLat: 10.04,
    farmLon: 105.78,
    closeWaterAlert() {},
    resetDashboardUI() {},
    setAnalysisMessage() {},
    placeMarker(lat, lon) {
      context.farmLat = lat;
      context.farmLon = lon;
    },
    getLocationClassification: options.classify || (async () => ({ is_water: false })),
    showLocationWarning: options.showWarning || (() => false),
    runAnalysis() {
      context.analysisRuns++;
    },
    analysisRuns: 0,
    fetch: options.fetch || (async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ score: 90, location: { y: 10.1, x: 105.2 }, address: "Hanoi" }],
      }),
    })),
  });
  const source = fs.readFileSync("public/js/geocoder.js", "utf8");
  vm.runInContext(source, context);
  element("search-input").value = "Hanoi";
  return { context, element, listeners, scheduled };
}

test("search verifies land before displaying the result and starting analysis", async () => {
  const { context, element, scheduled } = createBrowser({
    fetch: async (_url, request) => {
      assert.ok(request.signal);
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            score: 90,
            location: { y: 10.1, x: 105.2 },
            address: "<img src=x onerror=alert(1)>",
          }],
        }),
      };
    },
  });

  await vm.runInContext("smartGeocode()", context);

  assert.match(element("search-result").innerHTML, /&lt;img/);
  assert.equal(element("search-error").style.display, "none");
  assert.equal(element("btn-search").disabled, false);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 600);
  scheduled[0].callback();
  assert.equal(context.analysisRuns, 1);
});

test("search falls through to Photon when ArcGIS has no result", async () => {
  const requestedUrls = [];
  const { context, element } = createBrowser({
    fetch: async (url, request) => {
      requestedUrls.push(url);
      assert.ok(request.signal);
      if (url.includes("geocode.arcgis.com")) {
        return { ok: true, json: async () => ({ candidates: [] }) };
      }
      if (url.includes("photon.komoot.io")) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              geometry: { coordinates: [105.2, 10.1] },
              properties: { name: "Hanoi", country: "Vietnam" },
            }],
          }),
        };
      }
      throw new Error("Nominatim should not be needed");
    },
  });

  await vm.runInContext("smartGeocode()", context);

  assert.equal(requestedUrls.length, 2);
  assert.match(element("search-result").innerHTML, /Hanoi, Vietnam/);
});

test("water classification blocks analysis and reports the location warning", async () => {
  const { context, element, scheduled } = createBrowser({
    classify: async () => ({ is_water: true, message: "Vị trí nằm trên biển." }),
    showWarning: (location) => location.is_water,
  });

  await vm.runInContext("smartGeocode()", context);

  assert.equal(element("search-result").style.display, "none");
  assert.equal(element("search-error").textContent, "Vị trí nằm trên biển.");
  assert.equal(element("btn-search").disabled, false);
  assert.equal(scheduled.length, 0);
  assert.equal(context.analysisRuns, 0);
});

test("location verification errors are visible and always restore the search button", async () => {
  const { context, element, scheduled } = createBrowser({
    classify: async () => { throw new Error("Bản đồ không phản hồi."); },
  });

  await vm.runInContext("smartGeocode()", context);

  assert.match(element("search-error").textContent, /Bản đồ không phản hồi/);
  assert.equal(element("btn-search").disabled, false);
  assert.equal(scheduled.length, 0);
});

test("toast helpers remain available and treat messages as text", () => {
  const { context } = createBrowser();

  context.showCustomToast("<img src=x>");

  const toast = context.document.getElementById("farmshift-water-toast");
  assert.equal(toast.textContent, "<img src=x>");
  assert.equal(typeof context.showWaterToast, "function");
});
