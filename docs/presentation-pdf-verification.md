# Presentation PDF verification: actual model revision

Verified 2026-11-09T19:47:59.918229+00:00 from the final local presentation working tree. Production deployment and existing Space file replacement remain the parent's responsibility.

## Delivered files

The two existing files were updated in place, not replaced by a separate presentation:

- `public/presentation/ITER-Presentation-RU.pdf`
- `public/presentation/ITER-Presentation-KK.pdf`

| PDF | Bytes | Pages | Clickable links | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| RU | 5,800,451 | 10 | 15 | `5260e1ace282649cb4c5ea2889337f4b23dcf9181f55b70d7e6c2bade8faa4da` |
| KK | 5,805,568 | 10 | 15 | `e557523e00a11829fb97093001ab71d59dcace6dcfe0fe3ea90e12a2ba1d67d2` |

## Pages 6 to 8 now use the actual product

- Page 6: the real door205 opening in the source model, with strict and unknown-permitted policy results. Unknown width/surface remain explicitly unknown. Its room-side yaw135 / tilt25 pose matches the accepted live scene; source geometry was not moved or replaced.
- Page 7: the shared `RouteInterface`, containing the actual `FloorPlan` and compact `RouteGuidance`, showing the third route step at readable size. Manual step navigation is stated, without implying live position tracking.
- Page 8: real unfiltered graph versus requirement-filtered graph and the 40 m lift-A route. The criteria and algorithm remain searchable text.
- The new images also preserve the uncertainty/system scenes' meaning in the existing static WebGL fallback.

New genuine captures: `door205-focus`, `graph-source`, `graph-filtered-route`, each with an RU and `-kk` WebP. All six are 1920 x 1080 exports from the settled application's director, `clean:false`. Graph capture uses temporary zoom0.76 for full-building margins; the original pose is restored in `finally`. Door205 uses the shared live pose without a static-only orientation. Capture JSON records original and exported poses. No generator or spending was used.

## Verified

- Exactly 10 pages per PDF, 1152 x 648 points, 16:9.
- Russian and Kazakh text is selectable; all fonts are embedded. No replacement glyphs or text spans beyond the page.
- Kazakh-specific codepoints were checked in extracted text.
- All 20 pages rasterized and visually reviewed via contact sheets; revised pages 6, 7 and 8 also inspected at full resolution in both languages.
- No blank scenes, missing images or clipped print content. The original building/route/detour posters retain their prior complete-geometry framing.
- 15 clickable links per PDF; all distinct public targets returned HTTP200. Both final QR codes decode to `https://iter-navigator.vercel.app/`.
- No browser page errors or request failures during print export.
- Public PDFs are byte-for-byte copies of the verified candidates.

## Scope and preservation

`PrintScenes.tsx` and `printRevision.css` are reached only by print scenes6–8; live composition is not replaced. `Presentation.tsx` adds only the print branch. The small `posterForScene` mapping adds current uncertainty/system fallback images. The live scene5 pose change was made separately by the UI worker and accepted through focused QA.

Previous approved PDFs and their evidence were preserved at `.local/presentation-pdf/previous-approved/20261109T190809Z/`. Original v1 posters remain in git and `.local/presentation-pdf/v1-poster-backup/`. No unrelated media was overwritten.

## Reproduction

Use `.local/presentation-pdf/capture_revision_assets.mjs` (optional `--door-only`), `convert_revision_assets.py`, `export.mjs`, `verify.py`, and `finalize_revision.py`. Set `PRESENTATION_EXPORT_DIR` to `.local/presentation-pdf/composition-revision-candidate` for export/verification. Default source is `http://127.0.0.1:5380`.

Candidate evidence includes `revision-capture-evidence.json`, `revision-poster-evidence.json`, `export-evidence.json`, `validation.json`, `visual-review.json`, `final-verification.json`, two contact sheets and all 20 full-page rasters. Capture/export browser instances are closed. No duplicate screenshot matrix and no Space upload were performed.

The PDF intentionally preserves meaningful static states, not animation or interactivity. Final production hashes must still be checked after deployment.
