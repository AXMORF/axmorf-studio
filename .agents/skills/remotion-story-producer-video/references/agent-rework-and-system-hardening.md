# Agent 返工与固定流程完善边界

## Hard rule

Only Agent-owned authoring work is recoverable. Fixed-flow failure is a system defect, not a recovery
case. External environment failure is a blocker. Classify the failing owner before taking action.

## Agent-owned work may be reworked

Agent-owned work includes:

- VideoBrief/Story/StoryBeat/ttsChunks and StoryCheck authoring;
- VisualStyleSpec, StoryResourcePool, SceneProductionBrief, and resource choices;
- SceneVisualPlan, ShotPlan, SceneSoundPlan, selected-resource declarations, localized authoring
  adaptation, Renderer source, and other assignment-owned Scene inputs;
- continuity decisions and safe fallback authored by the responsible Agent.

When fixed validation rejects one of these outputs, return the finding to the owning Agent. Correct
only that owned artifact, rerun the same fixed validator, and preserve shared inputs and other Scene
ownership. Do not weaken the validator to make bad Agent output pass.

If no immutable Scene result or terminal event exists, submit the corrected Agent output normally. If
an explicit Agent failure already made the run terminal, keep that run immutable, correct the Agent
output, and start a new run from current authored inputs. The new run is required by the fixed state
contract; it does not mean the fixed workflow was recovered.

## Fixed-flow failure requires system hardening

The fixed flow includes contract implementations, production CLI parsing and dispatch, append-only
ledger/state projection, locks, watcher behavior, Scene result ingestion, package/coverage/registry/
projection generation, Composition scaffolding/listing, Remotion/FFmpeg process invocation, media
inspection, Preview assembly/evidence/check writing, and check-only idempotence.

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
   fixed workflow, and continue until the common flow reaches `preview-ready` without intervention.

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
- Preserve Remotion Composition listing stdout when it is parsed; a zero exit with suppressed stdout
  is not proof that the Composition is absent.
- Replace a Composition scaffold only when it byte-matches a recognized generated Narrative or Preview
  variant. Never overwrite hand-written or drifted source.
- Use the sole video stream duration, exact fps, and exact frame count as Composition timing evidence.
  Do not reject correct video because AAC tail padding lengthens container duration.
- Keep Preview rechecks byte/mtime stable and append no new event after `preview-ready`.

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

- Do not manually open or report `voxcpm/voxcpm.private.json`; let the fixed provider adapter consume it.
- Do not read, glob, checksum, copy, modify, stage, or commit user-designated protected voice-profile
  directories.
- Do not include secrets, private endpoints, absolute private paths, transcripts for private prompt
  recordings, or raw provider responses in events, tests, reports, or commits.
- Keep existing formal media, approval, evidence, final reports, and sealed narration byte-identical
  unless the user explicitly places that project in scope.
- Use explicit protected paths for before/after checks. Avoid repository-wide commands that enumerate
  ignored/private contents.

## Scope stop

The automatic endpoint is mechanical `preview-ready / awaiting-user-preview`. It does not authorize:

- `FinalPreviewApproval` or an approval authoring record;
- NarrativeCheck, SceneVisualCheck, SceneSoundCheck, or another aesthetic gate;
- full-film BGM, cross-Scene ambience, ducking, or independent GlobalVisualLayers in the M9.5 path;
- user-preview revision automation;
- capability promotion;
- M10, publishing, upload, account, network, secret, or permission work;
- push.

Start any of those only after a new explicit user instruction and the repository's corresponding
authority boundary.
