// reads the json the build wrote, draws the charts, runs the two tools

const COLOR = { 1: "#2a78d6", 2: "#eb6834", all: "#2a78d6", grey: "#c3c2b7" };
const SVG_NS = "http://www.w3.org/2000/svg";

const euro = (v) => "€" + Math.round(v).toLocaleString("en-GB");
const pct = (v, d = 1) => (100 * v).toFixed(d) + "%";
const num = (v) => Math.round(v).toLocaleString("en-GB");
const euroShort = (v) => (v >= 1e6 ? "€" + (v / 1e6).toFixed(1) + "M" : euro(v));

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
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

function yAxis(area, max, format, steps = 4) {
  const group = svg("g", { class: "axis" });
  for (let i = 0; i <= steps; i++) {
    const v = (max * i) / steps;
    const y = area.y1 - ((area.y1 - area.y0) * i) / steps;
    group.append(svg("line", { x1: area.x0, x2: area.x1, y1: y, y2: y }));
    group.append(svg("text", { x: area.x0 - 6, y: y + 4, "text-anchor": "end" }, format(v)));
  }
  return group;
}

function roundUpAxis(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return n * p;
}

// monthly lines. series: [{label, color, values: [{x: 'YYYY-MM', y}]}]
function lineChart(series, { format, max, h = 260 }) {
  const area = frame(h, 48);
  const months = series[0].values.map((v) => v.x);
  const top = max ?? roundUpAxis(Math.max(...series.flatMap((s) => s.values.map((v) => v.y))));
  const xAt = (i) => area.x0 + ((area.x1 - area.x0) * i) / (months.length - 1);
  const yAt = (v) => area.y1 - ((area.y1 - area.y0) * v) / top;
  area.root.append(yAxis(area, top, format));
  const axis = svg("g", { class: "axis" });
  months.forEach((m, i) => {
    if (m.endsWith("-01") || i === 0) {
      axis.append(svg("text", { x: xAt(i), y: area.y1 + 18, "text-anchor": "middle" }, m.slice(0, 4)));
      axis.append(svg("line", { x1: xAt(i), x2: xAt(i), y1: area.y1, y2: area.y1 + 4 }));
    }
  });
  area.root.append(axis);
  for (const s of series) {
    const path = s.values.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v.y).toFixed(1)}`).join(" ");
    area.root.append(svg("path", { d: path, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-dasharray": s.dash || "none" }));
    const last = s.values[s.values.length - 1];
    area.root.append(svg("circle", { cx: xAt(months.length - 1), cy: yAt(last.y), r: 4, fill: s.color, stroke: "#fff", "stroke-width": 2 }));
  }
  return area.root;
}

// horizontal bars with an optional grey "cancelled" part. rows: [{label, total, part}]
function barChart(rows, { format = num, showRate = false, h } = {}) {
  const rowH = 26;
  const height = h ?? rows.length * rowH + 20;
  const area = frame(height, 150, 8, 8, 70);
  const top = Math.max(...rows.map((r) => r.total));
  const widthOf = (v) => ((area.x1 - area.x0) * v) / top;
  rows.forEach((r, i) => {
    const y = area.y0 + i * rowH;
    area.root.append(svg("text", { x: area.x0 - 8, y: y + 16, "text-anchor": "end", class: "label" }, r.label));
    area.root.append(svg("rect", { x: area.x0, y: y + 4, width: widthOf(r.total), height: 16, rx: 3, fill: r.color }));
    if (r.part) {
      area.root.append(svg("rect", { x: area.x0 + widthOf(r.total - r.part) + 1, y: y + 4, width: Math.max(0, widthOf(r.part) - 1), height: 16, rx: 3, fill: COLOR.grey }));
    }
    const text = showRate ? pct(r.part / r.total) : format(r.total);
    area.root.append(svg("text", { x: area.x0 + widthOf(r.total) + 8, y: y + 16, class: "value" }, text));
  });
  return area.root;
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

function selectedHotels() {
  return hotel === "all" ? [1, 2] : [Number(hotel)];
}

function sum(rows, key) {
  return rows.reduce((a, r) => a + r[key], 0);
}

// combine per-hotel rows that share a label
function combine(rows, keys = ["bookings", "cancelled"]) {
  const out = new Map();
  for (const r of rows) {
    if (!selectedHotels().includes(r.hotel_key)) continue;
    const cur = out.get(r.label) || Object.fromEntries(keys.map((k) => [k, 0]));
    for (const k of keys) cur[k] += r[k];
    out.set(r.label, cur);
  }
  return [...out].map(([label, v]) => ({ label, ...v }));
}

// ---------- part 1 ----------

function drawTiles() {
  const hotels = DATA.summary.hotels.filter((h) => selectedHotels().includes(h.hotel_key));
  const months = DATA.monthly.filter((m) => selectedHotels().includes(m.hotel_key));
  const bookings = sum(hotels, "bookings");
  const cancelled = sum(hotels, "cancelled");
  const revenue = sum(hotels, "revenue");
  const sold = sum(months, "rooms_sold");
  const available = sum(months, "rooms_available");
  const tiles = [
    ["Bookings", num(bookings), "in three years"],
    ["Cancelled", pct(cancelled / bookings), num(cancelled) + " bookings"],
    ["Occupancy", pct(sold / available), num(sold) + " room nights sold"],
    ["ADR", euro(revenue / sold), "per room sold"],
    ["RevPAR", euro(revenue / available), "per room available"],
    ["Revenue", euroShort(revenue), euro(revenue) + " from stays that happened"],
  ];
  const box = document.getElementById("tiles");
  box.replaceChildren(...tiles.map(([label, value, sub]) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `<span class="label"></span><span class="value"></span><span class="sub"></span>`;
    tile.children[0].textContent = label;
    tile.children[1].textContent = value;
    tile.children[2].textContent = sub;
    return tile;
  }));
  document.getElementById("rooms-note").textContent =
    hotels.map((h) => `${h.hotel_name} has about ${h.rooms} rooms.`).join(" ") +
    (hotels.length > 1 ? " I estimated these from the busiest night." : " I estimated this from the busiest night.");
}

function monthlySeries(key, format) {
  const hotels = DATA.summary.hotels.filter((h) => selectedHotels().includes(h.hotel_key));
  return hotels.map((h) => ({
    label: h.hotel_name,
    color: COLOR[h.hotel_key],
    values: DATA.monthly.filter((m) => m.hotel_key === h.hotel_key).map((m) => ({ x: m.year_month, y: m[key] })),
  }));
}

function drawCharts() {
  const hotels = DATA.summary.hotels.filter((h) => selectedHotels().includes(h.hotel_key));
  const hotelLegend = hotels.map((h) => ({ label: h.hotel_name, color: COLOR[h.hotel_key], line: true }));

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
    selectedHotels().includes(r.hotel_key) && r.lead_bucket === p.lead_bucket && r.deposit_type === p.deposit_type &&
    r.segment_group === p.segment_group && r.repeated === p.repeated);
  const n = sum(rows, "n");
  const c = sum(rows, "cancelled");
  const hotels = DATA.summary.hotels.filter((h) => selectedHotels().includes(h.hotel_key));
  const avg = sum(hotels, "cancelled") / sum(hotels, "bookings");
  const box = document.getElementById("lookup");
  if (n === 0) {
    box.innerHTML = `<div class="big">No bookings like this</div><div class="row">There were no bookings like this in the three years.</div>`;
    return;
  }
  const rate = c / n;
  const standardError = Math.sqrt((rate * (1 - rate)) / n);
  const small = n < 100;
  box.innerHTML = `
    <div class="big"></div>
    <div class="row"></div>
    <div class="bar"><span></span><i></i></div>
    <div class="row muted"></div>
    <div class="row warn" hidden></div>`;
  box.querySelector(".big").textContent = pct(rate) + " got cancelled";
  box.querySelector(".row").textContent = `${num(c)} of ${num(n)} bookings like this were cancelled.`;
  box.querySelector(".bar > span").style.width = pct(rate);
  box.querySelector(".bar > i").style.left = pct(avg);
  const wobble = Math.max(1, Math.round(100 * 2 * standardError));
  box.querySelector(".row.muted").textContent =
    `The small black line is the average for ${hotel === "all" ? "both hotels" : "the " + hotels[0].hotel_name}, ${pct(avg)}. ` +
    `The true rate is probably within ${wobble} point${wobble > 1 ? "s" : ""} of this number.`;
  const warn = box.querySelector(".warn");
  warn.hidden = !small;
  warn.textContent = "This comes from fewer than 100 bookings, so it is not very reliable.";
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
  const probability = binomial(n, p);
  let empty = 0, walked = 0;
  for (let k = 0; k <= n; k++) {
    const show = n - k;
    if (show < rooms) empty += probability[k] * (rooms - show);
    else walked += probability[k] * (show - rooms);
  }
  return { cost: empty * costEmpty + walked * costWalk, empty, walked };
}

function overbookInputs() {
  const read = (name) => Number(document.querySelector(`[data-ob=${name}]`).value);
  return { rooms: read("rooms"), rate: read("rate") / 100, empty: read("empty"), walk: read("walk") };
}

function drawOverbook() {
  const { rooms, rate, empty, walk } = overbookInputs();
  if (!(rooms > 0) || !(rate >= 0 && rate < 1)) return;
  const maxExtra = Math.min(600, Math.round((rooms * Math.max(rate, 0.02)) / (1 - rate) * 1.6) + 8);
  const points = [];
  for (let e = 0; e <= maxExtra; e++) points.push({ extra: e, ...expectedCost(rooms, e, rate, empty, walk) });
  const best = points.reduce((a, b) => (b.cost < a.cost ? b : a));
  const base = points[0];

  const box = document.getElementById("overbook-answer");
  box.innerHTML = `<div class="big"></div><div class="row"></div><div class="row"></div>`;
  box.children[0].textContent = best.extra === 0
    ? "Do not sell more than you have"
    : `Sell ${best.extra} more room${best.extra > 1 ? "s" : ""} than you have`;
  box.children[1].textContent =
    `That is ${num(rooms + best.extra)} bookings for ${num(rooms)} rooms. On a normal night, about ` +
    `${best.empty.toFixed(1)} rooms stay empty and ${best.walked.toFixed(2)} guests have to be sent away.`;
  box.children[2].textContent = best.extra === 0
    ? `The expected cost is ${euro(best.cost)} per night. With these costs, selling extra rooms does not help.`
    : `The expected cost is ${euro(best.cost)} per night. With no overbooking it would be ${euro(base.cost)}. ` +
      `So this saves about ${euro(base.cost - best.cost)} per night. Over a year of nights like this, that is about ${euro((base.cost - best.cost) * 365)}.`;

  const area = frame(240, 60);
  const top = roundUpAxis(Math.max(...points.map((q) => q.cost)));
  const xAt = (i) => area.x0 + ((area.x1 - area.x0) * i) / maxExtra;
  const yAt = (v) => area.y1 - ((area.y1 - area.y0) * v) / top;
  area.root.append(yAxis(area, top, (v) => "€" + num(v)));
  const axis = svg("g", { class: "axis" });
  const step = maxExtra <= 20 ? 2 : maxExtra <= 60 ? 10 : 20;
  for (let e = 0; e <= maxExtra; e += step) {
    axis.append(svg("text", { x: xAt(e), y: area.y1 + 18, "text-anchor": "middle" }, e));
  }
  axis.append(svg("text", { x: (area.x0 + area.x1) / 2, y: area.y1 + 30, "text-anchor": "middle" }, "extra bookings, more than the number of rooms"));
  area.root.append(axis);
  const path = points.map((q, i) => `${i ? "L" : "M"}${xAt(q.extra).toFixed(1)} ${yAt(q.cost).toFixed(1)}`).join(" ");
  area.root.append(svg("path", { d: path, fill: "none", stroke: COLOR[hotel], "stroke-width": 2, "stroke-linejoin": "round" }));
  area.root.append(svg("line", { x1: xAt(best.extra), x2: xAt(best.extra), y1: area.y0, y2: area.y1, stroke: "#212529", "stroke-dasharray": "3 3" }));
  area.root.append(svg("circle", { cx: xAt(best.extra), cy: yAt(best.cost), r: 5, fill: COLOR[hotel], stroke: "#fff", "stroke-width": 2 }));
  area.root.append(svg("text", { x: xAt(best.extra) + 8, y: area.y0 + 12, class: "value" }, `lowest cost is at ${best.extra}`));
  mount("chart-overbook", area.root);
}

function setRateFromData() {
  const days = Number(document.querySelector("[data-ob=horizon]").value);
  const rows = DATA.summary.late.filter((r) => r.days === days && selectedHotels().includes(r.hotel_key));
  const rate = sum(rows, "cancelled") / sum(rows, "on_books");
  document.querySelector("[data-ob=rate]").value = (100 * rate).toFixed(1);
}

function setOverbookDefaults() {
  const hotels = DATA.summary.hotels.filter((h) => selectedHotels().includes(h.hotel_key));
  const rooms = sum(hotels, "rooms");
  const adr = sum(hotels, "revenue") / sum(hotels, "room_nights");
  document.querySelector("[data-ob=rooms]").value = rooms;
  document.querySelector("[data-ob=empty]").value = Math.round(adr);
  setRateFromData();
}

// ---------- wiring ----------

function drawAll() {
  drawTiles();
  drawCharts();
  drawLookup();
  setOverbookDefaults();
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
  document.querySelector("[data-ob=horizon]").addEventListener("change", () => { setRateFromData(); drawOverbook(); });
  drawAll();
}

main();
