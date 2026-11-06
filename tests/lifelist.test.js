import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, buildSeries, regionOf } from "../js/lifelist.js";

const sample = readFileSync(fileURLToPath(new URL("../sample.csv", import.meta.url)), "utf8");

test("parseCsv handles quoted commas, escaped quotes, CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n1,2\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].a, "x, y");
  assert.equal(rows[0].b, 'he said "hi"');
  assert.equal(rows[1].b, "2");
});

test("buildSeries dedupes species and counts cumulatively", () => {
  const d = buildSeries(parseCsv(sample));
  assert.ok(d.nSpecies > 0);
  assert.deepEqual(d.lifeList.y, [...Array(d.nSpecies).keys()].map((i) => i + 1));
  assert.ok(d.nWithMedia <= d.nSpecies);
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
  assert.equal(buildSeries(rows).nSpecies, 1);
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

test("sample fixture produces a chartable dataset", () => {
  const d = buildSeries(parseCsv(sample));
  assert.ok(d.nChecklists >= 5);
  assert.ok(d.trips.some((t) => t.region === "Bhutan"));
  assert.ok(!d.trips.some((t) => t.region === "Malaysia")); // single trip below min rows
});
