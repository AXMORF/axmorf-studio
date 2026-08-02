# M6 Scene Runtime Foundation Evidence

This record covers the synthetic `M6SceneRuntimeProof` only. It is not a formal
Scene for `gps-relativity` and it does not satisfy M7 Story coverage.

## Frozen reference and fidelity

- Source: `video-shotcraft` `draw-svg-trace` at immutable commit
  `d4915443232e89527fdc9d7e79f132ba411fc440`.
- Localized closure: two source files plus the Apache-2.0 license; no Gallery,
  template collection, audio library, package, or remote runtime dependency is
  vendored.
- Fidelity receipt:
  `sha256:81f51f86465a9bb17c2a228bba48c4c8756eb7caa0feae684763c97721a0f166`.
- The Agent review record binds source/adaptation phase pairs and normal-speed
  previews. Its current conclusion is that the 40-frame outline trace,
  closed-outline flash handoff, and moving pen remain recognizable at normal
  speed. The mechanical checker validates that current record; it does not make
  an automatic aesthetic judgment.

## Runtime proof

- ScenePackage:
  `sha256:7a49215f536d9bf142d1e9e53554bdf134e883ecf878d34ee45a97ddf3fa3b18`.
- SceneCoverageMap:
  `sha256:1af8b51502fdd83b36c3a2df05bc188760a67537fcc1f960004beea6fb940fab`.
- RendererRegistry:
  `sha256:d4f73aed83b88e757cb355ee81ef7610b077c829f177dbedbf615cbb41eecaec`.
- StoryVisualProjection:
  `sha256:c3b1b0a90f6fc28473d2ec8c13c3898b3e0667dbe9555d5e58f6cff77ee85a5f`.
- SoundDesignProjection:
  `sha256:b76b4ac9bebda023e00fb4a714fa886962343375f87f4beb05b275c514fbf579`.
- Evidence receipt:
  `sha256:791652e0cdb5bc74923dd2f52a51bb5eb9b990790611117641cfd29abef1b53b`.

The independent proof listing contains only `M6SceneRuntimeProof` at 30 fps,
1920x1080, 120 frames. Frame 72 is fully opaque and contains both current Scene
pixels and the top-level caption layer. The four-second proof render contains
120 H.264 video frames and exactly one AAC audio stream produced by the
Scene-local pulse cue; it is neither narration nor global BGM.

## Reproduction

```bash
npm run catalog:check
npm run m6:proof:compositions
npm run m6:proof:evidence
npm run compositions
```

The final command remains isolated from the proof and lists only
`CapabilityGallery` and `GpsRelativity`.
