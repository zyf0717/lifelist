// Smoke test for the browser glue (main.js) with a minimal DOM stub:
// simulates a CSV drop and asserts Plotly receives the right figure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handlers = {};
const els = {};
const el = (id) => (els[id] ??= {
  id, style: {}, textContent: "", value: "",
  addEventListener() {}, classList: { toggle() {} },
  replaceChildren(...options) { this.options = options; this.value = options[0]?.value ?? ""; },
});
globalThis.Option = class {
  constructor(text, value = text) { this.text = text; this.value = value; }
};
globalThis.document = { getElementById: el, querySelectorAll: () => [] };
globalThis.window = { addEventListener: (t, fn) => { handlers[t] = fn; } };
globalThis.location = { search: "" };
let rendered = null;
globalThis.Plotly = { react: (_id, data, layout) => { rendered = { data, layout }; } };

await import("../js/main.js");

async function dropCsv(text) {
  handlers.drop({
    preventDefault() {},
    dataTransfer: { files: [{ text: async () => text }] },
  });
  await new Promise((r) => setImmediate(r));
}

test("dropping a CSV renders two traces plus trip annotations", async () => {
  await dropCsv(readFileSync(new URL("../sample.csv", import.meta.url), "utf8"));
  assert.ok(rendered, "Plotly.react was not called");
  assert.equal(els["home-country"].value, "SG"); // sample.csv is mostly Singapore checklists
  assert.equal(els["year-wrap"].style.display, ""); // start-year appears after parse
  assert.equal(els["dl-row"].style.display, ""); // save buttons appear after parse
  assert.deepEqual(els["start-year"].options.map((option) => option.value), ["2023", "2024"]);
  assert.equal(els["start-year"].value, "2023"); // defaults to first year in the data
  assert.equal(rendered.data.length, 3);
  assert.equal(rendered.data[1].fill, "tonexty");
  assert.match(rendered.data[1].name, /^Life list \(\d+ species\)$/);
  assert.match(rendered.data[2].name, /^Species with media \(\d+\)$/);
  assert.ok(rendered.layout.annotations.some((a) => a.text === "Bhutan"));
  assert.match(rendered.layout.title.text, /checklists/);
});

test("a CSV with no valid observation dates shows a message instead of an empty chart", async () => {
  rendered = null;
  await dropCsv("Submission ID,Common Name,Date\ns1,X,nope\n");
  assert.equal(rendered, null, "Plotly.react must not be called with no valid observations");
  assert.match(els.error.textContent, /No dated observations/);
});

test("a CSV without Submission ID is rejected", async () => {
  rendered = null;
  await dropCsv("Common Name,Date\nX,2024-01-01\n");
  assert.equal(rendered, null);
  assert.match(els.error.textContent, /missing columns: Submission ID/);
});

test("a ZIP file gets a helpful error instead of silence", async () => {
  await dropCsv("PK\u0003\u0004garbage");
  assert.match(els.error.textContent, /ZIP/);
});
