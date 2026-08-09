import assert from "node:assert/strict";
import test from "node:test";

import {
  GlobalVisualAssignmentSchema,
  GlobalVisualBriefSchema,
  GlobalVisualPackageSchema,
  GlobalVisualProductionResultSchema,
  buildGlobalVisualAssignment,
  buildGlobalVisualBrief,
  buildGlobalVisualPackage,
  buildGlobalVisualProductionResult,
} from "../../src/contracts/production-global-visual";
import { createProductionError } from "../../src/contracts/production-run";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const briefInput = {
  storyId: "story-example",
  responsibility: "project-global-background-texture-decoration-continuity-v1",
  visualIntent: [
    {
      intentId: "unified-frame",
      description: "Carry one restrained frame treatment through the story.",
      appliesTo: "full-composition",
    },
  ],
  constraints: {
    captionOwner: "caption-layer",
    sceneSemanticOwner: "scene-package",
    visibleText: "forbidden",
    motion: "remotion-frame-api-only",
    runtimeExternalAccess: "forbidden",
    genericDsl: "forbidden",
  },
} as const;

const assignmentInput = {
  runId: "story-example-run-1",
  storyId: "story-example",
  compositionId: "StoryExample",
  requirementsFingerprint: sha("1"),
  globalVisualBriefFingerprint: sha("2"),
  storyFingerprint: sha("3"),
  renderFingerprint: sha("4"),
  semanticTimingFingerprint: sha("5"),
  visualStyleFingerprint: sha("6"),
  resourceCatalogFingerprint: sha("7"),
  resourcePoolFingerprint: sha("8"),
  readabilityPolicyFingerprint: sha("9"),
  timeline: {
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 300,
    captionSafeArea: { top: 64, right: 96, bottom: 160, left: 96 },
    storyBeatWindows: [
      { meaningId: "opening", startFrame: 0, endFrame: 150 },
      { meaningId: "ending", startFrame: 150, endFrame: 300 },
    ],
  },
  allowedResourceIds: [],
  exclusivePaths: {
    plan: "src/projects/story-example/global-visual-plan.json",
    sourceDirectory: "src/projects/story-example/global-visual",
    publicDirectory: "public/projects/story-example/global-visual",
  },
} as const;

test("builds strict GlobalVisual brief assignment package and success result contracts", () => {
  const brief = buildGlobalVisualBrief(briefInput);
  const assignment = buildGlobalVisualAssignment({
    ...assignmentInput,
    globalVisualBriefFingerprint: brief.briefFingerprint,
  });
  const globalVisualPackage = buildGlobalVisualPackage({
    storyId: assignment.storyId,
    compositionId: assignment.compositionId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    semanticTimingFingerprint: assignment.semanticTimingFingerprint,
    visualStyleFingerprint: assignment.visualStyleFingerprint,
    readabilityPolicyFingerprint: assignment.readabilityPolicyFingerprint,
    globalVisualPlanFingerprint: sha("a"),
    rendererId: "project-global-visual",
    rendererSourceGraphFingerprint: sha("b"),
    selectedResources: [],
    selectedResourcesFingerprint: sha("c"),
  });
  const result = buildGlobalVisualProductionResult({
    status: "success",
    runId: assignment.runId,
    storyId: assignment.storyId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    globalVisualPackage: {
      repositoryPath:
        "src/projects/story-example/global-visual/generated/global-visual-package.generated.json",
      packageFingerprint: globalVisualPackage.packageFingerprint,
    },
    globalVisualPlanFingerprint:
      globalVisualPackage.globalVisualPlanFingerprint,
    rendererSourceGraphFingerprint:
      globalVisualPackage.rendererSourceGraphFingerprint,
    selectedResourcesFingerprint:
      globalVisualPackage.selectedResourcesFingerprint,
    mechanicalCheckFingerprint: sha("d"),
  });

  assert.equal(GlobalVisualBriefSchema.parse(brief).storyId, "story-example");
  assert.equal(
    GlobalVisualAssignmentSchema.parse(assignment).timeline.storyBeatWindows
      .length,
    2,
  );
  assert.equal(
    GlobalVisualPackageSchema.parse(globalVisualPackage).rendererId,
    "project-global-visual",
  );
  assert.equal(
    GlobalVisualProductionResultSchema.parse(result).status,
    "success",
  );
});

test("rejects Agent metadata Scene dependencies executable data and non-exclusive paths", () => {
  for (const invalid of [
    { ...briefInput, agentId: "agent-1" },
    { ...briefInput, modulePath: "./GlobalVisualLayers" },
    { ...briefInput, jsx: "<GlobalVisualLayers />" },
  ]) {
    assert.throws(() => buildGlobalVisualBrief(invalid));
  }
  for (const invalid of [
    { ...assignmentInput, taskId: "task-1" },
    { ...assignmentInput, sceneResultFingerprint: sha("f") },
    {
      ...assignmentInput,
      exclusivePaths: {
        ...assignmentInput.exclusivePaths,
        sourceDirectory: "src/projects/story-example/scenes/opening",
      },
    },
  ]) {
    assert.throws(() => buildGlobalVisualAssignment(invalid));
  }
});

test("supports a GlobalVisual-scoped immutable failure result without lifecycle metadata", () => {
  const assignment = buildGlobalVisualAssignment(assignmentInput);
  const error = createProductionError({
    kind: "expected",
    code: "GLOBAL_VISUAL_AUTHORING_FAILED",
    stageId: "scenes",
    scope: "global-visual",
    meaningId: null,
    summary: "Global visual authoring failed.",
    description: "The required result contract was not produced.",
    retryable: false,
    remediation: "Correct the owned files and start a fresh production run.",
    commandId: "production-global-visual-fail",
    inputFingerprint: assignment.assignmentFingerprint,
    redactionApplied: true,
  });
  const result = buildGlobalVisualProductionResult({
    status: "failure",
    runId: assignment.runId,
    storyId: assignment.storyId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    error,
  });
  assert.equal(
    GlobalVisualProductionResultSchema.parse(result).status,
    "failure",
  );
  assert.throws(() =>
    buildGlobalVisualProductionResult({ ...result, heartbeatAt: "now" }),
  );
});
