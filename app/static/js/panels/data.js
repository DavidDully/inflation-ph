/* Data & SQL: region table, metrics, SQL drawers, exports. */
import { get } from "../api.js";
import { setState } from "../store.js";
import { $ } from "./common.js";

export async function renderData(state) {
  const regions = (await get("/table/geolocations")).data;
  drawRegionTable(regions, state);
  const metrics = (await get("/model/metrics")).data;
  drawMetrics(metrics);
}

function drawRegionTable(rows, state) {
  const table = $("#dataRegionTable");
  table.innerHTML =
    "<tr><th>Rank</th><th>Region</th><th>Inflation (year-on-year)</th><th>Previous month</th><th>Change vs prior</th><th>Status</th></tr>" +
    rows.map((r) => `<tr data-id="${r.region}" style="${state.region === r.region ? "background:var(--teal-soft)" : ""}">` +
      `<td>${r.rank}</td><td class="name">${r.region}</td>` +
      `<td>${r.infl.toFixed(1)}%</td><td>${r.prev == null ? "—" : r.prev.toFixed(1) + "%"}</td>` +
      `<td>${r.mom_change == null ? "—" : (r.mom_change >= 0 ? "+" : "") + r.mom_change.toFixed(1)}</td>` +
      `<td>${r.infl > 4 ? "Above 4%" : "Within band"}</td></tr>`).join("");
  table.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => setState({ region: tr.dataset.id }));
  });
}

function drawMetrics(m) {
  const table = $("#metricsTable");
  const rows = [
    ["SARIMA average / RMS error (MAE / RMSE)", `${m.backtest?.[1]?.MAE?.toFixed(2) ?? "—"} / ${m.backtest?.[1]?.RMSE?.toFixed(2) ?? "—"}`],
    ["Holt-Winters average / RMS error (MAE / RMSE)", `${m.backtest?.[0]?.MAE?.toFixed(2) ?? "—"} / ${m.backtest?.[0]?.RMSE?.toFixed(2) ?? "—"}`],
    ["Regional estimate: avg / RMS error / R²", `${m.gbm?.MAE?.toFixed(2)} / ${m.gbm?.RMSE?.toFixed(2)} / ${m.gbm?.R2?.toFixed(2)}`],
    ["Risk model ranking / precision score (AUC / AP)", `${m.classifier?.AUC?.toFixed(3)} / ${m.classifier?.average_precision?.toFixed(3)}`],
    ["Risk model precision @ 0.50", m.classifier?.precision?.toFixed(2)],
    ["Test window", "Nov 2025 – Oct 2026"],
    ["Series", `${m.series_start?.slice(0, 10)} to ${m.series_end?.slice(0, 10)}, n = ${m.n_obs}`],
    ["Trained at", m.trained_at],
  ];
  table.innerHTML = rows.map(([k, v]) => `<tr><td class="name">${k}</td><td>${v}</td></tr>`).join("");
}

export async function showSql(panel, argsText) {
  const box = $("#dataSql");
  const pre = $("#dataSqlText");
  box.classList.add("open");
  pre.textContent = "Loading…";
  try {
    const body = await get(`/sql/${panel}`);
    pre.textContent = `${panel}.sql\n\n${body.data.sql}` +
      (argsText ? `\n\n-- params: ${argsText}` : "");
  } catch (err) {
    pre.textContent = `SQL preview unavailable for ${panel}: ${err.message}`;
  }
}
