import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, buildSeries, regionOf, countryCounts, taxonKey } from "../js/lifelist.js";

const sample = readFileSync(fileURLToPath(new URL("../sample.csv", import.meta.url)), "utf8");

test("parseCsv handles quoted commas, escaped quotes, CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n1,2\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].a, "x, y");
  assert.equal(rows[0].b, 'he said "hi"');
  assert.equal(rows[1].b, "2");
});

test("buildSeries dedupes taxa and counts cumulatively", () => {
  const d = buildSeries(parseCsv(sample));
  assert.ok(d.nTaxa > 0);
  assert.deepEqual(d.lifeList.y, [...Array(d.nTaxa).keys()].map((i) => i + 1));
  assert.ok(d.nWithMedia <= d.nTaxa);
});

test("H1: dedupe unit is the scientific name, not the common name", () => {
  const rows = parseCsv(sample);
  const d = buildSeries(rows);
  // Reference total: distinct normalized scientific names among valid rows.
  const ref = new Set(rows
    .filter((r) => !Number.isNaN(Date.parse(r.Date)) && r["Common Name"])
    .map(taxonKey));
  assert.equal(d.nTaxa, ref.size);
  assert.equal(d.nTaxa, 22); // sample.csv reference export total
  // Same taxon renamed in eBird (new common name, same scientific name) dedupes.
  const renamed = [
    { "Common Name": "Old Name", "Scientific Name": "Turdus migratorius", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "American Robin (rev.)", "Scientific Name": "Turdus migratorius", Date: "2024-01-01", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(renamed).nTaxa, 1);
  // Distinct taxa sharing one common name stay distinct.
  const shared = [
    { "Common Name": "Common Sandpiper", "Scientific Name": "Actitis hypoleucos", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "Common Sandpiper", "Scientific Name": "Actitis macularius", Date: "2023-01-02", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(shared).nTaxa, 2);
  // Whitespace/case variants of the same scientific name normalize together.
  const messy = [
    { "Common Name": "A", "Scientific Name": "  egretta  GARZETTA ", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "B", "Scientific Name": "Egretta garzetta", Date: "2023-01-02", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(messy).nTaxa, 1);
  // Fallback to Common Name when Scientific Name is absent.
  const fallback = [
    { "Common Name": "Mystery sp.", "Scientific Name": "", Date: "2023-01-01", "Submission ID": "s1", "State/Province": "SG-" },
    { "Common Name": "Mystery sp.", "Scientific Name": "", Date: "2023-01-02", "Submission ID": "s2", "State/Province": "SG-" },
  ];
  assert.equal(buildSeries(fallback).nTaxa, 1);
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

test("rows with invalid dates are ignored", () => {
  const rows = [
    { "Common Name": "X", Date: "nope", "Submission ID": "s1", "State/Province": "SG-", "ML Catalog Numbers": "" },
    { "Common Name": "Y", Date: "2023-01-01", "Submission ID": "s2", "State/Province": "SG-", "ML Catalog Numbers": "" },
  ];
  assert.equal(buildSeries(rows).nTaxa, 1);
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

test("sample fixture produces a chartable dataset", () => {
  const d = buildSeries(parseCsv(sample));
  assert.ok(d.nChecklists >= 5);
  assert.ok(d.trips.some((t) => t.region === "Bhutan"));
  assert.ok(!d.trips.some((t) => t.region === "Malaysia")); // single trip below min rows
});
