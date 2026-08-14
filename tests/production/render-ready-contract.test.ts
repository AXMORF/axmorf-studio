import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionRenderReadySchema,
  buildProductionRenderPlan,
  buildProductionRenderReady,
} from "../../src/contracts/production-render";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const planInput = {
  runId: "story-example-run-001",
  storyId: "story-example",
  requirementsFingerprint: sha("1"),
  storyFingerprint: sha("2"),
  sealedNarrationFingerprint: sha("3"),
  masteredNarrationFingerprint: sha("4"),
  semanticTimingFingerprint: sha("4"),
  captionCuesFingerprint: sha("5"),
  sceneCoverageFingerprint: sha("6"),
  scenePackages: [
    { meaningId: "beat-one", packageFingerprint: sha("7") },
    { meaningId: "beat-two", packageFingerprint: sha("8") },
  ],
  rendererRegistryFingerprint: sha("9"),
  storyVisualProjectionFingerprint: sha("a"),
  sceneSoundProjectionFingerprint: sha("b"),
  globalVisual: {
    assignmentFingerprint: sha("c"),
    packageFingerprint: sha("d"),
    resultFingerprint: sha("e"),
    planFingerprint: sha("f"),
    projectionFingerprint: sha("0"),
    rendererSourceGraphFingerprint: sha("1"),
  },
  compositionId: "StoryExample",
  compositionSourceChecksum: sha("2"),
  width: 1080,
  height: 1920,
  fps: 30,
  timelinePolicyVersion: "scene-package-timeline-v1",
  sourceReferencesFingerprint: sha("3"),
  semanticTimingFrameCount: 120,
  frameCount: 120,
  layerOrder: ["global-visual", "story-visual", "narrative-core"],
  mixOrder: ["narration", "scene-local-sound"],
  remotionVersion: "4.0.489",
} as const;

test("builds one current render plan and terminal render-ready contract", () => {
  const plan = buildProductionRenderPlan(planInput);
  const ready = buildProductionRenderReady({ plan });

  assert.equal(plan.contractVersion, "production-render-plan-v4");
  assert.equal(plan.semanticTimingFrameCount, 120);
  assert.equal(plan.frameCount, 120);
  assert.equal(
    plan.renderPolicy.policyVersion,
    "remotion-detached-h264-aac-v1",
  );
  assert.equal(ready.contractVersion, "production-render-ready-v4");
  assert.equal(ready.status, "render-ready");
  assert.equal(ready.handoff, "awaiting-automatic-delivery");
  assert.equal(ready.renderPlanFingerprint, plan.renderPlanFingerprint);
  assert.doesNotMatch(JSON.stringify(ready), /preview|approval/iu);
});

test("render plan rejects a final frame count that disagrees with SemanticTiming", () => {
  assert.throws(() =>
    buildProductionRenderPlan({
      ...planInput,
      frameCount: planInput.frameCount - 1,
    }),
  );
});

test("render-ready rejects stale plan identity and unexpected fields", () => {
  const plan = buildProductionRenderPlan(planInput);
  const ready = buildProductionRenderReady({ plan });

  assert.throws(() =>
    ProductionRenderReadySchema.parse({
      ...ready,
      renderPlanFingerprint: sha("9"),
    }),
  );
  assert.throws(() =>
    ProductionRenderReadySchema.parse({
      ...ready,
      mediaChecksum: sha("8"),
    }),
  );
});
