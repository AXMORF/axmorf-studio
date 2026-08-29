---
name: remotion-story-producer-video
description: Produce and deliver videos through the authenticated AXMORF Studio Workspace rsp v2 surface.
---

# AXMORF Studio Workspace production

Use only `./.rsp/bin/rsp` from the Workspace root containing `.rsp/workspace.json`. It is the self-contained client
installed from the verified embedded Runtime Pack. Never fall back to repository scripts, host Node/npm/Git,
Remotion Studio, a Settings server, a background engine, or another executable.

## Discover the live contract

1. Run `./.rsp/bin/rsp doctor`. Require `protocolVersion: "rsp-local-v2"`, `adapterMode: "workspace"`,
   `runtimePackMode: "embedded"`, `network.controlPlane: "authenticated-unix-domain-socket-only"`,
   `network.persistentTcpListeners: false`, `network.deliveryBuildListener.host: "127.0.0.1"`,
   `productionAvailable: true`, `runtimePackAvailable: true`, `deliveryAvailable: true`, and
   `deliveryBlocker: null`. The temporary loopback HTTP listener is one DeliveryBuild's renderer data plane, not a
   command, Settings, Studio, or credential endpoint. Report any structured blocker exactly; do not retry or downgrade.
2. Run `./.rsp/bin/rsp help --json` when command discovery is needed. Local structural contracts are available with
   `./.rsp/bin/rsp schema project-create`, `./.rsp/bin/rsp schema project-revision`, and
   `./.rsp/bin/rsp schema asset-import`. Before delegating, also read `./.rsp/bin/rsp schema task-worker`; these
   commands do not require an active App session. Do not infer
   unsupported commands or fields.

## Create or select a Project

For a new Project:

1. Read the structural schema, then run `./.rsp/bin/rsp project create-context`. The context is the authority for
   current style profile IDs, publishing collections, Scene templates/defaults, selectable Project resources, and
   render defaults. Never invent an ID from prose, an old example, or host memory.
2. Author one strict raw `ProjectCreateInput` object. Never wrap it in `command`, `input`, `protocolVersion`,
   `requestId`, or `workspaceId`. Omit `sceneTemplates` when the user did not choose a boundary override; omission
   inherits the encrypted ProducerConfig defaults, while an explicit ID or `null` overrides them.
3. Send the same raw object on stdin to `./.rsp/bin/rsp project validate`. Continue only when `valid` is true. When
   `issues[]` is returned, correct the named `path` using `code`, `message`, and `ownerAction`; do not call create.
4. Send the validated raw object on stdin to `./.rsp/bin/rsp project create`. Creation is zero-provider and creates
   no generated media or production attempt; selected fixed boundary templates may copy their declared immutable
   source assets into the Project.

Use `./.rsp/bin/rsp project list` for discovery. Run
`./.rsp/bin/rsp project delete --project <storyId> --confirm-delete` only when the user explicitly requests deletion;
never replace it with broad filesystem deletion.

## Revise an existing Project

Do not clone an MP4, clone a Project directory, or edit controller-owned Project files. Keep the current Project and
its playable Delivery stable while a same-Project candidate revision is produced:

1. Run `./.rsp/bin/rsp project revise-context --project <storyId>`. It returns the exact current
   `baseRevisionId` and the editable authored sections. Preserve narrated meaningIds/order and boundary Scenes.
2. Read `./.rsp/bin/rsp schema project-revision`, author one strict raw `ProjectRevisionInput`, and include only the
   sections the user asked to change. Pipe the same raw object to `project revise-validate`, then to `project revise`.
3. Use the returned `candidateId` with `context --candidate`, `inspect --candidate`, and `prepare --candidate`.
   Candidate production always uses automatic Delivery; follow its exact task and continuation commands.
4. Only a verified exact four-file candidate Delivery promotes the candidate atomically. Until then the previous
   current source and Delivery remain authoritative and playable; a failed promotion rolls them back.

Never inspect or reuse an existing Project's Scene source while revising. Artifact reuse is decided only by fixed
content-addressed task identity; unchanged valid tasks are reused without copying their source into an Agent task.

## Optional external image acquisition

Before inspect, use an external image slot only when the current Root Agent itself exposes one compatible provider's
status, search, preview, and acquire tools. Otherwise omit the slot completely. When active, read the asset-import
schema, query the local Catalog first, and pipe only the compatible raw receipt/role/candidate-bytes envelope to
`./.rsp/bin/rsp asset import --project <storyId>`. Provider data never enters child tasks, revisions, artifacts,
Delivery, or render runtime.

## Resolve, inspect, and prepare

Run `./.rsp/bin/rsp context --project <storyId>`, then `./.rsp/bin/rsp inspect --project <storyId>`. Add Delivery or
execution overrides only when chosen by the user/current Workspace settings. A generic delegate/thread/chat is not
a runtime-native child. If subagent execution is selected, require concrete child execution plus either a verified
`shared-workspace` or `controller-io` transport; pass it as `--worker-transport` with known capacity. Missing transport,
zero capacity, or an unsatisfied exact capacity is a blocker before preparation. Do not infer capability from branding.

Inspect is read-only, zero-provider, and zero-write. Report source readiness, estimated cost, artifact reuse, and
changed-input explanations before running the cost-bearing
`./.rsp/bin/rsp prepare --project <storyId> --delivery-policy <resolved-policy>` exactly once.

## Execute self-describing dirty tasks

Follow `controlPlane.execution`. Inline executes one dirty workspace at a time. Subagents use only runtime-native
children admitted by the resolved bounded pool. Only a real spawn/mount/controller-IO failure runs Root's exact
`spawnFailureCommand`; it does not fall back inline.

Before any task read or write, run that dirty task's exact bind command. Continue only on `task-worker-bound`; use
only its returned workspace capability and bound commands, never a guessed path. Bind validates Task/attempt identity,
`task.json`, `inputs/context.json`, and `inputs/task-contract.json`. Any bind/immutable-input failure means zero writes,
stop, and return the structured `fixed-controller` issue. The binding's exact `task describe` command returns the
same redacted contract when command discovery is preferable. The task contract is the authority for exact
output paths, JSON Schemas, component signatures, examples, constraints, and which fields are derived by rsp.

Every `scene-owner` Renderer must be authored from its own immutable Scene context. Never read, copy, adapt, or
reformat a Renderer from another Project or another meaningId. Fixed validation rejects historical normalized
Renderer fingerprints and same-Revision exact or normalized narrated Renderer duplicates; changing plan JSON does
not make copied TSX valid.

Write only outputs whose contract owner is `agent` or `agent-draft-rsp-finalize`; the latter is a draft that fixed
finalization replaces. Never write an `rsp-finalize`-only output. Then:

1. Run the returned exact bound `task finalize` command once. It canonicalizes authored JSON and computes fixed
   fingerprints/receipts; never guess or hand-author derived values.
2. Run exact bound `task check`. Every issue owned by `agent-output` is a repairable task issue: correct only declared
   outputs and rerun. Never classify a fixed validation issue as host failure.
3. Run exact bound commit. Use `taskFailureCommand` only for unrecoverable authored output;
   `fixedFailureCommand` records immutable/controller failure. Never cross-read/commit or trust chat as completion.

## Fixed continuation and Delivery

After all dirty tasks are executed or admitted to the bounded pool, the Root's final production action is the exact
attempt-bound `continue` command returned by prepare. Then suspend: do not poll, launch another continuation, edit a
workspace, or infer terminal state. A disconnected client does not cancel the Engine's one-shot claim. On a later,
explicit diagnostic/recovery request, `./.rsp/bin/rsp attempt status --project <storyId> --attempt <attemptId>` may
read the redacted durable attempt state; never use it as an active continuation poll loop.

A terminal failed attempt stays immutable. On a later explicit recovery action, run `attempt recover-inspect`, then
`attempt reissue`. Reissue requires the same current Revision and no active attempt, performs no provider calls,
needs no current Delivery, preserves valid drafts, and returns a fresh attempt/binding. It is not candidate revision.

`project-production-source-current` is a valid manual-policy terminal with no playable Delivery. An explicit manual
Delivery request may run `./.rsp/bin/rsp delivery build --project <storyId>`; automatic policy uses the same fixed
controller. Only a revalidated exact four-file Delivery—`video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and
`publish.json`—is playable. Never connect to, inspect, or reuse the temporary renderer listener.

Workspace manifests, managed files, session credentials/sockets, fixed state, artifacts, attempts, source-current,
and Delivery are controller authority. A missing/incompatible App session or valid-input fixed failure ends this
lifecycle. Do not retry, weaken validators, fabricate artifacts, publish, push, or use `git add .`.
