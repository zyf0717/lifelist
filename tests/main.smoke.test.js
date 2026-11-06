// Smoke test for the browser glue (main.js) with a minimal DOM stub:
// simulates a CSV drop and asserts Plotly receives the right figure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handlers = {};
const els = {};
const el = (id) => (els[id] ??= {
  id, style: {}, textContent: "", value: "2023", min: "",
  addEventListener() {}, classList: { toggle() {} },
});
globalThis.document = { getElementById: el, querySelectorAll: () => [] };
globalThis.window = { addEventListener: (t, fn) => { handlers[t] = fn; } };
globalThis.location = { search: "" };
let rendered = null;
globalThis.Plotly = { react: (_id, data, layout) => { rendered = { data, layout }; } };

await import("../js/main.js");

test("dropping a CSV renders two traces plus trip annotations", async () => {
  const sample = readFileSync(new URL("../sample.csv", import.meta.url), "utf8");
  handlers.drop({
    preventDefault() {},
    dataTransfer: { files: [{ text: async () => sample }] },
  });
  await new Promise((r) => setImmediate(r));
  assert.ok(rendered, "Plotly.react was not called");
  assert.equal(els["home-country"].value, "SG"); // sample.csv is mostly Singapore checklists
  assert.equal(els["year-wrap"].style.display, ""); // start-year appears after parse
  assert.equal(els["dl-row"].style.display, ""); // save buttons appear after parse
  assert.match(els["start-year"].innerHTML, /<option>2023<\/option>/);
  assert.equal(els["start-year"].value, "2023"); // defaults to first year in the data
  assert.equal(rendered.data.length, 3);
  assert.equal(rendered.data[1].fill, "tonexty");
  assert.match(rendered.data[1].name, /^Life list \(\d+ taxa\)$/);
  assert.match(rendered.data[2].name, /^With media \(\d+ taxa\)$/);
  assert.ok(rendered.layout.annotations.some((a) => a.text === "Bhutan"));
  assert.match(rendered.layout.title.text, /checklists/);
});

test("a CSV with no valid observation dates shows a message instead of an empty chart", async () => {
  rendered = null;
  handlers.drop({
    preventDefault() {},
    dataTransfer: { files: [{ text: async () => 'Submission ID,Common Name,Scientific Name,Date,State/Province,ML Catalog Numbers\ns1,X,Turdus migratorius,nope,SG-,\n' }] },
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(rendered, null, "Plotly.react must not be called with no valid observations");
  assert.match(els.error.textContent, /No dated observations/);
});

test("a ZIP file gets a helpful error instead of silence", async () => {
  handlers.drop({
    preventDefault() {},
    dataTransfer: { files: [{ text: async () => "PK\u0003\u0004garbage" }] },
  });
  await new Promise((r) => setImmediate(r));
  assert.match(els.error.textContent, /ZIP/);
});
