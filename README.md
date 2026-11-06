# lifelist

Drag in your [My eBird](https://myebird.org) CSV export (My eBird → Download my data) and get an
interactive life-list chart: cumulative recorded species, species documented with media, and auto-detected
birding trips. Everything runs in your browser — your data is never uploaded.

Live: https://zyf0717.github.io/lifelist · Demo with sample data: add `?demo` to the URL.

## Chart

- **Life list** — cumulative recorded species, each counted at its first-sighting date. Species are
  deduplicated by the Scientific Name binomial (fallback: Common Name); subspecies roll up into their
  species, and unidentified records (`sp.`, species groups), hybrids, and domestic/feral forms are
  excluded. This lands close to eBird's official life-list total but is still a name-based tally,
  **not** eBird's taxonomy and countability rules.
- **Species with media** — cumulative species that have at least one Macaulay Library item attached,
  counted at the **observation date** of the earliest sighting that carries media. The CSV contains
  no upload timestamps, so media upload dates cannot be inferred from it; an upload-date timeline
  would need separate Macaulay Library metadata.
- **Trip labels** — checklists outside your home country clustered by ≤7-day gaps; trips with ≥10 rows
  get a marker. Default country is inferred from the file: the country with the highest share of
  checklists wins; ties break by most recent observation, then total rows, then name. Start year is
  a dropdown of the years present in the data, defaulting to the first year. Both selectors appear
  only after the file parses.

## Development

Static site, no build step. `js/lifelist.js` holds the pure data logic (CSV parsing, series
building, trip clustering) and is tested with node's built-in runner:

```sh
node --test                      # unit + smoke tests (run from the repo root)
python3 -m http.server 8000   # then open http://localhost:8000/?demo
```

Deploys to GitHub Pages via `.github/workflows/pages.yml` (tests gate the deploy).

## Privacy note

The chart is fine to publish; the raw CSV is not — it contains exact coordinates for sensitive
species. This repo contains only synthetic sample data.
