# Producer config boundary

Read this only while authoring a new Project's `producer-input.json`.

- Keep reusable production defaults in ignored `private/producer.config.json`; keep title, StoryBeat,
  narration copy, visual direction, and publishing description in Project input.
- Use the repository config helper and `project:configure`. Never open, copy, print, summarize, stage,
  or commit tokens, private paths, or protected voice material.
- Choose exactly one existing `publishingCollections` ID from its name and description. Never invent a
  free-text collection.
- Let the CLI freeze render defaults, readability, default voice/provider identity, speech rate, and
  `targetLoudnessLufs`. Do not reproduce its derivation or copy values into contracts manually.
- A Run freezes a private-safe narration execution snapshot. Configuration drift requires a fresh Run;
  never switch provider, voice, rate, or mastering policy mid-Run.
- Use environment diagnostics only for metadata, health/ready, and browser checks. Never generate test
  speech, warm the provider, or weaken Chromium sandboxing.
