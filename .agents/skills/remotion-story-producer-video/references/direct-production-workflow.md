# Direct production workflow

Agents choose creative direction; fixed scripts snapshot, validate, commit, materialize, and build.

## 1. Create or edit Project inputs

Author one strict repository-relative input. Omit `sceneTemplates` to inherit ProducerConfig; user silence must
never become `null`. Report inherited, explicit, or disabled:

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

Creation is atomic. Silent beats have no TTS/captions; narrated beats keep `ttsChunks`.

## 2. Load the optional external-asset MCP slot

Before inspect, activate this Root-owned slot only when the current Agent can call one MCP's
`get_provider_status`, `search_images`, `preview_images`, and `acquire_image`, with an import-compatible receipt.

When active, query local Catalog first; if imagery is missing, search, preview, acquire, then admit it:

```bash
npm run project:asset:import -- --project <storyId> --receipt <absolute-receipt-path> --asset <assetId>
```

If the MCP is absent, omit this entire stage without error, placeholder task, prompt, estimate, or DAG node.
Children never receive it. Receipts/candidates stay at the adapter; only Project-owned manifest IDs and
fingerprints proceed.

## 3. Inspect read-only, then prepare explicitly

```bash
npm run project:produce:inspect -- --project <storyId>
```

Inspect is read-only. Report readiness, cost/reuse, and invalidation before running:

```bash
npm run project:produce:prepare -- --project <storyId>
```

Prepare derives ProductionRevision/Task DAG and returns cost/explanations/`dirtyAgentTasks`. Diagnostics never own
identity; attempt IDs never enter TaskRevision.

Reuse valid artifacts. Dispatch only dirty `scene-owner`, `global-visual-owner`, and `cover-owner`, not
`scene-template`.

## 4. Delegate dirty Agent tasks

Use one runtime-native child per TaskRevision; it writes only:

```text
.producer-work/<storyId>/<taskRevision>/
```

It reads `task.json` and `inputs/context.json`, corrects its output, then runs:

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>
npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task|host
```

Commit revalidates and atomically promotes ArtifactAttestation; chat is not authority.

## 5. Suspend Root in the fixed continuation

After dispatch, Root launches prepare's exact `continuationCommand`:

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

It claims once while Root suspends, watches immutable events, and rejects duplicates. Failure exits without
convergence; all success converges once; six-hour absence times out. No repair, retry, or Root re-entry.

Convergence read-only replans, materializes attested bytes with rollback, and builds
`video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`. Promotion requires checksum/media/EOF-decode; a
matching delivery returns `project-production-current` without rewrite.

Run `npm run compositions` and `npm run check` with host permissions first. Sandbox failures cannot prove VoxCPM
unavailable or justify weakening Chromium sandbox.
