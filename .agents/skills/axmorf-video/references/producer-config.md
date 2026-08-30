# Producer config boundary

Read this only while authoring a new Project's strict create input.

- Keep reusable defaults in ignored `private/producer.config.json`; keep title, StoryBeat, authored
  `ttsChunks`, visual direction, and publishing description in the create input.
- Omit `sceneTemplates` to inherit `sceneDefaults`. Only write explicit template IDs or `null` when the user
  explicitly requests that override; absence of a request is not authorization to disable bookends.
- Use the repository config helper and `project:create`. Never open, copy, print, summarize, stage, or
  commit tokens, private paths, or protected voice material.
- Choose exactly one existing `publishingCollections` ID from its name and description. Never invent a
  free-text collection.
- Treat `sceneDefaults` as choices for new Projects. `project:create` copies selected generic Scene
  templates; do not hand-copy their files or add placement compatibility rules.
- Let the CLI write render defaults, readability, provider/voice identity, speech rate, and
  `targetLoudnessLufs`. Do not reproduce those derivations manually.
- ProductionRevision binds a private-safe narration-generation fingerprint, never secrets. Configuration
  drift creates new content-addressed task identities; valid unrelated artifacts remain reusable.
- Creation stops at `configured-authoring`; run and report the read-only inspection before explicit
  preparation. Do not fabricate timing-bound authoring or claim a Revision before verified PCM timing exists.
- Use environment diagnostics only for metadata, health/ready, and browser checks. Never generate test
  speech, warm a provider, or weaken Chromium sandboxing.
