# Presentation PDF verification: continuity revision

Verified locally on 2026-11-09 at 21:49 UTC. Publication verification is recorded
in `presentation-continuity-verification.md` after deployment.

## Current files

The existing files are updated in place:

| File | Bytes | Pages | Links | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `public/presentation/ITER-Presentation-RU.pdf` | 6,431,484 | 10 | 15 | `ee0a228a6f63b3b174ebb3d55bd7ed3c1f0b4a0df0e4f1b650ba077af6949457` |
| `public/presentation/ITER-Presentation-KK.pdf` | 6,436,261 | 10 | 15 | `c7d861f571fae355c6da116ff65bb237e79a0c5613e931c614f760dda5cf7cac` |

## Changes to static scenes

- Page 1 uses a separate `intro-purpose` capture of the real entrance, goal and
  solver-route prefix. The clean `building` poster used by the final scene remains
  unchanged.
- Page 6 uses the actual 205 opening, now locally highlighted. Its unknown width
  and surface remain explicitly unknown; rendered geometry is not a measurement.
- Page 7 retains the actual shared route interface and manual step guidance.
- Page 8 shows the actual rejected `narrow-204` passage before the allowed graph
  and 40 m route. The reason is computed from the model: 72 cm is below 90 cm.
  The text explicitly distinguishes it from the unknown door 205.
- The final `graph-filtered-route` capture matched the preceding version byte for
  byte. It was not needlessly changed.

The new genuine model captures are `intro-purpose`, `door205-focus` and
`graph-rejected`, with Russian and Kazakh variants. No generated image or new
credit expenditure was used. These also support relevant static fallbacks.

## Verification performed

- Exactly 10 pages in each document, 1152 x 648 points, 16:9.
- Searchable Russian and Kazakh text, embedded fonts, Kazakh-specific codepoints.
- No replacement glyphs, missing images or text spans beyond the pages detected.
- All 20 pages rasterized and visually reviewed in contact sheets. Changed pages
  1, 6 and 8 were additionally reviewed separately.
- 15 clickable links per PDF. Both distinct public targets returned HTTP 200.
- Both final QR codes decode to the published navigator address.
- No page errors or failed requests during browser export.
- Browser export instances closed before independent recording work resumed.

The PDF preserves meaningful static states; it does not substitute for interactive
or motion verification. No physical-phone or rendering-FPS claim follows from it.

## Preservation and reproduction

Previous PDFs, posters and print sources are preserved privately in
`.local/presentation-pdf/continuity-revision/previous-approved/` and git history.
No unrelated media was overwritten.

Private reproducibility scripts: `capture_continuity_assets.mjs`,
`convert_continuity_assets.py`, `export.mjs`, and `verify.py` under
`.local/presentation-pdf/`. The export directory is
`.local/presentation-pdf/continuity-revision/`, containing capture evidence,
validation JSON, both candidates, contact sheets and all full-page rasters.

Canonical PDF URLs:
- https://iter-navigator.vercel.app/presentation/ITER-Presentation-RU.pdf
- https://iter-navigator.vercel.app/presentation/ITER-Presentation-KK.pdf