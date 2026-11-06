// Smoke test for the browser glue (main.js) with a minimal DOM stub:
// simulates a CSV drop and asserts Plotly receives the right figure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handlers = {};
const el = (id) => ({
  id, style: {}, textContent: "", value: "2023", min: "",
  addEventListener() {}, classList: { toggle() {} },
});
globalThis.document = { getElementById: el };
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
  assert.equal(rendered.data.length, 2);
  assert.match(rendered.data[0].name, /^Life list \(\d+ species\)$/);
  assert.match(rendered.data[1].name, /^With media \(\d+ species\)$/);
  assert.ok(rendered.layout.annotations.some((a) => a.text === "Bhutan"));
  assert.match(rendered.layout.title.text, /checklists/);
});
