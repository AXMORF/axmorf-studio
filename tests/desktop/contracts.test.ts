import assert from "node:assert/strict";
import test from "node:test";

import {
  DoctorResponseSchema,
  EngineToMainMessageSchema,
  MainToEngineMessageSchema,
  RSP_CLI_FAILURES,
  RSP_PROTOCOL_VERSION,
  SessionRecordSchema,
} from "../../desktop/contracts/protocol";
import {
  buildPreviewVideoUrl,
  PreviewCatalogReadinessSchema,
  PreviewCatalogSchema,
  projectPreviewCatalogForPlayer,
} from "../../desktop/contracts/preview";
import {
  DESKTOP_PRELOAD_METHODS,
  DESKTOP_SHELL_IPC_CHANNELS,
} from "../../desktop/contracts/shell";
import {
  DESKTOP_MANAGED_FILE_PATHS,
  DESKTOP_WORKSPACE_DIRECTORIES,
  ManagedFilesLedgerSchema,
  WorkspaceManifestSchema,
} from "../../desktop/contracts/workspace";

const workspaceId = "26f9827f-2b31-46cc-ae3d-ab5b73f004bf";
const digest = `sha256:${"a".repeat(64)}`;
const revisionId = `revision-${"b".repeat(64)}`;
const deliveryBuildId = `delivery-${"c".repeat(64)}`;

const previewCatalog = () =>
  PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [
      {
        storyId: "story-one",
        revisionId,
        deliveryBuildId,
        compositionId: "StoryOne",
        title: "Story one",
        width: 1080,
        height: 1920,
        fps: 30,
        frameCount: 90,
        video: { checksum: digest, sizeBytes: 1024 },
        timeline: {
          durationInFrames: 90,
          leadInFrames: 10,
          tailFrames: 10,
          narrationStartFrame: 10,
          scenes: [
            {
              kind: "narrated-scene",
              meaningId: "opening",
              label: "Opening",
              startFrame: 10,
              endFrame: 50,
            },
            {
              kind: "narrated-scene",
              meaningId: "closing",
              label: "Closing",
              startFrame: 50,
              endFrame: 80,
            },
          ],
          narration: [
            {
              kind: "chunk",
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 10,
              endFrame: 40,
            },
            {
              kind: "pause",
              afterChunkId: "opening-one",
              meaningId: "opening",
              pauseMs: 333,
              startFrame: 40,
              endFrame: 50,
            },
            {
              kind: "chunk",
              chunkId: "closing-one",
              meaningId: "closing",
              text: "Closing",
              startFrame: 50,
              endFrame: 80,
            },
          ],
          captions: [
            {
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 10,
              endFrame: 40,
            },
            {
              chunkId: "closing-one",
              meaningId: "closing",
              text: "Closing",
              startFrame: 50,
              endFrame: 80,
            },
          ],
        },
      },
    ],
    unavailable: [{ storyId: "story-two", code: "delivery-missing" }],
  });

test("Workspace and managed integration schemas are strict and fixed", () => {
  assert.equal(DESKTOP_WORKSPACE_DIRECTORIES[0], "projects");
  assert.deepEqual(DESKTOP_MANAGED_FILE_PATHS, [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".agents/skills/remotion-story-producer-video/SKILL.md",
    ".rsp/hermes/INSTALL_PROMPT.md",
    ".rsp/bin/rsp",
    ".rsp/lib/rsp-client.cjs",
  ]);
  const manifest = WorkspaceManifestSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-workspace-v1",
    productId: "com.axmorf.studio",
    workspaceId,
    layoutVersion: 1,
    integrationVersion: 1,
    createdBy: "AXMORF Studio",
  });
  assert.equal(manifest.workspaceId, workspaceId);
  assert.throws(() =>
    WorkspaceManifestSchema.parse({ ...manifest, extra: true }),
  );
  assert.throws(() =>
    ManagedFilesLedgerSchema.parse({
      schemaVersion: 1,
      contractVersion: "desktop-managed-files-v1",
      integrationVersion: 1,
      workspaceId,
      state: "ready",
      files: [],
    }),
  );
});

test("Preview Catalog preserves canonical timing and contains no filesystem path", () => {
  const catalog = previewCatalog();
  assert.equal(catalog.entries[0]?.timeline.scenes.length, 2);
  assert.doesNotMatch(JSON.stringify(catalog), /repositoryPath|absolutePath/iu);
  assert.equal(
    buildPreviewVideoUrl(catalog.entries[0]!),
    `axmorf-media://delivery/story-one/${deliveryBuildId}/video.mp4`,
  );
  const player = projectPreviewCatalogForPlayer(catalog);
  assert.equal(
    player.entries[0]?.videoUrl,
    `axmorf-media://delivery/story-one/${deliveryBuildId}/video.mp4`,
  );
  assert.equal("video" in player.entries[0]!, false);
  assert.doesNotMatch(JSON.stringify(player), /checksum|sizeBytes/u);
  assert.throws(() =>
    PreviewCatalogSchema.parse({
      ...catalog,
      entries: [
        {
          ...catalog.entries[0],
          timeline: {
            ...catalog.entries[0]!.timeline,
            captions: [
              {
                ...catalog.entries[0]!.timeline.captions[0],
                text: "Drift",
              },
            ],
          },
        },
      ],
    }),
  );
});

test("rsp session and doctor contain no token and expose zero Desktop TCP listeners", () => {
  const session = SessionRecordSchema.parse({
    schemaVersion: 1,
    protocolVersion: RSP_PROTOCOL_VERSION,
    workspaceId,
    socketPath: "/tmp/workspace/.rsp/session/rsp.sock",
    appPid: 41,
    enginePid: 42,
    expiresAt: "2026-08-22T12:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(session), /token|secret/iu);
  const doctor = DoctorResponseSchema.parse({
    schemaVersion: 1,
    protocolVersion: RSP_PROTOCOL_VERSION,
    workspaceId,
    adapterMode: "repository",
    repositoryMode: "build-time-checkout",
    runtimePackMode: "host-node-prototype",
    previewCatalog: {
      state: "ready",
      entryCount: 1,
      unavailableCount: 1,
      failureCode: null,
    },
    desktopTcpListeners: false,
    productionAvailable: false,
    deliveryAvailable: false,
    distributionReady: false,
    runtimePackAvailable: false,
    activeWork: false,
    process: { appPid: 41, enginePid: 42 },
    session: { active: true, expiresAt: "2026-08-22T12:00:00.000Z" },
  });
  assert.equal(doctor.desktopTcpListeners, false);
  assert.equal(doctor.productionAvailable, false);
  assert.throws(() =>
    PreviewCatalogReadinessSchema.parse({
      state: "failed",
      entryCount: 1,
      unavailableCount: 0,
      failureCode: null,
    }),
  );
});

test("Main and Engine protocols reject service commands, unknown versions, and fields", () => {
  const initialize = {
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "request-1",
    type: "initialize",
    workspaceRoot: "/tmp/workspace",
    repositoryRoot: "/tmp/repository",
    appPid: 41,
    sessionExpiresAt: "2026-08-22T12:00:00.000Z",
  } as const;
  assert.equal(MainToEngineMessageSchema.parse(initialize).type, "initialize");
  assert.throws(() =>
    MainToEngineMessageSchema.parse({ ...initialize, type: "start-services" }),
  );
  assert.throws(() =>
    MainToEngineMessageSchema.parse({
      ...initialize,
      protocolVersion: "future",
    }),
  );
  assert.throws(() =>
    MainToEngineMessageSchema.parse({ ...initialize, token: "forbidden" }),
  );
  assert.equal(
    EngineToMainMessageSchema.parse({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: "request-1",
      type: "preview-catalog",
      catalog: previewCatalog(),
    }).type,
    "preview-catalog",
  );
});

test("CLI failures and preload surface are exact", () => {
  assert.deepEqual(RSP_CLI_FAILURES, {
    appUnavailable: { code: "rsp-app-unavailable", exitCode: 1 },
    protocolIncompatible: { code: "rsp-protocol-incompatible", exitCode: 2 },
    workspaceInvalid: { code: "rsp-workspace-invalid", exitCode: 3 },
    unauthorized: { code: "rsp-unauthorized", exitCode: 4 },
  });
  assert.deepEqual(DESKTOP_PRELOAD_METHODS, [
    "getAppState",
    "chooseInitialWorkspace",
    "showWorkspaceInFinder",
    "refreshPreviewCatalog",
    "selectPreview",
    "retryEngine",
  ]);
  assert.deepEqual(Object.values(DESKTOP_SHELL_IPC_CHANNELS), [
    "desktop:get-app-state",
    "desktop:choose-initial-workspace",
    "desktop:show-workspace-in-finder",
    "desktop:refresh-preview-catalog",
    "desktop:select-preview",
    "desktop:retry-engine",
  ]);
});
