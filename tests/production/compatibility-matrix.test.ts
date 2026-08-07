import assert from "node:assert/strict";
import test from "node:test";

import {
  GlobalVisualAssignmentSchema,
  GlobalVisualBriefSchema,
  GlobalVisualProjectionSchema,
  GlobalVisualProductionResultSchema,
  ProductionPreviewAssemblySchema,
  buildGlobalVisualAssignment,
  buildGlobalVisualBrief,
  buildGlobalVisualProductionResult,
  buildProductionPreviewAssembly,
  createGlobalVisualProjection,
} from "../../src/contracts";
import {
  validGlobalVisualIdentity,
  validPreviewAssemblyInput,
} from "./preview-fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("GlobalVisual contracts reject Agent lifecycle fields at every persisted boundary", () => {
  const brief = buildGlobalVisualBrief({
    storyId: "story-example",
    responsibility:
      "project-global-background-texture-decoration-continuity-v1",
    visualIntent: [
      {
        intentId: "continuity",
        description: "Carry one visual continuity motif.",
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
  });
  const assignment = buildGlobalVisualAssignment({
    runId: "story-example-run-001",
    storyId: "story-example",
    compositionId: "StoryExample",
    requirementsFingerprint: sha("1"),
    globalVisualBriefFingerprint: brief.briefFingerprint,
    storyFingerprint: sha("2"),
    renderFingerprint: sha("3"),
    semanticTimingFingerprint: sha("4"),
    visualStyleFingerprint: sha("5"),
    resourceCatalogFingerprint: sha("6"),
    resourcePoolFingerprint: sha("7"),
    readabilityPolicyFingerprint: sha("8"),
    timeline: {
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 120,
      captionSafeArea: { top: 120, right: 72, bottom: 280, left: 72 },
      storyBeatWindows: [
        { meaningId: "opening", startFrame: 0, endFrame: 120 },
      ],
    },
    allowedResourceIds: [],
    exclusivePaths: {
      plan: "src/projects/story-example/global-visual-plan.json",
      sourceDirectory: "src/projects/story-example/global-visual",
      publicDirectory: "public/projects/story-example/global-visual",
    },
    deadlineAt: "2026-08-07T01:00:00.000Z",
  });
  const result = buildGlobalVisualProductionResult({
    runId: assignment.runId,
    storyId: assignment.storyId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    status: "success",
    globalVisualPackage: {
      repositoryPath:
        "src/projects/story-example/global-visual/generated/global-visual-package.generated.json",
      packageFingerprint: sha("9"),
    },
    globalVisualPlanFingerprint: sha("a"),
    rendererSourceGraphFingerprint: sha("b"),
    selectedResourcesFingerprint: sha("c"),
    mechanicalCheckFingerprint: sha("d"),
  });
  for (const [schema, value] of [
    [GlobalVisualBriefSchema, brief],
    [GlobalVisualAssignmentSchema, assignment],
    [GlobalVisualProductionResultSchema, result],
  ] as const) {
    for (const forbidden of [
      "agentId",
      "taskId",
      "threadId",
      "model",
      "progress",
      "heartbeatAt",
      "conversation",
      "logs",
    ]) {
      assert.throws(() => schema.parse({ ...value, [forbidden]: "forbidden" }));
    }
  }
});

test("projection and PreviewAssembly identity drift fail closed while GlobalSound remains absent", () => {
  const projection = createGlobalVisualProjection({
    storyId: "story-example",
    compositionId: "StoryExample",
    durationInFrames: 120,
    requirementsFingerprint: sha("1"),
    assignmentFingerprint: sha("2"),
    packageFingerprint: sha("3"),
    globalVisualPlanFingerprint: sha("4"),
    rendererSourceGraphFingerprint: sha("5"),
    selectedResourcesFingerprint: sha("6"),
    productionResultFingerprint: sha("7"),
  });
  assert.throws(() =>
    GlobalVisualProjectionSchema.parse({
      ...projection,
      requirementsFingerprint: sha("8"),
    }),
  );
  const assembly = buildProductionPreviewAssembly({
    ...validPreviewAssemblyInput,
    globalVisual: validGlobalVisualIdentity,
    enhancements: {
      ...validPreviewAssemblyInput.enhancements,
      globalVisualLayers: "present",
    },
    layerOrder: [
      "story-visual",
      "global-visual",
      "narrative-core",
      "scene-local-sound",
    ],
  });
  assert.equal(assembly.enhancements.globalSoundPlan, "absent");
  assert.throws(() =>
    ProductionPreviewAssemblySchema.parse({
      ...assembly,
      globalVisual: {
        ...validGlobalVisualIdentity,
        projectionFingerprint: sha("9"),
      },
    }),
  );
});
