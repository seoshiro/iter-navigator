# Presentation PDF and poster verification

Verified 2026-11-09T17:53:09.785399+00:00 from the final local working tree on `feat/presentation-motion-20261109` (HEAD before release: `fe38525fcf2cb30b2a0816e62efe31ecae1a141a`).

## Delivered project assets

- `public/presentation/ITER-Presentation-RU.pdf`
- `public/presentation/ITER-Presentation-KK.pdf`
- Six optimized 1920 x 1080 WebP posters under `public/presentation/media/`: `building`, `route-204`, `detour-204`, each with its `-kk` equivalent.
- The existing files were updated, not replaced by a separate deck or presentation concept.

| PDF | Bytes | Pages | Clickable links | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| RU | 3,873,535 | 10 | 15 | `e3c0c9bc18174fa2807da9801a1578f641dc402a2dae04fc607d1178a268541a` |
| KK | 3,880,416 | 10 | 15 | `e769b736c20304f50a7f78519f021b3d122f4ee3166749831ea0e8b5139a8ba2` |

## Checks passed

- Both PDFs contain exactly ten 16:9 pages, 1152 x 648 points (16 x 9 inches).
- Selectable Russian and Kazakh text; all used fonts embedded; no replacement glyphs or text spans outside the page.
- Kazakh-specific characters used in the slides were verified in extracted text.
- All twenty pages rasterized and both contact sheets visually reviewed. Corrected pages 3 and 5 inspected at full resolution, as were model crops and the Kazakh system diagram.
- No blank slides or missing model images. All three floors, the full A route and the full B detour remain within the poster frame with visible margins.
- Fifteen clickable links per PDF. Both distinct public targets returned HTTP 200.
- Final-page QR codes in both PDF rasterizations decode to `https://iter-navigator.vercel.app/`.
- Print DOM reports zero clipped elements, zero image failures, and zero page errors.
- The project public-directory PDFs are byte-for-byte identical to the validated local exports. Production hashes are checked after deployment.

## Capture provenance

Posters are real renders from the application's settled Three.js director, not generated artwork. The route uses lift A (40 m); the detour uses lift B (54 m). Capture waits for `data-ready=true`, `data-settled=true`, and for the detour result `data-distance=54`.

The director capture API renders 1920 x 1080 with labels, accents, and routes retained (`clean:false`). Intro/building pose is unchanged. Route/detour capture temporarily uses zoom 0.76 rather than the animated scene's 0.82, keeping spread, cutaway, target, labels, and route progress unchanged. The original numeric pose is restored in `finally`, so live behavior is not modified. Both original and captured poses are recorded in local evidence.

Original poster files remain recoverable in git and were also backed up in `.local/presentation-pdf/v1-poster-backup/`. No unrelated media was edited and no new generation or spending was used.

## Print-only corrections

The final rules in `src/presentation/choreography.css` are scoped exclusively to `.pres-print`. They remove scrolling/clipping and the interactive disclosure summary from the static route section, and separate the 54 m figure from its 22 px lift caption. Live presentation selectors were not changed by this export task.

## Limits

PDFs are static, showing meaningful final states rather than animation or video. This verification covers final local files. Production file hashes are verified as part of release checks.
