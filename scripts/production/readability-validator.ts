import {
  ProductionRequirementsFreezeSchema,
  validateStoryCaptionReadability,
  type ProductionRequirementsFreeze,
  type SceneAssignment,
} from "../../src/contracts";
import type { RendererSourceGraph } from "../renderer-registry/domain";
import { validatePolicyAwareRendererSourceGraph } from "./readability-source-validator";

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
  const validated = await validatePolicyAwareRendererSourceGraph({
    rootDir,
    rendererPath: graph.rendererPath,
    sourcePaths: graph.files.map(({ sourcePath }) => sourcePath),
    policy: assignment.readabilityPolicy,
  });
  return { ...validated, legacy: false } as const;
};
