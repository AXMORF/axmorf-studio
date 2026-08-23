# Task 返工与固定流程完善边界

## Hard rule

Only an Agent-owned dirty task workspace is recoverable creative work. A fixed-flow failure is a system
defect. Provider, host, sandbox, permission, or authorization failure is an external blocker. Classify the
failing owner before acting.

## Agent task rework

The assigned child may correct files only inside
`.producer-work/<storyId>/<taskRevision>/`, rerun the same `project:task:check`, and then call
`project:task:commit`. Do not weaken the validator, change `task.json`, edit inputs, write live Project
output, or fabricate the artifact manifest. Commit repeats validation and is the only promoter.

A child terminal message does not prove an artifact. The child must execute its attempt-bound task failure
command when it cannot complete. Fixed continuation then fails the attempt and exits without convergence or
Root re-entry. A later, separately user-started ExecutionAttempt may replan current inputs, reuse every valid
ArtifactAttestation, and dispatch only remaining dirty tasks. Attempt state never invalidates or owns bytes.

## Fixed-flow defects

Artifact Store inspection/promotion, fixed template preparation, source-current convergence/materialization,
generated ScenePackage/Coverage/RendererRegistry/Composition refresh, and any requested DeliveryBuild are fixed flow. With
valid inputs:

The production attempt never repairs these defects in place. It exits. In a separate user-started engineering
task:

1. Diagnose from the failed attempt; do not skip the gate or hand-edit derived state.
2. Save a redacted incident containing storyId/revisionId/taskRevision where applicable, the safe symptom,
   expected invariant, and containment. Exclude secrets, endpoints, protected contents, and raw provider data.
3. Add the smallest deterministic Red regression for the shared defect.
4. Implement the smallest shared Green change without fallback success or run-specific branching.
5. Run focused tests, typecheck, lint, and every affected host/media gate.
6. Replan from current inputs. Reuse valid artifacts; never copy identities or bless drifted bytes.

## Store and materialization invariants

- Task identity excludes attempt IDs, clocks, PIDs, and absolute paths.
- Artifact hit means schema, task identity, exact sorted file set, containment, regular-file/no-symlink,
  size, checksum, dependencies, and validator version all pass again.
- Promotion uses same-parent staging, writes the manifest last, and rolls back a captured replacement failure.
- Converge recomputes ProductionRevision, rejects stale revision input, requires all artifacts before live
  mutation, and verifies materialized bytes against attestations.
- Current delivery is replaced only after exact four files pass checksums, H.264/AAC/channels, dimensions,
  fps/frame count, PNG, and EOF decode. A failed build preserves the previous current package and reusable
  verified staging media.

## Privacy and authoring isolation

Do not search, open, imitate, or copy old formal Scene source, Composition layouts, stills, contact sheets,
or preview media to author a new task. Do not open or report private config or protected voice profiles.
Historical `.producer-runs/` is deletion-only data and never a planning, convergence, delivery, or progress
input.

## Scope stop

`project-production-complete` and `project-production-current` prove a local verified four-file delivery.
They do not authorize platform upload, account/network/secret work, subjective aesthetic gates, capability
promotion, commit, or push.
