import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProducerTaskSpec } from "@axmorf/studio/contracts";
import {
  createTaskWorkspace,
  reissueTaskWorkspace,
  removeTaskWorkspace,
} from "../../scripts/project-production/adapters/task-workspace";

const task = buildProducerTaskSpec({
  taskKind: "global-visual-owner",
  storyId: "story-example",
  semanticId: null,
  revisionId: `revision-${"1".repeat(64)}`,
  dependencyArtifacts: [],
  inputFingerprints: [
    { id: "brief", fingerprint: `sha256:${"2".repeat(64)}` },
    {
      id: "read:inputs/brief.json",
      fingerprint: `sha256:${createHash("sha256").update("{}").digest("hex")}`,
    },
  ],
  declaredReadSet: ["inputs/brief.json"],
  declaredOutputSet: ["src/GlobalVisual.tsx"],
  validatorPolicyVersion: "global-v1",
});

test("reissue quarantines immutable drift and recreates the canonical workspace", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-workspace-reissue-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const seedFiles = { "inputs/brief.json": "{}" };
  const workspace = await createTaskWorkspace({ rootDir, task, seedFiles });
  await writeFile(join(workspace, "inputs/brief.json"), "drift");

  const result = await reissueTaskWorkspace({
    rootDir,
    task,
    seedFiles,
    failedAttemptId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(result.recovery, "fresh-seed");
  assert.equal(result.workspace, workspace);
  assert.equal(
    await readFile(join(workspace, "inputs/brief.json"), "utf8"),
    "{}",
  );
  assert.equal(
    await readFile(
      join(
        rootDir,
        ".producer-work",
        task.storyId,
        `.${task.taskRevision}.failed-11111111-1111-4111-8111-111111111111`,
        "inputs/brief.json",
      ),
      "utf8",
    ),
    "drift",
  );
});

test("reissue rolls quarantine back when fresh workspace creation fails", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-workspace-rollback-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const seedFiles = { "inputs/brief.json": "{}" };
  const workspace = await createTaskWorkspace({ rootDir, task, seedFiles });
  await writeFile(join(workspace, "inputs/brief.json"), "drift");

  await assert.rejects(
    reissueTaskWorkspace({
      rootDir,
      task,
      seedFiles,
      failedAttemptId: "22222222-2222-4222-8222-222222222222",
      createWorkspace: async () => {
        throw new Error("injected create failure");
      },
    }),
    /injected create failure/u,
  );
  assert.equal(
    await readFile(join(workspace, "inputs/brief.json"), "utf8"),
    "drift",
  );
});

test("workspace is content-addressed, idempotent, and cleanup stays exact", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-workspace-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/brief.json": "{}" },
  });
  assert.equal(await createTaskWorkspace({ rootDir, task }), workspace);
  await removeTaskWorkspace({ rootDir, task });
  await assert.rejects(() => lstat(workspace), { code: "ENOENT" });
});
