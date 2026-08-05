import {
  ProductionRequirementsFreezeSchema,
  validateStoryCaptionReadability,
  type ProductionRequirementsFreeze,
} from "../../src/contracts";

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
  if (requirements.schemaVersion !== 2) {
    throw new Error(
      "New production runs require production-requirements-freeze-v2 with a frozen readability policy.",
    );
  }
  return requirements.readabilityPolicy;
};
