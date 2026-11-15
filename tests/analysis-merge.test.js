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
  const dialog = element("analysis-failure");
  dialog.open = false;
  dialog.showModal = () => {
    assert.equal(element("btn-run").disabled, false);
    assert.equal(vm.runInContext("analysisInFlight", context), false);
    dialog.open = true;
  };
  dialog.close = () => { dialog.open = false; };
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
  assert.equal(element("analysis-failure").open, true);
  assert.match(element("analysis-failure-message").textContent, /No real climate data/);
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
  assert.equal(element("analysis-failure").open, false);
});

test("missing-data and suspect-quality popups explain the distinct failure at the selected point", async () => {
  const { context, element } = createBrowser();
  element("inp-lat").value = "29.898";element("inp-lon").value = "31.431";
  context.fetch = async () => ({ok:false,json:async()=>({ok:false,missing_variables:["PRECTOTCORR"]})});
  await vm.runInContext("runAnalysis()",context);
  assert.match(element("analysis-failure-message").textContent,/Thiếu: PRECTOTCORR/);
  assert.match(element("analysis-failure-coords").textContent,/29.898°, 31.431°/);
  context.fetch = async () => ({ok:false,json:async()=>({ok:false,source_status:"low_quality",suspect_variables:["PRECTOTCORR"]})});
  await vm.runInContext("runAnalysis()",context);
  assert.equal(element("analysis-failure").open,true);
  assert.match(element("analysis-failure-message").textContent,/kiểm tra chất lượng/);
  assert.doesNotMatch(element("analysis-failure-message").textContent,/Thiếu:/);
});

test("deadline releases a hung request, shows a popup and permits retry; late success is ignored",async()=>{
  const {context,element}=createBrowser();
  let deadline,cleared=false,signal,resolveLate,updates=0;
  context.setTimeout=(fn,ms)=>{assert.equal(ms,60000);deadline=fn;return 99;};
  context.clearTimeout=id=>{assert.equal(id,99);cleared=true;};
  context.updateUI=()=>{updates++;};
  context.fetch=(_url,options)=>{signal=options.signal;return new Promise(resolve=>{resolveLate=resolve;});};
  const pending=vm.runInContext("runAnalysis()",context);
  assert.equal(element("btn-run").disabled,true);
  deadline();await pending;
  assert.equal(signal.aborted,true);assert.equal(cleared,true);
  assert.equal(element("btn-run").disabled,false);
  assert.equal(element("analysis-failure").open,true);
  assert.match(element("analysis-failure-message").textContent,/60 giây/);
  const success={ok:true,json:async()=>({ok:true,contract_version:"terrain-v2-objective-v5",objective_version:"planning_rotation_v5",scenarios:{classical:{}}})};
  resolveLate(success);await new Promise(resolve=>setImmediate(resolve));assert.equal(updates,0);
  context.fetch=async()=>success;
  await vm.runInContext("runAnalysis()",context);
  assert.equal(updates,1);assert.equal(element("analysis-failure").open,false);
});

test("deadline also covers a stalled response body without AbortController",async()=>{
  const {context,element}=createBrowser();let deadline;
  context.AbortController=undefined;
  context.setTimeout=fn=>{deadline=fn;return 1;};context.clearTimeout=()=>{};
  context.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
  const pending=vm.runInContext("runAnalysis()",context);
  await Promise.resolve();deadline();await pending;
  assert.equal(element("btn-run").disabled,false);
  assert.match(element("analysis-failure-message").textContent,/60 giây/);
});

test("network failures and malformed responses show a popup without asserting missing climate",async()=>{
  const {context,element}=createBrowser();
  for(const fetch of [async()=>{throw Error("offline");},async()=>({json:async()=>{throw Error("invalid JSON");}})]){
    context.fetch=fetch;await vm.runInContext("runAnalysis()",context);
    assert.equal(element("analysis-failure").open,true);
    assert.match(element("analysis-failure-message").textContent,/Không thể tải phân tích/);
    assert.equal(element("btn-run").disabled,false);
  }
});

test("a timeout for an old selection does not open a popup",async()=>{
  const {context,element}=createBrowser();let deadline;
  context.setTimeout=fn=>{deadline=fn;return 1;};context.clearTimeout=()=>{};
  context.fetch=()=>new Promise(()=>{});
  const pending=vm.runInContext("runAnalysis()",context);
  element("inp-lat").value="20";deadline();await pending;
  assert.equal(element("analysis-failure").open,false);
  assert.equal(element("btn-run").disabled,false);
});

test("Enter in the failure dialog does not start a new analysis",()=>{
  const {context,element,listeners}=createBrowser();let runs=0;
  context.runAnalysis=()=>{runs++;};element("analysis-failure").open=true;
  listeners.keydown({key:"Enter",target:{tagName:"BUTTON"},preventDefault(){throw Error("Dialog close must retain default behavior");}});
  assert.equal(runs,0);
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
