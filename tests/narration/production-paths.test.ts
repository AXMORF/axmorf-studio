import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  resolveNarrationMediaLogicalPath,
  resolveNarrationProjectRoot,
} from "../../scripts/narration/production-paths";
import { getNarrationProjectPaths } from "../../scripts/narration/project-files";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import { createExecutableProcessRunner } from "../../scripts/narration/adapters/ffmpeg-normalizer";

test("narration source and media resolve through explicit Workspace ownership roots", () => {
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: "/workspace",
    applicationSupportRoot: "/support",
    runtimeResources: "/app/resources/runtime-pack",
    cacheRoot: "/cache",
  });
  const paths = getNarrationProjectPaths({
    locations,
    projectId: "story-example",
  });

  assert.equal(paths.projectDirectory, "/workspace/projects/story-example");
  assert.equal(
    resolveNarrationProjectRoot({ locations, storyId: "story-example" }),
    "/workspace/projects/story-example",
  );
  assert.equal(
    resolveNarrationMediaLogicalPath({
      locations,
      storyId: "story-example",
      logicalPath: "public/projects/story-example/narration/abc/complete.wav",
    }),
    "/workspace/media/story-example/narration/abc/complete.wav",
  );
  assert.throws(
    () =>
      resolveNarrationMediaLogicalPath({
        locations,
        storyId: "story-example",
        logicalPath: "public/projects/other-story/narration/complete.wav",
      }),
    /outside the Project media root/iu,
  );
  assert.throws(
    () =>
      resolveNarrationMediaLogicalPath({
        locations,
        storyId: "story-example",
        logicalPath: "public/projects/story-example/narration\\escaped.wav",
      }),
    /outside the Project media root/iu,
  );
});

test("repository adapter maps the same narration logical paths without path probing", () => {
  const locations = createRepositoryProductionLocations({
    repositoryRoot: "/repository",
  });
  assert.equal(
    resolveNarrationMediaLogicalPath({
      locations,
      storyId: "story-example",
      logicalPath: "public/projects/story-example/narration/complete.wav",
    }),
    join("/repository/public/projects/story-example", "narration/complete.wav"),
  );
});

test("embedded narration media execution binds one absolute executable", async () => {
  assert.throws(
    () => createExecutableProcessRunner("ffmpeg"),
    /must be absolute/iu,
  );
  const run = createExecutableProcessRunner(process.execPath);
  const result = await run("ignored-path-command", [
    "-e",
    "process.stdout.write('embedded')",
  ]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "embedded");
});
