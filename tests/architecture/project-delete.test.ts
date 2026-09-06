import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  deleteProjectData,
  discoverDeletableProjectIds,
  parseProjectDeleteArguments,
} from "../../scripts/projects/delete";
import { acquireRepositoryOperationLock } from "../../scripts/shared/repository-operation-lock";
import { writeRemovableProject } from "../fixtures/removable-project";

const missing = async (path: string) => {
  await assert.rejects(() => access(path));
};

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-delete-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "deliveries/.staging"), { recursive: true });
  return rootDir;
};

const writeProjectData = async ({
  rootDir,
  projectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  for (const root of [
    "src/projects",
    "public/projects",
    ".narration-work",
    ".producer-attempts",
    ".producer-work",
    ".producer-artifacts",
    ".producer-revisions",
    "out",
    "deliveries",
  ]) {
    const directory = join(rootDir, root, projectId);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "sentinel.txt"), projectId);
  }
  const runId = `${projectId}-run-20260809120000-000000000001`;
  const runRoot = join(rootDir, ".producer-runs", runId);
  await mkdir(runRoot, { recursive: true });
  const run = { runId, storyId: projectId, legacy: true };
  await writeFile(join(runRoot, "run.json"), `${JSON.stringify(run)}\n`);
  return { runId, runRoot };
};

test("delete arguments require an explicit selector and confirmation", () => {
  assert.deepEqual(
    parseProjectDeleteArguments([
      "--project",
      "alpha-story",
      "--project",
      "beta-story",
      "--confirm-delete",
    ]),
    {
      selection: {
        kind: "projects",
        projectIds: ["alpha-story", "beta-story"],
      },
    },
  );
  assert.deepEqual(parseProjectDeleteArguments(["--all", "--confirm-delete"]), {
    selection: { kind: "all" },
  });
  assert.throws(() =>
    parseProjectDeleteArguments(["--project", "alpha-story"]),
  );
  assert.throws(() =>
    parseProjectDeleteArguments([
      "--all",
      "--project",
      "alpha-story",
      "--confirm-delete",
    ]),
  );
  assert.throws(() =>
    parseProjectDeleteArguments([
      "--project",
      "alpha-story",
      "--project",
      "alpha-story",
      "--confirm-delete",
    ]),
  );
  assert.throws(() =>
    parseProjectDeleteArguments([
      "--project",
      "scene-runtime-proof",
      "--confirm-delete",
    ]),
  );
});

test("package scripts expose the Project deletion CLI", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["project:delete"],
    "node --import tsx scripts/projects/delete.ts",
  );
});

test("selected deletion removes every owned data root and preserves other Projects", async (context) => {
  const rootDir = await createRoot(context);
  const alpha = await writeProjectData({ rootDir, projectId: "alpha-story" });
  const beta = await writeProjectData({ rootDir, projectId: "beta-story" });
  await mkdir(join(rootDir, "public/voice_profile"), { recursive: true });
  await writeFile(join(rootDir, "public/voice_profile/my_voice.m4a"), "voice");
  await mkdir(join(rootDir, "out/scene-runtime-proof"), {
    recursive: true,
  });
  await writeFile(join(rootDir, "out/scene-runtime-proof/proof.mp4"), "core");
  await mkdir(join(rootDir, "out/orphan-story"), { recursive: true });
  await writeFile(join(rootDir, "out/orphan-story/render.log"), "orphan");

  let regenerated = false;
  const result = await deleteProjectData({
    rootDir,
    selection: { kind: "projects", projectIds: ["alpha-story"] },
    regenerate: async () => {
      regenerated = true;
      await missing(join(rootDir, "src/projects/alpha-story"));
      assert.equal(
        await readFile(
          join(rootDir, "src/projects/beta-story/sentinel.txt"),
          "utf8",
        ),
        "beta-story",
      );
      return { catalogEntryCount: 18, projectEntryCount: 1 };
    },
  });

  assert.equal(regenerated, true);
  assert.deepEqual(result.deletedProjectIds, ["alpha-story"]);
  assert.equal(result.projectEntryCount, 1);
  for (const path of [
    "src/projects/alpha-story",
    "public/projects/alpha-story",
    ".narration-work/alpha-story",
    ".producer-attempts/alpha-story",
    ".producer-work/alpha-story",
    ".producer-artifacts/alpha-story",
    ".producer-revisions/alpha-story",
    "out/alpha-story",
    "deliveries/alpha-story",
    `.producer-runs/${alpha.runId}`,
  ]) {
    await missing(join(rootDir, path));
  }
  await access(join(rootDir, "src/projects/beta-story"));
  await access(beta.runRoot);
  await access(join(rootDir, "public/voice_profile/my_voice.m4a"));
  await access(join(rootDir, "out/scene-runtime-proof/proof.mp4"));
  await access(join(rootDir, "out/orphan-story/render.log"));
});

test("deletion removes the target Registry import before source disappears", async (context) => {
  const rootDir = await createRoot(context);
  await writeRemovableProject({
    rootDir,
    slug: "alpha-story",
    compositionId: "AlphaStory",
  });
  await writeRemovableProject({
    rootDir,
    slug: "beta-story",
    compositionId: "BetaStory",
  });

  await deleteProjectData({
    rootDir,
    selection: { kind: "projects", projectIds: ["alpha-story"] },
    regenerate: async () => {
      const registry = await readFile(
        join(rootDir, "src/projects/project-registry.generated.ts"),
        "utf8",
      );
      assert.doesNotMatch(registry, /alpha-story/u);
      assert.match(registry, /beta-story/u);
      return { catalogEntryCount: 17, projectEntryCount: 1 };
    },
  });

  await missing(join(rootDir, "src/projects/alpha-story"));
  await access(join(rootDir, "src/projects/beta-story/Composition.tsx"));
});

test("failed removal rebuilds the Registry from the Projects still on disk", async (context) => {
  const rootDir = await createRoot(context);
  await writeRemovableProject({
    rootDir,
    slug: "alpha-story",
    compositionId: "AlphaStory",
  });
  await writeRemovableProject({
    rootDir,
    slug: "beta-story",
    compositionId: "BetaStory",
  });

  await assert.rejects(
    deleteProjectData({
      rootDir,
      selection: { kind: "projects", projectIds: ["alpha-story"] },
      remove: async () => {
        throw new Error("injected removal failure");
      },
    }),
    (error: unknown) => {
      if (error instanceof AggregateError) {
        assert.match(String(error.errors[0]), /injected removal failure/u);
      } else {
        assert.match(String(error), /injected removal failure/u);
      }
      return true;
    },
  );

  await access(join(rootDir, "src/projects/alpha-story/Composition.tsx"));
  const registry = await readFile(
    join(rootDir, "src/projects/project-registry.generated.ts"),
    "utf8",
  );
  assert.match(registry, /alpha-story/u);
  assert.match(registry, /beta-story/u);
});

test("all deletion discovers Projects across authority roots but preserves core outputs", async (context) => {
  const rootDir = await createRoot(context);
  const alpha = await writeProjectData({ rootDir, projectId: "alpha-story" });
  const beta = await writeProjectData({ rootDir, projectId: "beta-story" });
  await rm(join(rootDir, "src/projects/beta-story"), {
    recursive: true,
    force: true,
  });
  await mkdir(join(rootDir, "out/scene-runtime-proof"), {
    recursive: true,
  });
  await writeFile(join(rootDir, "out/scene-runtime-proof/proof.mp4"), "core");
  await mkdir(join(rootDir, "out/orphan-story"), { recursive: true });
  await writeFile(join(rootDir, "out/orphan-story/render.log"), "orphan");

  const result = await deleteProjectData({
    rootDir,
    selection: { kind: "all" },
    regenerate: async () => ({
      catalogEntryCount: 17,
      projectEntryCount: 0,
    }),
  });

  assert.deepEqual(result.deletedProjectIds, [
    "alpha-story",
    "beta-story",
    "orphan-story",
  ]);
  await missing(alpha.runRoot);
  await missing(beta.runRoot);
  await missing(join(rootDir, "out/alpha-story"));
  await missing(join(rootDir, "out/beta-story"));
  await missing(join(rootDir, "out/orphan-story"));
  await access(join(rootDir, "out/scene-runtime-proof/proof.mp4"));
});

test("deletion identifies Project ownership without parsing obsolete Run contracts", async (context) => {
  const rootDir = await createRoot(context);
  const { runRoot } = await writeProjectData({
    rootDir,
    projectId: "legacy-story",
  });
  const runPath = join(runRoot, "run.json");
  const run = JSON.parse(await readFile(runPath, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(
    runPath,
    `${JSON.stringify({
      ...run,
      contractVersion: "production-run-current-v1",
      policy: {
        pollIntervalMs: 1_000,
        sceneTimeoutMs: 60_000,
      },
    })}\n`,
  );

  const result = await deleteProjectData({
    rootDir,
    selection: { kind: "all" },
    regenerate: async () => ({
      catalogEntryCount: 17,
      projectEntryCount: 0,
    }),
  });

  assert.deepEqual(result.deletedProjectIds, ["legacy-story"]);
  await missing(runRoot);
  await missing(join(rootDir, "src/projects/legacy-story"));
});

test("malformed legacy ownership fails closed before deleting current data", async (context) => {
  const rootDir = await createRoot(context);
  const { runRoot } = await writeProjectData({
    rootDir,
    projectId: "legacy-story",
  });
  await writeFile(join(runRoot, "run.json"), "{ malformed-history");

  await assert.rejects(
    deleteProjectData({
      rootDir,
      selection: { kind: "projects", projectIds: ["legacy-story"] },
      regenerate: async () => ({
        catalogEntryCount: 17,
        projectEntryCount: 0,
      }),
    }),
    /Production run manifest is malformed/u,
  );
  await access(join(rootDir, "src/projects/legacy-story/sentinel.txt"));
  await access(runRoot);
});

test("preflight rejects unsafe targets before deleting anything", async (context) => {
  const rootDir = await createRoot(context);
  await writeProjectData({ rootDir, projectId: "alpha-story" });
  await rm(join(rootDir, "public/projects/alpha-story"), {
    recursive: true,
    force: true,
  });
  await symlink(
    join(rootDir, "public/voice_profile"),
    join(rootDir, "public/projects/alpha-story"),
  );

  await assert.rejects(() =>
    deleteProjectData({
      rootDir,
      selection: { kind: "projects", projectIds: ["alpha-story"] },
      regenerate: async () => ({
        catalogEntryCount: 17,
        projectEntryCount: 0,
      }),
    }),
  );
  await access(join(rootDir, "src/projects/alpha-story/sentinel.txt"));
});

test("multi-Project deletion validates every requested ID before deleting", async (context) => {
  const rootDir = await createRoot(context);
  await writeProjectData({ rootDir, projectId: "alpha-story" });

  await assert.rejects(() =>
    deleteProjectData({
      rootDir,
      selection: {
        kind: "projects",
        projectIds: ["alpha-story", "missing-story"],
      },
      regenerate: async () => ({
        catalogEntryCount: 17,
        projectEntryCount: 0,
      }),
    }),
  );
  await access(join(rootDir, "src/projects/alpha-story/sentinel.txt"));
});

test("preflight refuses active writer locks and unfinished delivery staging", async (context) => {
  const lockedRoot = await createRoot(context);
  const locked = await writeProjectData({
    rootDir: lockedRoot,
    projectId: "locked-story",
  });
  await writeFile(join(locked.runRoot, "lock"), "active");
  await assert.rejects(() =>
    deleteProjectData({
      rootDir: lockedRoot,
      selection: { kind: "all" },
      regenerate: async () => ({
        catalogEntryCount: 17,
        projectEntryCount: 0,
      }),
    }),
  );
  await access(join(lockedRoot, "src/projects/locked-story/sentinel.txt"));

  const stagedRoot = await createRoot(context);
  await writeProjectData({ rootDir: stagedRoot, projectId: "staged-story" });
  await mkdir(join(stagedRoot, "deliveries/.staging/delivery-in-progress"));
  await assert.rejects(() =>
    deleteProjectData({
      rootDir: stagedRoot,
      selection: { kind: "projects", projectIds: ["staged-story"] },
      regenerate: async () => ({
        catalogEntryCount: 17,
        projectEntryCount: 0,
      }),
    }),
  );
  await access(join(stagedRoot, "src/projects/staged-story/sentinel.txt"));
});

test("Project deletion refuses a concurrent repository mutation before deleting", async (context) => {
  const rootDir = await createRoot(context);
  await writeProjectData({ rootDir, projectId: "active-story" });
  const lock = await acquireRepositoryOperationLock({
    rootDir,
    ownerId: "production-start",
  });
  try {
    await assert.rejects(
      deleteProjectData({
        rootDir,
        selection: { kind: "projects", projectIds: ["active-story"] },
        regenerate: async () => ({
          catalogEntryCount: 17,
          projectEntryCount: 0,
        }),
      }),
      /Another Project operation is already active/u,
    );
    await access(join(rootDir, "src/projects/active-story/sentinel.txt"));
  } finally {
    await lock.release();
  }
});

test("repository operation lock initialization failure leaves no stale lock", async (context) => {
  const rootDir = await createRoot(context);
  await assert.rejects(
    acquireRepositoryOperationLock({
      rootDir,
      ownerId: "production-start",
      initialize: async () => {
        throw new Error("injected lock initialization failure");
      },
    }),
    /injected lock initialization failure/u,
  );
  await missing(join(rootDir, ".project-operation.lock"));

  const recovered = await acquireRepositoryOperationLock({
    rootDir,
    ownerId: "production-start",
  });
  await recovered.release();
});

test("repository operation lock close failure leaves no stale lock", async (context) => {
  const rootDir = await createRoot(context);
  await assert.rejects(
    acquireRepositoryOperationLock({
      rootDir,
      ownerId: "delivery-build",
      close: async (handle) => {
        await handle.close();
        throw new Error("injected lock close failure");
      },
    }),
    /injected lock close failure/u,
  );
  await missing(join(rootDir, ".project-operation.lock"));

  const recovered = await acquireRepositoryOperationLock({
    rootDir,
    ownerId: "delivery-build",
  });
  await recovered.release();
});

test("Project discovery excludes only real reserved Workspace process diagnostics", async (context) => {
  const rootDir = await createRoot(context);
  await mkdir(join(rootDir, ".producer-attempts", ".processes"), {
    recursive: true,
  });
  await mkdir(join(rootDir, ".producer-attempts", ".process-logs"));
  await mkdir(
    join(rootDir, ".producer-attempts", "owned-story", "attempt", ".processes"),
    { recursive: true },
  );
  assert.deepEqual(await discoverDeletableProjectIds({ rootDir }), [
    "owned-story",
  ]);
  await deleteProjectData({
    rootDir,
    selection: { kind: "all" },
    regenerate: async () => ({ catalogEntryCount: 0, projectEntryCount: 0 }),
  });
  await missing(join(rootDir, ".producer-attempts", "owned-story"));
  await access(join(rootDir, ".producer-attempts", ".processes"));
  await mkdir(join(rootDir, ".producer-attempts", ".unknown"));
  await assert.rejects(discoverDeletableProjectIds({ rootDir }));
});

test("Project discovery rejects symlinked and regular-file reserved diagnostics", async (context) => {
  const rootDir = await createRoot(context);
  const outside = await createRoot(context);
  await mkdir(join(rootDir, ".producer-attempts"));
  const reserved = join(rootDir, ".producer-attempts", ".processes");
  await symlink(outside, reserved);
  await assert.rejects(
    discoverDeletableProjectIds({ rootDir }),
    /symbolic-link/u,
  );
  await rm(reserved);
  await writeFile(reserved, "unsafe");
  await assert.rejects(
    discoverDeletableProjectIds({ rootDir }),
    /real directories/u,
  );
});
