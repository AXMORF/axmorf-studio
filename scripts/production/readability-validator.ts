import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ProductionRequirementsFreezeSchema,
  createFingerprint,
  validateStoryCaptionReadability,
  type ProductionRequirementsFreeze,
  type SceneAssignment,
} from "../../src/contracts";
import type { RendererSourceGraph } from "../renderer-registry/domain";
import { validatePolicyAwareRendererSourceGraph } from "./readability-source-validator";

const assertCurrentSharedSceneBoundary = async () => {
  const rootDir = process.cwd();
  const [sceneSlot, sceneSafeArea, scaffold] = await Promise.all([
    readFile(
      join(rootDir, "src/remotion/runtime/story-visual/SceneSlot.tsx"),
      "utf8",
    ),
    readFile(
      join(rootDir, "src/remotion/runtime/readability/SceneSafeArea.tsx"),
      "utf8",
    ),
    readFile(join(rootDir, "scripts/production/project-scaffold.ts"), "utf8"),
  ]);
  if (
    !sceneSlot.includes('sceneBoundaryVersion === "scene-composition-boundary-v1"') ||
    !sceneSlot.includes("<SceneSafeArea") ||
    !sceneSafeArea.includes("policy.sceneContentSafeAreaPx") ||
    !sceneSafeArea.includes("SceneReadabilityProvider") ||
    !scaffold.includes("sceneBoundaryVersion: task.schemaVersion === 3")
  ) {
    throw new Error("Shared Scene boundary runtime or scaffold marker is stale.");
  }
  return createFingerprint({
    namespace: "production-shared-scene-boundary-source",
    version: 1,
    value: { sceneSlot, sceneSafeArea, scaffold },
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
  if (requirements.schemaVersion === 1) {
    return { requirements, readabilityPolicy: null } as const;
  }
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
) => {
  if (requirements.schemaVersion === 1) {
    throw new Error(
      "New production runs require a frozen readability policy.",
    );
  }
  return requirements.readabilityPolicy;
};

export const validateSceneReadability = async ({
  rootDir,
  assignment,
  graph,
}: {
  readonly rootDir: string;
  readonly assignment: SceneAssignment;
  readonly graph: RendererSourceGraph;
}) => {
  if (assignment.schemaVersion === 1) {
    return { policyFingerprint: null, legacy: true } as const;
  }
  if (assignment.schemaVersion === 3) {
    const [validated, boundarySourceFingerprint] = await Promise.all([
      validatePolicyAwareRendererSourceGraph({
        rootDir,
        rendererPath: graph.rendererPath,
        sourcePaths: graph.files.map(({ sourcePath }) => sourcePath),
        policy: assignment.readabilityPolicy,
        boundaryMode: "shared-v3",
      }),
      assertCurrentSharedSceneBoundary(),
    ]);
    if (
      assignment.taskInput.schemaVersion !== 3 ||
      assignment.sceneCompositionBoundaryVersion !==
        assignment.taskInput.sceneCompositionBoundaryVersion
    ) {
      throw new Error("v3 Scene shared boundary identity is stale.");
    }
    return {
      ...validated,
      legacy: false,
      sceneCompositionBoundaryVersion:
        assignment.sceneCompositionBoundaryVersion,
      boundarySourceFingerprint,
    } as const;
  }
  const validated = await validatePolicyAwareRendererSourceGraph({
    rootDir,
    rendererPath: graph.rendererPath,
    sourcePaths: graph.files.map(({ sourcePath }) => sourcePath),
    policy: assignment.readabilityPolicy,
  });
  return { ...validated, legacy: false } as const;
};
