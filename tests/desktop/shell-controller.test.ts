import assert from "node:assert/strict";
import test from "node:test";

import { PreviewCatalogSchema } from "../../desktop/contracts/preview";
import { createDesktopSettingsSnapshot } from "../../desktop/application/manage-settings";
import {
  DesktopSettingsEngineRestartError,
  DesktopShellController,
  type DesktopEngineSnapshot,
  type DesktopWorkspacePort,
} from "../../desktop/main/shell-controller";

const digest = `sha256:${"a".repeat(64)}`;
const revisionId = `revision-${"b".repeat(64)}`;
const deliveryBuildId = `delivery-${"c".repeat(64)}`;
const runtimePack = {
  runtimePackId: `runtime-pack-${"d".repeat(64)}`,
  architecture: "arm64" as const,
};
const settingsSnapshot = createDesktopSettingsSnapshot({ privateConfig: null });
const settingsSaveRequest = {
  schemaVersion: 1,
  config: settingsSnapshot.config,
  executionPreferences: settingsSnapshot.executionPreferences,
  deliveryPolicy: settingsSnapshot.deliveryPolicy,
  clearedSecrets: [],
} as const;

const catalog = (storyId = "story-one") =>
  PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [
      {
        storyId,
        revisionId,
        deliveryBuildId,
        compositionId: "StoryOne",
        title: "Story one",
        width: 1080,
        height: 1920,
        fps: 30,
        frameCount: 60,
        video: { checksum: digest, sizeBytes: 1024 },
        timeline: {
          durationInFrames: 60,
          leadInFrames: 0,
          tailFrames: 0,
          narrationStartFrame: 0,
          scenes: [
            {
              kind: "narrated-scene",
              meaningId: "opening",
              label: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
          narration: [
            {
              kind: "chunk",
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
          captions: [
            {
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
        },
      },
    ],
    unavailable: [],
  });

const snapshot = (storyId = "story-one"): DesktopEngineSnapshot => ({
  catalog: catalog(storyId),
  previewCatalog: {
    state: "ready",
    entryCount: 1,
    unavailableCount: 0,
    failureCode: null,
  },
  projects: [
    {
      storyId: storyId as never,
      title: "Story one",
      source: "current",
      delivery: "current",
      invalidation: [],
    },
  ],
  productionProgress: [],
  activeWork: null,
  runtimePack,
  agentIntegration: "ready",
  provider: "unknown",
  deliveryAvailable: true,
  deliveryBlocker: null,
});

const manualSnapshot = (): DesktopEngineSnapshot => ({
  catalog: PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [],
    unavailable: [{ storyId: "story-one", code: "delivery-missing" }],
  }),
  previewCatalog: {
    state: "ready",
    entryCount: 0,
    unavailableCount: 1,
    failureCode: null,
  },
  projects: [
    {
      storyId: "story-one" as never,
      title: "Story one",
      source: "current",
      delivery: "missing",
      invalidation: [
        {
          code: "delivery-missing",
          cause: "Source is current, but no Delivery has been built.",
        },
      ],
    },
  ],
  productionProgress: [],
  activeWork: null,
  runtimePack,
  agentIntegration: "ready",
  provider: "not-configured",
  deliveryAvailable: true,
  deliveryBlocker: null,
});

const createHarness = (selectedRoot: string | null) => {
  const calls: string[] = [];
  let currentSnapshot = snapshot();
  const failedEngineRoots = new Set<string>();
  let listener: ((snapshot: DesktopEngineSnapshot) => void) | undefined;
  const workspace: DesktopWorkspacePort = {
    loadSelectedRoot: async () => selectedRoot,
    chooseInitialRoot: async (defaultRoot) => {
      calls.push(`choose:${defaultRoot}`);
      return "/tmp/AXMORF Studio";
    },
    persistInitialRoot: async (root) => {
      calls.push(`persist:${root}`);
      return root;
    },
    chooseMigrationTarget: async (root) => {
      calls.push(`migration-choose:${root}`);
      return "/tmp/moved-workspace";
    },
    migrateRoot: async (source, target) => {
      calls.push(`migration-copy:${source}:${target}`);
      return {
        workspaceRoot: target,
        complete: async () => {
          calls.push("migration-complete");
        },
        rollback: async () => {
          calls.push("migration-rollback");
        },
      };
    },
    showInFileManager: async (root) => {
      calls.push(`reveal:${root}`);
    },
  };
  const controller = new DesktopShellController({
    defaultWorkspaceRoot: "/Users/test/Movies/AXMORF Studio",
    workspace,
    settings: {
      get: async () => settingsSnapshot,
      save: async () => {
        calls.push("settings-save");
        return { ...settingsSnapshot, status: "ready" };
      },
    },
    engine: {
      start: async (root) => {
        calls.push(`engine-start:${root}`);
        if (failedEngineRoots.delete(root)) {
          throw new Error(`engine failed:${root}`);
        }
        return currentSnapshot;
      },
      refreshPreviewCatalog: async () => {
        calls.push("engine-refresh");
        return currentSnapshot;
      },
      buildDelivery: async (storyId) => {
        calls.push(`engine-delivery:${storyId}`);
        currentSnapshot = snapshot(storyId);
        return currentSnapshot;
      },
      deleteProject: async (storyId) => {
        calls.push(`engine-delete:${storyId}`);
        currentSnapshot = {
          ...manualSnapshot(),
          projects: [],
          catalog: PreviewCatalogSchema.parse({
            schemaVersion: 1,
            contractVersion: "desktop-preview-catalog-v1",
            entries: [],
            unavailable: [],
          }),
          previewCatalog: {
            state: "ready",
            entryCount: 0,
            unavailableCount: 0,
            failureCode: null,
          },
        };
        return currentSnapshot;
      },
      subscribe: (next) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
      stop: async () => {
        calls.push("engine-stop");
      },
    },
    media: {
      selectWorkspace: async (root) => {
        calls.push(`media-workspace:${root}`);
      },
      replaceCatalog: async (next) => {
        calls.push(
          `media:${next.entries.map(({ storyId }) => storyId).join(",")}`,
        );
      },
      close: async () => {
        calls.push("media-close");
      },
    },
  });
  return {
    controller,
    calls,
    setSnapshot: (next: DesktopEngineSnapshot) => {
      currentSnapshot = next;
    },
    failNextEngineStart: (root: string) => {
      failedEngineRoots.add(root);
    },
    publishSnapshot: async (next: DesktopEngineSnapshot) => {
      currentSnapshot = next;
      listener?.(next);
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
};

test("first run persists one Workspace only after Engine initialization", async () => {
  const { controller, calls } = createHarness(null);
  assert.equal((await controller.bootstrap()).workspaceRoot, null);
  const ready = await controller.chooseInitialWorkspace();
  assert.equal(ready.status, "ready");
  assert.equal(ready.phase, "B");
  assert.equal(ready.adapterMode, "workspace");
  assert.equal(ready.runtimePackMode, "embedded");
  assert.equal(ready.runtimePack?.runtimePackId, runtimePack.runtimePackId);
  assert.deepEqual(calls.slice(0, 5), [
    "choose:/Users/test/Movies/AXMORF Studio",
    "media-workspace:/tmp/AXMORF Studio",
    "engine-start:/tmp/AXMORF Studio",
    "persist:/tmp/AXMORF Studio",
    "media:story-one",
  ]);
});

test("first run does not persist a Workspace when Engine initialization fails", async () => {
  const harness = createHarness(null);
  harness.failNextEngineStart("/tmp/AXMORF Studio");
  const failed = await harness.controller.chooseInitialWorkspace();
  assert.equal(failed.status, "fatal");
  assert.equal(
    harness.calls.includes("persist:/tmp/AXMORF Studio"),
    false,
  );
});

test("manual source-current is selectable and Delivery is an explicit action", async () => {
  const harness = createHarness("/tmp/workspace");
  harness.setSnapshot(manualSnapshot());
  const ready = await harness.controller.bootstrap();
  assert.equal(ready.selectedStoryId, "story-one");
  assert.equal(ready.catalog.entries.length, 0);
  assert.equal(ready.projects[0]?.source, "current");
  assert.equal(ready.projects[0]?.delivery, "missing");

  const delivered = await harness.controller.buildDelivery("story-one");
  assert.equal(delivered.projects[0]?.delivery, "current");
  assert.equal(delivered.catalog.entries[0]?.storyId, "story-one");
  assert.equal(harness.calls.includes("engine-delivery:story-one"), true);
});

test("Project deletion removes the selected Project and clears its media identity", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  const deleted = await harness.controller.deleteProject("story-one");
  assert.deepEqual(deleted.projects, []);
  assert.equal(deleted.selectedStoryId, null);
  assert.equal(deleted.catalog.entries.length, 0);
  assert.deepEqual(harness.calls.slice(-2), [
    "engine-delete:story-one",
    "media:",
  ]);
});

test("Delivery action rejects an explicitly unavailable runtime", async () => {
  const harness = createHarness("/tmp/workspace");
  harness.setSnapshot({
    ...manualSnapshot(),
    deliveryAvailable: false,
    deliveryBlocker: {
      code: "desktop-delivery-runtime-unavailable",
      message: "Embedded Delivery runtime is unavailable.",
    },
  });
  await harness.controller.bootstrap();
  await assert.rejects(
    () => harness.controller.buildDelivery("story-one"),
    /desktop-delivery-build-denied/u,
  );
  assert.equal(harness.calls.includes("engine-delivery:story-one"), false);
});

test("Engine terminal events automatically refresh media and preserve target", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  await harness.publishSnapshot(snapshot("story-two"));
  const state = harness.controller.getState();
  assert.equal(state.selectedStoryId, "story-two");
  assert.equal(harness.calls.at(-1), "media:story-two");
});

test("progress-only Engine snapshots preserve current media tickets", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  await harness.publishSnapshot(snapshot());
  assert.equal(
    harness.calls.filter((call) => call === "media:story-one").length,
    1,
  );
});

test("saving structured Desktop Settings restarts and rebinds Engine", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  harness.setSnapshot({ ...manualSnapshot(), provider: "ready" });
  await harness.controller.saveSettings(settingsSaveRequest);
  const state = harness.controller.getState();
  assert.equal(state.health.provider, "ready");
  assert.deepEqual(
    harness.calls.filter((call) =>
      ["settings-save", "engine-stop", "engine-start:/tmp/workspace"].includes(
        call,
      ),
    ),
    [
      "engine-start:/tmp/workspace",
      "settings-save",
      "engine-stop",
      "engine-start:/tmp/workspace",
    ],
  );
});

test("saved Desktop Settings keep a structured restart failure and fatal Engine state", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  harness.failNextEngineStart("/tmp/workspace");
  await assert.rejects(
    () => harness.controller.saveSettings(settingsSaveRequest),
    DesktopSettingsEngineRestartError,
  );
  const state = harness.controller.getState();
  assert.equal(state.status, "fatal");
  assert.equal(state.health.runtime, "unavailable");
  assert.equal(harness.calls.includes("settings-save"), true);
  assert.deepEqual(harness.calls.slice(-4), [
    "settings-save",
    "engine-stop",
    "media:",
    "engine-start:/tmp/workspace",
  ]);
});

test("active work blocks Delivery and shutdown orders Engine before media", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  await harness.publishSnapshot({
    ...manualSnapshot(),
    activeWork: {
      storyId: "story-one" as never,
      kind: "production",
      attemptId: "11111111-1111-4111-8111-111111111111",
      phase: "awaiting-task-terminals",
    },
  });
  await assert.rejects(
    () => harness.controller.buildDelivery("story-one"),
    /desktop-delivery-build-denied/u,
  );
  await assert.rejects(
    () => harness.controller.deleteProject("story-one"),
    /desktop-project-delete-denied/u,
  );
  await harness.controller.shutdown();
  assert.deepEqual(harness.calls.slice(-2), ["engine-stop", "media-close"]);
});

test("preparing production blocks Desktop Settings restart", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  const publishing = harness.publishSnapshot({
    ...manualSnapshot(),
    activeWork: {
      storyId: "story-one" as never,
      kind: "production",
      attemptId: null,
      phase: "preparing-production",
    },
  });
  assert.equal(
    harness.controller.getState().activeWork?.phase,
    "preparing-production",
  );
  await assert.rejects(
    () => harness.controller.saveSettings(settingsSaveRequest),
    /desktop-settings-active-work/u,
  );
  await publishing;
  assert.equal(harness.calls.includes("settings-save"), false);
  assert.equal(harness.calls.slice(1).includes("engine-stop"), false);
});

test("Workspace migration stops Engine, rebinds the target, then completes", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  const migrationStart = harness.calls.length;
  const migrated = await harness.controller.migrateWorkspace();
  assert.equal(migrated.status, "ready");
  assert.equal(migrated.workspaceRoot, "/tmp/moved-workspace");
  assert.deepEqual(harness.calls.slice(migrationStart), [
    "migration-choose:/tmp/workspace",
    "engine-stop",
    "media:",
    "migration-copy:/tmp/workspace:/tmp/moved-workspace",
    "media-workspace:/tmp/moved-workspace",
    "engine-start:/tmp/moved-workspace",
    "media:story-one",
    "migration-complete",
  ]);
  assert.equal(harness.calls.at(-1), "migration-complete");
});

test("Workspace migration rolls back and restarts the old root when target Engine fails", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  harness.failNextEngineStart("/tmp/moved-workspace");
  const restored = await harness.controller.migrateWorkspace();
  assert.equal(restored.status, "ready");
  assert.equal(restored.workspaceRoot, "/tmp/workspace");
  assert.match(restored.error ?? "", /迁移已回滚/u);
  assert.equal(harness.calls.includes("migration-rollback"), true);
  assert.equal(harness.calls.at(-2), "engine-start:/tmp/workspace");
  assert.equal(harness.calls.at(-1), "media:story-one");
});

test("active work blocks Workspace migration before opening the directory dialog", async () => {
  const harness = createHarness("/tmp/workspace");
  await harness.controller.bootstrap();
  await harness.publishSnapshot({
    ...manualSnapshot(),
    activeWork: {
      storyId: "story-one" as never,
      kind: "delivery",
      attemptId: null,
      phase: "building-delivery",
    },
  });
  await assert.rejects(
    () => harness.controller.migrateWorkspace(),
    /desktop-workspace-migration-denied/u,
  );
  assert.equal(
    harness.calls.some((call) => call.startsWith("migration-choose:")),
    false,
  );
});
