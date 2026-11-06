# lifelist

Drag in your [My eBird](https://myebird.org) CSV export (My eBird → Download my data) and get an
interactive life-list chart: cumulative species, species documented with media, and auto-detected
birding trips. Everything runs in your browser — your data is never uploaded.

Live: https://zyf0717.github.io/lifelist · Demo with sample data: add `?demo` to the URL.

## Chart

- **Life list** — cumulative species, each counted at its first-sighting date.
- **With media** — cumulative species that have at least one Macaulay Library item attached,
  counted at the date the media was first uploaded.
- **Trip labels** — checklists outside your home country clustered by ≤7-day gaps; trips with ≥10 rows
  get a marker. Home country is selectable and defaults to your most-visited country. Start year
  defaults to 2023 and is adjustable.

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
