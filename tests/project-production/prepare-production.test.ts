import assert from "node:assert/strict";
import test from "node:test";

import { prepareProjectProduction } from "../../scripts/project-production/application/prepare-production";
import { repositoryProductionCommandFormatter } from "../../scripts/project-production/adapters/repository-production-command-formatter";
import { buildProducerConfig } from "../../src/contracts";
import {
  createRepositoryProductionLocations,
  createRuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import { validProjectCreateProducerConfig } from "../fixtures/project-create";

const locations = createRepositoryProductionLocations({
  repositoryRoot: "/fixture",
});
const runtime = createRuntimeExecutionResources({
  rendererRuntimeFingerprint: `sha256:${"1".repeat(64)}`,
  browserExecutable: "/runtime/browser",
  binariesDirectory: "/runtime/bin",
  ffmpegExecutable: "/runtime/bin/ffmpeg",
  ffprobeExecutable: "/runtime/bin/ffprobe",
});
const config = buildProducerConfig(validProjectCreateProducerConfig);

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
    {
      locations,
      runtime,
      config,
      projectId: "story-example",
      deliveryPolicy: "automatic",
    },
    {
      commandFormatter: repositoryProductionCommandFormatter,
      acquireLock: async () => ({
        release: async () => {
          order.push("release");
        },
      }),
      inspect: async (input) => {
        assert.equal(input.locations, locations);
        assert.equal(input.config, config);
        order.push("inspect");
        inspectionCalls += 1;
        return inspection(
          inspectionCalls === 1 ? "configured-authoring" : "timing-ready",
        ) as never;
      },
      prepareNarration: async (input) => {
        assert.equal(input.locations, locations);
        assert.equal(input.runtime, runtime);
        assert.equal(input.config, config);
        order.push("provider");
        return {
          actualCost: { providerRequests: 1, providerCacheHits: 2 },
        } as never;
      },
      projectPendingAuthoring: async (input) => {
        assert.equal(input.locations, locations);
        order.push("project-authoring");
        return {} as never;
      },
      loadInputs: async () => {
        throw new Error("unreachable");
      },
      buildCurrentPlan: async () => {
        throw new Error("unreachable");
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
    {
      locations,
      runtime,
      config,
      projectId: "story-example",
      deliveryPolicy: "automatic",
    },
    {
      commandFormatter: repositoryProductionCommandFormatter,
      acquireLock: async () => ({ release: async () => undefined }),
      inspect: async () => inspection("production-inputs-ready") as never,
      projectPendingAuthoring: async (input) => {
        assert.equal(input.locations, locations);
        return {} as never;
      },
      prepareNarration: async (input) => {
        assert.equal(input.locations, locations);
        assert.equal(input.runtime, runtime);
        assert.equal(input.config, config);
        return {
          actualCost: { providerRequests: 0, providerCacheHits: 3 },
        } as never;
      },
      loadInputs: async (input) => {
        assert.equal(input.locations, locations);
        return { projectId: "story-example" } as never;
      },
      prepareFixedTasks: async (input) => {
        assert.equal(input.locations, locations);
        calls.fixed += 1;
      },
      buildCurrentPlan: async (input) => {
        assert.equal(input.locations, locations);
        assert.equal(input.config, config);
        return {
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
        } as never;
      },
      createWorkspace: async (input) => {
        assert.equal(input.locations, locations);
        calls.workspace += 1;
        return `${locations.taskWorkspaceRoot}/story-example/${dirtyTask.taskRevision}`;
      },
      buildTaskSnapshots: () => [] as never,
      createAttempt: async (input) => {
        assert.equal(input.locations, locations);
        calls.attempt += 1;
        return { attemptId: "00000000-0000-4000-8000-000000000001" } as never;
      },
    },
  );

  assert.equal(result.status, "project-production-prepared");
  assert.equal(result.attemptId, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.dirtyAgentTasks.length, 1);
  assert.equal(
    result.dirtyAgentTasks[0]?.workspace,
    `story-example/${dirtyTask.taskRevision}`,
  );
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
