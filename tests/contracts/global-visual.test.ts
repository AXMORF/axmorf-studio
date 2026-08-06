import assert from "node:assert/strict";
import test from "node:test";

import {
  GlobalVisualPlanSchema,
  GlobalVisualProjectionSchema,
  createGlobalVisualPlan,
  createGlobalVisualProjection,
} from "../../src/contracts/global-visual";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const input = () => ({
  schemaVersion: 1 as const,
  planVersion: "global-visual-plan-v1" as const,
  storyId: "synthetic-proof",
  compositionId: "SyntheticProof",
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 120,
  captionSafeArea: { top: 64, right: 96, bottom: 160, left: 96 },
  catalogFingerprint: sha("1"),
  frameTreatment: {
    inset: 28,
    borderWidth: 2,
    borderColor: "#9ee7ff",
    borderOpacity: 0.22,
    vignetteOpacity: 0.18,
    grainOpacity: 0.025,
  },
  continuityMotif: {
    color: "#ffd166",
    strokeWidth: 3,
    opacity: 0.32,
    motionPolicy: "linear-frame-progress-v1" as const,
    windows: [
      {
        startFrame: 20,
        endFrame: 36,
        axis: "x" as const,
        direction: 1 as const,
      },
      {
        startFrame: 80,
        endFrame: 96,
        axis: "y" as const,
        direction: -1 as const,
      },
    ],
  },
});

test("GlobalVisualPlan only accepts frame treatment and continuity motif semantics", () => {
  const plan = createGlobalVisualPlan(input());
  assert.doesNotThrow(() => GlobalVisualPlanSchema.parse(plan));
  assert.notEqual(
    plan.planFingerprint,
    createGlobalVisualPlan({
      ...input(),
      captionSafeArea: { ...input().captionSafeArea, bottom: 161 },
    }).planFingerprint,
  );
});

test("GlobalVisualPlan rejects DSL executable caption and invalid windows", () => {
  for (const mutation of [
    { ...input(), layers: [] },
    { ...input(), componentId: "Anything" },
    { ...input(), modulePath: "./Anything" },
    { ...input(), expression: "frame * 2" },
    { ...input(), captionText: "forbidden" },
    {
      ...input(),
      continuityMotif: {
        ...input().continuityMotif,
        windows: [{ startFrame: 30, endFrame: 20, axis: "x", direction: 1 }],
      },
    },
    {
      ...input(),
      continuityMotif: {
        ...input().continuityMotif,
        windows: [
          { startFrame: 20, endFrame: 40, axis: "x", direction: 1 },
          { startFrame: 39, endFrame: 50, axis: "y", direction: 1 },
        ],
      },
    },
  ]) {
    assert.throws(() => createGlobalVisualPlan(mutation));
  }
});

test("keeps projection v1 and adds production-bound projection v2", () => {
  const legacy = createGlobalVisualProjection({
    schemaVersion: 1,
    projectionVersion: "global-visual-projection-v1",
    storyId: "synthetic-proof",
    compositionId: "SyntheticProof",
    durationInFrames: 120,
    globalVisualPlanFingerprint: sha("1"),
    sourceChecksum: sha("2"),
  });
  assert.equal(legacy.schemaVersion, 1);

  const production = createGlobalVisualProjection({
    storyId: "story-example",
    compositionId: "StoryExample",
    durationInFrames: 300,
    requirementsFingerprint: sha("1"),
    assignmentFingerprint: sha("2"),
    packageFingerprint: sha("3"),
    globalVisualPlanFingerprint: sha("4"),
    rendererSourceGraphFingerprint: sha("5"),
    selectedResourcesFingerprint: sha("6"),
    productionResultFingerprint: sha("7"),
  });
  assert.equal(production.schemaVersion, 2);
  assert.equal(production.projectionVersion, "global-visual-projection-v2");
  assert.equal(
    GlobalVisualProjectionSchema.parse(production).projectionFingerprint,
    production.projectionFingerprint,
  );
  assert.throws(() =>
    createGlobalVisualProjection({ ...production, agentId: "agent-1" }),
  );
});
