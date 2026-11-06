import { parseCsv, buildSeries } from "./lifelist.js";
import { makeFigure } from "./chart.js";

const DEFAULT_START_YEAR = 2023;
const hint = document.getElementById("hint");
const dropzone = document.getElementById("dropzone");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const yearInput = document.getElementById("start-year");
let data = null;

function render() {
  if (!data) return;
  if (typeof Plotly === "undefined") {
    errorEl.textContent = "Plotly failed to load (ad blocker?); it is now served from this site, try a hard reload (Ctrl/Cmd+Shift+R).";
    return;
  }
  try {
    const f = makeFigure(data, +yearInput.value);
    Plotly.react("chart", f.data, f.layout, { responsive: true });
    errorEl.textContent = "";
  } catch (e) {
    errorEl.textContent = `Render error: ${e.message}`;
  }
}

function handleText(text) {
  errorEl.textContent = "";
  if (text.startsWith("PK")) {
    errorEl.textContent = "That's a ZIP archive — My eBird zips the download. Unzip it and drop the CSV inside.";
    return;
  }
  const rows = parseCsv(text);
  if (!rows.length || !("Common Name" in rows[0]) || !("Date" in rows[0])) {
    errorEl.textContent = "That doesn't look like a My eBird export (missing Common Name / Date columns).";
    return;
  }
  data = buildSeries(rows);
  const minYear = new Date(data.minDate).getUTCFullYear();
  yearInput.min = minYear;
  yearInput.value = Math.max(DEFAULT_START_YEAR, minYear);
  hint.style.display = "none";
  statusEl.textContent = `${data.nSpecies} species · ${data.nChecklists} checklists`;
  render();
}

const handleFile = (file) => file.text().then(handleText);

yearInput.addEventListener("input", render);
document.getElementById("file").addEventListener("change", (e) => e.target.files[0] && handleFile(e.target.files[0]));

const showDrop = (on) => dropzone.classList.toggle("over", on);
window.addEventListener("dragover", (e) => { e.preventDefault(); showDrop(true); });
window.addEventListener("dragleave", (e) => { if (e.relatedTarget === null) showDrop(false); });
window.addEventListener("drop", (e) => {
  e.preventDefault(); showDrop(false);
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFile(f);
});

if (new URLSearchParams(location.search).has("demo")) {
  fetch("sample.csv").then((r) => r.text()).then(handleText);
}
