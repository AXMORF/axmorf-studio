import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProductionProgressPanel } from "../../settings/client/features/progress/ProductionProgressPanel";
import { ProductionProgressResponseSchema } from "../../settings/contracts/api";

test("progress UI renders Revision task reuse attempt diagnostics and four-file delivery", () => {
  const progress = ProductionProgressResponseSchema.parse({
    schemaVersion: 5,
    projects: [
      {
        projectId: "story-example",
        status: "current",
        revisionId: `revision-${"a".repeat(64)}`,
        tasks: {
          reusedTaskCount: 8,
          dirtyAgentTaskCount: 0,
          dirtyFixedTaskCount: 0,
          blockedTaskCount: 0,
        },
        inspection: null,
        attempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          revisionId: `revision-${"a".repeat(64)}`,
          state: "succeeded",
          updatedAt: "2026-08-20T08:00:00.000Z",
          diagnosticCode: null,
          tasks: {
            reusedTaskCount: 8,
            dirtyAgentTaskCount: 0,
            dirtyFixedTaskCount: 0,
            blockedTaskCount: 0,
          },
          estimatedCost: {
            providerRequests: 1,
            providerCacheHits: 2,
            agentTasks: 1,
            deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
          },
          actualCost: {
            providerRequests: 1,
            providerCacheHits: 2,
            agentTasks: 1,
            deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
          },
          taskExplanations: [
            {
              taskKind: "scene-owner",
              subject: { kind: "meaning", id: "opening" },
              taskRevision: `task-${"1".repeat(64)}`,
              baselineTaskRevision: `task-${"2".repeat(64)}`,
              action: "dispatch-agent",
              artifactState: "missing",
              directChanges: [{ kind: "input", id: "brief" }],
              dependencyChanges: [],
              blockedBy: [],
              explanationAvailability: "complete",
            },
            {
              taskKind: "composition-convergence",
              subject: { kind: "project", id: "story-example" },
              taskRevision: `task-${"3".repeat(64)}`,
              baselineTaskRevision: `task-${"4".repeat(64)}`,
              action: "blocked",
              artifactState: "missing",
              directChanges: [],
              dependencyChanges: [
                {
                  taskKind: "scene-owner",
                  subjectId: "opening",
                  taskRevision: `task-${"1".repeat(64)}`,
                },
              ],
              blockedBy: [
                {
                  taskKind: "scene-owner",
                  subjectId: "opening",
                  taskRevision: `task-${"1".repeat(64)}`,
                },
              ],
              explanationAvailability: "complete",
            },
          ],
          taskOutcomes: {
            committedTaskCount: 3,
            currentTaskCount: 5,
            failedTaskCount: 0,
          },
          terminalResult: "delivery-current",
        },
        delivery: {
          deliveryBuildId: `delivery-${"b".repeat(64)}`,
          revisionId: `revision-${"a".repeat(64)}`,
          sourceCurrentId: `source-current-${"c".repeat(64)}`,
          rendererRuntimeFingerprint: `sha256:${"d".repeat(64)}`,
          frameCount: 120,
          current: true,
          files: {
            video: true,
            cover4x3: true,
            cover3x4: true,
            publish: true,
          },
        },
        error: null,
      },
    ],
  });
  const markup = renderToStaticMarkup(
    createElement(ProductionProgressPanel, {
      progress,
      status: "Project 状态已更新",
      error: null,
      refresh: async () => undefined,
      deleteProject: async () => undefined,
    }),
  );

  assert.match(markup, /Revision \/ Task \/ Delivery/u);
  assert.match(markup, /project:produce:inspect/u);
  assert.match(markup, /project:produce:prepare/u);
  assert.match(markup, /复用任务/u);
  assert.match(markup, /Dirty Agent/u);
  assert.match(markup, /Dirty Fixed/u);
  assert.match(markup, /Attempt diagnostic/u);
  assert.match(markup, /task committed 3/u);
  assert.match(markup, /预计成本/u);
  assert.match(markup, /实际成本/u);
  assert.match(markup, /Provider requests 1/u);
  assert.match(markup, /直接变化/u);
  assert.match(markup, /派发 Agent/u);
  assert.match(markup, /brief/u);
  assert.match(markup, /被阻塞/u);
  assert.match(markup, /scene-owner.*opening/u);
  assert.match(markup, /terminal delivery-current/u);
  assert.match(markup, /VERIFIED DELIVERY/u);
  assert.match(markup, /VIDEO/u);
  assert.match(markup, /COVER 4:3/u);
  assert.match(markup, /COVER 3:4/u);
  assert.match(markup, /PUBLISH/u);
  assert.doesNotMatch(markup, /audited|render-ready|spawn acknowledgement/iu);
  assert.equal(markup.includes(["project", "produce", "plan"].join(":")), false);
  assert.doesNotMatch(markup, /sha256:|private|provider error/iu);
});

test("configured authoring renders read-only readiness and estimated cost before prepare", () => {
  const progress = ProductionProgressResponseSchema.parse({
    schemaVersion: 5,
    projects: [
      {
        projectId: "story-fresh",
        status: "not-produced",
        revisionId: null,
        tasks: {
          reusedTaskCount: 0,
          dirtyAgentTaskCount: 0,
          dirtyFixedTaskCount: 0,
          blockedTaskCount: 0,
        },
        inspection: {
          schemaVersion: 1,
          contractVersion: "production-inspection-v1",
          storyId: "story-fresh",
          sourceState: "configured-authoring",
          currentRevisionId: null,
          sourceCurrentId: null,
          deliveryBuildId: null,
          baseline: { kind: "none", revisionId: null },
          estimatedCost: {
            providerRequests: 1,
            providerCacheHits: 2,
            agentTasks: null,
            deliveryMedia: null,
          },
          tasks: [],
          nextAction: "prepare-narration",
        },
        attempt: null,
        delivery: null,
        error: null,
      },
    ],
  });
  const markup = renderToStaticMarkup(
    createElement(ProductionProgressPanel, {
      progress,
      status: "Project 状态已更新",
      error: null,
      refresh: async () => undefined,
      deleteProject: async () => undefined,
    }),
  );

  assert.match(markup, /待准备旁白/u);
  assert.match(markup, /Provider requests 1/u);
  assert.match(markup, /cache hits 2/u);
  assert.match(markup, /project:produce:inspect/u);
  assert.match(markup, /project:produce:prepare/u);
});
