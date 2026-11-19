/* Drivers tab: treemap, contributions, sector × month heatmap, detail table. */
import { get } from "../api.js";
import { setState } from "../store.js";
import { C, baseLayout, config, $, csvDownload } from "./common.js";

let sectorRows = [];

export async function renderDrivers(state) {
  const treemap = (await get("/drivers/treemap", { date: state.focusDate })).data;
  sectorRows = treemap;
  drawTreemap(treemap, state);
  drawContrib(treemap);
  const heat = (await get("/drivers/heatmap", { end: state.end })).data;
  drawHeat(heat, state);
  drawSmall(heat, state);
  drawTable(treemap, state);
}

const ICON_PATHS = {
  "01": '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M7 7c0-1.5 1-2 1-3.5"/><path d="M12 7c0-1.5 1-2 1-3.5"/><path d="M17 7c0-1.5 1-2 1-3.5"/>',
  "02": '<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5V2H7v8a5 5 0 0 0 5 5Z"/>',
  "03": '<path d="M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2Z"/>',
  "04": '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
  "05": '<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z"/><path d="M4 18v2"/><path d="M20 18v2"/>',
  "06": '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="M3.2 12H9l1-2 2 4 2-6 1.5 4H21"/>',
  "07": '<path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/><path d="M18 18h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  "08": '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  "09": '<rect width="20" height="20" x="2" y="2" rx="2"/><path d="M7 2v20"/><path d="M17 2v20"/><path d="M2 12h20"/><path d="M2 7h5"/><path d="M2 17h5"/><path d="M17 17h5"/><path d="M17 7h5"/>',
  "10": '<path d="M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.7 0L2.6 9.1a1 1 0 0 0 0 1.8l8.5 3.9a2 2 0 0 0 1.7 0Z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  "11": '<path d="M3 2v7a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Z"/>',
  "12": '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  "13": '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
};
const SHORT = {
  "01": "Food", "02": "Alcohol & tobacco", "03": "Clothing", "04": "Housing & utilities",
  "05": "Furnishings", "06": "Health", "07": "Transport", "08": "Communication",
  "09": "Recreation", "10": "Education", "11": "Restaurants", "12": "Financial services",
  "13": "Personal care",
};
const TILE_STOPS = [[0, [47, 122, 79]], [4, [236, 195, 94]], [8, [224, 122, 63]], [12, [178, 58, 46]]];

function tileColor(value) {
  const v = Math.max(0, Math.min(12, Number(value) || 0));
  let a = TILE_STOPS[0], b = TILE_STOPS[TILE_STOPS.length - 1];
  for (let i = 0; i < TILE_STOPS.length - 1; i++) {
    if (v >= TILE_STOPS[i][0] && v <= TILE_STOPS[i + 1][0]) {
      a = TILE_STOPS[i]; b = TILE_STOPS[i + 1]; break;
    }
  }
  const t = (v - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const rgb = a[1].map((c, i) => Math.round(c + (b[1][i] - c) * t));
  return `rgb(${rgb.join(",")})`;
}

function textOn(rgb) {
  const m = rgb.match(/\d+/g).map(Number);
  const lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
  return lum > 0.55 ? "#14201f" : "#fffdf8";
}

function partitionRows(rows) {
  const total = rows.reduce((a, r) => a + r.weight_pct, 0);
  const rowsOut = [];
  let current = [], sum = 0;
  const targets = [0.55, 0.22];
  let target = targets[0] * total;
  for (const r of rows) {
    current.push(r); sum += r.weight_pct;
    if (sum >= target && targets.length) {
      rowsOut.push({ items: current, sum });
      current = []; sum = 0;
      target = targets.shift() ? targets[0] * total : Infinity;
      if (!targets.length) target = Infinity;
    }
  }
  if (current.length) rowsOut.push({ items: current, sum });
  return rowsOut;
}

function drawTreemap(rows, state) {
  const el = $("#treemap");
  const sorted = [...rows].sort((a, b) => b.weight_pct - a.weight_pct);
  const groups = partitionRows(sorted);
  el.replaceChildren();
  const basket = document.createElement("div");
  basket.className = "basket";
  groups.forEach((group) => {
    const row = document.createElement("div");
    row.className = "basket-row";
    row.style.flex = String(group.sum);
    group.items.forEach((r) => {
      const bg = tileColor(r.value);
      const fg = textOn(bg);
      const small = r.weight_pct < 4.0;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = `basket-tile${small ? " small" : ""}${state.sector === r.code ? " selected" : ""}`;
      tile.style.flex = String(Math.max(r.weight_pct, 2.0));
      tile.style.background = bg;
      tile.style.color = fg;
      tile.dataset.code = r.code;
      tile.title = `${r.name}, share ${r.weight_pct.toFixed(1)}%, inflation ${(r.value ?? 0).toFixed(1)}%`;
      tile.setAttribute("aria-label", `${r.name}, share of basket ${r.weight_pct.toFixed(1)} percent, inflation ${(r.value ?? 0).toFixed(1)} percent`);
      tile.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[r.code] || ""}</svg>` +
        (small ? "" : `<span class="bt-label"><b>${SHORT[r.code] || r.name}</b>${r.weight_pct.toFixed(1)}%</span>`);
      tile.addEventListener("click", () => setState({ sector: r.code }));
      row.appendChild(tile);
    });
    basket.appendChild(row);
  });
  el.appendChild(basket);
}

function wrapLabel(name, width = 26) {
  const words = name.replace(/,\s+/g, " ").split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = `${line} ${w}`.trim();
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = `${shown[1].slice(0, width - 1)}…`;
  return shown.join("<br>");
}

function drawContrib(rows) {
  const sorted = [...rows].sort((a, b) => (a.contribution ?? 0) - (b.contribution ?? 0));
  Plotly.react("contribChart", [{
    type: "bar", orientation: "h",
    x: sorted.map((r) => r.contribution),
    y: sorted.map((r) => wrapLabel(r.name.toLowerCase())),
    customdata: sorted.map((r) => r.name),
    marker: { color: sorted.map((r) => (r.value > 4 ? C.vermilion : C.teal)) },
    hovertemplate: "%{customdata}<br>%{x:.2f} percentage points<extra></extra>",
  }], baseLayout({ margin: { l: 168, r: 18, t: 8, b: 34 },
    yaxis: { tickfont: { size: 10 } },
    xaxis: { title: "share of basket × inflation (pp)", gridcolor: C.line } }), config);
}

function drawHeat(rows, state) {
  const sectors = [...new Set(rows.map((r) => r.sector))];
  const dates = [...new Set(rows.map((r) => String(r.date).slice(0, 10)))].sort();
  const z = sectors.map((s) => dates.map((d) => {
    const row = rows.find((r) => r.sector === s && String(r.date).slice(0, 10) === d);
    return row ? row.value : null;
  }));
  Plotly.react("sectorHeat", [{
    type: "heatmap", z, x: dates, y: sectors, colorscale: "RdBu", reversescale: true,
    zmid: 3, zmin: -2, zmax: 15, xgap: 1, ygap: 1,
    colorbar: { title: "Inflation %", thickness: 9, len: 0.8 },
    hovertemplate: "%{y}<br>%{x} · %{z:.1f}%<extra></extra>",
  }], baseLayout({
    margin: { l: 210, r: 12, t: 8, b: 60 },
    xaxis: { gridcolor: C.line, tickangle: -45, dtick: 6 },
    yaxis: { gridcolor: "rgba(0,0,0,0)", tickfont: { size: 10 } },
    shapes: [],
  }), config);
}

let smallToken = 0;
let smallObserver = null;

function drawSmall(rows, state) {
  const token = ++smallToken;
  const el = $("#sectorSmall");
  const sectors = [...new Set(rows.map((r) => r.sector))];
  el.replaceChildren();
  smallObserver?.disconnect();

  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
  const build = (i) => {
    if (token !== smallToken || i >= sectors.length) return;
    idle(() => {
      if (token !== smallToken) return;
      const sector = sectors[i];
      const cell = document.createElement("div");
      cell.className = "mini";
      cell.title = sector;
      el.appendChild(cell);
      const sub = rows.filter((r) => r.sector === sector)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      Plotly.react(cell, [{
        x: sub.map((r) => String(r.date).slice(0, 10)),
        y: sub.map((r) => r.value),
        type: "scatter", mode: "lines",
        line: { color: C.teal, width: 1.4 },
        hovertemplate: `${sector}<br>%{x} · %{y:.1f}%<extra></extra>`,
      }], baseLayout({
        margin: { l: 26, r: 6, t: 20, b: 18 },
        title: { text: sector.replace(/,.*/, ""), font: { size: 9 }, x: 0.02, y: 0.98 },
        xaxis: { showgrid: false, tickfont: { size: 8 }, nticks: 3 },
        yaxis: { gridcolor: C.line, tickfont: { size: 8 }, nticks: 3 },
        showlegend: false,
      }), { displayModeBar: false, responsive: true });
      cell.addEventListener("click", () => {
        const row = sectorRows.find((r) => r.name.toLowerCase() === sector.toLowerCase());
        if (row) setState({ sector: row.code });
      });
      build(i + 1);
    }, { timeout: 800 });
  };

  smallObserver = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    smallObserver?.disconnect();
    build(0);
  }, { rootMargin: "200px" });
  smallObserver.observe(el);
}

export function highlightSector(code) {
  const table = document.getElementById("sectorTable");
  if (!table) return;
  let name = "";
  table.querySelectorAll("tr[data-code]").forEach((tr) => {
    const on = tr.dataset.code === code;
    tr.style.background = on ? "var(--teal-soft)" : "";
    if (on) name = tr.querySelector(".name")?.textContent || code;
  });
  document.querySelectorAll(".basket-tile").forEach((tile) => {
    tile.classList.toggle("selected", tile.dataset.code === code);
  });
  const label = document.getElementById("basketSelection");
  if (label) label.textContent = name ? `Selected: ${name}.` : "Click a tile to focus a sector.";
}

function drawTable(rows, state) {
  const table = $("#sectorTable");
  table.innerHTML = "<tr><th>Sector</th><th>Share of basket</th><th>Inflation</th><th>Push (pp)</th></tr>" +
    rows.map((r) => `<tr data-code="${r.code}" class="${state.sector === r.code ? "active" : ""}" style="${state.sector === r.code ? "background:var(--teal-soft)" : ""}">` +
      `<td class="name">${r.name}</td><td>${r.weight_pct.toFixed(1)}%</td>` +
      `<td>${r.value == null ? "—" : r.value.toFixed(1) + "%"}</td>` +
      `<td>${r.contribution == null ? "—" : r.contribution.toFixed(2)}</td></tr>`).join("");
  table.querySelectorAll("tr[data-code]").forEach((tr) => {
    tr.addEventListener("click", () => setState({ sector: tr.dataset.code }));
  });
}
