import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildProducerTaskSpec,
  buildProductionRevision,
  type ProducerTaskSpec,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import {
  commitTaskArtifact,
  inspectArtifactState,
  resolveArtifactPath,
} from "../../scripts/project-production/adapters/artifact-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { createProducerPlan } from "../../scripts/project-production/domain/plan";
import type { ArtifactInspection } from "../../scripts/project-production/domain/invalidation";
import type { ProducerTaskNode } from "../../scripts/project-production/domain/task-graph";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;

const revision = buildProductionRevision({
  storyId: "story-example",
  storyFingerprint: sha("1"),
  narrationFingerprint: sha("2"),
  renderFingerprint: sha("3"),
  visualStyleFingerprint: sha("4"),
  publishingIntentFingerprint: sha("5"),
  projectSoundFingerprint: sha("6"),
  authoringRequirementsFingerprint: sha("7"),
  globalVisualBriefFingerprint: sha("8"),
  storyResourcePoolFingerprint: sha("9"),
  projectAssetManifestFingerprint: sha("a"),
  narrationGenerationFingerprint: sha("b"),
  scenes: [],
  selectedResources: [],
  policyFingerprints: [{ id: "runtime", fingerprint: sha("c") }],
});

const buildTask = ({
  taskKind,
  semanticId,
  input,
}: {
  readonly taskKind: "scene-owner" | "global-visual-owner" | "cover-owner";
  readonly semanticId: string | null;
  readonly input: Sha256Digest;
}) =>
  buildProducerTaskSpec({
    taskKind,
    storyId: revision.storyId,
    semanticId,
    revisionId: revision.revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "brief", fingerprint: input },
      {
        id: "read:inputs/context.json",
        fingerprint:
          "sha256:ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
      },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["src/output.txt"],
    validatorPolicyVersion: `${taskKind}-validator-v1`,
  });

const tasks = [
  buildTask({
    taskKind: "scene-owner",
    semanticId: "opening",
    input: sha("d"),
  }),
  buildTask({
    taskKind: "global-visual-owner",
    semanticId: null,
    input: sha("e"),
  }),
  buildTask({ taskKind: "cover-owner", semanticId: null, input: sha("f") }),
].sort((left, right) => left.taskRevision.localeCompare(right.taskRevision));

const inspectTasks = async (
  rootDir: string,
  currentTasks: readonly ProducerTaskSpec[],
) => {
  const inspections = new Map<string, ArtifactInspection>();
  for (const task of currentTasks) {
    inspections.set(
      task.taskRevision,
      await inspectArtifactState({ rootDir, task }),
    );
  }
  return inspections;
};

const planFromStore = async (
  rootDir: string,
  currentTasks: readonly ProducerTaskSpec[],
) => {
  const nodes: ProducerTaskNode[] = currentTasks.map((task) => ({
    task,
    dependencyTaskRevisions: [],
  }));
  return createProducerPlan({
    revision,
    nodes,
    subjects: new Map(
      currentTasks.map((task) => [
        task.taskRevision,
        task.semanticId === null
          ? { kind: "project" as const, id: task.storyId }
          : { kind: "meaning" as const, id: task.semanticId },
      ]),
    ),
    inspections: await inspectTasks(rootDir, currentTasks),
  });
};

const writeTaskOutput = async ({
  rootDir,
  task,
  content,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly content: string;
}) => {
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": "{}\n" },
  });
  await mkdir(dirname(join(workspace, "src/output.txt")), { recursive: true });
  await writeFile(join(workspace, "src/output.txt"), content);
  return workspace;
};

test("a failed attempt reuses completed artifacts and dispatches only the remaining dirty Agent task", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-e2e-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  const firstPlan = await planFromStore(rootDir, tasks);
  assert.deepEqual(firstPlan.summary, {
    reusedTaskCount: 0,
    dirtyAgentTaskCount: 3,
    dirtyFixedTaskCount: 0,
    blockedTaskCount: 0,
  });

  for (const [index, task] of tasks.slice(0, 2).entries()) {
    const workspace = await writeTaskOutput({
      rootDir,
      task,
      content: `completed-owner-${index}`,
    });
    assert.equal(
      (await commitTaskArtifact({ rootDir, task, workspace })).reused,
      false,
    );
  }
  const failedTask = tasks[2]!;
  const failedWorkspace = await createTaskWorkspace({
    rootDir,
    task: failedTask,
    seedFiles: { "inputs/context.json": "{}\n" },
  });
  await assert.rejects(
    commitTaskArtifact({
      rootDir,
      task: failedTask,
      workspace: failedWorkspace,
    }),
    /missing or unknown files/u,
  );
  await assert.rejects(
    access(join(rootDir, "deliveries/story-example/publish.json")),
    /ENOENT/u,
  );

  const completedArtifactRoot = resolveArtifactPath({
    rootDir,
    storyId: tasks[0]!.storyId,
    taskKind: tasks[0]!.taskKind,
    taskRevision: tasks[0]!.taskRevision,
  });
  const before = await stat(
    join(completedArtifactRoot, "artifact-attestation.json"),
  );
  const retryPlan = await planFromStore(rootDir, tasks);
  const dirtyAgentTasks = retryPlan.tasks.filter(
    ({ action, taskKind }) =>
      action === "dispatch-agent" &&
      ["scene-owner", "global-visual-owner", "cover-owner"].includes(taskKind),
  );
  assert.equal(retryPlan.summary.reusedTaskCount, 2);
  assert.equal(retryPlan.summary.dirtyAgentTaskCount, 1);
  assert.deepEqual(
    dirtyAgentTasks.map(({ taskRevision }) => taskRevision),
    [failedTask.taskRevision],
  );
  const after = await stat(
    join(completedArtifactRoot, "artifact-attestation.json"),
  );
  assert.equal(after.mtimeMs, before.mtimeMs);

  await mkdir(dirname(join(failedWorkspace, "src/output.txt")), {
    recursive: true,
  });
  await writeFile(
    join(failedWorkspace, "src/output.txt"),
    "completed-on-retry",
  );
  await commitTaskArtifact({
    rootDir,
    task: failedTask,
    workspace: failedWorkspace,
  });
  const convergedPlan = await planFromStore(rootDir, tasks);
  assert.equal(convergedPlan.summary.reusedTaskCount, 3);
  assert.equal(convergedPlan.summary.dirtyAgentTaskCount, 0);
  assert.ok(convergedPlan.tasks.every(({ action }) => action === "reuse"));
});
