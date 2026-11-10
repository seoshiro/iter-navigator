# English navigator release — 2026-11-10

## Scope

The main navigator now offers Қазақша / Русский / English, with kk-KZ, ru-RU and en-US document locales. English covers settings, room search, the 2D/3D controls and labels, route summaries and evidence, manual steps, warnings, errors, QR/share tools, accessibility text and the obstacle journal. User-written journal contents are preserved verbatim, not machine-translated.

The graph, stable IDs, route filtering, costs, backend schema and deployment architecture are unchanged. English room and passage names are keyed by existing IDs. Search accepts names in all three languages regardless of the display language, with common English synonyms. The separate interactive product presentation still supports RU/KK; it uses independent language storage and cannot overwrite the navigator’s English preference.

## Executed local checks

- TypeScript, full ESLint and Vite production build passed.
- Vitest: **220 tests in 21 files passed**. This includes 26 new English tests covering dictionary coverage, directions, rendered UI, locale storage and speech behavior.
- Playwright: **12 serial English cases passed**, using installed Chrome on Windows, desktop 1366 × 768 and mobile/touch emulation 390 × 844. One journal test selector was corrected before the full successful rerun; no production records were submitted.
- RU → KK → EN preserved start, destination, numeric requirements, selected alternative, route IDs, current step, theme, larger text and reduced-motion preference. Reload preserved the English choice and saved route settings.
- Library / библиотека / кітапхана resolve to the same room. Room numbers and current English labels are covered by unit/component tests.
- Control routes: 40 m through elevator A; 54 m through B when A is closed; no matching route with both closed and stairs excluded; room 205 rejected in strict mode and 46 m with an explicit unknown-data opt-in; same start and destination gives 0 m.
- Share links, all three QR start links, invalid URL parameters and invalid numeric requirements were exercised in English.
- A real WebGL render succeeded. Simulated context loss and initial WebGL unavailability retained the same route in usable 2D.
- Mobile manual steps, keyboard focus, reduced motion and a genuine Chrome 200% page zoom were exercised. The browser zoom check uses an isolated profile and does not change the user’s browser settings. A subsequent focused rerun passed after strengthening post-walk bounds assertions and using a composited viewport capture to avoid Playwright’s full-page zoom clipping artifact.
- Journal failure/retry was tested against mocked API responses only. The pending payload and UUID survived reload and language changes; reconnect caused no automatic submission; repeated retry preserved identical request bytes and produced one record in the fixture.

Run the English browser suite with `pnpm exec playwright test --config=tests/english-interface.config.ts`. It runs serially on port 5276 and blocks external calls. Private screenshots and raw test results are not committed.

## Speech: what is and is not verified

Speech uses only local voices whose base language matches the selected interface language. English utterances use en-US; an explicitly selected local English dialect is accepted. Language changes cancel stale queued utterances. Rate and voice preferences are separate for RU, KK and EN. Enabling reading does not start it automatically, and reading is off after reload.

Instrumented unit/browser checks verified local English selection, exclusion of remote and RU/KK voices, cancellation, late voices, stale callbacks, unavailable-language explanations and independent preferences. The actual test machine exposed only the local Russian Microsoft Irina and Pavel voices. **No local English or Kazakh voice was available, and audible English output was not verified.** The interface states that limitation next to the controls rather than substituting Russian or using paid TTS.

## Boundaries

The mobile checks are Chrome emulation, not a physical phone or Safari. No human screen-reader listening session or native-speaker review is claimed. The journal’s live backend availability is independent of these mocked reliability checks; local routing does not depend on it. The building and its measurements remain fictional.

No paid generation, paid tool, new subscription or financial expenditure was used. The existing lazy Three.js chunk still triggers Vite’s advisory 500 kB chunk-size warning; it is not a build failure.

Rollback baseline: `05319bed4ee847c77cc83bf99a69119458e05513`, preserved as `snapshot/pre-english-05319be` before this release. Unrelated local media/documentation work was excluded from the release.
