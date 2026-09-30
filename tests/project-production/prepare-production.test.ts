import assert from "node:assert/strict";
import test from "node:test";
import { buildDurationBudget } from "@axmorf/studio/contracts";

import { prepareProjectProduction } from "../../scripts/project-production/application/prepare-production";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";
import { join } from "node:path";

const inspection = (
  sourceState:
    | "configured-authoring"
    | "timing-ready"
    | "production-inputs-ready",
) =>
  ({
    storyId: "story-example",
    sourceState,
    durationBudget: buildDurationBudget({
      targetDurationSeconds: 30,
      fps: 30,
      boundaryFrames: 300,
      ...(sourceState === "configured-authoring"
        ? {}
        : { actualDurationInFrames: 1045 }),
    }),
    currentRevisionId: null,
    baseline: { kind: "none", revisionId: null },
    estimatedCost: {
      providerRequests: sourceState === "configured-authoring" ? 1 : 0,
      providerCacheHits: 2,
      agentTasks: null,
      deliveryMedia: null,
    },
    tasks: [],
    nextAction:
      sourceState === "configured-authoring"
        ? "prepare-narration"
        : sourceState === "timing-ready"
          ? "complete-authoring"
          : "prepare-production",
  }) as const;

test("prepare validates read-only inputs before provider work and stops before owner state when authoring remains incomplete", async () => {
  const order: string[] = [];
  let workspaceCalls = 0;
  let attemptCalls = 0;
  let inspectionCalls = 0;
  const result = await prepareProjectProduction(
    { rootDir: "/fixture", projectId: "story-example", env: {} },
    {
      acquireLock: async () => ({
        release: async () => {
          order.push("release");
        },
      }),
      inspect: async () => {
        order.push("inspect");
        inspectionCalls += 1;
        return inspection(
          inspectionCalls === 1 ? "configured-authoring" : "timing-ready",
        ) as never;
      },
      prepareNarration: async () => {
        order.push("provider");
        return {
          actualCost: { providerRequests: 1, providerCacheHits: 2 },
        } as never;
      },
      projectPendingAuthoring: async () => {
        order.push("project-authoring");
        return {} as never;
      },
      createWorkspace: async () => {
        workspaceCalls += 1;
        return "unreachable";
      },
      createAttempt: async () => {
        attemptCalls += 1;
        throw new Error("unreachable");
      },
    },
  );

  assert.equal(result.status, "project-authoring-required");
  assert.deepEqual(result.missingAuthoringInputs, [
    "production/scene-production-brief.json",
  ]);
  assert.deepEqual(order, [
    "inspect",
    "provider",
    "project-authoring",
    "inspect",
    "release",
  ]);
  assert.equal(workspaceCalls, 0);
  assert.equal(attemptCalls, 0);
});

test("prepare alone commits fixed tasks, creates dirty owner workspaces, and opens one attempt", async () => {
  const calls = { fixed: 0, workspace: 0, attempt: 0 };
  const dirtyTask = {
    taskKind: "scene-owner",
    subject: { kind: "meaning", id: "scene-one" },
    taskRevision: `task-${"3".repeat(64)}`,
    baselineTaskRevision: null,
    action: "dispatch-agent",
    artifactState: "missing",
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable",
  } as const;
  const result = await prepareProjectProduction(
    { rootDir: "/fixture", projectId: "story-example", env: {} },
    {
      acquireLock: async () => ({ release: async () => undefined }),
      inspect: async () => inspection("production-inputs-ready") as never,
      prepareNarration: async () =>
        ({
          actualCost: { providerRequests: 0, providerCacheHits: 3 },
        }) as never,
      loadInputs: async () => ({ projectId: "story-example" }) as never,
      prepareFixedTasks: async () => {
        calls.fixed += 1;
      },
      buildCurrentPlan: async () =>
        ({
          revision: {
            storyId: "story-example",
            revisionId: `revision-${"4".repeat(64)}`,
          },
          plan: {
            storyId: "story-example",
            revisionId: `revision-${"4".repeat(64)}`,
            tasks: [dirtyTask],
            summary: {
              reusedTaskCount: 0,
              dirtyAgentTaskCount: 1,
              dirtyFixedTaskCount: 0,
              blockedTaskCount: 0,
            },
          },
          taskSeeds: new Map([
            [
              dirtyTask.taskRevision,
              {
                task: {
                  storyId: "story-example",
                  taskRevision: dirtyTask.taskRevision,
                },
                contextBytes: "{}\n",
                taskContractBytes: "{}\n",
              },
            ],
          ]),
        }) as never,
      createWorkspace: async () => {
        calls.workspace += 1;
        return `.producer-work/story-example/${dirtyTask.taskRevision}`;
      },
      buildTaskSnapshots: () =>
        [
          {
            taskRevision: dirtyTask.taskRevision,
            decision: {
              action: "dispatch-agent",
              taskRevision: dirtyTask.taskRevision,
            },
          },
        ] as never,
      createAttempt: async () => {
        calls.attempt += 1;
        return { attemptId: "00000000-0000-4000-8000-000000000001" } as never;
      },
    },
  );

  assert.equal(result.status, "project-production-prepared");
  assert.equal(result.durationBudget?.actualTotalSeconds, 1045 / 30);
  assert.equal(result.durationBudget?.measurement, "sealed-semantic-timing");
  assert.equal(result.attemptId, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.dirtyAgentTasks.length, 1);
  assert.match(
    result.dirtyAgentTasks[0]?.commitCommand ?? "",
    /project:task:commit[\s\S]*--assignment 1/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.bindCommands.sharedWorkspace ?? "",
    /project:task:bind[\s\S]*--transport shared-workspace/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.bindCommands.controllerIo ?? "",
    /project:task:bind[\s\S]*--transport controller-io/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.describeCommand ?? "",
    /project:task:describe[\s\S]*--assignment 1/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.finalizeCommand ?? "",
    /project:task:finalize[\s\S]*--assignment 1/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.taskFailureCommand ?? "",
    /project:task:fail[\s\S]*--assignment 1[\s\S]*--kind task/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.fixedFailureCommand ?? "",
    /project:task:fail[\s\S]*--assignment 1[\s\S]*--kind fixed/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.spawnFailureCommand ?? "",
    /project:task:fail[\s\S]*--assignment 1[\s\S]*--kind host/u,
  );
  assert.match(
    result.continuationCommand,
    /project:produce:continue[\s\S]*--attempt 00000000-0000-4000-8000-000000000001/u,
  );
  assert.equal(
    result.nextAction,
    "dispatch-agent-tasks-then-start-fixed-continuation",
  );
  assert.deepEqual(result.actualCost, {
    providerRequests: 0,
    providerCacheHits: 3,
    agentTasks: 1,
    deliveryMedia: [],
  });
  assert.deepEqual(calls, { fixed: 1, workspace: 1, attempt: 1 });
});

test("candidate prepare isolates work and attempts while keeping commands repository-routable", async () => {
  const scope = createProjectRevisionProductionScope({
    rootDir: "/fixture",
    storyId: "story-example",
    candidateId: `revision-candidate-${"b".repeat(64)}`,
  });
  const dirtyTask = {
    taskKind: "scene-owner",
    subject: { kind: "meaning", id: "scene-one" },
    taskRevision: `task-${"5".repeat(64)}`,
    action: "dispatch-agent",
    directChanges: [],
    blockedBy: [],
  } as const;
  let attemptRoot = "";
  let authoringRoot = "";
  let fixedScope: unknown;
  const result = await prepareProjectProduction(
    {
      rootDir: "/fixture",
      projectId: "story-example",
      env: {},
      scope,
    },
    {
      acquireLock: async ({ rootDir }) => {
        assert.equal(rootDir, "/fixture");
        return { release: async () => undefined };
      },
      inspect: async () => inspection("production-inputs-ready") as never,
      projectPendingAuthoring: async ({ rootDir }) => {
        authoringRoot = rootDir;
        return {} as never;
      },
      prepareNarration: async () =>
        ({
          actualCost: { providerRequests: 0, providerCacheHits: 0 },
        }) as never,
      loadInputs: async () => ({ projectId: "story-example" }) as never,
      prepareFixedTasks: async ({ scope: receivedScope }) => {
        fixedScope = receivedScope;
      },
      buildCurrentPlan: async () =>
        ({
          revision: {
            storyId: "story-example",
            revisionId: `revision-${"6".repeat(64)}`,
          },
          plan: {
            storyId: "story-example",
            revisionId: `revision-${"6".repeat(64)}`,
            tasks: [dirtyTask],
            summary: {
              reusedTaskCount: 0,
              dirtyAgentTaskCount: 1,
              dirtyFixedTaskCount: 0,
              blockedTaskCount: 0,
            },
          },
          taskSeeds: new Map([
            [
              dirtyTask.taskRevision,
              {
                task: {
                  storyId: "story-example",
                  taskRevision: dirtyTask.taskRevision,
                },
                contextBytes: "{}\n",
                taskContractBytes: "{}\n",
              },
            ],
          ]),
        }) as never,
      createWorkspace: async () =>
        join(scope.producerWorkRoot, "story-example", dirtyTask.taskRevision),
      buildTaskSnapshots: () =>
        [
          {
            taskRevision: dirtyTask.taskRevision,
            decision: {
              action: "dispatch-agent",
              taskRevision: dirtyTask.taskRevision,
            },
          },
        ] as never,
      createAttempt: async ({ rootDir }) => {
        attemptRoot = rootDir;
        return { attemptId: "00000000-0000-4000-8000-000000000009" } as never;
      },
    },
  );

  assert.equal(authoringRoot, scope.isolatedRoot);
  assert.equal(attemptRoot, scope.isolatedRoot);
  assert.equal(fixedScope, scope);
  assert.equal(result.status, "project-production-prepared");
  if (result.status !== "project-production-prepared") {
    throw new Error("Candidate production unexpectedly requires authoring.");
  }
  assert.equal(
    result.dirtyAgentTasks[0]?.workspace,
    `.producer-revisions/story-example/${scope.candidateId}/scope/.producer-work/story-example/${dirtyTask.taskRevision}`,
  );
  for (const command of [
    result.dirtyAgentTasks[0]?.bindCommands.sharedWorkspace,
    result.dirtyAgentTasks[0]?.commitCommand,
    result.continuationCommand,
  ]) {
    assert.match(command ?? "", /--project story-example/u);
    assert.match(
      command ?? "",
      new RegExp(`--candidate ${scope.candidateId}`, "u"),
    );
  }
});
