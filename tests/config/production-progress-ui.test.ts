import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProductionProgressPanel } from "../../settings/client/features/progress/ProductionProgressPanel";
import { ProductionProgressResponseSchema } from "../../settings/contracts/api";

test("progress UI renders Revision task reuse attempt diagnostics and four-file delivery", () => {
  const progress = ProductionProgressResponseSchema.parse({
    schemaVersion: 4,
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
        attempt: {
          attemptId: "00000000-0000-4000-8000-000000000001",
          revisionId: `revision-${"a".repeat(64)}`,
          planFingerprint: `sha256:${"d".repeat(64)}`,
          artifactSetFingerprint: `sha256:${"e".repeat(64)}`,
          state: "succeeded",
          updatedAt: "2026-08-20T08:00:00.000Z",
          diagnosticCode: null,
          tasks: {
            reusedTaskCount: 8,
            dirtyAgentTaskCount: 0,
            dirtyFixedTaskCount: 0,
            blockedTaskCount: 0,
          },
          taskOutcomes: {
            committedTaskCount: 3,
            currentTaskCount: 5,
            failedTaskCount: 0,
          },
          deliveryResult: "verified",
        },
        delivery: {
          deliveryBuildId: `delivery-${"b".repeat(64)}`,
          revisionId: `revision-${"a".repeat(64)}`,
          artifactSetFingerprint: `sha256:${"c".repeat(64)}`,
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
  assert.match(markup, /复用任务/u);
  assert.match(markup, /Dirty Agent/u);
  assert.match(markup, /Dirty Fixed/u);
  assert.match(markup, /Attempt diagnostic/u);
  assert.match(markup, /task committed 3/u);
  assert.match(markup, /delivery verified/u);
  assert.match(markup, /VERIFIED DELIVERY/u);
  assert.match(markup, /VIDEO/u);
  assert.match(markup, /COVER 4:3/u);
  assert.match(markup, /COVER 3:4/u);
  assert.match(markup, /PUBLISH/u);
  assert.doesNotMatch(markup, /audited|render-ready|spawn acknowledgement/iu);
});
