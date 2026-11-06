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

// Every iOS browser is WebKit, and WebKit silently drops the programmatic
// anchor click Plotly fires after its async SVG→canvas→toDataURL pipeline
// (the click's user activation is gone by then). On iOS we render the PNG
// with Plotly.toImage and let the user long-press the preview to save it.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS 13+

const overlay = document.getElementById("save-overlay");
const overlayImg = document.getElementById("save-img");
document.getElementById("save-close").addEventListener("click", () => { overlay.hidden = true; });
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.hidden = true; });

yearSel.addEventListener("change", render);

// Export renders into an offscreen div at the exact target pixels with
// export-tuned type (see makeFigure) — no fixed-1920 scale trick.
async function renderExport(w) {
  const h = Math.round(w * 9 / 16);
  const f = makeFigure(data, +yearSel.value, { exportSize: { width: w, height: h } });
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px`;
  document.body.appendChild(div);
  try {
    await Plotly.newPlot(div, f.data, f.layout, { width: w, height: h });
    return await Plotly.toImage(div, { format: "png", width: w, height: h });
  } finally {
    Plotly.purge(div);
    div.remove();
  }
}

for (const btn of document.querySelectorAll("#dl-row button")) {
  btn.addEventListener("click", async () => {
    const w = +btn.dataset.w;
    btn.disabled = true;
    try {
      const url = await renderExport(w);
      if (isIOS) {
        overlayImg.src = url;
        overlay.hidden = false;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `ebird-lifelist-${btn.dataset.name}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      errorEl.textContent = `Export failed: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
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
