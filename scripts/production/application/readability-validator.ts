import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ProductionRequirementsFreezeSchema,
  validateStoryCaptionReadability,
  type ProductionRequirementsFreeze,
  type SceneAssignment,
} from "../../../src/contracts";
import type { RendererSourceGraph } from "../../renderer-registry/domain";
import { renderReadabilityAwareProductionSceneRuntime } from "./project-scaffold";
import { validatePolicyAwareRendererSourceGraph } from "./readability-source-validator";
import { validateSharedSceneBoundarySources } from "./shared-boundary-source-validator";

const assertCurrentSharedSceneBoundary = async (rootDir: string) => {
  const [sceneSlotSource, sceneSafeAreaSource] = await Promise.all([
    readFile(
      join(rootDir, "src/remotion/runtime/story-visual/SceneSlot.tsx"),
      "utf8",
    ),
    readFile(
      join(rootDir, "src/remotion/runtime/readability/SceneSafeArea.tsx"),
      "utf8",
    ),
  ]);
  return validateSharedSceneBoundarySources({
    sceneSlotSource,
    sceneSafeAreaSource,
    generatedRuntimeSource: renderReadabilityAwareProductionSceneRuntime({
      storyId: "shared-boundary-contract",
      meaningIds: ["semantic-scene"],
    }),
  });
};

export const validateProductionReadabilityInputs = ({
  requirements: rawRequirements,
  story,
}: {
  readonly requirements: ProductionRequirementsFreeze | unknown;
  readonly story: unknown;
}) => {
  const requirements =
    ProductionRequirementsFreezeSchema.parse(rawRequirements);
  validateStoryCaptionReadability({
    story,
    policy: requirements.readabilityPolicy,
  });
  return {
    requirements,
    readabilityPolicy: requirements.readabilityPolicy,
  } as const;
};

export const requireCurrentProductionReadabilityPolicy = (
  requirements: ProductionRequirementsFreeze,
) => requirements.readabilityPolicy;

export const validateSceneReadability = async ({
  rootDir,
  assignment,
  graph,
}: {
  readonly rootDir: string;
  readonly assignment: SceneAssignment;
  readonly graph: RendererSourceGraph;
}) => {
  if (assignment.taskInput.schemaVersion !== 3) {
    throw new Error("Production Scene assignment is not current.");
  }
  const [validated, boundarySourceFingerprint] = await Promise.all([
    validatePolicyAwareRendererSourceGraph({
      rootDir,
      rendererPath: graph.rendererPath,
      sourcePaths: graph.files.map(({ sourcePath }) => sourcePath),
      policy: assignment.readabilityPolicy,
      boundaryMode: "shared-v3",
    }),
    assertCurrentSharedSceneBoundary(rootDir),
  ]);
  if (
    assignment.sceneCompositionBoundaryVersion !==
    assignment.taskInput.sceneCompositionBoundaryVersion
  ) {
    throw new Error("Production Scene shared boundary identity is stale.");
  }
  return {
    ...validated,
    sceneCompositionBoundaryVersion: assignment.sceneCompositionBoundaryVersion,
    boundarySourceFingerprint:
      boundarySourceFingerprint.boundarySourceFingerprint,
  } as const;
};
