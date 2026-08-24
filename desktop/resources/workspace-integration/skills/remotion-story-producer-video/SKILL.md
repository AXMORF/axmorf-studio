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
4. For a new Project, first run `./.rsp/bin/rsp schema project-create`. This is a stable, local, read-only surface:
   it does not require an active App session and returns the complete JSON Schema plus a valid example. Send the
   strict raw `ProjectCreateInput` JSON on stdin to `./.rsp/bin/rsp project create`. Never wrap it in `command`,
   `input`, `protocolVersion`, `requestId`, or `workspaceId`. Project creation is zero-provider and creates no media
   or production attempt. Unless the user explicitly chooses boundary templates, omit `sceneTemplates`; omission
   inherits the current encrypted ProducerConfig defaults, while explicit template IDs or `null` override them.
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

## ProjectCreateInput contract reference

`./.rsp/bin/rsp schema project-create` is the complete machine-readable contract bundled with this Skill. The raw
object is strict and requires exactly these top-level authored domains: `schemaVersion: 1`,
`contractVersion: "project-create-input-v1"`, `storyId`, `brief`, `story`, `visualStyle`, `resources`, `scenes`,
`globalVisual`, `render`, `publishing`, and `production`; only `sceneTemplates` is optional. Unknown fields fail.
The three Story IDs must match. `story.beats` contains narrated Scenes with globally unique `meaningId` and
`ttsChunks[].chunkId`; `scenes` must cover those beats in the same order. Resource and snapshot identity lists are
unique and sorted, every Scene resource selection comes from the Story pool, every Global Visual intent ID is
unique, and authored text must not contain credentials, private paths, endpoints, or diagnostics. `publishing`
chooses one configured collection. The returned JSON Schema defines every nested field, enum, bound, pattern, and
cross-field-independent constraint; `project create` adds the cross-field checks just listed and reports failures as
redacted `issues[]` with `path`, `code`, and `message`.

Valid raw stdin example (intentionally omits `sceneTemplates` so ProducerConfig defaults are inherited):

```json
{
  "schemaVersion": 1,
  "contractVersion": "project-create-input-v1",
  "storyId": "story-example",
  "brief": {
    "schemaVersion": 1,
    "storyId": "story-example",
    "title": "Measured audio keeps every frame stable",
    "sourceMaterial": "Explain why measured PCM prevents frame drift.",
    "sourceReferences": [],
    "audience": "Developers",
    "targetDurationSeconds": 10,
    "deliveryConstraints": ["Keep the explanation concise."]
  },
  "story": {
    "schemaVersion": 3,
    "storyId": "story-example",
    "title": "Measured audio keeps every frame stable",
    "beats": [
      {
        "kind": "narrated-scene",
        "meaningId": "opening",
        "narrativePurpose": "State the timing principle.",
        "ttsChunks": [
          {
            "chunkId": "opening-01",
            "ttsText": "Measured audio is the timing authority."
          }
        ],
        "explicitPauses": []
      }
    ]
  },
  "visualStyle": {
    "styleProfileId": "cinematic-3d",
    "artDirection": {
      "medium": "cinematic scientific visualization",
      "palette": "deep blue and warm highlights",
      "lighting": "high contrast orbital light",
      "texture": "clean technical surfaces",
      "compositionGrammar": "depth stage",
      "motionLanguage": "slow spatial reveal",
      "typography": "minimal technical editorial"
    },
    "continuityRules": ["Keep direction stable."],
    "forbiddenTreatments": ["No decorative HUD."]
  },
  "resources": {
    "allowedResourceIds": [],
    "allowedSnapshots": []
  },
  "scenes": [
    {
      "meaningId": "opening",
      "visualIntent": "Show measured audio becoming a stable timeline.",
      "compositionIntent": "Use one centered causal diagram.",
      "motionIntent": "Reveal samples before frames.",
      "soundIntent": "Narration only.",
      "continuityBrief": "Keep the sample axis stable.",
      "candidateResourceIds": [],
      "allowedSnapshotCards": []
    }
  ],
  "globalVisual": {
    "visualIntent": [
      {
        "intentId": "background-depth",
        "description": "Use a restrained dark depth field.",
        "appliesTo": "full-composition"
      }
    ]
  },
  "render": {
    "compositionId": "StoryExample",
    "leadInFrames": 15,
    "tailFrames": 12,
    "audioChannels": 2
  },
  "publishing": {
    "description": "A concise explanation of deterministic audio timing.",
    "topics": ["audio", "timing", "frames", "remotion", "pcm", "workflow"],
    "collectionId": "default",
    "chapters": [{ "meaningId": "opening", "name": "时序权威" }]
  },
  "production": {
    "enhancementSelection": {
      "storyVisual": "required",
      "sound": "allowed",
      "globalVisual": "required"
    },
    "resourcePolicy": {
      "selfAuthoredVisualsAllowed": true,
      "unlistedThirdPartyResources": "deny"
    },
    "additionalRequirements": []
  }
}
```
