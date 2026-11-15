const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createMap() {
  const events = {};
  const inputs = new Map();
  const buttonIds = ["btn-layer-esri", "btn-layer-google", "btn-layer-pure"];
  const buttons = buttonIds.map(() => ({
    classList: {
      active: false,
      add() { this.active = true; },
      remove() { this.active = false; },
    },
  }));
  const layers = new Set();
  const markers = [];
  const selectedLocations = [];
  let closedAlerts = 0;
  const map = {
    createPane() {},
    getPane() { return { style: {} }; },
    hasLayer(layer) { return layers.has(layer); },
    addLayer(layer) { layers.add(layer); },
    removeLayer(layer) { layers.delete(layer); },
    flyTo() {},
    getZoom() { return 7; },
    on(name, callback) { events[name] = callback; },
  };
  const tileLayer = () => ({
    addTo(target) {
      target.addLayer(this);
      return this;
    },
  });
  const element = (id) => {
    if (!inputs.has(id)) {
      inputs.set(id, {
        value: "",
        style: {},
        listeners: {},
        addEventListener(name, callback) { this.listeners[name] = callback; },
      });
    }
    return inputs.get(id);
  };
  const buttonById = new Map(buttonIds.map((id, index) => [id, buttons[index]]));
  const context = vm.createContext({
    L: {
      map() { return map; },
      tileLayer,
      divIcon(options) { return options; },
      marker(coordinates) {
        const marker = {
          coordinates,
          popup: "",
          addTo() {
            markers.push(this);
            return this;
          },
          bindPopup(html) {
            this.popup = html;
            return this;
          },
        };
        return marker;
      },
    },
    document: {
      getElementById: (id) => buttonById.get(id) || element(id),
      querySelectorAll: () => buttons,
    },
    console: { warn() {} },
    farmLat: 10.04,
    farmLon: 105.78,
    farmMarker: null,
    closeWaterAlert() { closedAlerts++; },
    checkSelectedLocation(lat, lon) { selectedLocations.push([lat, lon]); },
  });

  vm.runInContext(fs.readFileSync("public/js/map.js", "utf8"), context);
  return {
    context,
    element,
    events,
    layers,
    markers,
    selectedLocations,
    buttons,
    get closedAlerts() { return closedAlerts; },
  };
}

test("placeMarker rejects invalid coordinates and preserves the current marker", () => {
  const { context, markers } = createMap();
  const previous = [context.farmLat, context.farmLon];
  const markerCount = markers.length;

  assert.equal(vm.runInContext("placeMarker(91, 0)", context), false);
  assert.equal(markers.length, markerCount);
  assert.deepEqual([context.farmLat, context.farmLon], previous);
});

test("map clicks place precise coordinates and run the shared location check", () => {
  const { context, events, selectedLocations, markers } = createMap();
  events.click({ latlng: { lat: -34.123456, lng: -58.987654 } });

  assert.equal(context.farmLat, -34.123456);
  assert.equal(context.farmLon, -58.987654);
  assert.deepEqual(selectedLocations, [[-34.123456, -58.987654]]);
  assert.match(markers.at(-1).popup, /°S/);
  assert.match(markers.at(-1).popup, /°W/);
});

test("manual coordinate edits validate and check location before accepting selection", () => {
  const { context, element, selectedLocations } = createMap();
  element("inp-lat").value = "35.12345";
  element("inp-lon").value = "-120.98765";
  element("inp-lat").listeners.change();

  assert.equal(context.farmLat, 35.12345);
  assert.equal(context.farmLon, -120.98765);
  assert.deepEqual(selectedLocations, [[35.12345, -120.98765]]);

  element("inp-lat").value = "95";
  element("inp-lon").listeners.change();
  assert.equal(context.farmLat, 35.12345);
  assert.deepEqual(selectedLocations, [[35.12345, -120.98765]]);
});

test("map layer switching remains functional", () => {
  const { context, layers, buttons } = createMap();

  vm.runInContext('switchMapLayer("google")', context);

  assert.equal(layers.size, 1);
  assert.equal(buttons[1].classList.active, true);
});
