# lifelist

Drag in your [My eBird](https://myebird.org) CSV export (My eBird → Download my data) and get an
interactive life-list chart: cumulative recorded taxa, taxa documented with media, and auto-detected
birding trips. Everything runs in your browser — your data is never uploaded.

Live: https://zyf0717.github.io/lifelist · Demo with sample data: add `?demo` to the URL.

## Chart

- **Life list** — cumulative recorded taxa, each counted at its first-sighting date. Taxa are
  deduplicated by normalized Scientific Name (fallback: Common Name). This is a name-based tally,
  **not** eBird's official life-list total: subspecies, hybrids, and unidentified taxa are counted
  by name, not by eBird's taxonomy and countability rules.
- **Taxa with media** — cumulative taxa that have at least one Macaulay Library item attached,
  counted at the **observation date** of the earliest sighting that carries media. The CSV contains
  no upload timestamps, so media upload dates cannot be inferred from it; an upload-date timeline
  would need separate Macaulay Library metadata.
- **Trip labels** — checklists outside your home country clustered by ≤7-day gaps; trips with ≥10 rows
  get a marker. Default country is selectable (from the countries in your file) and defaults to your
  most-visited country. Start year is a dropdown of the years present in the data, defaulting to the
  first year. Both selectors appear only after the file parses.

## Development

Static site, no build step. `js/lifelist.js` holds the pure data logic (CSV parsing, series
building, trip clustering) and is tested with node's built-in runner:

```sh
node --test tests/
python3 -m http.server 8000   # then open http://localhost:8000/?demo
```

Deploys to GitHub Pages via `.github/workflows/pages.yml` (tests gate the deploy).

## Privacy note

The chart is fine to publish; the raw CSV is not — it contains exact coordinates for sensitive
species. This repo contains only synthetic sample data.
