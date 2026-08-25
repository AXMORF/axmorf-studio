import assert from "node:assert/strict";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateResourceCatalogForStorage } from "../../scripts/catalog/generate";
import { loadWorkspaceCatalogAuthorityDescriptors } from "../../scripts/catalog/project-files";
import {
  createWorkspaceProjectStorageLocations,
  resolveProjectOwnedLogicalPath,
} from "../../scripts/projects/project-locations";
import { deleteWorkspaceProject } from "../../scripts/projects/workspace-project";
import { generateProjectRegistry } from "../../scripts/registry/generate";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";

const fixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const root = await import("node:fs/promises").then(({ mkdtemp, rm }) =>
    mkdtemp(join(tmpdir(), "workspace-project-storage-")).then((path) => {
      context.after(() => rm(path, { recursive: true, force: true }));
      return path;
    }),
  );
  const workspace = join(root, "workspace");
  const runtime = join(root, "runtime");
  const support = join(root, "support");
  const cache = join(root, "cache");
  await Promise.all([
    mkdir(join(workspace, "projects"), { recursive: true }),
    mkdir(join(workspace, "media"), { recursive: true }),
    mkdir(join(workspace, ".rsp/current/source"), { recursive: true }),
    mkdir(join(workspace, ".rsp/work"), { recursive: true }),
    mkdir(runtime, { recursive: true }),
    mkdir(support, { recursive: true }),
    mkdir(cache, { recursive: true }),
  ]);
  return {
    root,
    workspace,
    runtime,
    support,
    cache,
    locations: createWorkspaceProductionLocations({
      workspaceRoot: workspace,
      applicationSupportRoot: support,
      runtimeResources: runtime,
      cacheRoot: cache,
    }),
  };
};

test("Workspace storage maps stable logical paths without a repository-shaped tree", async (context) => {
  const { locations, workspace } = await fixture(context);
  const storage = createWorkspaceProjectStorageLocations(locations);
  assert.equal(
    resolveProjectOwnedLogicalPath({
      storage,
      logicalPath: "src/projects/story-one/story.json",
    }),
    join(workspace, "projects/story-one/story.json"),
  );
  assert.equal(
    resolveProjectOwnedLogicalPath({
      storage,
      logicalPath: "public/projects/story-one/audio.wav",
    }),
    join(workspace, "media/story-one/audio.wav"),
  );
  assert.throws(
    () =>
      resolveProjectOwnedLogicalPath({
        storage,
        logicalPath: "src/projects/story-one/../other/secret.json",
      }),
    /normalized|unsafe/u,
  );
  await assert.rejects(access(join(workspace, "src/projects")));
  await assert.rejects(access(join(workspace, "public/projects")));
});

test("Workspace Catalog and Registry projections have explicit writable destinations", async (context) => {
  const { locations, workspace } = await fixture(context);
  const storage = createWorkspaceProjectStorageLocations(locations);
  const catalog = await generateResourceCatalogForStorage({
    storage,
    mode: "write",
    loadDescriptors: async () => [],
  });
  const registry = await generateProjectRegistry({
    storage,
    mode: "write",
  });
  assert.equal(
    catalog.destination,
    join(workspace, ".rsp/current/resource-catalog.generated.json"),
  );
  assert.equal(
    registry.destination,
    join(workspace, ".rsp/current/project-registry.generated.ts"),
  );
  assert.equal(registry.entryCount, 0);
  assert.match(
    await readFile(registry.destination, "utf8"),
    /projectRegistry =\s+\[\]/u,
  );
  await assert.rejects(access(join(workspace, "src")));
});

test("Workspace Catalog resolves immutable Runtime Pack source and shared assets without cwd fallback", async (context) => {
  const { locations, runtime } = await fixture(context);
  await mkdir(join(runtime, "source"), { recursive: true });
  await cp(
    join(import.meta.dirname, "../../src"),
    join(runtime, "source/src"),
    {
      recursive: true,
    },
  );
  await cp(
    join(
      import.meta.dirname,
      "../../desktop/resources/workspace-integration/assets",
    ),
    join(runtime, "shared-assets"),
    { recursive: true },
  );
  const descriptors = await loadWorkspaceCatalogAuthorityDescriptors({
    locations,
  });
  assert.ok(
    descriptors.some(({ id }) => id === "asset.axmorf.default-intro-impact"),
  );
  await rm(
    join(
      runtime,
      "shared-assets/library/mixkit/sound-effects/mixkit-movie-trailer-epic-impact-2908.wav",
    ),
  );
  await assert.rejects(
    loadWorkspaceCatalogAuthorityDescriptors({ locations }),
    /ENOENT|stale/u,
  );
});

test("Workspace deletion removes only exact Project-owned roots and ignores legacy runs", async (context) => {
  const { locations, workspace, runtime, support, cache } =
    await fixture(context);
  for (const projectId of ["alpha", "beta"]) {
    for (const root of [
      locations.projectSourceRoot,
      locations.projectMediaRoot,
      locations.taskWorkspaceRoot,
      locations.artifactStoreRoot,
      locations.attemptStoreRoot,
      locations.deliveryRoot,
      locations.disposableBuildRoot,
      locations.evidenceRoot,
    ]) {
      await mkdir(join(root, projectId), { recursive: true });
      await writeFile(join(root, projectId, "sentinel"), projectId);
    }
    await mkdir(locations.sourceCurrentRoot, { recursive: true });
    await writeFile(
      join(locations.sourceCurrentRoot, `${projectId}.json`),
      "{}\n",
    );
  }
  await mkdir(join(workspace, ".producer-runs/alpha"), { recursive: true });
  await writeFile(join(workspace, ".producer-runs/alpha/run.json"), "{}\n");
  await writeFile(join(runtime, "immutable"), "runtime\n");
  await writeFile(join(support, "private.json"), "private\n");
  const calls: string[] = [];
  const result = await deleteWorkspaceProject({
    locations,
    projectId: "alpha",
    projections: {
      prepublish: async () => {
        calls.push("prepublish");
      },
      regenerate: async () => {
        calls.push("regenerate");
        return { catalogEntryCount: 0, projectEntryCount: 1 };
      },
    },
  });
  assert.deepEqual(calls, ["prepublish", "regenerate"]);
  assert.equal(result.projectEntryCount, 1);
  await assert.rejects(access(join(locations.projectSourceRoot, "alpha")));
  await assert.rejects(access(join(locations.evidenceRoot, "alpha")));
  assert.ok(result.deletedPaths.includes("evidence/alpha"));
  await access(join(locations.projectSourceRoot, "beta/sentinel"));
  await access(join(locations.evidenceRoot, "beta/sentinel"));
  await access(join(workspace, ".producer-runs/alpha/run.json"));
  await access(join(runtime, "immutable"));
  await access(join(support, "private.json"));
  await access(join(cache, "evidence/beta/sentinel"));
});

test("Workspace deletion rejects a symbolic Project target before publication", async (context) => {
  const { locations, root } = await fixture(context);
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(outside, join(locations.projectSourceRoot, "linked"));
  let published = false;
  await assert.rejects(
    deleteWorkspaceProject({
      locations,
      projectId: "linked",
      projections: {
        prepublish: async () => {
          published = true;
        },
        regenerate: async () => ({
          catalogEntryCount: 0,
          projectEntryCount: 0,
        }),
      },
    }),
    /symbolic/u,
  );
  assert.equal(published, false);
  await access(outside);
});

test("Workspace deletion rejects a symbolic evidence target and preserves unrelated evidence", async (context) => {
  const { locations, root } = await fixture(context);
  const outside = join(root, "outside-evidence");
  await mkdir(outside);
  await mkdir(locations.evidenceRoot, { recursive: true });
  await symlink(outside, join(locations.evidenceRoot, "linked"));
  await mkdir(join(locations.evidenceRoot, "other"));
  await writeFile(join(locations.evidenceRoot, "other/sentinel"), "other\n");
  let published = false;
  await assert.rejects(
    deleteWorkspaceProject({
      locations,
      projectId: "linked",
      projections: {
        prepublish: async () => {
          published = true;
        },
        regenerate: async () => ({
          catalogEntryCount: 0,
          projectEntryCount: 0,
        }),
      },
    }),
    /symbolic/u,
  );
  assert.equal(published, false);
  await access(outside);
  await access(join(locations.evidenceRoot, "other/sentinel"));
});

test("Workspace deletion rejects a symlinked evidence ancestor before deleting Project or external bytes", async (context) => {
  const { locations, root, cache } = await fixture(context);
  await mkdir(join(locations.projectSourceRoot, "alpha"));
  await writeFile(
    join(locations.projectSourceRoot, "alpha/sentinel"),
    "project\n",
  );
  await mkdir(join(locations.evidenceRoot, "alpha"), { recursive: true });
  await writeFile(join(locations.evidenceRoot, "alpha/sentinel"), "external\n");
  const outsideCache = join(root, "outside-cache");
  await rename(cache, outsideCache);
  await symlink(outsideCache, cache);
  let published = false;

  await assert.rejects(
    deleteWorkspaceProject({
      locations,
      projectId: "alpha",
      projections: {
        prepublish: async () => {
          published = true;
        },
        regenerate: async () => ({
          catalogEntryCount: 0,
          projectEntryCount: 0,
        }),
      },
    }),
    /ownership chain|canonical|symbolic|unsafe/u,
  );
  assert.equal(published, false);
  assert.equal(
    await readFile(join(locations.projectSourceRoot, "alpha/sentinel"), "utf8"),
    "project\n",
  );
  assert.equal(
    await readFile(join(outsideCache, "evidence/alpha/sentinel"), "utf8"),
    "external\n",
  );
});
