import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { captureProductionInspectionSnapshot } from "../../scripts/project-production/adapters/production-inspection";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import { createWorkspaceProjectStorageLocations } from "../../scripts/projects/project-locations";
import { createRepositoryProjectStorageFromProductionLocations } from "../../scripts/projects/repository-project-locations";

test("production snapshot reader does not mutate any production plane", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-inspection-read-only-"));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const { catalogProjectionPath } =
    createRepositoryProjectStorageFromProductionLocations(locations);
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const paths = [
    "src/projects/story-example/story.json",
    "public/projects/story-example/media.bin",
    ".producer-work/story-example/narration/progress.json",
    ".producer-artifacts/story-example/scene-owner/value.bin",
    ".producer-work/story-example/task/value.bin",
    ".producer-attempts/story-example/attempt/value.json",
    ".producer-current/source/story-example.json",
    "src/remotion/catalog/resource-catalog.generated.json",
    "deliveries/story-example/publish.json",
  ];
  for (const path of paths) {
    await mkdir(join(rootDir, path, ".."), { recursive: true });
    await writeFile(join(rootDir, path), path);
  }
  const before = await Promise.all(
    paths.map(
      async (path) =>
        [path, (await stat(join(rootDir, path))).mtimeMs] as const,
    ),
  );
  const first = await captureProductionInspectionSnapshot({
    locations,
    projectId: "story-example",
    catalogProjectionPath,
  });
  const second = await captureProductionInspectionSnapshot({
    locations,
    projectId: "story-example",
    catalogProjectionPath,
  });
  const after = await Promise.all(
    paths.map(
      async (path) =>
        [path, (await stat(join(rootDir, path))).mtimeMs] as const,
    ),
  );

  assert.deepEqual(second, first);
  assert.deepEqual(after, before);
  await assert.rejects(
    stat(join(rootDir, ".producer-operation.lock")),
    /ENOENT/u,
  );
});

test("production snapshot reads only explicitly configured Workspace roots", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "rsp-workspace-inspection-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const workspaceRoot = join(parent, "workspace");
  const locations = createWorkspaceProductionLocations({
    workspaceRoot,
    applicationSupportRoot: join(parent, "application-support"),
    runtimeResources: join(parent, "runtime-pack"),
    cacheRoot: join(parent, "cache"),
  });
  const { catalogProjectionPath } =
    createWorkspaceProjectStorageLocations(locations);
  const workspaceStory = join(
    locations.projectSourceRoot,
    "story-example/story.json",
  );
  const repositoryDecoy = join(
    workspaceRoot,
    "src/projects/story-example/story.json",
  );
  const repositoryCatalogDecoy = join(
    workspaceRoot,
    "src/remotion/catalog/resource-catalog.generated.json",
  );
  await Promise.all([
    mkdir(join(workspaceStory, ".."), { recursive: true }),
    mkdir(join(repositoryDecoy, ".."), { recursive: true }),
    mkdir(join(catalogProjectionPath, ".."), { recursive: true }),
    mkdir(join(repositoryCatalogDecoy, ".."), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(workspaceStory, "workspace-source"),
    writeFile(repositoryDecoy, "repository-decoy"),
    writeFile(catalogProjectionPath, "workspace-catalog"),
    writeFile(repositoryCatalogDecoy, "repository-catalog-decoy"),
  ]);
  const first = await captureProductionInspectionSnapshot({
    locations,
    projectId: "story-example",
    catalogProjectionPath,
  });
  await Promise.all([
    writeFile(repositoryDecoy, "changed-decoy"),
    writeFile(repositoryCatalogDecoy, "changed-catalog-decoy"),
  ]);
  const second = await captureProductionInspectionSnapshot({
    locations,
    projectId: "story-example",
    catalogProjectionPath,
  });
  assert.deepEqual(second, first);
  await writeFile(catalogProjectionPath, "changed-workspace-catalog");
  const third = await captureProductionInspectionSnapshot({
    locations,
    projectId: "story-example",
    catalogProjectionPath,
  });
  assert.notEqual(third.catalog, second.catalog);
});
