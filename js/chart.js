// Plotly figure spec for the life-list chart. Pure: returns {data, layout}.

const BG = "#14171c", FG = "#d6d9de", LINE = "#5fb4d9", MEDIA = "#e0a458", TRIP = "#8b93a0";

const fmtMonthYear = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function makeFigure(d, startYear) {
  const start = `${startYear}-01-01`;
  const end = new Date(d.maxDate + 20 * 86400000).toISOString().slice(0, 10);
  const title = `Life list vs documented species — ${d.nChecklists} checklists (${fmtMonthYear(start)} – ${fmtMonthYear(end)})`;

  const shapes = [], annotations = [];
  d.trips.forEach((t) => {
    const mid = new Date((Date.parse(t.start) + Date.parse(t.end)) / 2).toISOString().slice(0, 10);
    shapes.push({ type: "line", xref: "x", yref: "paper", x0: mid, x1: mid, y0: 0, y1: 1,
      line: { color: TRIP, width: 1 }, opacity: 0.45 });
    annotations.push({ text: t.region, xref: "x", yref: "paper", x: mid, y: 1.10,
      textangle: -90, xanchor: "center", yanchor: "top", showarrow: false,
      font: { size: 9, color: TRIP } });
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
    paper_bgcolor: BG, plot_bgcolor: BG, font: { color: FG },
    title: { text: title, font: { size: 15 } },
    margin: { t: 150, r: 20, b: 50, l: 60 },
    xaxis: { range: [start, end], gridcolor: "#3a3f46", linecolor: "#3a3f46", dtick: "M12" },
    yaxis: { title: { text: "Species on life list" }, gridcolor: "#242930", zerolinecolor: "#3a3f46", linecolor: "#3a3f46",
      range: [0, Math.ceil((d.nSpecies * 1.12) / 50) * 50] },
    legend: { x: 0.01, y: 0.99, bgcolor: "rgba(0,0,0,0)", traceorder: "normal" },
    hovermode: "x unified",
    shapes, annotations,
  };
  return { data, layout };
}
