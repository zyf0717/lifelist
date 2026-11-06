import { parseCsv, buildSeries, countryCounts } from "./lifelist.js";
import { makeFigure } from "./chart.js";

const hint = document.getElementById("hint");
const dropzone = document.getElementById("dropzone");
const errorEl = document.getElementById("error");
const yearSel = document.getElementById("start-year");
const yearWrap = document.getElementById("year-wrap");
const homeSel = document.getElementById("home-country");
const homeWrap = document.getElementById("home-wrap");
const dlRow = document.getElementById("dl-row");
let rows = null;
let data = null;

function render() {
  if (!data) return;
  if (typeof Plotly === "undefined") {
    errorEl.textContent = "Chart library failed to load — try a hard reload (Ctrl/Cmd+Shift+R).";
    return;
  }
  try {
    const f = makeFigure(data, +yearSel.value);
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
  const years = [...new Set(rows.map((r) => String(r.Date).slice(0, 4)))].filter((y) => /^\d{4}$/.test(y)).sort();
  yearSel.innerHTML = years.map((y) => `<option>${y}</option>`).join("");
  yearSel.value = years[0];
  yearWrap.style.display = "";
  homeWrap.style.display = "";
  dlRow.style.display = "";
  const counts = countryCounts(rows);
  homeSel.innerHTML = counts
    .map((c) => `<option value="${c.code}">${c.name} (${c.checklists})</option>`)
    .join("");
  homeSel.value = counts.length ? counts[0].code : "SG";
  rebuild();
  hint.style.display = "none";
}

function rebuild() {
  if (!rows) return;
  data = buildSeries(rows, { homeCode: homeSel.value });
  render();
}

const handleFile = (file) => file.text().then(handleText);

yearSel.addEventListener("change", render);
for (const btn of document.querySelectorAll("#dl-row button")) {
  btn.addEventListener("click", () => {
    const w = +btn.dataset.w;
    // Fixed 1920x1080 layout so type stays proportional at every resolution;
    // scale renders the canvas at the exact target pixel size.
    Plotly.downloadAsImage(document.getElementById("chart"), {
      format: "png", filename: `ebird-lifelist-${btn.dataset.name}`,
      width: 1920, height: 1080, scale: w / 1920,
    });
  });
}
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
