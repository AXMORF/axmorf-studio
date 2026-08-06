import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  GlobalVisualAssignmentSchema,
  GlobalVisualBriefSchema,
  GlobalVisualProjectionSchema,
  GlobalVisualProductionResultSchema,
  ProductionPreviewAssemblySchema,
  ProductionRequirementsFreezeSchema,
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

const checksum = async (relativePath: string) =>
  createHash("sha256")
    .update(Uint8Array.from(await readFile(join(process.cwd(), relativePath))))
    .digest("hex");

test("v1-v3 requirements and formal GPS/Product identities remain byte-compatible", async () => {
  const legacyRequirements = [
    {
      path: "src/projects/rounded-airplane-windows/production/requirements.json",
      schemaVersion: 1,
      checksum:
        "9e4dc0daf0a25198f2a71097fcd36563b5efbc7f10964d7ca167850579f50a06",
    },
    {
      path: "src/projects/algorithm-model-ai-system/production/requirements.json",
      schemaVersion: 2,
      checksum:
        "9f529e83f52d0a123e4502b8c974c805fcdaf393a836e8c3e92310e49836a1a8",
    },
    {
      path: "src/projects/machine-learning-basics/production/requirements.json",
      schemaVersion: 3,
      checksum:
        "1c3183312d9762431701623d06c251d67d73ddc34a4de2c070f596ea0bc8859c",
    },
    {
      path: "src/projects/what-is-deep-learning/production/requirements.json",
      schemaVersion: 3,
      checksum:
        "3d9eb5504ed57e2e907531ac2d9a3fd5954b835968c75b99d128e97f26529448",
    },
  ] as const;
  for (const fixture of legacyRequirements) {
    const parsed = ProductionRequirementsFreezeSchema.parse(
      JSON.parse(await readFile(fixture.path, "utf8")),
    );
    assert.equal(parsed.schemaVersion, fixture.schemaVersion);
    assert.notEqual(parsed.enhancementSelection.globalVisual, "required");
    assert.equal(await checksum(fixture.path), fixture.checksum);
  }
  for (const fixture of [
    {
      path: "src/projects/gps-relativity/generated/final-assembly.generated.json",
      checksum:
        "0627a40c87e477f593dcf62f2de2263721e5965361dffb7b0830da1aa1a32b4f",
    },
    {
      path: "src/projects/gps-relativity/generated/final-preview-approval.generated.json",
      checksum:
        "4f9a06c701a6b175a953dbb47eea31ab575f950a480d5d08556116e35c93381a",
    },
    {
      path: "src/projects/product-comic-vertical/generated/final-assembly.generated.json",
      checksum:
        "f4c2113998c02aa8e6b4666cd70a733a693955d9a399461358974b692af0b18d",
    },
    {
      path: "src/projects/product-comic-vertical/generated/final-preview-approval.generated.json",
      checksum:
        "06a49fee346c028e0f31196d660d6018537ec04ae833e07f770cd66eb688ba59",
    },
  ] as const) {
    assert.equal(await checksum(fixture.path), fixture.checksum);
  }
});

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
