// Motion for state changes only: KPI count-up, rank bars, tab reveal, one load intro.
import { animate, stagger } from "animejs";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// "4.12%" -> { pre: "", n: 4.12, post: "%", dp: 2 }; null when no number.
export function parseNum(text) {
  const m = /^(.*?)(-?\d[\d,]*\.?\d*)(.*)$/.exec(text || "");
  if (!m) return null;
  const raw = m[2].replace(/,/g, "");
  return { pre: m[1], n: Number(raw), post: m[3], dp: (raw.split(".")[1] || "").length };
}
console.assert(parseNum("₱1,234.5")?.n === 1234.5 && parseNum("−")  === null && parseNum("-0.30 pp").dp === 2, "parseNum");

// instant: skip tweening (play mode re-renders every 650ms; overlapping tweens cause jank).
export function countUp(el, fromText, instant = false) {
  if (instant) return;
  const to = parseNum(el.textContent);
  const from = parseNum(fromText);
  if (!to || !from || reduced() || from.n === to.n) return;
  const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: to.dp, maximumFractionDigits: to.dp });
  const o = { v: from.n };
  animate(o, {
    v: to.n, duration: 450, ease: "outQuart",
    onUpdate: () => { el.textContent = `${to.pre}${fmt(o.v)}${to.post}`; },
  });
}

export function growBars(list, instant = false) {
  const bars = [...list.querySelectorAll(".bar > span[data-w]")];
  if (instant || reduced()) { bars.forEach((b) => { b.style.width = `${b.dataset.w}%`; }); return; }
  bars.forEach((b) => animate(b, { width: `${b.dataset.w}%`, duration: 450, ease: "outQuart" }));
}

export function intro() {
  if (reduced()) return;
  animate("#kpis .kpi, .hero-grid .card", {
    opacity: [0, 1], translateY: [8, 0], duration: 500, delay: stagger(60), ease: "outQuart",
  });
}

// Push `from` off to the left while `to` comes in from the right, as one moving surface.
export async function slideOver(from, to) {
  if (reduced()) return;
  const o = { duration: 700, ease: "inOutCubic" };
  await Promise.all([
    animate(from, { translateX: ["0%", "-100%"], ...o }),
    animate(to, { translateX: ["100%", "0%"], ...o }),
  ]);
}

export function revealPanel(el) {
  if (!el || reduced()) return;
  animate(el, { opacity: [0, 1], translateY: [6, 0], duration: 250, ease: "outQuad" });
}
