# Adaptation notice

The fixed outro adapts three motion grammars from video-shotcraft at immutable
commit `0d6f0b57f0d4d6700761644c07f7ef03c3e50234`:

- `outro / logo-shrink-wordmark-lockup`: full-frame brand mark shrink, braking
  overshoot, lateral lockup shift, and staggered AXMORF wordmark reveal;
- `input-trigger-moves / cursor-performance`: curved cursor arrival, hover
  response, button press, and decoupled expanding/fading ripple;
- `icon-performance-moves / pop-burst-confirm`: deterministic radial accents
  and a drawn confirmation check after the click.

Exact upstream recipe/demo paths:

- `references/shots/outro/logo-shrink-wordmark-lockup.md`
- `demos/outro/logo-shrink-wordmark-lockup/LogoShrinkWordmarkLockup.tsx`
- `references/shots/interaction/input-trigger-moves.md`
- `demos/interaction/input-trigger-moves/CursorPerformancePunchIn.tsx`
- `references/shots/effects/icon-performance-moves.md`
- `demos/effects/icon-performance-moves/PopBurstConfirm.tsx`

The ending statement, parameterized source credits, AXMORF mark and wordmark,
follow/followed states, palette, responsive layouts, scale, timing, and component
boundaries are project-specific changes. The upstream placeholder ring, tagline,
camera punch-in, dashboard, labels, and sound cues are omitted.

Upstream copyright 2026 Wei Yihao. Licensed under Apache-2.0. The repository
already carries the Apache-2.0 license text with its localized video-shotcraft
proof source at
`src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/shots/video-shotcraft/draw-svg-trace/LICENSE`.
