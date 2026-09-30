# Task 返工与固定流程完善边界

## Hard rule

Only an Agent-owned dirty task workspace is recoverable creative work. A fixed-flow failure is a system
defect. Provider, host, sandbox, permission, or authorization failure is an external blocker. Classify the
failing owner before acting.

## Low-token supervision

Root remains responsible through verified delivery. After bounded admission, start the exact continuation once per attempt.
Prefer native completion notification or a blocking wait on its original process handle. An ordinary wait timeout with a live
process means continue waiting on that handle, not inspect progress, read logs or diagnose a failure. Read only new error output
when an error arrives. Do not poll child chats, tail transcripts, repeat unchanged status or reply again to late success notices.
A success notification never replaces fixed delivery verification. Report the fixed final result once.

Use the longest supported blocking wait that fits the outer host deadline, typically 30–60 seconds or longer when allowed. Native completion should wake it early. Do not repeatedly request 1-second waits, alternate wait tools to inspect unchanged state, or narrate routine renewals. Queue admission likewise uses a long native wait-any that wakes on completion; it does not need short polling intervals.

## Agent task rework

On a worker error notification, Root diagnoses from the exact task/binding identity, failing command, structured validator issue
and the owner's minimal relevant excerpt. Chat routes diagnosis only; bound checks and terminal events remain authority. Root may
send a targeted correction to the original live executor, which alone can read/write its declared outputs after successful bind.
Do not read another worker's workspace, take over its commit, edit immutable inputs or fixed-finalize outputs, weaken validators,
or repair a running continuation. The owner reruns exact bound finalize/check/commit before terminal. Repeated identical errors
without a concrete new correction stop and report; neither Root nor worker loops blindly.

A terminal failed attempt is never reopened. Video production authorizes at most **one automatic task-recovery cycle per user
production request**, including revision candidates; a retry or candidate change does not reset this allowance. Only a proven
Agent-authored output fault qualifies. A generic exit code or recovery-ready response alone does not classify the original fault.
Unknown, fixed-system, provider, host, permission, identity or integrity faults stop with diagnosis and a concise blocker.

For an eligible terminal task failure:

1. Wait for the original continuation to exit and use native worker completion, or native stop followed by confirmed exit, to
   establish that **all previous workers have exited**. A failed attempt alone does not prove their processes stopped. If the host
   cannot establish quiescence, report the blocker; never overlap old and new writers.
2. Run read-only, zero-provider `project:attempt:recover-inspect` for the exact failed attempt, preserving `--candidate` when present.
   Report the diagnosed cause, proposed task correction, artifact reuse and inspection result. Only `attempt-recovery-ready`
   permits `project:attempt:reissue`; it rechecks same-current-Revision, no active/fixed blocker, and valid artifacts/drafts under lock.
3. Reissue needs no current delivery and calls no provider. It returns a fresh attempt/bindings/continuation. Admit only its dirty
   tasks to fresh native workers using the resolved capacity/transport; inline Root binds serially. Give each its exact new bind
   and the relevant diagnosis, never another task's contents. No old bindings or terminal sessions may be reused.
4. Start that attempt's exact continuation once and resume low-token supervision. If this recovery fails, stop and report; do not
   reissue again, rerun prepare, regenerate narration or expand to package-source repair. A later explicit user recovery request
   is a separate authorization, still subject to all gates.

Root-only spawn/fixed failure commands retain their narrow authority: record actual host/transport or immutable/controller
faults without task content access. Workers never initiate recovery. Automatic mode fallback is forbidden.

For an external interruption with no terminal event, diagnose and report; automatic task recovery does not cover it. On explicit
recovery, `project:attempt:interrupt-inspect` proves same-host owner/process-group death, all task terminals and exact lock ownership.
Only its ready result permits `project:attempt:interrupt` to append failure and archive the abandoned lock, preserving the old claim.
Then use recover-inspect/reissue. Unknown or legacy ownership blocks; never manually remove a lock or manufacture terminal events.

## Fixed-flow defects

Artifact Store inspection/promotion, fixed template preparation, convergence/materialization, generated
ScenePackage/Coverage/RendererRegistry/Composition refresh, and synchronous delivery are fixed flow. With
valid inputs:

The production attempt never repairs these defects in place. It exits. Root may read the relevant diagnostic evidence and
report the likely cause, supporting evidence and required engineering scope, but must not change program source, installed
packages, dependencies, validators or generated authority, or restart production. In a separate user-started engineering task:

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
