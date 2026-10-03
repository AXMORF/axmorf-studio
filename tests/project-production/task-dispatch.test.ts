import assert from "node:assert/strict";
import test from "node:test";
import type {
  ProducerTaskKind,
  ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import { buildTaskDispatch } from "../../scripts/project-production/application/task-dispatch";
import { prepareProjectProduction } from "../../scripts/project-production/application/prepare-production";

const rootDir =
  "/Users/example/AgentWorkspace/acceptance/axmorf-0.1.16-fresh-firstuse-20261003-01234567/workspace";
const storyId = "ai-hallucination-draft";
const attemptId = "00000000-0000-4000-8000-000000000001";
const revisionId = `revision-${"a".repeat(64)}` as const;
const kinds: readonly ProducerTaskKind[] = [
  "scene-owner",
  "scene-owner",
  "scene-owner",
  "scene-owner",
  "global-visual-owner",
  "cover-owner",
];
const tasks = kinds.map((taskKind, index) => ({
  storyId,
  revisionId,
  taskKind,
  taskRevision: `task-${(index + 1).toString(16).repeat(64)}`,
})) as unknown as readonly ProducerTaskSpec[];

test("dispatch keeps exact routing while lifecycle commands come from successful binding", () => {
  const dispatch = buildTaskDispatch({
    repositoryRootDir: rootDir,
    task: tasks[0]!,
    assignment: 1,
    attemptId,
    workspace: `.producer-work/${storyId}/${tasks[0]!.taskRevision}`,
  });
  for (const key of [
    "describeCommand",
    "finalizeCommand",
    "checkCommand",
    "commitCommand",
    "taskFailureCommand",
  ]) {
    assert.equal(Object.hasOwn(dispatch, key), false, key);
  }
  for (const [key, transport] of [
    ["sharedWorkspace", "shared-workspace"],
    ["controllerIo", "controller-io"],
  ] as const) {
    const command = dispatch.bindCommands[key];
    assert.match(command, new RegExp(`--project ${storyId}`, "u"));
    assert.match(command, new RegExp(`--attempt ${attemptId}`, "u"));
    assert.match(command, /--assignment 1/u);
    assert.match(command, new RegExp(`--transport ${transport}`, "u"));
    const prompt = dispatch.workerPrompts[key];
    assert.ok(prompt.includes(rootDir));
    assert.ok(prompt.includes(command));
    assert.match(prompt, /AGENTS\.md/u);
    assert.match(prompt, /task-worker-bound/u);
    assert.match(prompt, /three immutable inputs/u);
    assert.match(prompt, /declared Agent-owned outputs/u);
    assert.match(prompt, /remotion-best-practices/u);
    assert.match(prompt, /process\/session\/cell handles/u);
    assert.match(prompt, /commit/u);
  }
  assert.match(dispatch.fixedFailureCommand, /--kind fixed/u);
  assert.match(dispatch.spawnFailureCommand, /--kind host/u);
});

test("prepare retains every dirty assignment and full attempt diagnostics within the six-task native result budget", async () => {
  const decisions = Array.from({ length: 34 }, (_, index) => ({
    taskKind: index < tasks.length ? tasks[index]!.taskKind : "narration-chunk",
    subject: { kind: "meaning", id: `meaning-${index + 1}` },
    taskRevision:
      index < tasks.length
        ? tasks[index]!.taskRevision
        : `task-${(index + 1).toString(16).padStart(64, "0")}`,
    baselineTaskRevision: null,
    action: index < tasks.length ? "dispatch-agent" : "reuse",
    artifactState: index < tasks.length ? "missing" : "valid",
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable",
  }));
  const snapshots = decisions.map((decision) => ({ decision }));
  let savedSnapshots: unknown;
  let savedDecisions: unknown;
  const result = await prepareProjectProduction(
    { rootDir, projectId: storyId, env: {} },
    {
      acquireLock: async () => ({ release: async () => undefined }),
      inspect: async () =>
        ({
          sourceState: "production-inputs-ready",
          durationBudget: null,
          estimatedCost: {
            providerRequests: 0,
            providerCacheHits: 25,
            agentTasks: 6,
            deliveryMedia: null,
          },
        }) as never,
      prepareNarration: async () =>
        ({
          actualCost: { providerRequests: 0, providerCacheHits: 25 },
        }) as never,
      projectPendingAuthoring: async () => ({}) as never,
      loadInputs: async () => ({ projectId: storyId }) as never,
      prepareFixedTasks: async () => undefined,
      buildCurrentPlan: async () =>
        ({
          revision: { storyId, revisionId },
          plan: {
            storyId,
            revisionId,
            tasks: decisions,
            summary: {
              reusedTaskCount: 28,
              dirtyAgentTaskCount: 6,
              dirtyFixedTaskCount: 0,
              blockedTaskCount: 0,
            },
          },
          taskSeeds: new Map(
            tasks.map((task) => [
              task.taskRevision,
              { task, contextBytes: "{}\n", taskContractBytes: "{}\n" },
            ]),
          ),
        }) as never,
      createWorkspace: async ({ task }) =>
        `.producer-work/${storyId}/${task.taskRevision}`,
      buildTaskSnapshots: () => snapshots as never,
      createAttempt: async ({ plan, taskSnapshots }) => {
        savedDecisions = plan.tasks;
        savedSnapshots = taskSnapshots;
        return { attemptId } as never;
      },
    },
  );
  assert.equal(result.status, "project-production-prepared");
  if (result.status !== "project-production-prepared") {
    throw new Error("Expected prepared assignments.");
  }
  assert.deepEqual(savedSnapshots, snapshots);
  assert.deepEqual(savedDecisions, decisions);
  assert.ok(
    Buffer.byteLength(JSON.stringify(result), "utf8") <= 24_000,
    "A six-task dispatch must fit below the observed native output cap without omitting tasks.",
  );
  assert.equal(Object.hasOwn(result, "taskExplanations"), false);
  assert.deepEqual(
    result.dirtyAgentTasks.map(({ taskRevision }) => taskRevision),
    tasks.map(({ taskRevision }) => taskRevision),
  );
  for (const [index, task] of result.dirtyAgentTasks.entries()) {
    assert.match(
      task.bindCommands.sharedWorkspace,
      new RegExp(`--assignment ${index + 1}(?: |$)`, "u"),
    );
  }
  assert.match(result.continuationCommand, new RegExp(attemptId, "u"));
  assert.equal(result.actualCost.agentTasks, 6);
});
