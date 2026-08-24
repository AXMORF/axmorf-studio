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
   `./.rsp/bin/rsp schema project-create` and `./.rsp/bin/rsp schema asset-import`; these commands do not require an
   active App session. Do not infer unsupported commands or fields.

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

## Optional external image acquisition

Before inspect, use an external image slot only when the current Root Agent itself exposes one compatible provider's
status, search, preview, and acquire tools. Otherwise omit the slot completely. When active, read the asset-import
schema, query the local Catalog first, and pipe only the compatible raw receipt/role/candidate-bytes envelope to
`./.rsp/bin/rsp asset import --project <storyId>`. Provider data never enters child tasks, revisions, artifacts,
Delivery, or render runtime.

## Resolve, inspect, and prepare

Run `./.rsp/bin/rsp context --project <storyId>`, then `./.rsp/bin/rsp inspect --project <storyId>`. Add Delivery or
execution overrides only when chosen by the user/current Workspace settings. If subagent execution is selected and
the host exposes a concrete runtime capacity, pass it as `--runtime-max-concurrency <n>`; zero or an unsatisfied exact
capacity is a blocker before preparation. Do not infer child capability from host branding.

Inspect is read-only, zero-provider, and zero-write. Report source readiness, estimated cost, artifact reuse, and
changed-input explanations before running the cost-bearing
`./.rsp/bin/rsp prepare --project <storyId> --delivery-policy <resolved-policy>` exactly once.

## Execute self-describing dirty tasks

Follow `controlPlane.execution`. Inline executes one dirty workspace at a time. Subagents use only runtime-native
children admitted by the resolved bounded pool; a spawn failure runs that task's exact `hostFailureCommand` and does
not fall back inline.

Each executor is bound to one TaskRevision and may read only its `task.json`, `inputs/context.json`, and
`inputs/task-contract.json`. `./.rsp/bin/rsp task describe --task <taskRevision>` returns the same redacted task
contract when discovery through the command surface is preferable. The task contract is the authority for exact
output paths, JSON Schemas, component signatures, examples, constraints, and which fields are derived by rsp.

Write only outputs whose contract owner is `agent` or `agent-draft-rsp-finalize`; the latter is a draft that fixed
finalization replaces. Never write an `rsp-finalize`-only output. Then:

1. Run the returned exact `task finalize` command once. It canonicalizes authored JSON and computes fixed
   fingerprints/receipts; never guess or hand-author derived values.
2. Run the exact `task check` command. Correct only the owning workspace using structured `issues[]`, then rerun
   finalize/check as directed until valid.
3. Run the exact attempt-bound `task commit` command, or the exact `task fail`/`hostFailureCommand` when execution
   cannot complete. Never cross-read, cross-commit, edit fixed state, or treat chat/child status as completion.

## Fixed continuation and Delivery

After all dirty tasks are executed or admitted to the bounded pool, the Root's final production action is the exact
attempt-bound `continue` command returned by prepare. Then suspend: do not poll, launch another continuation, edit a
workspace, or infer terminal state. A disconnected client does not cancel the Engine's one-shot claim. On a later,
explicit diagnostic/recovery request, `./.rsp/bin/rsp attempt status --project <storyId> --attempt <attemptId>` may
read the redacted durable attempt state; never use it as an active continuation poll loop.

`project-production-source-current` is a valid manual-policy terminal with no playable Delivery. An explicit manual
Delivery request may run `./.rsp/bin/rsp delivery build --project <storyId>`; automatic policy uses the same fixed
controller. Only a revalidated exact four-file Delivery—`video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and
`publish.json`—is playable. Never connect to, inspect, or reuse the temporary renderer listener.

Workspace manifests, managed files, session credentials/sockets, fixed state, artifacts, attempts, source-current,
and Delivery are controller authority. A missing/incompatible App session or valid-input fixed failure ends this
lifecycle. Do not retry, weaken validators, fabricate artifacts, publish, push, or use `git add .`.
