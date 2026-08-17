# Agent 返工与固定流程完善边界

## Hard rule

Only Agent-owned authoring work is recoverable. Fixed-flow failure is a system defect, not a recovery
case. External environment failure is a blocker. Classify the failing owner before taking action.

## Agent-owned work may be reworked

Agent-owned work includes:

- VideoBrief/Story/StoryBeat/ttsChunks authoring;
- VisualStyleSpec, StoryResourcePool, SceneProductionBrief, and resource choices;
- GlobalVisualBrief, GlobalVisualPlan, selected-resource declarations, project-local source, and
  other GlobalVisual assignment-owned inputs;
- SceneVisualPlan, ShotPlan, SceneSoundPlan, selected-resource declarations, localized authoring
  adaptation, Renderer source, and other assignment-owned Scene inputs;
- continuity decisions and safe fallback authored by the responsible Agent.

Before child delegation, correct only the root-owned authored artifact, rerun the same fixed validator,
and preserve other ownership. Do not weaken validators.

After delegation the root does not coordinate owner rework. Each child publishes exactly one
assignment-bound ready or failed receipt and returns a minimal terminal signal. After every child is terminal,
the root calls `production:finalize` exactly once. Foreground finalize alone reruns fixed validation and writes
formal Scene/GlobalVisual/Cover results. An owner must never call submit/fail result commands.

No receipt is not inferred from child chat status: finalize returns `owner-receipts-incomplete` without
changing ledger/state/results. Do not retry finalize or create an inline replacement owner in the same
orchestration attempt. Once any receipt exists it is immutable; an
explicit failed receipt keeps its formal failure outcome immutable and requires a fresh Run.

When Story or ttsChunks change after an earlier active narration seal exists, the fresh Run must call
`production:narrative -- --run <runId> --supersede <current-sealed-fingerprint>`. The fingerprint is
an explicit identity authorization for the existing atomic seal contract, not a retry or manual state
edit. A missing or stale value must fail closed, and the previous Run and immutable seal directory
remain untouched.

After an authorized seal replacement, the fixed narrative writer may replace one structurally valid
but identity-stale narrative baseline evidence receipt while rebuilding the baseline. Check-only evidence and project
checks remain strict, malformed receipts never become replaceable input, and Agents never edit or
delete the receipt to continue.

## Fixed-flow failure requires system hardening

The fixed flow includes contract implementations, production CLI parsing and dispatch, non-terminal
Scene check, append-only
ledger/state projection, locks, foreground finalize, Scene result ingestion, package/coverage/registry/
projection generation, Composition scaffolding/listing, render-plan/render-ready writing, non-MP4
delivery packaging, detached Remotion launch, launch intent/receipt writing, and check-only
idempotence.

When valid current inputs expose a failure in any of those components:

1. Stop the current fixed flow immediately.
2. Do not retry, resume, skip, or manually complete the failed fixed stage.
3. Save one redacted incident with run ID, terminal sequence, safe symptom, expected invariant, owner
   classification, and containment. Exclude raw stack, token, endpoint, private path, and protected
   content.
4. Reproduce the defect with the smallest deterministic test. Use fake provider/process/clock/media
   only when it faithfully represents the real fixed boundary.
5. Confirm Red for the exact common-flow defect.
6. Implement the smallest fix in the shared production workflow. Do not add recovery shortcuts,
   fallback success, tolerance widening, or run-specific branching.
7. Prove focused Green, adjacent production tests, typecheck, lint, and any affected real media gate.
8. Inspect secret/protected scope, stage exact paths, and create a local hardening commit.
9. Keep the failed run terminal and immutable. Start a fresh run from `production:start`, replay the
   fixed workflow, and continue until one foreground finalize reaches its documented outcome.

Call this system hardening or common-flow completion, never failure recovery.

## External blockers are not recovery

Provider unavailability, sandbox loopback denial, missing host binaries, unavailable filesystem
permission, or missing authorization are external blockers. Exhaust safe read-only diagnostics and
request the smallest necessary permission when appropriate. Do not add retry loops or fallback output
to the fixed workflow. Resume work only after the external condition changes, and describe that as a
new execution attempt rather than recovered fixed flow.

Private provider configuration is user/external input, not Agent-owned creative work. Report only a
safe missing/invalid configuration fact; never print or copy the private value.

## Known common-flow invariants

Treat these as regression requirements:

- Validate the entire selected-resources envelope at Scene submit and post-Scene boundaries with one
  strict parser.
- Keep Scene check and submit on the same validator; check failure writes no immutable result, event,
  or derived state, while submit repeats validation before its atomic result write.
- Preserve Remotion Composition listing stdout when it is parsed; a zero exit with suppressed stdout
  is not proof that the Composition is absent.
- Replace a Composition scaffold only when it byte-matches the current generated variant. Never
  overwrite hand-written or drifted source.
- Bind the frozen Composition source checksum, exact fps, and exact frame count in the render plan.
- Keep render-ready rechecks byte/mtime stable and append no new event after `render-ready`.
- Write delivery launch intent exactly once before detached spawn. After an intent exists, missing receipt is
  permanently ambiguous and no repository command may retry that launch.
- Treat the OS `spawn` event only as launch acknowledgement. Never monitor the child or use MP4
  completion, checksum, probing, or decoding as part of the automatic handoff.

Add a Red regression before changing any of these behaviors. Never reclassify their failure as Agent
rework.

## Central state protection

`.producer-runs/<runId>/events/` is append-only, Scene results are immutable, and
`state.generated.json` is a derived projection. Only repository production scripts may write them.

Never:

- edit, delete, rename, renumber, or synthesize an event;
- hand-edit derived state or its fingerprint;
- overwrite a success/failure Scene result;
- remove a lock owned by another live writer;
- change a failed state back to active;
- copy generated identities between runs.

Use `production:status` only to inspect fixed state. Do not use state mutation as Agent rework or
system hardening.

## Authoring isolation

Do not search, open, compare, imitate, or copy old formal Scene source, Composition layout, stills,
contact sheets, or preview media to author a new Scene. If a broad search unexpectedly returns such
content, stop using it, record a sanitized process incident, and restrict subsequent work to the
current project, contracts, tests, ResourceCatalog, shared runtime APIs, and explicitly selected
immutable upstream references.

Historical source may be inspected only for a narrowly scoped runtime diagnosis after separating that
diagnosis from new authoring decisions.

## Privacy and protected artifacts

- Do not manually open or report `private/producer.config.json`; let repository config helpers consume it.
- Do not read, glob, checksum, copy, modify, stage, or commit user-designated protected voice-profile
  directories.
- Do not include secrets, private endpoints, absolute private paths, transcripts for private prompt
  recordings, or raw provider responses in events, tests, reports, or commits.
- Keep protected voice profiles and private configuration untouched.
- Use explicit protected paths for before/after checks. Avoid repository-wide commands that enumerate
  ignored/private contents.

## Scope stop

The automatic endpoint is `delivery-render-started`. It does not prove or authorize:

- NarrativeCheck, SceneVisualCheck, SceneSoundCheck, or another aesthetic gate;
- automatic ducking or mastering beyond the frozen contribution volumes;
- detached-render monitoring or MP4 success claims;
- capability promotion;
- publishing, upload, account, network, secret, or permission work;
- push.

Start any of those only after a new explicit user instruction and the repository's corresponding
authority boundary.
