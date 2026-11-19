/* Regional structure: PCA scatter + selectable region table. */
import { get } from "../api.js";
import { setState } from "../store.js";
import { C, baseLayout, config, $ } from "./common.js";

export async function renderStructure(state) {
  const rows = (await get("/structure/pca")).data;
  drawPCA(rows, state);
  drawTable(rows, state);
  if (!renderStructure.bound) {
    $("#pcaChart").on("plotly_click", (e) => {
      const r = e.points?.[0];
      if (r) setState({ region: r.text });
    });
    renderStructure.bound = true;
  }
}

function drawPCA(rows, state) {
  Plotly.react("pcaChart", [{
    type: "scatter", mode: "markers+text",
    x: rows.map((r) => r.pc1), y: rows.map((r) => r.pc2),
    text: rows.map((r) => r.geolocation.split(" ")[0].replace(/\(.*\)/, "")),
    textposition: "top center", textfont: { size: 8.5 },
    marker: {
      size: rows.map((r) => 8 + Math.min(18, r.volatility * 4)),
      color: rows.map((r) => r.latest_inflation), colorscale: "RdYlGn", cmid: 3,
      cmin: 0, cmax: 12, line: { color: C.paper, width: 1 },
      colorbar: { title: "Inflation %", thickness: 9, len: 0.7 },
    },
    customdata: rows.map((r) => r.geolocation),
    hovertemplate: "<b>%{customdata}</b><br>Component 1 %{x:.1f} · Component 2 %{y:.1f}<extra></extra>",
  }], baseLayout({
    xaxis: { title: "Component 1, level (29.9%)", gridcolor: C.line, zeroline: true, zerolinecolor: C.line },
    yaxis: { title: "Component 2, timing (20.4%)", gridcolor: C.line, zeroline: true, zerolinecolor: C.line },
  }), config);
}

function drawTable(rows, state) {
  const table = $("#regionTable");
  table.innerHTML = "<tr><th>Region</th><th>Latest inflation</th><th>Average</th><th>Swings</th></tr>" +
    rows.map((r) => `<tr data-id="${r.geolocation}" style="${state.region === r.geolocation ? "background:var(--teal-soft)" : ""}">` +
      `<td class="name">${r.geolocation}</td><td>${r.latest_inflation.toFixed(1)}%</td>` +
      `<td>${r.mean_inflation.toFixed(2)}</td><td>${r.volatility.toFixed(2)}</td></tr>`).join("");
  table.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => setState({ region: tr.dataset.id }));
  });
}
