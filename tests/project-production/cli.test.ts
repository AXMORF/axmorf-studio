import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runProjectProductionCli } from "../../scripts/project-production/cli";
import { readLatestExecutionAttempt } from "../../scripts/project-production/adapters/progress";
import {
  buildArtifactAttestation,
  buildProducerTaskSpec,
} from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("project production CLI exposes only plan, task check/commit, and converge", async () => {
  const context = {
    rootDir: process.cwd(),
    stdout: () => undefined,
  };
  for (const args of [
    [],
    ["production:start"],
    ["production:finalize"],
    ["delivery:build"],
    ["project:build"],
    ["plan"],
    ["task-check"],
    ["task-commit"],
    ["converge"],
  ]) {
    await assert.rejects(() => runProjectProductionCli(args, context));
  }
  await assert.rejects(
    () =>
      runProjectProductionCli(["task-check", "--task", "../escape"], context),
    /Invalid|string|task/iu,
  );
});

test("package scripts have one clean-break production surface and no compatibility shims", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.deepEqual(
    {
      plan: packageJson.scripts["project:produce:plan"],
      check: packageJson.scripts["project:task:check"],
      commit: packageJson.scripts["project:task:commit"],
      converge: packageJson.scripts["project:produce:converge"],
    },
    {
      plan: "node --import tsx scripts/project-production/cli.ts plan",
      check: "node --import tsx scripts/project-production/cli.ts task-check",
      commit: "node --import tsx scripts/project-production/cli.ts task-commit",
      converge: "node --import tsx scripts/project-production/cli.ts converge",
    },
  );
  for (const removed of [
    "production:preflight",
    "production:start",
    "production:status",
    "production:narrative",
    "production:scene:freeze",
    "production:scene:check",
    "production:global-visual:check",
    "production:owner:ready",
    "production:owner:failed",
    "production:finalize",
    "production:render-ready:check",
    "delivery:cover:freeze",
    "delivery:cover:check",
    "delivery:build",
    "delivery:check",
    "project:build",
  ]) {
    assert.equal(packageJson.scripts[removed], undefined, removed);
  }
});

test("task-commit records failed and committed outcomes without changing artifact authority", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-task-commit-attempt-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: sha("2") },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-owner-validator-v1",
  });
  const artifact = buildArtifactAttestation({
    storyId: task.storyId,
    taskKind: task.taskKind,
    semanticId: task.semanticId,
    taskRevision: task.taskRevision,
    validatorPolicyVersion: task.validatorPolicyVersion,
    dependencyArtifacts: task.dependencyArtifacts,
    outputManifest: [
      {
        logicalPath: "src/Renderer.tsx",
        checksum: sha("3"),
        sizeBytes: 1,
        kind: "file",
      },
    ],
  });
  const readWorkspace = async () => ({ task, workspace: "/unused" });
  await assert.rejects(
    runProjectProductionCli(["task-commit", "--task", task.taskRevision], {
      rootDir,
      stdout: () => undefined,
      readWorkspace,
      commitTaskArtifact: async () => {
        throw new Error("validator rejected output");
      },
    }),
    /validator rejected/u,
  );
  const failed = await readLatestExecutionAttempt({
    rootDir,
    storyId: task.storyId,
  });
  assert.equal(failed?.taskOutcomeSummary.failedTaskCount, 1);
  assert.equal(
    failed?.taskOutcomes[0]?.diagnosticCode,
    "producer-task-commit-failed",
  );

  const output = await runProjectProductionCli(
    ["task-commit", "--task", task.taskRevision],
    {
      rootDir,
      stdout: () => undefined,
      readWorkspace,
      commitTaskArtifact: async () => ({
        attestation: artifact,
        reused: false,
      }),
    },
  );
  assert.equal(output.status, "producer-artifact-committed");
  assert.equal(output.attemptRecorded, true);
  const committed = await readLatestExecutionAttempt({
    rootDir,
    storyId: task.storyId,
  });
  assert.equal(committed?.taskOutcomeSummary.committedTaskCount, 1);
  assert.equal(committed?.taskOutcomeSummary.failedTaskCount, 0);
  assert.equal(committed?.eventCount, 3);
});
