# Producer config

Before freezing a new Project, use the repository config helper and fixed `project:configure` CLI.
Never print, summarize, stage, or commit its token or private paths.
Repository entrypoints automatically load an optional root `.env` copied from `.env.example`;
`RSP_PRODUCER_CONFIG` there may select a repository-relative or absolute config file, while an
exported shell value has precedence. Voice profile source files themselves must use normalized
repository-relative paths, normally below ignored `voxcpm/voice_profile/`; the host adapters resolve
them from the repository root before access. `audioDefaults.globalBgm`, when present, is also a
repository-relative path plus linear volume, but current production keeps `globalSound: none` and
does not freeze or render this preset.

The CLI applies it as follows:

- freeze `renderDefaults` into the new RenderSpec; do not add target duration or caption-safe-area
  fields;
- require `readability.edgeInsetPx` when building ProductionRequirementsFreeze. There is no fallback.
  The policy scales this
  reference inset by short edge, derives caption bottom as twice the resolved edge inset, then derives
  Scene bottom from caption bottom + caption box + gap and rounds upward to 10 px;
- inspect every `publishingCollections` entry and choose exactly one most suitable `id` from its name
  and description. Do not invent free-text collections. Build PublishingIntent v2 with the whole
  current collection array so it freezes the selected ID/name and catalog fingerprint;
- freeze `tts.defaultVoiceProfileId` into NarrationSpec and use `tts.defaultProviderId` for the Run
  execution provider;
- production start resolves the selected provider once for preflight and freezes a private-safe Run
  snapshot that reuses provider-attempt identity and freezes `speech.rate` plus
  `targetLoudnessLufs` in the mastering policy. Generation must reproduce the snapshot before its
  first request; mastering consumes the frozen policy and never rereads global config. Drift requires
  a fresh Run.

`tts` is the stable product boundary. `kind: "voxcpm"` is one adapter. Controllable clone uses
`POST /clone` with `control` and `reference_audio`; high-fidelity clone uses
`POST /clone_with_prompt` with `prompt_text`, `prompt_audio`, and `reference_audio`. `mode` selects the
adapter branch and is not sent as a provider form field.

The local config console is available through `npm run dev` at `http://127.0.0.1:3100`; Remotion
Studio remains the preview surface at `http://127.0.0.1:3101`. The console intentionally returns the
full token for editing and uses no browser persistence. When the operator has explicitly confirmed a
trusted LAN, `npm run dev:lan` exposes both surfaces on the same LAN hostname at ports 3100 and 3101;
settings writes still require an exact Origin/Host match. Never forward either port to the public
internet.
Its environment diagnostics are read-only: metadata access, health/ready and Remotion browser
preflight only. They never generate speech, warm the provider, or weaken the Chromium sandbox.
