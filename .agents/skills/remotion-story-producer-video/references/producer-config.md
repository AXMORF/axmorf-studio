# Producer config boundary

Read this only while authoring a new Project's `producer-input.json`.

- Keep reusable defaults in ignored `private/producer.config.json`; keep title, StoryBeat, narration copy,
  visual direction, and publishing description in Project input.
- Use the repository config helper and `project:configure`. Never open, copy, print, summarize, stage, or
  commit tokens, private paths, or protected voice material.
- Choose exactly one existing `publishingCollections` ID from its name and description. Never invent a
  free-text collection.
- Treat `sceneDefaults` as choices for new Projects. `project:configure` copies selected generic Scene
  templates; do not hand-copy their files or add placement compatibility rules.
- Let the CLI write render defaults, readability, provider/voice identity, speech rate, and
  `targetLoudnessLufs`. Do not reproduce those derivations manually.
- ProductionRevision binds a private-safe narration-generation fingerprint, never secrets. Configuration
  drift creates new content-addressed task identities; valid unrelated artifacts remain reusable.
- Use environment diagnostics only for metadata, health/ready, and browser checks. Never generate test
  speech, warm a provider, or weaken Chromium sandboxing.
