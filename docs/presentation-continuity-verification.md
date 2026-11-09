# Presentation continuity verification

This revision responds to the review of the presentation published at `0b7d0b5`.
It preserves the navigator and the existing generated media. No new generation
or credit expenditure was needed.

## Changes

- Preserve the live host height, position and camera pose before retargeting a scene.
  Animate explicit numeric host dimensions, including the desktop endpoint.
- Keep selected-button foreground and background in the same contrast state.
- Reveal each incoming information block as the building clears its space, while
  model motion continues. Do not hide the whole copy column on internal actions.
- Highlight the actual opening of room 205, with a local frame and leader.
  Its unknown width remains unknown.
- During filtering, highlight the separate known narrow passage to room 204:
  0.72 m is below the requested 0.90 m. Continue with the allowed graph and path.
- After the existing introductory film, identify the real entrance, destination
  and first edges of the route in the controlled Three.js scene.
- Cache floor-local bounds once; animation uses only eight projected corners per
  visible floor, not a per-frame geometry traversal.

## Local verification

One Chrome worker was used. Browser checks and media export were not run in
parallel. The clean matrix passed 18/18 cases:

- 375 x 667, 390 x 844, 1366 x 768 and 1536 x 864, in Russian and Kazakh.
- 96 forward, reverse and mid-transition retargets. First-render projected size
  and host dimensions preserve their pre-event values; endpoint scale assertions pass.
- Eight contrast scenarios, including rapid condition changes. The lowest sampled
  alpha-composited contrast was 5.94:1.
- Route-interface information becomes visible 740-872 ms after forward input;
  pipeline blocks appear at 335-423 ms; reverse route-interface entrance occurs at
  654-806 ms. These overlap the 1.05-second placement animation.
- Reduced motion, fresh entry, skip, large text, room 205 strict/allow-unknown modes
  and the separate known narrow-passage explanation.
- Read-only navigator smoke: 40 m via lift A, 54 m after closing A, and explained
  absence of a route after closing both lifts. No backend writes.

TypeScript, ESLint, the 194 unit tests and the production build passed during
candidate verification. Final publication and exported-material checks are recorded
below when completed.

## Visual verification

Private production-build recordings were inspected at consecutive 40 ms frames
around scene 6 to 7 and a rapid retarget, plus contact sheets of forward and reverse
motion. The earlier first-frame and endpoint size jumps were not reproduced in
those inspected frames. Information no longer makes an opaque cut across the
moving building.

Instrumentation initially exposed two issues that were corrected: desktop
`height: auto` snapped at tween completion, and overly broad collision gating hid
condition controls. Trace-generated HTML also caused development-server reloads;
private report directories are now ignored by the Vite watcher. That development
artifact is not reported as a production frame-rate defect.

## Scope and limitations

The mobile checks are browser viewport/touch emulation on Windows, not a physical
phone. No Safari or display/GPU FPS claim is made. A 25 fps recording describes
the video encoding, not the rendering performance of the site. The introductory
asset uses the application's playback setting; the evidence recordings are normal
speed and uncut.

The fictional-building notice remains. Routing remains local and independent of
the server journal. The previously observed journal HTTP 503 is a separate issue
and is not claimed fixed by this presentation revision.

## Publication and delivery

Pending final exports, published-build verification and the new continuous
desktop/mobile evidence recordings.