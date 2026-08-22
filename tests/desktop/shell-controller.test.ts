import assert from "node:assert/strict";
import test from "node:test";

import { PreviewCatalogSchema } from "../../desktop/contracts/preview";
import {
  DesktopShellController,
  type DesktopEngineSnapshot,
  type DesktopWorkspacePort,
} from "../../desktop/main/shell-controller";

const digest = `sha256:${"a".repeat(64)}`;
const revisionId = `revision-${"b".repeat(64)}`;
const deliveryBuildId = `delivery-${"c".repeat(64)}`;

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
  activeWork: false,
});

const createHarness = (selectedRoot: string | null) => {
  const calls: string[] = [];
  let currentSnapshot = snapshot();
  const workspace: DesktopWorkspacePort = {
    loadSelectedRoot: async () => selectedRoot,
    chooseInitialRoot: async (defaultRoot) => {
      calls.push(`choose:${defaultRoot}`);
      return "/tmp/AXMORF Studio";
    },
    initializeInitialRoot: async (root) => {
      calls.push(`initialize:${root}`);
      return root;
    },
    showInFileManager: async (root) => {
      calls.push(`reveal:${root}`);
    },
  };
  const controller = new DesktopShellController({
    defaultWorkspaceRoot: "/Users/test/Movies/AXMORF Studio",
    workspace,
    engine: {
      start: async (root) => {
        calls.push(`engine-start:${root}`);
        return currentSnapshot;
      },
      refreshPreviewCatalog: async () => {
        calls.push("engine-refresh");
        return currentSnapshot;
      },
      stop: async () => {
        calls.push("engine-stop");
      },
    },
    media: {
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
  };
};

test("first run waits for explicit Workspace confirmation before Engine start", async () => {
  const { controller, calls } = createHarness(null);
  const initial = await controller.bootstrap();
  assert.equal(initial.status, "workspace-selection-required");
  assert.equal(initial.workspaceRoot, null);
  assert.deepEqual(calls, []);

  const ready = await controller.chooseInitialWorkspace();
  assert.equal(ready.status, "ready");
  assert.equal(ready.workspaceRoot, "/tmp/AXMORF Studio");
  assert.equal(ready.selectedStoryId, "story-one");
  assert.deepEqual(calls, [
    "choose:/Users/test/Movies/AXMORF Studio",
    "initialize:/tmp/AXMORF Studio",
    "engine-start:/tmp/AXMORF Studio",
    "media:story-one",
  ]);
});

test("saved Workspace starts Engine and exposes exact Phase A capabilities", async () => {
  const { controller, calls } = createHarness("/tmp/saved-workspace");
  const ready = await controller.bootstrap();
  assert.equal(ready.adapterMode, "repository");
  assert.equal(ready.repositoryMode, "build-time-checkout");
  assert.equal(ready.runtimePackMode, "host-node-prototype");
  assert.equal(ready.productionAvailable, false);
  assert.equal(ready.deliveryAvailable, false);
  assert.equal(ready.distributionReady, false);
  assert.equal(ready.runtimePackAvailable, false);
  assert.equal(calls.includes("initialize:/tmp/saved-workspace"), false);
  await controller.bootstrap();
  assert.equal(
    calls.filter((call) => call === "engine-start:/tmp/saved-workspace").length,
    1,
  );

  await controller.showWorkspaceInFinder();
  assert.equal(calls.at(-1), "reveal:/tmp/saved-workspace");
});

test("refresh preserves a playable selection and otherwise selects the first entry", async () => {
  const { controller, calls, setSnapshot } = createHarness("/tmp/workspace");
  await controller.bootstrap();
  await controller.selectPreview("story-one");
  assert.equal(
    (await controller.refreshPreviewCatalog()).selectedStoryId,
    "story-one",
  );

  setSnapshot(snapshot("story-two"));
  const refreshed = await controller.refreshPreviewCatalog();
  assert.equal(refreshed.selectedStoryId, "story-two");
  assert.deepEqual(calls.slice(-2), ["engine-refresh", "media:story-two"]);
  await assert.rejects(() => controller.selectPreview("story-one"));
});

test("Catalog refresh failure clears stale media tickets without killing Engine", async () => {
  const { controller, calls } = createHarness("/tmp/workspace");
  await controller.bootstrap();
  // The media port is exercised through a second harness whose Engine fails.
  const failingCalls: string[] = [];
  const failed = new DesktopShellController({
    defaultWorkspaceRoot: "/tmp/default",
    workspace: {
      loadSelectedRoot: async () => "/tmp/workspace",
      chooseInitialRoot: async () => null,
      initializeInitialRoot: async (root) => root,
      showInFileManager: async () => undefined,
    },
    engine: {
      start: async () => snapshot(),
      refreshPreviewCatalog: async () => {
        throw new Error("refresh failed");
      },
      stop: async () => undefined,
    },
    media: {
      replaceCatalog: async (next) => {
        failingCalls.push(`media:${next.entries.length}`);
      },
      close: async () => undefined,
    },
  });
  await failed.bootstrap();
  const state = await failed.refreshPreviewCatalog();
  assert.equal(state.status, "ready");
  assert.equal(state.previewCatalog.state, "failed");
  assert.equal(state.selectedStoryId, null);
  assert.deepEqual(failingCalls, ["media:1", "media:0"]);
  assert.equal(calls.includes("engine-stop"), false);
});

test("fatal Engine can retry once and shutdown orders Engine before media", async () => {
  let attempts = 0;
  const calls: string[] = [];
  const controller = new DesktopShellController({
    defaultWorkspaceRoot: "/tmp/default",
    workspace: {
      loadSelectedRoot: async () => "/tmp/workspace",
      chooseInitialRoot: async () => null,
      initializeInitialRoot: async (root) => root,
      showInFileManager: async () => undefined,
    },
    engine: {
      start: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("engine-start-failed");
        return snapshot();
      },
      refreshPreviewCatalog: async () => snapshot(),
      stop: async () => {
        calls.push("engine-stop");
      },
    },
    media: {
      replaceCatalog: async () => undefined,
      close: async () => {
        calls.push("media-close");
      },
    },
  });
  assert.equal((await controller.bootstrap()).status, "fatal");
  assert.equal((await controller.retryEngine()).status, "ready");
  await controller.shutdown();
  assert.deepEqual(calls.slice(-2), ["engine-stop", "media-close"]);
});
