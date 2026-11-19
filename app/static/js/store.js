/* Single source of truth + URL persistence + pub/sub. */

const defaults = {
  region: null,            // null = national
  start: "2018-01-01",
  end: "2026-10-01",
  focusDate: "2026-10-01",
  metric: "yoy",
  sector: null,
  selectedPoint: null,
};

const listeners = [];
export const state = { ...defaults };

function parseURL() {
  const p = new URLSearchParams(location.search);
  if (p.get("region")) state.region = p.get("region");
  if (p.get("start")) state.start = p.get("start");
  if (p.get("end")) state.end = p.get("end");
  if (p.get("date")) state.focusDate = p.get("date");
  if (p.get("metric")) state.metric = p.get("metric");
  if (p.get("sector")) state.sector = p.get("sector");
}

function writeURL() {
  const p = new URLSearchParams();
  if (state.region) p.set("region", state.region);
  p.set("start", state.start);
  p.set("end", state.end);
  p.set("date", state.focusDate);
  p.set("metric", state.metric);
  if (state.sector) p.set("sector", state.sector);
  history.replaceState(null, "", `?${p.toString()}`);
}

export function subscribe(fn) { listeners.push(fn); }
export function setState(patch, { silent = false } = {}) {
  Object.assign(state, patch);
  writeURL();
  if (!silent) listeners.forEach((fn) => fn(state));
}
export function clearRegion() {
  setState({ region: null, selectedPoint: null });
}
export function initStore() {
  parseURL();
  return state;
}
