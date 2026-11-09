# Route cutaway and transition verification

This iteration changes only the existing architectural view. It does not change graph distances, accessibility rules, room IDs, routing, or reports.

## View contract

- Show the whole route selects a readable oblique camera and an explicitly labelled transparent architectural section. The entrance, inter-floor connector and destination remain visible through the translucent floor context. The route itself retains depth testing.
- Normal whole-building and focused-floor views remain available. Manual orbit and pinch limits remain unchanged. The special route view is not a claim of live position tracking or a measured real building.
- Floor visibility animates from the current opacity/offset. Floor materials are isolated and the shadow pass uses the same fade, including interrupted transitions. A floor is removed only after reaching negligible opacity.
- Active location labels maintain a stable screen size. Candidate positions avoid the actual projected path and each other. Canvas labels use sRGB; active labels are not tone mapped. The measured flat background/text contrast is 11.86:1 (#173d3d / #ffffff); antialiased edge pixels are not used for that ratio.
- Corridor boundaries and room skirting follow existing graph-derived geometry. No new decorative assets or generated building geometry were added.

## Verification

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:architecture`, `pnpm test:mobile-3d`, `pnpm test:browser`, and `pnpm exec playwright test --config=tests/route-readability.config.ts`.

The dedicated route suite covers 1366 x 768, 1600 x 1000, 375 x 667 and 390 x 844 in Russian and Kazakh. It checks A=40 m / closed-A B=54 m, projected endpoint/label bounds, sampled path-versus-label intersections, top/front-to-route reset, interruptions and language rebuilds. Screenshots supplement these geometric assertions; bounds alone cannot prove line visibility.

Controlled transition screenshots were taken at 0, 100, 200, 300, 400, 420, 440, 460, 480 and 520 ms. The ground-shadow region excluding the moving route marker contained no changed RGB pixels from 440 to 480 ms, while earlier frames showed gradual fading. These virtual-clock frames check the terminal disappearance, not frame rate.

Separate normal-speed recordings and isolated frame-interval measurements are performed against the production version. Browser emulation is not a physical phone test. Video capture frame rate is not the application's render frame rate. Presentation work remains outside this iteration.

No additional Higgsfield generation or credit spending was performed.
