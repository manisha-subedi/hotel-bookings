// reads the json the build wrote, draws the charts, runs the two tools

const COLOR = { 1: "#2a78d6", 2: "#eb6834", all: "#2a78d6", grey: "#c3c2b7" };
const NS = "http://www.w3.org/2000/svg";

const euro = (v) => "€" + Math.round(v).toLocaleString("en-GB");
const pct = (v, d = 1) => (100 * v).toFixed(d) + "%";
const num = (v) => Math.round(v).toLocaleString("en-GB");

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

function mount(id, root) {
  const box = document.getElementById(id);
  box.replaceChildren(root);
}

// ---------- charts ----------

const W = 640;

function frame(h, left = 44, bottom = 28, top = 12, right = 12) {
  const root = svg("svg", { viewBox: `0 0 ${W} ${h}`, role: "img" });
  return { root, x0: left, x1: W - right, y0: top, y1: h - bottom };
}

function yAxis(f, max, format, steps = 4) {
  const g = svg("g", { class: "axis" });
  for (let i = 0; i <= steps; i++) {
    const v = (max * i) / steps;
    const y = f.y1 - ((f.y1 - f.y0) * i) / steps;
    g.append(svg("line", { x1: f.x0, x2: f.x1, y1: y, y2: y }));
    g.append(svg("text", { x: f.x0 - 6, y: y + 4, "text-anchor": "end" }, format(v)));
  }
  return g;
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return n * p;
}

// monthly lines. series: [{label, color, values: [{x: 'YYYY-MM', y}]}]
function lineChart(series, { format, max, h = 260 }) {
  const f = frame(h, 48);
  const months = series[0].values.map((v) => v.x);
  const top = max ?? niceMax(Math.max(...series.flatMap((s) => s.values.map((v) => v.y))));
  const xs = (i) => f.x0 + ((f.x1 - f.x0) * i) / (months.length - 1);
  const ys = (v) => f.y1 - ((f.y1 - f.y0) * v) / top;
  f.root.append(yAxis(f, top, format));
  const ax = svg("g", { class: "axis" });
  months.forEach((m, i) => {
    if (m.endsWith("-01") || i === 0) {
      ax.append(svg("text", { x: xs(i), y: f.y1 + 18, "text-anchor": "middle" }, m.slice(0, 4)));
      ax.append(svg("line", { x1: xs(i), x2: xs(i), y1: f.y1, y2: f.y1 + 4 }));
    }
  });
  f.root.append(ax);
  for (const s of series) {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(v.y).toFixed(1)}`).join(" ");
    f.root.append(svg("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-dasharray": s.dash || "none" }));
    const last = s.values[s.values.length - 1];
    f.root.append(svg("circle", { cx: xs(months.length - 1), cy: ys(last.y), r: 4, fill: s.color, stroke: "#fff", "stroke-width": 2 }));
  }
  return f.root;
}

// horizontal bars with an optional grey "cancelled" part. rows: [{label, total, part}]
function barChart(rows, { format = num, showRate = false, h } = {}) {
  const rowH = 26;
  const height = h ?? rows.length * rowH + 20;
  const f = frame(height, 150, 8, 8, 70);
  const top = Math.max(...rows.map((r) => r.total));
  const w = (v) => ((f.x1 - f.x0) * v) / top;
  rows.forEach((r, i) => {
    const y = f.y0 + i * rowH;
    f.root.append(svg("text", { x: f.x0 - 8, y: y + 16, "text-anchor": "end", class: "label" }, r.label));
    f.root.append(svg("rect", { x: f.x0, y: y + 4, width: w(r.total), height: 16, rx: 3, fill: r.color }));
    if (r.part) {
      f.root.append(svg("rect", { x: f.x0 + w(r.total - r.part) + 1, y: y + 4, width: Math.max(0, w(r.part) - 1), height: 16, rx: 3, fill: COLOR.grey }));
    }
    const text = showRate ? pct(r.part / r.total) : format(r.total);
    f.root.append(svg("text", { x: f.x0 + w(r.total) + 8, y: y + 16, class: "value" }, text));
  });
  return f.root;
}

function legend(items) {
  const ul = document.createElement("ul");
  ul.className = "legend";
  for (const it of items) {
    const li = document.createElement("li");
    const key = document.createElement("span");
    key.className = "key" + (it.line ? " line" : "");
    key.style.background = it.color;
    li.append(key, it.label);
    ul.append(li);
  }
  return ul;
}

// ---------- state ----------

let DATA = null;
let hotel = "all";

function hotelsIn() {
  return hotel === "all" ? [1, 2] : [Number(hotel)];
}

function sum(rows, key) {
  return rows.reduce((a, r) => a + r[key], 0);
}

// combine per-hotel rows that share a label
function combine(rows, keys = ["bookings", "cancelled"]) {
  const out = new Map();
  for (const r of rows) {
    if (!hotelsIn().includes(r.hotel_key)) continue;
    const cur = out.get(r.label) || Object.fromEntries(keys.map((k) => [k, 0]));
    for (const k of keys) cur[k] += r[k];
    out.set(r.label, cur);
  }
  return [...out].map(([label, v]) => ({ label, ...v }));
}

// ---------- part 1 ----------

function drawTiles() {
  const hs = DATA.summary.hotels.filter((h) => hotelsIn().includes(h.hotel_key));
  const months = DATA.monthly.filter((m) => hotelsIn().includes(m.hotel_key));
  const bookings = sum(hs, "bookings");
  const cancelled = sum(hs, "cancelled");
  const revenue = sum(hs, "revenue");
  const sold = sum(months, "rooms_sold");
  const available = sum(months, "rooms_available");
  const tiles = [
    ["Bookings", num(bookings), "three years"],
    ["Cancelled", pct(cancelled / bookings), num(cancelled) + " bookings"],
    ["Occupancy", pct(sold / available), num(sold) + " room nights"],
    ["ADR", euro(revenue / sold), "revenue per room sold"],
    ["RevPAR", euro(revenue / available), "revenue per room available"],
    ["Revenue", euro(revenue), "stays that happened"],
  ];
  const box = document.getElementById("tiles");
  box.replaceChildren(...tiles.map(([label, value, sub]) => {
    const d = document.createElement("div");
    d.className = "tile";
    d.innerHTML = `<span class="label"></span><span class="value"></span><span class="sub"></span>`;
    d.children[0].textContent = label;
    d.children[1].textContent = value;
    d.children[2].textContent = sub;
    return d;
  }));
  document.getElementById("rooms-note").textContent =
    hs.map((h) => `${h.hotel_name}: ${h.rooms} rooms, estimated from its busiest night.`).join(" ");
}

function monthlySeries(key, format) {
  const hs = DATA.summary.hotels.filter((h) => hotelsIn().includes(h.hotel_key));
  return hs.map((h) => ({
    label: h.hotel_name,
    color: COLOR[h.hotel_key],
    values: DATA.monthly.filter((m) => m.hotel_key === h.hotel_key).map((m) => ({ x: m.year_month, y: m[key] })),
  }));
}

function drawCharts() {
  const hs = DATA.summary.hotels.filter((h) => hotelsIn().includes(h.hotel_key));
  const hotelLegend = hs.map((h) => ({ label: h.hotel_name, color: COLOR[h.hotel_key], line: true }));

  const occ = lineChart(monthlySeries("occupancy"), { format: (v) => pct(v, 0), max: 1 });
  mount("chart-occupancy", occ);
  document.getElementById("chart-occupancy").append(legend(hotelLegend));

  const rates = lineChart(
    [...monthlySeries("adr"), ...monthlySeries("revpar").map((s) => ({ ...s, dash: "5 4", label: s.label + ", RevPAR" }))],
    { format: (v) => "€" + Math.round(v) },
  );
  mount("chart-rates", rates);
  document.getElementById("chart-rates").append(legend([
    ...hotelLegend.map((l) => ({ ...l, label: l.label + ", ADR" })),
    { label: "RevPAR, dashed", color: "#898781", line: true },
  ]));

  const color = COLOR[hotel];
  const seg = combine(DATA.breakdowns.segments).sort((a, b) => b.bookings - a.bookings);
  mount("chart-segments", barChart(seg.map((r) => ({ label: r.label, total: r.bookings, part: r.cancelled, color }))));

  const lead = combine(DATA.breakdowns.lead);
  const order = DATA.summary.lead_order;
  lead.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  mount("chart-lead", barChart(lead.map((r) => ({ label: r.label + " days", total: r.bookings, part: r.cancelled, color })), { showRate: true }));

  const dep = combine(DATA.breakdowns.deposit).sort((a, b) => b.bookings - a.bookings);
  mount("chart-deposit", barChart(dep.map((r) => ({ label: r.label, total: r.bookings, part: r.cancelled, color })), { showRate: true }));

  const countries = combine(DATA.breakdowns.countries, ["bookings"]).sort((a, b) => b.bookings - a.bookings).slice(0, 8);
  mount("chart-countries", barChart(countries.map((r) => ({ label: r.label, total: r.bookings, color }))));
}

// ---------- part 2 ----------

function pick() {
  const out = {};
  document.querySelectorAll("#picker select").forEach((s) => (out[s.dataset.pick] = s.value));
  out.repeated = out.repeated === "true";
  return out;
}

function drawLookup() {
  const p = pick();
  const rows = DATA.lookup.filter((r) =>
    hotelsIn().includes(r.hotel_key) && r.lead_bucket === p.lead_bucket && r.deposit_type === p.deposit_type &&
    r.segment_group === p.segment_group && r.repeated === p.repeated);
  const n = sum(rows, "n");
  const c = sum(rows, "cancelled");
  const hs = DATA.summary.hotels.filter((h) => hotelsIn().includes(h.hotel_key));
  const avg = sum(hs, "cancelled") / sum(hs, "bookings");
  const box = document.getElementById("lookup");
  if (n === 0) {
    box.innerHTML = `<div class="big">No bookings</div><div class="row">There were no bookings like this one in the three years.</div>`;
    return;
  }
  const rate = c / n;
  const se = Math.sqrt((rate * (1 - rate)) / n);
  const small = n < 100;
  box.innerHTML = `
    <div class="big"></div>
    <div class="row"></div>
    <div class="bar"><span></span><i></i></div>
    <div class="row muted"></div>
    <div class="row warn" hidden></div>`;
  box.querySelector(".big").textContent = pct(rate) + " cancelled";
  box.querySelector(".row").textContent = `${num(c)} of ${num(n)} bookings like this one cancelled.`;
  box.querySelector(".bar > span").style.width = pct(rate);
  box.querySelector(".bar > i").style.left = pct(avg);
  box.querySelector(".row.muted").textContent =
    `The mark is the average for ${hotel === "all" ? "both hotels" : hs[0].hotel_name}, ${pct(avg)}. ` +
    `Give or take about ${Math.max(1, Math.round(100 * 2 * se))} point${Math.round(100 * 2 * se) > 1 ? "s" : ""} either way.`;
  const warn = box.querySelector(".warn");
  warn.hidden = !small;
  warn.textContent = "Fewer than 100 bookings. Treat this rate as rough.";
}

// ---------- part 3 ----------

// probability that exactly k of n bookings cancel
function binomial(n, p) {
  const out = new Array(n + 1);
  let v = Math.pow(1 - p, n);
  out[0] = v;
  for (let k = 1; k <= n; k++) {
    v = (v * (n - k + 1) * p) / (k * (1 - p));
    out[k] = v;
  }
  return out;
}

function expectedCost(rooms, extra, p, costEmpty, costWalk) {
  const n = rooms + extra;
  const pm = binomial(n, p);
  let empty = 0, walked = 0;
  for (let k = 0; k <= n; k++) {
    const show = n - k;
    if (show < rooms) empty += pm[k] * (rooms - show);
    else walked += pm[k] * (show - rooms);
  }
  return { cost: empty * costEmpty + walked * costWalk, empty, walked };
}

function obInputs() {
  const g = (k) => Number(document.querySelector(`[data-ob=${k}]`).value);
  return { rooms: g("rooms"), rate: g("rate") / 100, empty: g("empty"), walk: g("walk") };
}

function drawOverbook() {
  const { rooms, rate, empty, walk } = obInputs();
  if (!(rooms > 0) || !(rate >= 0 && rate < 1)) return;
  const maxExtra = Math.min(600, Math.round((rooms * Math.max(rate, 0.02)) / (1 - rate) * 1.6) + 8);
  const points = [];
  for (let e = 0; e <= maxExtra; e++) points.push({ extra: e, ...expectedCost(rooms, e, rate, empty, walk) });
  const best = points.reduce((a, b) => (b.cost < a.cost ? b : a));
  const base = points[0];

  const box = document.getElementById("overbook-answer");
  box.innerHTML = `<div class="big"></div><div class="row"></div><div class="row"></div>`;
  box.children[0].textContent = `Sell ${best.extra} more than you have`;
  box.children[1].textContent =
    `${num(rooms + best.extra)} bookings for ${num(rooms)} rooms. On an average night that leaves ` +
    `${best.empty.toFixed(1)} rooms empty and sends ${best.walked.toFixed(2)} guests away.`;
  box.children[2].textContent =
    `Expected cost ${euro(best.cost)} a night, against ${euro(base.cost)} with no overbooking. ` +
    `That is ${euro(base.cost - best.cost)} a night, or about ${euro((base.cost - best.cost) * 365)} over a year of nights like this.`;

  const f = frame(240, 60);
  const top = niceMax(Math.max(...points.map((q) => q.cost)));
  const xs = (i) => f.x0 + ((f.x1 - f.x0) * i) / maxExtra;
  const ys = (v) => f.y1 - ((f.y1 - f.y0) * v) / top;
  f.root.append(yAxis(f, top, (v) => "€" + num(v)));
  const ax = svg("g", { class: "axis" });
  const step = maxExtra <= 20 ? 2 : maxExtra <= 60 ? 10 : 20;
  for (let e = 0; e <= maxExtra; e += step) {
    ax.append(svg("text", { x: xs(e), y: f.y1 + 18, "text-anchor": "middle" }, e));
  }
  ax.append(svg("text", { x: (f.x0 + f.x1) / 2, y: f.y1 + 30, "text-anchor": "middle" }, "extra bookings above the room count"));
  f.root.append(ax);
  const d = points.map((q, i) => `${i ? "L" : "M"}${xs(q.extra).toFixed(1)} ${ys(q.cost).toFixed(1)}`).join(" ");
  f.root.append(svg("path", { d, fill: "none", stroke: COLOR[hotel], "stroke-width": 2, "stroke-linejoin": "round" }));
  f.root.append(svg("line", { x1: xs(best.extra), x2: xs(best.extra), y1: f.y0, y2: f.y1, stroke: "#212529", "stroke-dasharray": "3 3" }));
  f.root.append(svg("circle", { cx: xs(best.extra), cy: ys(best.cost), r: 5, fill: COLOR[hotel], stroke: "#fff", "stroke-width": 2 }));
  f.root.append(svg("text", { x: xs(best.extra) + 8, y: f.y0 + 12, class: "value" }, `lowest cost at ${best.extra}`));
  mount("chart-overbook", f.root);
}

function seedRate() {
  const days = Number(document.querySelector("[data-ob=horizon]").value);
  const rows = DATA.summary.late.filter((r) => r.days === days && hotelsIn().includes(r.hotel_key));
  const rate = sum(rows, "cancelled") / sum(rows, "on_books");
  document.querySelector("[data-ob=rate]").value = (100 * rate).toFixed(1);
}

function seedOverbook() {
  const hs = DATA.summary.hotels.filter((h) => hotelsIn().includes(h.hotel_key));
  const rooms = sum(hs, "rooms");
  const adr = sum(hs, "revenue") / sum(hs, "room_nights");
  document.querySelector("[data-ob=rooms]").value = rooms;
  document.querySelector("[data-ob=empty]").value = Math.round(adr);
  seedRate();
}

// ---------- wiring ----------

function drawAll() {
  drawTiles();
  drawCharts();
  drawLookup();
  seedOverbook();
  drawOverbook();
}

async function main() {
  const [summary, monthly, breakdowns, lookup] = await Promise.all(
    ["summary", "monthly", "breakdowns", "lookup"].map((n) => fetch(`data/${n}.json`).then((r) => r.json())),
  );
  DATA = { summary, monthly, breakdowns, lookup };

  document.querySelectorAll(".hotel-switch button").forEach((b) =>
    b.addEventListener("click", () => {
      hotel = b.dataset.hotel;
      document.querySelectorAll(".hotel-switch button").forEach((x) => x.classList.toggle("is-on", x === b));
      drawAll();
    }));
  document.querySelectorAll("#picker select").forEach((s) => s.addEventListener("change", drawLookup));
  document.querySelectorAll("#overbook-inputs input").forEach((i) => i.addEventListener("input", drawOverbook));
  document.querySelector("[data-ob=horizon]").addEventListener("change", () => { seedRate(); drawOverbook(); });
  drawAll();
}

main();
