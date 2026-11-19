/* Risk tab: ROC/PR, live threshold explorer, SHAP, residuals. */
import { get, post } from "../api.js";
import { C, baseLayout, config, $ } from "./common.js";

let curves = null;

export async function renderRisk() {
  if (!curves) curves = (await get("/classifier/curves")).data;
  drawCurves(curves);
  await applyThreshold(Number($("#thrSlider").value));
  const shap = (await get("/nowcast/shap/global")).data;
  drawShapBar(shap);
  const swarm = (await get("/nowcast/shap/beeswarm", { sample: 45 })).data;
  drawSwarm(swarm);
  const res = (await get("/nowcast/residuals")).data;
  drawResiduals(res);
}

export function initRisk() {
  const slider = $("#thrSlider");
  slider.addEventListener("input", () => {
    $("#thrVal").textContent = Number(slider.value).toFixed(2);
  });
  slider.addEventListener("change", () => applyThreshold(Number(slider.value)));
  $("#rocSqlBtn").addEventListener("click", async () => {
    const drawer = $("#rocSql");
    drawer.classList.toggle("open");
    if (drawer.classList.contains("open")) {
      $("#rocSql pre").textContent =
        "ROC / PR curves are precomputed in models/train_models.py\n" +
        "and served from data/models/roc_curve.parquet, pr_curve.parquet.\n\n" +
        "POST /api/classifier/threshold\n{ \"threshold\": 0.50 }";
    }
  });
}

function drawCurves(c) {
  Plotly.react("rocChart", [
    { x: c.roc.map((r) => r.fpr), y: c.roc.map((r) => r.tpr), type: "scatter", mode: "lines",
      name: `Ranking trade-off`, line: { color: C.teal, width: 2 } },
    { x: c.pr.map((r) => r.recall), y: c.pr.map((r) => r.precision), type: "scatter",
      mode: "lines", name: `Precision–recall`, line: { color: C.vermilion, width: 2 },
      yaxis: "y2" },
  ], baseLayout({
    xaxis: { title: "False alarms / rises caught", gridcolor: C.line },
    yaxis: { title: "Share of rises caught", gridcolor: C.line, range: [0, 1.02] },
    yaxis2: { title: "Share of alarms correct", overlaying: "y", side: "right", range: [0, 1.02], showgrid: false },
    margin: { l: 48, r: 52, t: 10, b: 36 },
  }), config);
}

async function applyThreshold(threshold) {
  const m = (await post("/classifier/threshold", { threshold })).data;
  const cards = [
    ["Precision (alarms correct)", m.precision.toFixed(2), `${m.tp} correct, ${m.fp} false alarms`],
    ["Recall (rises caught)", m.recall.toFixed(2), `${m.tp} caught, ${m.fn} missed`],
    ["Specificity (calm months correct)", m.specificity.toFixed(2), `${m.tn} correct, ${m.fp} false alarms`],
    ["Accuracy (all months correct)", m.accuracy.toFixed(2), `n = ${m.n}`],
  ];
  $("#thrKpis").innerHTML = cards.map(([k, v, d]) =>
    `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join("");
  $("#confusionTable").innerHTML =
    "<tr><th>Flagged next month?</th><th>Actually above 4%</th><th>Actually below 4%</th></tr>" +
    `<tr><td class="name">Above 4%</td><td>${m.tp}</td><td>${m.fp}</td></tr>` +
    `<tr><td class="name">Not flagged</td><td>${m.fn}</td><td>${m.tn}</td></tr>`;
}

function drawShapBar(rows) {
  const sorted = [...rows].sort((a, b) => a.mean_abs_shap - b.mean_abs_shap);
  Plotly.react("shapBar", [{
    type: "bar", orientation: "h", x: sorted.map((r) => r.mean_abs_shap),
    y: sorted.map((r) => r.feature), marker: { color: C.teal },
    hovertemplate: "%{y} · %{x:.3f}<extra></extra>",
  }], baseLayout({ margin: { l: 76, r: 18, t: 6, b: 32 },
    xaxis: { title: "Average impact (pp)", gridcolor: C.line } }), config);
}

function drawSwarm(rows) {
  const features = [...new Set(rows.map((r) => r.feature))];
  const traces = features.map((f) => {
    const sub = rows.filter((r) => r.feature === f);
    return {
      type: "scatter", mode: "markers", name: f,
      x: sub.map((r) => r.shap_value), y: sub.map(() => f),
      customdata: sub.map((r) => [String(r.date).slice(0, 10), r.geolocation]),
      marker: {
        size: 4,
        color: sub.map((r) => r.feature_value),
        colorscale: "RdYlBu", showscale: f === features[0],
        colorbar: f === features[0] ? { title: "value", thickness: 8, len: 0.6 } : undefined,
        opacity: 0.7,
      },
      hovertemplate: `${f} · impact %{x:.3f}<extra></extra>`,
    };
  });
  Plotly.react("shapSwarm", traces, baseLayout({
    showlegend: false, margin: { l: 76, r: 14, t: 6, b: 32 },
    xaxis: { title: "Impact on prediction (pp)", gridcolor: C.line, zeroline: true, zerolinecolor: C.line },
  }), config);

  const el = document.getElementById("shapSwarm");
  if (!el._localBound) {
    el.on("plotly_click", async (ev) => {
      const p = ev.points?.[0];
      const cd = p?.customdata;
      if (!Array.isArray(cd) || cd.length < 2) return;
      const [date, region] = cd;
      $("#shapLocalLabel").textContent = `${region}, ${date}`;
      const body = await get("/nowcast/shap/local", { region, date });
      drawWaterfall(body);
    });
    el._localBound = true;
  }
}

function drawWaterfall(body) {
  const data = body?.data || [];
  if (!data.length) {
    $("#shapLocalLabel").textContent = "no stored explanation for that point";
    return;
  }
  const rows = [...data].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const base = body.base ?? 0;
  const pred = body.prediction ?? base + rows.reduce((a, r) => a + r.contribution, 0);
  Plotly.react("shapLocal", [{
    type: "waterfall", orientation: "v",
    measure: ["absolute", ...rows.map(() => "relative"), "total"],
    x: ["Base", ...rows.map((r) => `${r.feature} = ${(+r.value).toFixed(2)}`), "Prediction"],
    y: [base, ...rows.map((r) => r.contribution), pred],
    increasing: { marker: { color: C.vermilion } },
    decreasing: { marker: { color: C.teal } },
    totals: { marker: { color: C.graphite } },
    hovertemplate: "%{x}<br>%{y:+.3f} pp<extra></extra>",
  }], baseLayout({
    margin: { l: 48, r: 12, t: 8, b: 70 },
    yaxis: { title: "Next-month inflation (pp)", gridcolor: C.line },
  }), config);
}

function drawResiduals(rows) {
  const vals = rows.map((r) => r.residual);
  const sd = Math.sqrt(vals.reduce((a, v) => a + v * v, 0) / Math.max(1, vals.length));
  Plotly.react("residChart", [{
    x: rows.map((r) => r.date), y: vals, type: "scatter", mode: "lines+markers",
    line: { color: C.graphite, width: 1 }, marker: { size: 3, color: C.graphite },
    hovertemplate: "%{x} · %{y:.3f}<extra></extra>",
  }], baseLayout({
    margin: { l: 48, r: 18, t: 8, b: 34 },
    yaxis: { title: "log-price error", gridcolor: C.line },
    shapes: [2 * sd, -2 * sd].map((y) => ({
      type: "line", xref: "paper", x0: 0, x1: 1, y0: y, y1: y,
      line: { color: C.amber, width: 1, dash: "dot" },
    })),
  }), config);
}
