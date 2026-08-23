---
name: remotion-story-producer-video
description: Produce and deliver videos through the authenticated AXMORF Studio Workspace rsp v2 surface.
---

# AXMORF Studio Workspace production

Use only `./.rsp/bin/rsp`. It is the self-contained client installed from the verified embedded Runtime Pack.
Never call repository npm scripts, host Node/npm/Git, Remotion Studio, a Settings server, or another executable as
a fallback.

1. Work from the Workspace root containing `.rsp/workspace.json`.
2. Run `./.rsp/bin/rsp doctor`.
3. Require `protocolVersion: "rsp-local-v2"`, `adapterMode: "workspace"`, `runtimePackMode: "embedded"`,
   `network.controlPlane: "authenticated-unix-domain-socket-only"`, `network.persistentTcpListeners: false`,
   `network.deliveryBuildListener.host: "127.0.0.1"`, `productionAvailable: true`, `deliveryAvailable: true`,
   `deliveryBlocker: null`, and `runtimePackAvailable: true`. The temporary loopback HTTP listener is renderer data
   plane scoped to one DeliveryBuild; it is not a command, Settings, Studio, or credential endpoint. If a required
   capability is unavailable, report the structured failure exactly; do not retry or downgrade.
4. For a new Project, send the strict create request on stdin to `./.rsp/bin/rsp project create`. Project creation
   is zero-provider and creates no media or production attempt.
5. Before inspect, use an external image acquisition slot only if the current Root Agent itself exposes the same
   compatible provider status/search/preview/acquire tools. Import with
   `./.rsp/bin/rsp asset import --project <storyId>`; bind the Project only through `--project`, and send only the
   strict compatible raw provider receipt, role, and candidate bytes envelope on stdin. Otherwise omit the slot
   completely.
6. Run `./.rsp/bin/rsp context --project <storyId>`, then
   `./.rsp/bin/rsp inspect --project <storyId>`. If the user's current prompt explicitly selects a Delivery policy,
   add `--delivery-policy manual|automatic` to `context`; otherwise do not invent an override. Treat
   `controlPlane.deliveryPolicy` as the resolved command > Project setting > App-default authority, and read only
   the redacted `controlPlane.provider` readiness/config summary. Inspect is read-only, zero-provider, and
   zero-write. Report source readiness, estimated cost, reuse, and changed-input explanations before preparation.
7. Run `./.rsp/bin/rsp prepare --project <storyId> --delivery-policy <resolved-policy>` once. Preparation is the
   only cost-bearing entry and returns an exact attempt plus dirty task workspaces and attempt-bound commands.
8. Follow `controlPlane.execution`. With no saved Workspace setting it resolves to `inline`; execute one dirty
   workspace at a time. Use bounded runtime-native children only when it resolves to `subagents`, reports `ready`,
   and runtime capacity is available. Do not infer a mode from host branding or silently change a blocked result.
   Each executor reads
   only its immutable task/context inputs, writes only its own workspace, loops `rsp task check`, then calls the
   returned exact `rsp task commit` or `rsp task fail` command. Never cross-commit or edit fixed state.
9. After all dirty tasks are executed or accepted by the bounded pool, run the returned exact
   `./.rsp/bin/rsp continue --project <storyId> --revision <revisionId> --attempt <attemptId>` command as the final
   production action. Do not poll or launch another continuation. A disconnected client does not cancel the
   Engine's one-shot claim.
10. Treat `project-production-source-current` as a valid manual-policy terminal with no playable Delivery. An explicit
    Delivery request may run `./.rsp/bin/rsp delivery build --project <storyId>`; automatic policy continues through
    the same fixed controller to a revalidated current four-file Delivery. Never connect to, inspect, or reuse the
    temporary renderer listener.

The manifest, managed files, launcher, task workspaces, session records, tokens, sockets, artifacts, attempts,
source-current and Delivery are fixed-controller authority. Do not modify them outside the exact task workspace.
A missing or incompatible App session is a structured blocker, not permission to start a background engine,
probe a checkout, use a legacy protocol, or create a second authority.
