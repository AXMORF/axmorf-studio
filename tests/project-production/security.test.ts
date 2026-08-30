import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProducerTaskSpec } from "@axmorf/studio/contracts";
import {
  commitTaskArtifact,
  inspectArtifact,
  resolveArtifactPath,
} from "../../scripts/project-production/adapters/artifact-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const buildTask = (declaredOutputSet: readonly string[] = ["src/Cover.tsx"]) =>
  buildProducerTaskSpec({
    taskKind: "cover-owner",
    storyId: "story-example",
    semanticId: null,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "cover", fingerprint: sha("2") },
      {
        id: "read:inputs/context.json",
        fingerprint:
          "sha256:ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
      },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet,
    validatorPolicyVersion: "cover-owner-validator-v1",
  });

test("task and artifact paths reject escapes, absolute paths, and duplicate logical outputs", () => {
  for (const output of [
    "../escape.ts",
    "/absolute.ts",
    "src/../escape.ts",
    "src\\escape.ts",
  ]) {
    assert.throws(() => buildTask([output]), /normalized repository-relative/u);
  }
  assert.throws(
    () => buildTask(["src/Cover.tsx", "src/Cover.tsx"]),
    /sorted and unique/u,
  );
  assert.throws(
    () =>
      resolveArtifactPath({
        rootDir: "/tmp/isolated-test-root",
        storyId: "../escape",
        taskKind: "cover-owner",
        taskRevision: `task-${"3".repeat(64)}`,
      }),
    /invalid|too_small|Invalid/u,
  );
});

test("workspace symlinks and undeclared files fail closed", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-security-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildTask();
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": "{}\n" },
  });
  await mkdir(join(workspace, "src"), { recursive: true });
  const outside = join(rootDir, "outside.tsx");
  await writeFile(outside, "outside");
  await symlink(outside, join(workspace, "src/Cover.tsx"));
  await assert.rejects(
    commitTaskArtifact({ rootDir, task, workspace }),
    /non-regular entry/u,
  );

  await rm(join(workspace, "src/Cover.tsx"));
  await writeFile(join(workspace, "src/Cover.tsx"), "export default null;\n");
  await writeFile(join(workspace, "src/unknown.ts"), "unknown\n");
  await assert.rejects(
    commitTaskArtifact({ rootDir, task, workspace }),
    /missing or unknown files/u,
  );
});

test("checksum drift and same task identity with different bytes fail closed", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-integrity-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildTask();
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": "{}\n" },
  });
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src/Cover.tsx"), "version-one\n");
  const committed = await commitTaskArtifact({ rootDir, task, workspace });
  assert.equal(committed.reused, false);

  await writeFile(join(workspace, "src/Cover.tsx"), "version-two\n");
  await assert.rejects(
    commitTaskArtifact({ rootDir, task, workspace }),
    /conflicting output bytes/u,
  );

  const artifact = resolveArtifactPath({
    rootDir,
    storyId: task.storyId,
    taskKind: task.taskKind,
    taskRevision: task.taskRevision,
  });
  await writeFile(join(artifact, "files/src/Cover.tsx"), "tampered\n");
  await assert.rejects(inspectArtifact({ rootDir, task }), /checksum drifted/u);
});

test("Artifact Store refuses symlinked storage parents", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-artifact-parent-"),
  );
  const outside = await mkdtemp(
    join(tmpdir(), "rsp-production-artifact-outside-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(rootDir, ".producer-artifacts"));

  const task = buildTask();
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": "{}\n" },
  });
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src/Cover.tsx"), "export default null;\n");

  await assert.rejects(
    commitTaskArtifact({ rootDir, task, workspace }),
    /Artifact Store parent is unsafe/u,
  );
});
