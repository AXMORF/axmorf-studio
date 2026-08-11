# Producer config

Before authoring a new Project, read the current ignored `private/producer.config.json` through the
repository config contract. Never print, summarize, stage, or commit its token or private paths.

Use it as follows:

- copy `renderDefaults` into the new RenderSpec; do not add target duration or caption-safe-area
  fields;
- pass `readability.edgeInsetPx` when building ProductionRequirementsFreeze. The policy scales this
  reference inset by short edge, derives caption bottom as twice the resolved edge inset, then derives
  Scene bottom from caption bottom + caption box + gap and rounds upward to 10 px;
- inspect every `publishingCollections` entry and choose exactly one most suitable `id` from its name
  and description. Do not invent free-text collections. Build PublishingIntent v2 with the whole
  current collection array so it freezes the selected ID/name and catalog fingerprint;
- use `tts.defaultProviderId` and `tts.defaultVoiceProfileId` for NarrationSpec selection unless the
  brief explicitly requires another configured voice;
- narration generation reads `tts.speech.rate` and the selected provider. The provider response is
  rate-adjusted before canonical PCM measurement, and the rate is bound by provider-attempt identity;
- narration mastering reads `tts.speech.targetLoudnessLufs` and freezes the resolved mastering policy
  in the mastered narration manifest.

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
