// test/smoke.js — node test/smoke.js
const { fetchNasa, computeDerived, buildSatelliteSummary } = require("../services/nasa");
const { generateAlerts } = require("../services/alerts");
const { scoreScenario } = require("../services/scoring");

(async () => {
  // 1. Đơn vị mưa khớp giữa mock và thật
  const m = require("../services/nasa").mockNasa(10.04, 105.78);
  console.assert(m.PRECTOTCORR.every(v => v >= 5 && v <= 350), "mock rain range OK");

  // 2. Deterministic: cùng toạ độ → cùng data
  const a = require("../services/nasa").mockNasa(10.04, 105.78);
  const b = require("../services/nasa").mockNasa(10.04, 105.78);
  console.assert(JSON.stringify(a) === JSON.stringify(b), "mock deterministic");

  // 3. NaN guards
  const { mean, meanAt } = require("../utils/helpers");
  console.assert(mean([]) === 0 && meanAt([], [0]) === 0, "NaN guards");

  // 4. Validation throws
  try { scoreScenario(["Rice"], {}, 0.3, 0.3, 0.4); console.assert(false, "should throw"); }
  catch (e) { console.assert(e instanceof RangeError, "throw on bad cropTrio"); }

  // 5. End-to-end
  const d = computeDerived(await fetchNasa(10.04, 105.78));
  console.log("source:", d._source, "patched:", d._patched);
  console.log("alerts:", generateAlerts(d));
  console.log("summary.RISK:", buildSatelliteSummary(d).RISK);
  console.log("score:", scoreScenario(["Rice","Soybean","Maize"], d, 0.33, 0.33, 0.34));
})();