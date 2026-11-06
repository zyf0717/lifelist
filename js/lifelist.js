// Pure logic: parse a My eBird CSV export into chart series.
// No DOM, no Plotly — importable from node tests and the browser alike.

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { if (row.length > 1 || row[0] !== "") rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") { pushField(); pushRow(); }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { pushField(); pushRow(); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export const COUNTRY = {
  SG: "Singapore", MY: "Malaysia", TH: "Thailand", BT: "Bhutan", JP: "Japan",
  IN: "India", VN: "Vietnam", KH: "Cambodia", TW: "Taiwan", HK: "Hong Kong",
  CN: "China", GB: "UK", PH: "Philippines", ID: "Indonesia", KR: "S. Korea", KE: "Kenya",
};
export const PROVINCE = { "CN-46": "Hainan" };

export function regionOf(stateProvince) {
  const sp = String(stateProvince ?? "");
  if (PROVINCE[sp]) return PROVINCE[sp];
  const code = sp.split("-")[0];
  return COUNTRY[code] ?? code;
}

export function isHome(stateProvince, homeCode) {
  const sp = String(stateProvince ?? "");
  return sp === homeCode || sp.startsWith(homeCode + "-");
}

// Countries present in the data, ranked by checklist count — feeds the home selector.
export function countryCounts(rows) {
  const byCode = new Map();
  for (const r of rows) {
    if (Number.isNaN(Date.parse(r["Date"])) || !r["Common Name"]) continue;
    const code = String(r["State/Province"] ?? "").split("-")[0];
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, new Set());
    byCode.get(code).add(r["Submission ID"]);
  }
  return [...byCode.entries()]
    .map(([code, subs]) => ({ code, name: COUNTRY[code] ?? code, checklists: subs.size }))
    .sort((a, b) => b.checklists - a.checklists || a.name.localeCompare(b.name));
}

// Dedupe unit: one "taxon" = one normalized Scientific Name (fallback: Common
// Name). This is a name-based tally, NOT eBird's official countable-species
// total — subspecies, hybrids, and unidentified taxa are counted by name,
// not by eBird's taxonomy and countability rules.
export function taxonKey(row) {
  const sci = String(row["Scientific Name"] ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return sci || String(row["Common Name"] ?? "").trim().toLowerCase();
}

const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function buildSeries(rows, { homeCode = "SG", minTripRows = 10, tripGapDays = 7 } = {}) {
  const obs = [];
  for (const r of rows) {
    const d = Date.parse(r["Date"]);
    if (Number.isNaN(d) || !r["Common Name"]) continue;
    obs.push({
      date: d,
      taxon: taxonKey(r),
      submission: r["Submission ID"],
      media: String(r["ML Catalog Numbers"] ?? "").trim() !== "",
      sp: r["State/Province"],
    });
  }

  const firstSeen = new Map();
  const firstMedia = new Map();
  const submissions = new Set();
  for (const o of obs) {
    submissions.add(o.submission);
    if (!firstSeen.has(o.taxon) || o.date < firstSeen.get(o.taxon)) firstSeen.set(o.taxon, o.date);
    if (o.media && (!firstMedia.has(o.taxon) || o.date < firstMedia.get(o.taxon))) firstMedia.set(o.taxon, o.date);
  }
  const toCurve = (map) => {
    const sorted = [...map.entries()].sort((a, b) => a[1] - b[1]);
    return { x: sorted.map(([, d]) => isoDay(d)), y: sorted.map((_, i) => i + 1) };
  };
  const lifeList = toCurve(firstSeen);
  const withMedia = toCurve(firstMedia);

  // trips: non-home checklists clustered by <= tripGapDays gaps, min rows filter
  const byRegion = new Map();
  for (const o of obs) {
    if (isHome(o.sp, homeCode)) continue;
    const region = regionOf(o.sp);
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(o);
  }
  const trips = [];
  for (const [region, list] of byRegion) {
    const days = [...new Set(list.map(o => Math.floor(o.date / DAY)))].sort((a, b) => a - b);
    let group = [days[0]];
    const groups = [];
    for (const d of days.slice(1)) {
      if (d - group[group.length - 1] > tripGapDays) { groups.push(group); group = [d]; }
      else group.push(d);
    }
    groups.push(group);
    for (const g of groups) {
      const t0 = g[0] * DAY, t1 = (g[g.length - 1] + 1) * DAY;
      const n = list.filter(o => o.date >= t0 && o.date < t1).length;
      if (n >= minTripRows) trips.push({ region, start: isoDay(t0), end: isoDay(g[g.length - 1] * DAY) });
    }
  }
  trips.sort((a, b) => (a.start < b.start ? -1 : 1));

  const dates = obs.map(o => o.date);
  return {
    lifeList, withMedia, trips,
    nTaxa: lifeList.y.length,
    nWithMedia: withMedia.y.length,
    nChecklists: submissions.size,
    minDate: Math.min(...dates),
    maxDate: Math.max(...dates),
  };
}
