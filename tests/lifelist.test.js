import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, buildSeries, regionOf, countryCounts, speciesKey } from "../js/lifelist.js";
import { makeFigure } from "../js/chart.js";

const sample = readFileSync(fileURLToPath(new URL("../sample.csv", import.meta.url)), "utf8");

test("parseCsv handles quoted commas, escaped quotes, CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n1,2\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].a, "x, y");
  assert.equal(rows[0].b, 'he said "hi"');
  assert.equal(rows[1].b, "2");
});

test("M3: a leading UTF-8 BOM does not corrupt the first header", () => {
  const base = parseCsv(sample);
  const bom = parseCsv("\ufeff" + sample);
  assert.deepEqual(bom, base); // same rows, first header clean
  const d = buildSeries(bom);
  assert.equal(d.nChecklists, buildSeries(base).nChecklists);
  assert.equal(d.nSpecies, buildSeries(base).nSpecies);
  // BOM only stripped at the start: a \ufeff inside the text is preserved.
  assert.equal(parseCsv('a,b\n\ufeffx,y\n')[0].a, "\ufeffx");
});

test("buildSeries dedupes taxa and counts cumulatively", () => {
  const d = buildSeries(parseCsv(sample));
  assert.ok(d.nSpecies > 0);
  assert.deepEqual(d.lifeList.y, [...Array(d.nSpecies).keys()].map((i) => i + 1));
  assert.ok(d.nWithMedia <= d.nSpecies);
});

test("H1: dedupe unit is the scientific name, not the common name", () => {
  const rows = parseCsv(sample);
  const d = buildSeries(rows);
  // Reference total: distinct normalized scientific names among valid rows.
  const ref = new Set(rows
    .filter((r) => !Number.isNaN(Date.parse(r.Date)) && r["Common Name"])
    .map(speciesKey).filter(Boolean));
  assert.equal(d.nSpecies, ref.size);
  assert.equal(d.nSpecies, 21); // sample.csv reference export total (feral pigeon excluded)
  // Same taxon renamed in eBird (new common name, same scientific name) dedupes.
  const renamed = [
    { "Common Name": "Old Name", "Scientific Name": "Turdus migratorius", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "American Robin (rev.)", "Scientific Name": "Turdus migratorius", Date: "2024-01-01", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(renamed).nSpecies, 1);
  // Distinct taxa sharing one common name stay distinct.
  const shared = [
    { "Common Name": "Common Sandpiper", "Scientific Name": "Actitis hypoleucos", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "Common Sandpiper", "Scientific Name": "Actitis macularius", Date: "2023-01-02", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(shared).nSpecies, 2);
  // Whitespace/case variants of the same scientific name normalize together.
  const messy = [
    { "Common Name": "A", "Scientific Name": "  egretta  GARZETTA ", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "B", "Scientific Name": "Egretta garzetta", Date: "2023-01-02", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(messy).nSpecies, 1);
  // Fallback to Common Name when Scientific Name is absent.
  const fallback = [
    { "Common Name": "Mystery sp.", "Scientific Name": "", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "Mystery sp.", "Scientific Name": "", Date: "2023-01-02", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(fallback).nSpecies, 1);
});

test("speciesKey: subspecies roll up; unknowns, hybrids, domestic excluded", () => {
  const k = (sci) => speciesKey({ "Scientific Name": sci });
  assert.equal(k("Oriolus chinensis diffusus"), "oriolus chinensis"); // trinomial
  assert.equal(k("Apus affinis [nipalensis Group]"), "apus affinis"); // bracketed group
  assert.equal(k("Aerodramus fuciphagus germani/amechanus"), "aerodramus fuciphagus"); // subspecies group
  assert.equal(k("Treron sp."), null);
  assert.equal(k("Nectariniidae sp. (sunbird sp.)"), null);
  assert.equal(k("Charadriidae sp."), null); // family level
  assert.equal(k("Collocalia/Aerodramus sp."), null);
  assert.equal(k("Terpsiphone incei/affinis"), null); // species-group slash
  assert.equal(k("Mycteria cinerea x leucocephala"), null); // hybrid
  assert.equal(k("Cairina moschata (Domestic type)"), null); // domestic
  assert.equal(k("Columba livia (Feral Pigeon)"), null); // feral
  assert.equal(k("Egretta garzetta"), "egretta garzetta");
});

test("media boolean uses the first date the species had media", () => {
  const rows = [
    { "Common Name": "X", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-", "ML Catalog Numbers": "" },
    { "Common Name": "X", Date: "2023-05-01", "Submission ID": "s2", "State/Province": "SG-", "ML Catalog Numbers": "999" },
  ];
  const d = buildSeries(rows);
  assert.equal(d.lifeList.x[0], "2023-01-01");
  assert.equal(d.withMedia.x[0], "2023-05-01");
});

test("M1: media curve is dated by observation, and wording never claims upload date", () => {
  // A 2020 sighting gets media attached later (on the 2023 re-sighting row);
  // the media point lands on the 2023 observation date, not an inferred upload.
  const rows = [
    { "Common Name": "X", "Scientific Name": "X y", Date: "2020-06-01", "Submission ID": "s1", "State/Province": "SG-", "ML Catalog Numbers": "" },
    { "Common Name": "X", "Scientific Name": "X y", Date: "2023-02-10", "Submission ID": "s2", "State/Province": "SG-", "ML Catalog Numbers": "12345" },
  ];
  const d = buildSeries(rows);
  assert.equal(d.withMedia.x[0], "2023-02-10");
  const f = makeFigure(d, 2020);
  const mediaTrace = f.data[2];
  assert.match(mediaTrace.name, /^Species with media \(\d+\)$/);
  assert.doesNotMatch(mediaTrace.name, /upload/i);
  assert.doesNotMatch(f.layout.title.text, /upload/i);
});

test("rows with invalid dates are ignored", () => {
  const rows = [
    { "Common Name": "X", Date: "nope", "Submission ID": "s1", "State/Province": "SG-", "ML Catalog Numbers": "" },
    { "Common Name": "Y", Date: "2023-01-01", "Submission ID": "s2", "State/Province": "SG-", "ML Catalog Numbers": "" },
  ];
  assert.equal(buildSeries(rows).nSpecies, 1);
});

test("H2: extrema are tracked incrementally, no array spread", () => {
  // 150k observations: Math.min(...dates) would throw RangeError.
  const rows = [];
  for (let i = 0; i < 150000; i++) {
    const day = new Date(Date.UTC(2000, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    rows.push({ "Common Name": `S${i}`, "Scientific Name": `Sci s${i}`, Date: day, "Submission ID": `sub${i}`, "State/Province": "SG-", "ML Catalog Numbers": "" });
  }
  const d = buildSeries(rows);
  assert.equal(d.nSpecies, 150000);
  assert.equal(d.minDate, Date.UTC(2000, 0, 1));
  assert.equal(d.maxDate, Date.UTC(2000, 0, 1) + 149999 * 86400000);
  // Single observation: min === max.
  const one = buildSeries([rows[0]]);
  assert.equal(one.minDate, one.maxDate);
  assert.equal(one.nSpecies, 1);
  // No valid observations: explicit nulls.
  const none = buildSeries([{ "Common Name": "X", Date: "not a date", "Submission ID": "s1", "State/Province": "SG-" }]);
  assert.equal(none.minDate, null);
  assert.equal(none.maxDate, null);
  assert.equal(none.nSpecies, 0);
  assert.equal(buildSeries([]).minDate, null);
});

test("M2: later start year keeps the cumulative baseline as a synthetic step point", () => {
  const mk = (sci, date, media = "") => ({
    "Common Name": sci, "Scientific Name": sci, Date: date,
    "Submission ID": `sub-${sci}-${date}`, "State/Province": "SG-", "ML Catalog Numbers": media,
  });
  const rows = [mk("A a", "2020-05-01", "111"), mk("B b", "2021-07-01")];
  const d = buildSeries(rows);

  // Selected year after all observations: one synthetic point at the full total.
  const late = makeFigure(d, 2025);
  assert.deepEqual(late.data[1].x, ["2025-01-01"]);
  assert.deepEqual(late.data[1].y, [2]);
  assert.deepEqual(late.data[2].x, ["2025-01-01"]);
  assert.deepEqual(late.data[2].y, [1]); // media taxon A was recorded before 2025

  // Year between sightings: baseline point then the on/after points.
  const mid = makeFigure(d, 2021);
  assert.deepEqual(mid.data[1].x, ["2021-01-01", "2021-07-01"]);
  assert.deepEqual(mid.data[1].y, [1, 2]);
  assert.deepEqual(mid.data[2].x, ["2021-01-01"]);
  assert.deepEqual(mid.data[2].y, [1]);

  // Sighting exactly on January 1: it is an on/after point, not double-counted.
  const jan1 = buildSeries([mk("A a", "2021-01-01"), mk("B b", "2022-03-01")]);
  const f = makeFigure(jan1, 2021);
  assert.deepEqual(f.data[1].x, ["2021-01-01", "2022-03-01"]);
  assert.deepEqual(f.data[1].y, [1, 2]);

  // Step shape kept; baseline fill follows the displayed life-list x.
  assert.equal(mid.data[1].line.shape, "hv");
  assert.equal(mid.data[2].line.shape, "hv");
  assert.deepEqual(mid.data[0].x, mid.data[1].x);
  // buildSeries totals are untouched by the display filter.
  assert.equal(d.nSpecies, 2);
});

test("trip clustering: gap splits, min rows filters, SG excluded, CN-46 is Hainan", () => {
  const rows = [];
  const mk = (sp, date, sub) => rows.push({
    "Common Name": "C", Date: date, "Submission ID": sub, "State/Province": sp, "ML Catalog Numbers": "",
  });
  for (let i = 0; i < 12; i++) mk("BT-42", `2024-04-${String((i % 3) + 5).padStart(2, "0")}`, `b${i}`);
  for (let i = 0; i < 11; i++) mk("SG-", `2024-04-${String((i % 3) + 5).padStart(2, "0")}`, `g${i}`);
  for (let i = 0; i < 11; i++) mk("MY-10", `2024-09-${String((i % 3) + 1).padStart(2, "0")}`, `m${i}`);
  for (let i = 0; i < 11; i++) mk("MY-10", `2024-12-${String((i % 3) + 1).padStart(2, "0")}`, `n${i}`);
  for (let i = 0; i < 11; i++) mk("CN-46", `2026-11-0${(i % 3) + 1}`, `h${i}`);
  const d = buildSeries(rows);
  const regions = d.trips.map((t) => t.region);
  assert.ok(regions.includes("Bhutan"));
  assert.ok(!regions.includes("Singapore"));
  assert.equal(d.trips.filter((t) => t.region === "Malaysia").length, 2);
  assert.ok(regions.includes("Hainan"));
});

test("regionOf maps country codes and province overrides", () => {
  assert.equal(regionOf("BT-42"), "Bhutan");
  assert.equal(regionOf("CN-46"), "Hainan");
  assert.equal(regionOf("CN-61"), "China");
  assert.equal(regionOf("XX-99"), "XX");
});

test("home country is configurable: BT home makes Singapore the trip", () => {
  const rows = [];
  const mk = (sp, day, sub) => rows.push({
    "Common Name": "C", Date: `2024-04-${String(day).padStart(2, "0")}`, "Submission ID": sub, "State/Province": sp, "ML Catalog Numbers": "",
  });
  for (let i = 0; i < 12; i++) mk("BT-42", (i % 3) + 5, `b${i}`);
  for (let i = 0; i < 12; i++) mk("SG-", (i % 3) + 5, `g${i}`);
  const d = buildSeries(rows, { homeCode: "BT" });
  assert.ok(d.trips.some((t) => t.region === "Singapore"));
  assert.ok(!d.trips.some((t) => t.region === "Bhutan"));
});

test("countryCounts ranks by checklist count", () => {
  const rows = [];
  const mk = (sp, sub) => rows.push({
    "Common Name": "C", Date: "2024-01-01", "Submission ID": sub, "State/Province": sp, "ML Catalog Numbers": "",
  });
  for (let i = 0; i < 3; i++) mk("SG-", `g${i}`);
  for (let i = 0; i < 5; i++) mk("JP-", `j${i}`);
  const counts = countryCounts(rows);
  assert.equal(counts[0].code, "JP");
  assert.equal(counts[0].checklists, 5);
  assert.equal(counts[1].code, "SG");
});

test("home inference tiebreaks: recency, then rows, then name", () => {
  const mk = (sp, date, sub, cn = "C") => ({
    "Common Name": cn, "Scientific Name": cn, Date: date,
    "Submission ID": sub, "State/Province": sp, "ML Catalog Numbers": "",
  });
  // Equal checklists (2 each): the country with the more recent observation wins.
  let counts = countryCounts([
    mk("SG-", "2024-01-01", "a1"), mk("SG-", "2024-01-02", "a2"),
    mk("MY-", "2023-06-01", "b1"), mk("MY-", "2024-05-01", "b2"),
  ]);
  assert.equal(counts[0].code, "MY");
  // Equal checklists and last date: more observation rows wins.
  counts = countryCounts([
    mk("SG-", "2024-01-01", "a1"), mk("SG-", "2024-01-01", "a1", "D"),
    mk("MY-", "2024-01-01", "b1"),
  ]);
  assert.equal(counts[0].code, "SG");
  // Fully tied: alphabetical by name (Malaysia before Singapore).
  counts = countryCounts([
    mk("SG-", "2024-01-01", "a1"),
    mk("MY-", "2024-01-01", "b1"),
  ]);
  assert.equal(counts[0].code, "MY");
  assert.deepEqual(counts.map((c) => c.code), ["MY", "SG"]);
});

test("sample fixture produces a chartable dataset", () => {
  const d = buildSeries(parseCsv(sample));
  assert.ok(d.nChecklists >= 5);
  assert.ok(d.trips.some((t) => t.region === "Bhutan"));
  assert.ok(!d.trips.some((t) => t.region === "Malaysia")); // single trip below min rows
});
