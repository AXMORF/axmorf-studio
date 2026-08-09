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
  DEFAULT_PRODUCTION_RUN_POLICY,
  createProductionRunManifest,
} from "../../src/contracts";
import {
  deleteProjectData,
  parseProjectDeleteArguments,
} from "../../scripts/projects/delete";

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
  const run = createProductionRunManifest({
    runId,
    storyId: projectId,
    requirementsPath: `src/projects/${projectId}/production/requirements.json`,
    requirementsFingerprint: `sha256:${"0".repeat(64)}`,
    policy: DEFAULT_PRODUCTION_RUN_POLICY,
    createdAt: "2026-08-09T04:00:00.000Z",
  });
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
      "m6-scene-runtime-proof",
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
  await mkdir(join(rootDir, "out/m6-scene-runtime-proof"), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, "out/m6-scene-runtime-proof/proof.mp4"),
    "core",
  );
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
    "out/alpha-story",
    "deliveries/alpha-story",
    `.producer-runs/${alpha.runId}`,
  ]) {
    await missing(join(rootDir, path));
  }
  await access(join(rootDir, "src/projects/beta-story"));
  await access(beta.runRoot);
  await access(join(rootDir, "public/voice_profile/my_voice.m4a"));
  await access(join(rootDir, "out/m6-scene-runtime-proof/proof.mp4"));
  await access(join(rootDir, "out/orphan-story/render.log"));
});

test("all deletion discovers Projects across authority roots but preserves core outputs", async (context) => {
  const rootDir = await createRoot(context);
  const alpha = await writeProjectData({ rootDir, projectId: "alpha-story" });
  const beta = await writeProjectData({ rootDir, projectId: "beta-story" });
  await rm(join(rootDir, "src/projects/beta-story"), {
    recursive: true,
    force: true,
  });
  await mkdir(join(rootDir, "out/m6-scene-runtime-proof"), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, "out/m6-scene-runtime-proof/proof.mp4"),
    "core",
  );
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
  await access(join(rootDir, "out/m6-scene-runtime-proof/proof.mp4"));
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
