# Producer config boundary

New Project input only.

- Keep reusable defaults in ignored `private/producer.config.json`; title, StoryBeat, `ttsChunks`, visual
  direction and publishing description belong in create input.
- Explicit user `render.width/height/fps/locale` overrides defaults per field. Omit unspecified fields.
  Convert orientation to dimensions, e.g. 1920×1080 for 16:9 landscape. Keep saved settings unchanged;
  verify the returned frozen `render` matches the request before provider preparation.
- Omit `sceneTemplates` to inherit `sceneDefaults`. Only explicit user choices permit template IDs or
  `null`; absence of a request is not authorization to disable bookends. Defaults affect new Projects; `project:create` copies templates.
  Never hand-copy templates or add placement compatibility rules.
- Use the config helper and `project:create`. Never read, copy, print, summarize, stage or commit tokens, private paths or
  protected voice material. Select an existing `publishingCollections` ID by name/description; never invent one.
- CLI derives resolved render, readability, provider/voice identity, speech rate and `targetLoudnessLufs`.
  Do not reproduce derivations. ProductionRevision binds a private-safe narration-generation fingerprint;
  config drift changes content identities while unrelated valid artifacts remain reusable.
- Execution preferences: mode/concurrency only. Verified `shared-workspace` or `controller-io` transport
  is ephemeral host evidence, never config or content identity.
- Creation ends at `configured-authoring`. Report read-only inspect before preparation. Never fabricate
  timing-bound authoring or a Revision before verified PCM timing.
- Environment diagnostics cover metadata, health/ready and browser checks. Never generate test speech,
  warm providers or weaken Chromium sandboxing.
