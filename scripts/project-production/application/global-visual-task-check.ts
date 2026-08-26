import { checkProducerTaskWorkspace } from "./task-check";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import {
  GlobalVisualLayerPolicySchema,
  GlobalVisualPlanSchema,
  RenderSpecSchema,
  SceneReadabilityPolicySchema,
  SelectedResourceRefSchema,
  SemanticTimingSchema,
  StoryIdSchema,
  deriveGlobalVisualLayerPolicy,
  getStoryCompositionDurationInFrames,
  serializeCanonicalJson,
} from "../../../src/contracts";
import { assertGuardedSource } from "../../external-references/source-guard";
import { assertGlobalVisualSource } from "./global-visual-validator";
import { compileTypeScriptImportGraph } from "./typescript-compile";

export const checkGlobalVisualTask = async (
  input: Parameters<typeof checkProducerTaskWorkspace>[0],
) => {
  const checked = await checkProducerTaskWorkspace(input);
  if (checked.task.taskKind !== "global-visual-owner")
    throw new Error("Task is not a GlobalVisual task.");
  const context = JSON.parse(
    await readFile(join(checked.workspace, "inputs/context.json"), "utf8"),
  ) as {
    story?: { storyId?: unknown };
    render?: unknown;
    timing?: unknown;
    layerPolicy?: unknown;
    requirements?: {
      readabilityPolicy?: {
        width?: unknown;
        height?: unknown;
        captionSafeAreaPx?: unknown;
      };
    };
    resourcePool?: {
      allowedResourceIds?: readonly string[];
      resourceCatalogFingerprint?: unknown;
    };
  };
  const storyId = StoryIdSchema.parse(context.story?.storyId);
  const render = RenderSpecSchema.parse(context.render);
  const timing = SemanticTimingSchema.parse(context.timing);
  const layerPolicy = GlobalVisualLayerPolicySchema.parse(context.layerPolicy);
  const expectedLayerPolicy = deriveGlobalVisualLayerPolicy(timing);
  const readabilityPolicy = SceneReadabilityPolicySchema.parse(
    context.requirements?.readabilityPolicy,
  );
  const plan = GlobalVisualPlanSchema.parse(
    JSON.parse(
      await readFile(
        join(checked.workspace, "project/global-visual-plan.json"),
        "utf8",
      ),
    ),
  );
  if (
    storyId !== checked.task.storyId ||
    timing.storyId !== storyId ||
    plan.storyId !== storyId ||
    plan.compositionId !== render.compositionId ||
    plan.width !== readabilityPolicy.width ||
    plan.height !== readabilityPolicy.height ||
    plan.width !== render.width ||
    plan.height !== render.height ||
    plan.fps !== timing.fps ||
    plan.fps !== render.fps ||
    plan.durationInFrames !==
      getStoryCompositionDurationInFrames(timing.durationInFrames) ||
    plan.catalogFingerprint !==
      context.resourcePool?.resourceCatalogFingerprint ||
    plan.captionSafeArea.top !== readabilityPolicy.captionSafeAreaPx.top ||
    plan.captionSafeArea.right !== readabilityPolicy.captionSafeAreaPx.right ||
    plan.captionSafeArea.bottom !==
      readabilityPolicy.captionSafeAreaPx.bottom ||
    plan.captionSafeArea.left !== readabilityPolicy.captionSafeAreaPx.left ||
    serializeCanonicalJson(layerPolicy) !==
      serializeCanonicalJson(expectedLayerPolicy) ||
    plan.continuityMotif.windows.some(
      ({ startFrame, endFrame }) =>
        startFrame < layerPolicy.decorationLayerFrameRange.startFrame ||
        endFrame > layerPolicy.decorationLayerFrameRange.endFrame,
    )
  ) {
    throw new Error("GlobalVisual plan is stale against task context.");
  }
  const envelope = z
    .object({
      schemaVersion: z.literal(1),
      selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
    })
    .strict()
    .parse(
      JSON.parse(
        await readFile(
          join(checked.workspace, "src/selected-resources.json"),
          "utf8",
        ),
      ),
    );
  const allowed = new Set(context.resourcePool?.allowedResourceIds ?? []);
  if (
    envelope.selectedResources.some(
      ({ resourceId, role }) =>
        role !== "global-visual" || !allowed.has(resourceId),
    )
  ) {
    throw new Error(
      "GlobalVisual resource selection is outside the task allowlist.",
    );
  }
  const source = await readFile(
    join(checked.workspace, "src/GlobalVisualLayers.tsx"),
    "utf8",
  );
  const logicalFuturePath = `src/projects/${storyId}/global-visual/GlobalVisualLayers.tsx`;
  assertGlobalVisualSource({
    source,
    sourcePath: logicalFuturePath,
    entryPath: logicalFuturePath,
  });
  const guarded = assertGuardedSource({
    source,
    sourcePath: logicalFuturePath,
    allowedBarePackages: new Map([
      ["react", "19.2.3"],
      ["remotion", "4.0.489"],
    ]),
    relativeRoot: "src",
  });
  if (guarded.relativeImports.length > 0) {
    throw new Error(
      "GlobalVisual task must declare every relative source as an output.",
    );
  }
  const runtimeSourceRoot =
    input.locations.layoutKind === "repository"
      ? input.locations.runtimeResources
      : join(input.locations.runtimeResources, "source");
  const futurePath = join(runtimeSourceRoot, logicalFuturePath);
  compileTypeScriptImportGraph({
    rootDir: runtimeSourceRoot,
    rootPath: futurePath,
    typescriptLibRoot: join(
      input.locations.runtimeResources,
      "node_modules/typescript/lib",
    ),
    label: "GlobalVisual task compile",
    virtualSource: source,
  });
  return checked;
};
