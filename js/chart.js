// Plotly figure spec for the life-list chart. Pure: returns {data, layout}.

export const BG = "#14171c"; const FG = "#d6d9de", LINE = "#5fb4d9", MEDIA = "#e0a458", TRIP = "#8b93a0";

const fmtMonthYear = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function makeFigure(d, startYear, opts = {}) {
  const ex = opts.exportSize || null; // {width,height}: PNG export rendered at exact pixels
  const k = ex ? ex.height / 1080 : 1; // proportional px so exports match at any resolution
  const s = ex ? 1.5 : 1; // export type is 1.5x larger relative to the image
  const start = `${startYear}-01-01`;
  const end = new Date(d.maxDate + 20 * 86400000).toISOString().slice(0, 10);
  const title = `Life list vs taxa with media — ${d.nChecklists} checklists (${fmtMonthYear(start)} – ${fmtMonthYear(end)})`;

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

  // Preserve the cumulative baseline when the start year skips early
  // sightings: prepend a synthetic step point at the start date with y equal
  // to the number of taxa first recorded before it, then keep points on or
  // after it. buildSeries() totals are untouched; shape "hv" renders the step.
  const display = (series) => {
    const before = series.x.filter((x) => x < start).length;
    const x = [], y = [];
    if (before > 0) { x.push(start); y.push(before); }
    series.x.forEach((dt, i) => { if (dt >= start) { x.push(dt); y.push(series.y[i]); } });
    return { x, y };
  };
  const life = display(d.lifeList);
  const media = display(d.withMedia);

  const data = [
    { x: life.x, y: life.x.map(() => 0), type: "scatter", mode: "lines",
      line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
    { x: life.x, y: life.y, type: "scatter", mode: "lines",
      name: `Life list (${d.nTaxa} taxa)`,
      line: { color: LINE, width: 2, shape: "hv" },
      fill: "tonexty", fillcolor: "rgb(29,42,50)" },
    { x: media.x, y: media.y, type: "scatter", mode: "lines",
      name: `Taxa with media (${d.nWithMedia})`,
      line: { color: MEDIA, width: 2, shape: "hv" } },
  ];

  // Export-only 1.25x y-title breathing room (owner call 2026-11-06): Plotly
  // auto-spaces the title ~labelW+27px off the axis; title.standoff adds to
  // the label's left edge, so gap ≈ standoff + labelW + 4. Size it to 1.25x
  // and grow l so the title never clamps against the paper edge.
  const yLabelW = String(Math.ceil((d.nTaxa * 1.12) / 50) * 50).length * 9.5 * k;
  const yStandoff = ex ? Math.round(0.25 * yLabelW + 30) : 0;

  const layout = {
    paper_bgcolor: BG, plot_bgcolor: BG,
    font: { color: FG, ...(ex && { size: 12 * s * k }) },
    title: { text: title, font: { size: 15 * s * k } },
    // Export: margins only as wide as the text needs; the outer border comes
    // from compositing the figure onto a larger canvas (see main.js).
    // b has headroom so year tick labels can never clip at the canvas edge.
    // Export-only spacing (owner call 2026-11-06): Plotly centers the title
    // in the top margin (gap = t/2 - 4.5 measured), so t = 1.5*t0 - 4.5 puts
    // the title-to-plot gap at 1.5x its natural 45k+maxRise value; l widens
    // the title-to-axis gap (the rotated title stays pinned near the paper
    // edge, so the axis moves away from it). On-screen layout is unchanged.
    margin: ex
      ? { t: 1.5 * (45 * k + maxRise) - 4.5, r: 15 * k + maxRun, b: 55 * k, l: yStandoff + Math.round(yLabelW + 30 * k) }
      : { t: 150, r: 20, b: 50, l: 60 },
    // Year markers: outside ticks at each Jan 1 (dtick M12), short notches on
    // the axis line rather than full vertical gridlines. showline is required
    // for linecolor/ticks to render at all.
    xaxis: { range: [start, end], showgrid: false, showline: true, linecolor: "#3a3f46",
      ticks: "outside", ticklen: 6 * k, tickwidth: ex ? 2 * k : 1, tickcolor: "#3a3f46", dtick: "M12" },
    yaxis: { title: { text: "Recorded taxa on life list", ...(ex && { standoff: yStandoff }) }, gridcolor: "#242930", zerolinecolor: "#3a3f46", linecolor: "#3a3f46",
      range: [0, Math.ceil((d.nTaxa * 1.12) / 50) * 50] },
    legend: { x: 0.01, y: 0.99, bgcolor: "rgba(0,0,0,0)", traceorder: "normal" },
    hovermode: "x unified",
    shapes, annotations,
  };
  return { data, layout };
}
