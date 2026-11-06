// Plotly figure spec for the life-list chart. Pure: returns {data, layout}.

export const BG = "#14171c"; const FG = "#d6d9de", LINE = "#5fb4d9", MEDIA = "#e0a458", TRIP = "#8b93a0";

const fmtMonthYear = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function makeFigure(d, startYear, opts = {}) {
  const ex = opts.exportSize || null; // {width,height}: PNG export rendered at exact pixels
  const k = ex ? ex.height / 1080 : 1; // proportional px so exports match at any resolution
  const s = ex ? 2 : 1; // export type is 2x larger relative to the image
  const start = `${startYear}-01-01`;
  const end = new Date(d.maxDate + 20 * 86400000).toISOString().slice(0, 10);
  const title = `Life list vs documented species — ${d.nChecklists} checklists (${fmtMonthYear(start)} – ${fmtMonthYear(end)})`;

  const shapes = [], annotations = [];
  // Trip labels sit at 45° up-right from the top of their vertical line,
  // anchored at the line (owner call 2026-11-06). Label-on-label overlap in
  // dense clusters is accepted; the top margin grows to keep the title clear.
  const tripFont = 9 * s * k;
  const maxW = d.trips.reduce((m, t) => Math.max(m, t.region.length), 0) * 0.62 * tripFont;
  const maxRise = (maxW + 1.2 * tripFont) * Math.SQRT1_2; // vertical extent of the tallest 45° label
  const maxRun = maxW * Math.SQRT1_2; // horizontal extent of the rightmost 45° label
  d.trips.forEach((t) => {
    const mid = new Date((Date.parse(t.start) + Date.parse(t.end)) / 2).toISOString().slice(0, 10);
    shapes.push({ type: "line", xref: "x", yref: "paper", x0: mid, x1: mid, y0: 0, y1: 1,
      line: { color: TRIP, width: 1 }, opacity: 0.45 });
    annotations.push({ text: t.region, xref: "x", yref: "paper", x: mid,
      y: 1, textangle: -45, xanchor: "left", yanchor: "bottom", showarrow: false,
      // pull the label left so the first char's centre sits on the line
      // (measured: rotated bbox left edge lands ~0.77x the font size right of x)
      xshift: -Math.round(0.77 * tripFont),
      font: { size: tripFont, color: TRIP } });
  });

  const data = [
    { x: d.lifeList.x, y: d.lifeList.x.map(() => 0), type: "scatter", mode: "lines",
      line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
    { x: d.lifeList.x, y: d.lifeList.y, type: "scatter", mode: "lines",
      name: `Life list (${d.nSpecies} species)`,
      line: { color: LINE, width: 2, shape: "hv" },
      fill: "tonexty", fillcolor: "rgb(29,42,50)" },
    { x: d.withMedia.x, y: d.withMedia.y, type: "scatter", mode: "lines",
      name: `With media (${d.nWithMedia} species)`,
      line: { color: MEDIA, width: 2, shape: "hv" } },
  ];

  const layout = {
    paper_bgcolor: BG, plot_bgcolor: BG,
    font: { color: FG, ...(ex && { size: 12 * s * k }) },
    title: { text: title, font: { size: 15 * s * k } },
    // Export: margins only as wide as the text needs; the outer border comes
    // from compositing the figure onto a larger canvas (see main.js).
    // b has headroom so year tick labels can never clip at the canvas edge.
    margin: ex
      ? { t: 45 * k + maxRise, r: 15 * k + maxRun, b: 55 * k, l: 85 * k }
      : { t: 150, r: 20, b: 50, l: 60 },
    xaxis: { range: [start, end], showgrid: false, linecolor: "#3a3f46", dtick: "M12" },
    yaxis: { title: { text: "Species on life list" }, gridcolor: "#242930", zerolinecolor: "#3a3f46", linecolor: "#3a3f46",
      range: [0, Math.ceil((d.nSpecies * 1.12) / 50) * 50] },
    legend: ex
      ? { x: 0.99, y: 0.02, xanchor: "right", yanchor: "bottom", bgcolor: "rgba(0,0,0,0)", traceorder: "normal" }
      : { x: 0.01, y: 0.99, bgcolor: "rgba(0,0,0,0)", traceorder: "normal" },
    hovermode: "x unified",
    shapes, annotations,
  };
  return { data, layout };
}
