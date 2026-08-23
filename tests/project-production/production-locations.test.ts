import assert from "node:assert/strict";
import test from "node:test";

import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
  resolveTaskLogicalOutput,
} from "../../scripts/project-production/application/production-locations";

test("repository and Workspace layouts map the same logical task outputs explicitly", () => {
  const repository = createRepositoryProductionLocations({
    repositoryRoot: "/repo",
  });
  const workspace = createWorkspaceProductionLocations({
    workspaceRoot: "/workspace",
    applicationSupportRoot: "/app-support",
    runtimeResources: "/app/Resources/runtime",
    cacheRoot: "/cache",
  });
  assert.equal(repository.layoutKind, "repository");
  assert.equal(workspace.layoutKind, "workspace");
  assert.equal(
    resolveTaskLogicalOutput({
      locations: repository,
      storyId: "story",
      logicalPath: "project/scenes/opening/Renderer.tsx",
    }),
    "/repo/src/projects/story/scenes/opening/Renderer.tsx",
  );
  assert.equal(
    resolveTaskLogicalOutput({
      locations: workspace,
      storyId: "story",
      logicalPath: "public/audio/complete.wav",
    }),
    "/workspace/media/story/audio/complete.wav",
  );
  assert.throws(() =>
    resolveTaskLogicalOutput({
      locations: workspace,
      storyId: "story",
      logicalPath: "public/../escape",
    }),
  );
});

test("locations are immutable and absolute", () => {
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: "/workspace",
    applicationSupportRoot: "/app-support",
    runtimeResources: "/app/Resources/runtime",
    cacheRoot: "/cache",
  });
  assert.equal(Object.isFrozen(locations), true);
  assert.throws(() =>
    createWorkspaceProductionLocations({
      workspaceRoot: "relative",
      applicationSupportRoot: "/app-support",
      runtimeResources: "/app/Resources/runtime",
      cacheRoot: "/cache",
    }),
  );
  assert.throws(
    () =>
      createWorkspaceProductionLocations({
        workspaceRoot: "/workspace",
        applicationSupportRoot: "/workspace/private",
        runtimeResources: "/app/Resources/runtime",
        cacheRoot: "/cache",
      }),
    /overlap/u,
  );
});
