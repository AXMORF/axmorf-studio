# Scene template fixed artifact contract incident

- Classification: fixed-flow defect in the shared configured Scene template artifact boundary.
- Story: `remotion-story-producer-intro`.
- Revision: `revision-e8911961b383271ff2e8c208c1fefde44de113b171b4e742cfdee7e966d353ce`.
- Failing task: `task-b6b2db0b48239f801624848207da93a425c4c72b610532ed0be9d289864b28b2`
  (`scene-template`, `configured-intro-scene`).
- Safe symptom: fixed preparation reached Scene template validation without
  `src/selected-resources.json`; the validator stopped with `ENOENT` before any Agent task dispatch or
  ExecutionAttempt creation.
- Expected invariant: a fixed template producer and its validator must share one exact output contract. The
  fixed artifact must contain the immutable copied source/assets plus the canonical Scene plans, empty recipe
  fidelity receipt, and exact selected-resource envelope required by Scene validation.
- Containment: the failed lifecycle was not retried or repaired in place. No workspace file, validator,
  ArtifactAttestation, live Project output, or delivery was hand-edited. The six narration chunks and their
  fixed artifacts remain independently reusable.

## Root cause

Both inspection and preparation rebound the template task output set to the files already copied into the
Project. The template validator instead required those copied files plus the derived canonical Scene bundle.
The first missing derived file happened to be `src/selected-resources.json`; adding only that file would have
left the remaining plan, recipe, sound, anchor, and fidelity outputs missing.

## Hardening implemented

- Added one shared deterministic template Scene artifact builder that owns the complete output set.
- Used the shared output contract for read-only task planning and the deterministic builder for fixed artifact
  preparation.
- Added a regression that prepares and commits a real template fixed artifact through the production validator.
- Re-ran focused tests, typecheck, lint, host Composition checks, and the full repository gate before starting
  a new production lifecycle.

## Follow-up lifecycle defect

- Attempt: `41947140-719e-4fb5-a4ec-e0dc758153e7`.
- Safe symptom: after all five Agent tasks committed, fixed convergence stopped during its read-only current
  replan with `Prepared Scene template file conflicts with derived output.` No delivery was created.
- Root cause: the new planning helper accepted create-only template files but rejected the same template after
  its valid derived Scene files had been materialized into the live Scene root.
- Expected invariant: create-only, fixed-prepared, and materialized views of one unchanged template must bind
  the same exact output set and TaskRevision. Already-declared derived outputs are idempotent input to replan;
  unknown files and checksum drift remain fail-closed in the fixed builder and Artifact Store.
- Containment: the failed Attempt was not retried or edited. Its five committed Agent artifacts remain reusable
  by a separately created Attempt after this shared defect is fixed and verified.

## Resolution evidence

- The shared fixed builder and validator accepted one canonical copied-plus-derived output set.
- Regression coverage proved that create-only and materialized reads bind the same output set and TaskRevision.
- The full repository gate passed 522 tests, and a fresh lifecycle reached verified four-file delivery before
  that Project and delivery were later removed through the user-authorized controlled Project deletion command.
