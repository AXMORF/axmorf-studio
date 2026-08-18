import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ProductionProgressResponseSchema } from "../../settings/contracts/api";
import { ProductionProgressPanel } from "../../settings/client/features/progress/ProductionProgressPanel";

test("build delivery is primary and an absent audited Run is non-blocking", () => {
  const occurredAt = "2026-08-18T08:00:00.000Z";
  const stepIds = [
    "prepare",
    "video",
    "cover-4x3",
    "cover-3x4",
    "verify",
    "promote",
  ] as const;
  const progress = ProductionProgressResponseSchema.parse({
    schemaVersion: 3,
    projects: [
      {
        projectId: "story-example",
        status: "current",
        error: null,
        build: {
          buildId: `build-${"a".repeat(64)}`,
          completedSteps: 6,
          detail: "当前源码对应的四文件交付已完成",
          delivery: {
            buildId: `build-${"a".repeat(64)}`,
            sourceSnapshotFingerprint: `sha256:${"b".repeat(64)}`,
            frameCount: 120,
            sourceCurrent: true,
            updatedAt: occurredAt,
            files: {
              video: true,
              cover4x3: true,
              cover3x4: true,
              publish: true,
            },
          },
          steps: stepIds.map((id) => ({
            id,
            label: id,
            status: "succeeded",
            detail: "已完成",
            occurredAt,
            reused: null,
          })),
          totalSteps: 6,
          updatedAt: occurredAt,
        },
        auditedRun: null,
        auditedRunError: null,
      },
    ],
  });
  const markup = renderToStaticMarkup(
    <ProductionProgressPanel
      progress={progress}
      status="Project 进度已更新"
      error={null}
      refresh={async () => undefined}
      deleteProject={async () => undefined}
    />,
  );

  assert.match(markup, /交付完成/u);
  assert.match(markup, /VERIFIED DELIVERY/u);
  assert.match(markup, /AUDITED PRODUCTION/u);
  assert.match(markup, /未启动，不影响普通构建/u);
  assert.doesNotMatch(markup, /尚无 Run|尚无 current Production Run/u);
  assert.doesNotMatch(markup, /<details[^>]* open/iu);
});
