import assert from "node:assert/strict";
import test from "node:test";

import { prepareProjectProduction } from "../../scripts/project-production/application/prepare-production";

const inspection = (
  sourceState:
    | "configured-authoring"
    | "timing-ready"
    | "production-inputs-ready",
) =>
  ({
    storyId: "story-example",
    sourceState,
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
              },
            ],
          ]),
        }) as never,
      createWorkspace: async () => {
        calls.workspace += 1;
        return `.producer-work/story-example/${dirtyTask.taskRevision}`;
      },
      buildTaskSnapshots: () => [] as never,
      createAttempt: async () => {
        calls.attempt += 1;
        return { attemptId: "00000000-0000-4000-8000-000000000001" } as never;
      },
    },
  );

  assert.equal(result.status, "project-production-prepared");
  assert.equal(result.attemptId, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.dirtyAgentTasks.length, 1);
  assert.match(
    result.dirtyAgentTasks[0]?.commitCommand ?? "",
    /project:task:commit[\s\S]*--attempt 00000000-0000-4000-8000-000000000001/u,
  );
  assert.match(
    result.dirtyAgentTasks[0]?.taskFailureCommand ?? "",
    /project:task:fail[\s\S]*--kind task/u,
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
