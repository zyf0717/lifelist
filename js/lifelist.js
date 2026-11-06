// Pure logic: parse a My eBird CSV export into chart series.
// No DOM, no Plotly — importable from node tests and the browser alike.

export function parseCsv(text) {
  // A leading UTF-8 BOM would glue \uFEFF onto the first header name and break
  // column lookup / checklist dedup. Strip only the initial one.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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

// Countries present in the data, ranked by checklist share — feeds the home
// selector, whose default is the top entry. Ties on checklist count break by
// most recent observation (home is where you bird now), then total observation
// rows, then name.
export function countryCounts(rows) {
  const byCode = new Map();
  for (const r of rows) {
    const d = Date.parse(r["Date"]);
    if (Number.isNaN(d) || !r["Common Name"]) continue;
    const code = String(r["State/Province"] ?? "").split("-")[0];
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, { subs: new Set(), rows: 0, last: -Infinity });
    const c = byCode.get(code);
    c.subs.add(r["Submission ID"]);
    c.rows += 1;
    if (d > c.last) c.last = d;
  }
  return [...byCode.entries()]
    .map(([code, c]) => ({
      code, name: COUNTRY[code] ?? code,
      checklists: c.subs.size, rows: c.rows, lastDate: c.last,
    }))
    .sort((a, b) =>
      b.checklists - a.checklists ||
      b.lastDate - a.lastDate ||
      b.rows - a.rows ||
      a.name.localeCompare(b.name));
}

// Counting unit: one "species" = the binomial from Scientific Name (fallback:
// Common Name). Subspecies (trinomials, "[Group]" names, and subspecies-group
// slashes like "Aerodramus fuciphagus germani/amechanus") roll up into their
// species. Unknowns (trailing "sp.", family-level names, species-group
// slashes), hybrids ("x"), and domestic/feral forms are excluded entirely
// (owner call 2026-11-07), bringing the tally close to eBird's countable
// total — still a name-based count, not eBird's official taxonomy.
export function speciesKey(row) {
  const raw = String(row["Scientific Name"] ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return String(row["Common Name"] ?? "").trim().toLowerCase() || null;
  if (/\((?:Domestic type|Feral .*)\)/i.test(raw)) return null; // domestic/feral
  const bare = raw.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim();
  if (/\bx\b/.test(bare)) return null; // hybrid
  if (/\bsp\.?$/i.test(bare)) return null; // not identified to species
  const words = bare.split(/\s+/);
  // A slash inside the 3rd word is one species' subspecies group (roll up);
  // any other slash separates species — unknown, excluded.
  if (words.some((w) => w.includes("/")) && !(words.length === 3 && words[2].includes("/"))) return null;
  return words.slice(0, 2).join(" ").toLowerCase();
}

const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function buildSeries(rows, { homeCode = "SG", minTripRows = 10, tripGapDays = 7 } = {}) {
  const obs = [];
  let minDate = Infinity, maxDate = -Infinity; // tracked incrementally: spread on 100k+ arrays throws RangeError
  for (const r of rows) {
    const d = Date.parse(r["Date"]);
    if (Number.isNaN(d) || !r["Common Name"]) continue;
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
    obs.push({
      date: d,
      taxon: speciesKey(r),
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
    if (o.taxon === null) continue; // excluded: unknown / hybrid / domestic
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

  return {
    lifeList, withMedia, trips,
    nSpecies: lifeList.y.length,
    nWithMedia: withMedia.y.length,
    nChecklists: submissions.size,
    minDate: Number.isFinite(minDate) ? minDate : null,
    maxDate: Number.isFinite(maxDate) ? maxDate : null,
  };
}
