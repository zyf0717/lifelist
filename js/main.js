import { parseCsv, buildSeries, countryCounts } from "./lifelist.js";
import { makeFigure } from "./chart.js";

const DEFAULT_START_YEAR = 2023;
const hint = document.getElementById("hint");
const dropzone = document.getElementById("dropzone");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const yearInput = document.getElementById("start-year");
const homeSel = document.getElementById("home-country");
const homeWrap = document.getElementById("home-wrap");
let rows = null;
let data = null;

function render() {
  if (!data) return;
  if (typeof Plotly === "undefined") {
    errorEl.textContent = "Chart library failed to load — try a hard reload (Ctrl/Cmd+Shift+R).";
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
  const parsed = parseCsv(text);
  if (!parsed.length || !("Common Name" in parsed[0]) || !("Date" in parsed[0])) {
    errorEl.textContent = "That doesn't look like a My eBird export (missing Common Name / Date columns).";
    return;
  }
  rows = parsed;
  homeWrap.style.display = "";
  const counts = countryCounts(rows);
  homeSel.innerHTML = counts
    .map((c) => `<option value="${c.code}">${c.name} (${c.checklists})</option>`)
    .join("");
  homeSel.value = counts.length ? counts[0].code : "SG";
  rebuild();
  const minYear = new Date(data.minDate).getUTCFullYear();
  yearInput.min = minYear;
  yearInput.value = Math.max(DEFAULT_START_YEAR, minYear);
  hint.style.display = "none";
  render();
}

function rebuild() {
  if (!rows) return;
  data = buildSeries(rows, { homeCode: homeSel.value });
  statusEl.textContent = `${data.nSpecies} species · ${data.nChecklists} checklists`;
  render();
}

const handleFile = (file) => file.text().then(handleText);

yearInput.addEventListener("input", render);
homeSel.addEventListener("change", rebuild);
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
