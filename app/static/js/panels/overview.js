/* Overview panels: headline vs core, calendar, distribution, long run, focus line. */
import { get } from "../api.js";
import { setState } from "../store.js";
import { C, baseLayout, config, $, empty, monthLabel } from "./common.js";

let national = { start: null, end: null };

export async function renderOverview(state) {
  const range = { start: state.start, end: state.end };
  if (national.start !== state.start || national.end !== state.end) {
    national = { ...range, rows: (await get("/series/headline", range)).data };
  }
  const rows = national.rows || [];

  drawHeadline(rows);
  const calendar = (await get("/calendar", range)).data;
  drawCalendar(calendar);
  const dist = (await get("/distribution")).data;
  drawDistribution(dist);
  const long = (await get("/series/headline", { start: "1958-01-01", end: "2026-10-01" })).data;
  drawLong(long);
  bindFocusClicks();
  await drawFocus(state);
}

function focusFromDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return;
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  setState({ focusDate: date });
}

function bindFocusClicks() {
  const bind = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof el.on !== "function") {
      requestAnimationFrame(() => bind(id, handler));
      return;
    }
    if (el._focusBound) return;
    el.on("plotly_click", handler);
    el._focusBound = true;
  };
  bind("headlineChart", (e) => focusFromDate(e.points?.[0]?.x));
  bind("longChart", (e) => focusFromDate(e.points?.[0]?.x));
  bind("focusChart", (e) => focusFromDate(e.points?.[0]?.x));
  bind("calendarChart", (e) => {
    const p = e.points?.[0];
    if (!p) return;
    const month = Number(p.x);
    const year = Number(p.y);
    if (!month || !year) return;
    setState({ focusDate: `${year}-${String(month).padStart(2, "0")}-01` });
  });
}

function drawHeadline(rows) {
  const dates = rows.map((r) => r.date);
  const headline = rows.map((r) => r.headline);
  const core = rows.map((r) => r.core);
  const ma = rows.map((r) => r.ma12);
  Plotly.react("headlineChart", [
    { x: dates, y: headline, type: "scatter", mode: "lines", name: "Overall inflation",
      line: { color: C.teal, width: 2.2 }, hovertemplate: "%{x|%b %Y} · %{y:.1f}%<extra></extra>" },
    { x: dates, y: core, type: "scatter", mode: "lines", name: "Core inflation",
      line: { color: C.vermilion, width: 1.4, dash: "dash" },
      hovertemplate: "core %{y:.1f}%<extra></extra>" },
    { x: dates, y: ma, type: "scatter", mode: "lines", name: "12-month average",
      line: { color: C.muted, width: 1, dash: "dot" }, hoverinfo: "skip" },
    { x: [dates[0], dates[dates.length - 1]], y: [4, 4], mode: "lines", name: "4% ceiling",
      line: { color: C.vermilion, width: 1, dash: "dot" }, hoverinfo: "skip" },
    { x: [dates[0], dates[dates.length - 1]], y: [2, 2], mode: "lines", name: "2% floor",
      line: { color: C.tealSoft, width: 1, dash: "dot" }, hoverinfo: "skip" },
  ], baseLayout({ yaxis: { title: "Inflation (%)", gridcolor: C.line }, showlegend: true }), config);
}

function drawCalendar(rows) {
  const years = [...new Set(rows.map((r) => r.year))];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const z = years.map((y) => months.map((m) => {
    const row = rows.find((r) => r.year === y && r.month === m);
    return row ? row.value : null;
  }));
  Plotly.react("calendarChart", [{
    type: "heatmap", z, x: months, y: years, colorscale: "RdBu", reversescale: true,
    zmid: 3, zmin: -2, zmax: 12, xgap: 1, ygap: 1,
    colorbar: { title: "Inflation %", thickness: 9, len: 0.75 },
    hovertemplate: "%{y} M%{x} · %{z:.1f}%<extra></extra>",
  }], baseLayout({
    yaxis: { autorange: "reversed", type: "category", gridcolor: "rgba(0,0,0,0)" },
    xaxis: { tickmode: "array", tickvals: months, ticktext: ["J","F","M","A","M","J","J","A","S","O","N","D"] },
    margin: { l: 50, r: 10, t: 8, b: 26 },
  }), config);
}

function drawDistribution(rows) {
  const full = rows.filter((r) => r.sample === "full");
  const recent = rows.filter((r) => r.sample === "recent");
  Plotly.react("distChart", [
    { x: full.map((r) => r.bin_start), y: full.map((r) => r.n), type: "bar",
      name: "1958–2026", marker: { color: C.tealSoft } },
    { x: recent.map((r) => r.bin_start), y: recent.map((r) => r.n), type: "bar",
      name: "2018–2026", marker: { color: C.vermilion }, opacity: 0.85 },
  ], baseLayout({ barmode: "overlay", xaxis: { title: "Inflation (%)", gridcolor: C.line },
    yaxis: { title: "Months", gridcolor: C.line } }), config);
}

function drawLong(rows) {
  Plotly.react("longChart", [{
    x: rows.map((r) => r.date), y: rows.map((r) => r.headline), type: "scatter",
    mode: "lines", line: { color: C.graphite, width: 1 },
    fill: "tozeroy", fillcolor: "rgba(13,110,99,.08)",
    hovertemplate: "%{x|%Y} · %{y:.1f}%<extra></extra>",
  }], baseLayout({ yaxis: { title: "Inflation (%)", gridcolor: C.line }, margin: { l: 44, r: 12, t: 8, b: 30 } }), config);
}

async function drawFocus(state) {
  const nat = (await get("/series/headline", { start: state.start, end: state.end })).data;
  const traces = [{
    x: nat.map((r) => r.date), y: nat.map((r) => r.headline), type: "scatter",
    mode: "lines", name: "Philippines", line: { color: C.muted, width: 1.4, dash: "dot" },
  }];
  if (state.region) {
    const reg = (await get("/series/region", { region: state.region, start: state.start, end: state.end })).data;
    if (!reg.length) { empty($("#focusChart")); return; }
    traces.unshift({
      x: reg.map((r) => r.date), y: reg.map((r) => r.value), type: "scatter",
      mode: "lines", name: state.region, line: { color: C.teal, width: 2.2 },
    });
  }
  Plotly.react("focusChart", traces, baseLayout({
    yaxis: { title: "Inflation (%)", gridcolor: C.line }, margin: { l: 44, r: 12, t: 10, b: 30 },
  }), config);
  $("#focusLabel").textContent = state.region || "Philippines";
}
