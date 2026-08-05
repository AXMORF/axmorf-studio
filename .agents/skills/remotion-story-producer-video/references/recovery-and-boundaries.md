# 故障恢复与边界

## Failure classification

Classify before acting. Preserve only sanitized evidence.

### Authored input or private configuration

Examples: malformed source JSON, stale StoryCheck, unknown safe voice profile ID, non-WAV reference
required by the provider, or a missing local asset.

Fix the current authored/private input without weakening contracts. Do not print private configuration.
If a run already recorded terminal failure, create a replacement run; do not revive it.

### Expected production failure

Examples: a Scene cannot meet its assignment, an allowed resource is unavailable, or a declared
fallback cannot be produced. Submit a safe `production:scene:fail`. Preserve partial successes as
diagnostic facts, but do not assemble coverage or Preview. Correct the production input and use a
replacement run.

### Orchestration defect

Use this classification only when valid intended production input exposes incorrect coordinator,
contract-boundary, watcher, recovery, process-runner, or media-inspection behavior.

Execute this loop without skipping steps:

1. Save a redacted incident under an ignored diagnostic output path. Record run ID, terminal sequence,
   safe symptom, expected behavior, classification, and containment. Exclude raw stack, token, endpoint,
   private path, or protected content.
2. Reproduce the defect with the smallest deterministic test. Use fake provider/process/clock/media
   only when the real boundary can be represented faithfully.
3. Confirm Red for the intended reason.
4. Implement the smallest fix at the earliest correct validation boundary. Do not broaden contracts or
   add recovery shortcuts.
5. Run the focused Green test, adjacent production tests, typecheck, and lint as appropriate.
6. Inspect diff and secret/protected scope. Stage exact paths and create one local fix commit.
7. Keep the failed run immutable. Resume only if its state legally supports the same command;
   otherwise create a replacement run from current authored inputs.
8. Continue the real trial to `preview-ready`; do not stop merely because the focused test is Green.

### External environment blocker

Examples: provider unavailable, host loopback denied by sandbox, missing system binary, or required
authorization unavailable. Exhaust safe read-only diagnostics. Request the smallest necessary runtime
permission when appropriate. If the environment still blocks progress, report the exact safe blocker
and current immutable run state; do not simulate success.

## Known hardened invariants

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

Add a Red regression before changing any of these behaviors.

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

Use `production:status` to inspect state and fixed commands to advance it.

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
