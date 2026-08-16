import { z } from "zod";

import {
  computeRenderSpecFingerprint,
  computeStoryCheckFingerprint,
} from "./auto-check";
import { VideoBriefSchema } from "./brief";
import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { computeStoryFingerprint } from "./generation-input";
import { NarrationSpecSchema } from "./narration";
import { ProjectSoundPlanSchema } from "./project-sound";
import {
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  VoiceProfileIdSchema,
} from "./primitives";
import {
  ProductionReadabilityPolicySchema,
  resolveProductionReadabilityPolicy,
  validateStoryCaptionReadability,
} from "./production-readability";
import { RenderSpecSchema } from "./render";
import {
  StoryCheckReportSchema,
  validateStoryCheckReport,
} from "./story-check";
import { StorySpecSchema } from "./story";

export const PRODUCTION_REQUIREMENTS_CONTRACT_VERSION =
  "production-requirements-current-v2" as const;
export const SCENE_COMPOSITION_BOUNDARY_VERSION =
  "scene-composition-boundary-v1" as const;

export const SceneBoundaryOwnershipSchema = z
  .object({
    sceneCompositionBoundaryVersion: z.literal(
      SCENE_COMPOSITION_BOUNDARY_VERSION,
    ),
    sceneSafeAreaOwner: z.literal("composition"),
    captionOwner: z.literal("caption-layer"),
  })
  .strict()
  .readonly();

const RepositorySourcePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      !value.includes("://"),
    "Source bindings must use safe repository-relative paths.",
  );

const ProductionArtifactBindingObject = z
  .object({
    repositoryPath: RepositorySourcePathSchema,
    checksum: Sha256DigestSchema,
  })
  .strict();

export const ProductionArtifactBindingSchema =
  ProductionArtifactBindingObject.readonly();

export const FingerprintedProductionArtifactBindingSchema =
  ProductionArtifactBindingObject.extend({
    fingerprint: Sha256DigestSchema,
  })
    .strict()
    .readonly();

const ProductionSourceBindingsSchema = z
  .object({
    videoBrief: ProductionArtifactBindingSchema,
    storySpec: FingerprintedProductionArtifactBindingSchema,
    narrationSpec: FingerprintedProductionArtifactBindingSchema,
    renderSpec: FingerprintedProductionArtifactBindingSchema,
    storyCheck: FingerprintedProductionArtifactBindingSchema,
    projectSound: FingerprintedProductionArtifactBindingSchema,
  })
  .strict()
  .readonly();

const ProductionNormalizedSummarySchema = z
  .object({
    locale: z.string().trim().min(1),
    fps: PositiveIntegerSchema.max(120),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    voiceProfileId: VoiceProfileIdSchema,
  })
  .strict()
  .readonly();

const SAFE_REQUIREMENT_TEXT_PATTERN =
  /(?:^|\s)(?:\/home\/|\/data\/|\/tmp\/|[A-Za-z]:\\)|Bearer\s|\b(?:api[-_ ]?key|token|secret|private[-_ ]?config|provider[-_ ]?endpoint)\b|https?:\/\//iu;

const RequirementStatementSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine(
    (statement) => !SAFE_REQUIREMENT_TEXT_PATTERN.test(statement),
    "Production requirement statements must not contain private diagnostics or absolute paths.",
  );

const RequirementIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const ProductionRequirementObject = z
  .object({
    requirementId: RequirementIdSchema,
    scope: z.enum(["production", "narrative", "all-scenes", "scene"]),
    targetMeaningIds: z.array(MeaningIdSchema).max(128).readonly(),
    category: z.enum([
      "content",
      "render",
      "narration",
      "caption",
      "visual",
      "resource",
      "sound",
      "delivery",
      "other",
    ]),
    statement: RequirementStatementSchema,
    owner: z.enum(["main-agent", "scene-agent", "script"]),
    verification: z.enum(["contract", "mechanical"]),
    severity: z.enum(["error", "warning"]),
  })
  .strict();

export const ProductionRequirementSchema =
  ProductionRequirementObject.superRefine((requirement, context) => {
    const targets = requirement.targetMeaningIds;
    if (new Set(targets).size !== targets.length) {
      context.addIssue({
        code: "custom",
        message: "Production requirement target meaning IDs must be unique.",
        path: ["targetMeaningIds"],
      });
    }
    if (
      (requirement.scope === "scene" && targets.length === 0) ||
      (requirement.scope !== "scene" && targets.length !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Only scene-scoped requirements declare one or more target meaning IDs.",
        path: ["targetMeaningIds"],
      });
    }
    if (
      requirement.verification === "mechanical" &&
      requirement.owner !== "script"
    ) {
      context.addIssue({
        code: "custom",
        message: "Mechanical verification must be owned by the fixed script.",
        path: ["owner"],
      });
    }
    if (
      requirement.owner === "scene-agent" &&
      requirement.scope !== "scene" &&
      requirement.scope !== "all-scenes"
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene Agent requirements must target a Scene scope.",
        path: ["scope"],
      });
    }
  }).readonly();

const EnhancementSelectionSchema = z
  .object({
    storyVisual: z.literal("required"),
    sound: z.enum(["allowed", "none"]),
    globalVisual: z.literal("required"),
  })
  .strict()
  .readonly();

const ResourcePolicySchema = z
  .object({
    selfAuthoredVisualsAllowed: z.literal(true),
    unlistedThirdPartyResources: z.literal("deny"),
  })
  .strict()
  .readonly();

const ProductionRequirementsFreezeInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_REQUIREMENTS_CONTRACT_VERSION),
    storyId: StoryIdSchema,
    sourceBindings: ProductionSourceBindingsSchema,
    normalizedSummary: ProductionNormalizedSummarySchema,
    enhancementSelection: EnhancementSelectionSchema,
    resourcePolicy: ResourcePolicySchema,
    additionalRequirements: z
      .array(ProductionRequirementSchema)
      .max(256)
      .readonly(),
    readabilityPolicy: ProductionReadabilityPolicySchema,
    sceneBoundaryOwnership: SceneBoundaryOwnershipSchema,
  })
  .strict();

type ProductionRequirementsFreezeInput = z.infer<
  typeof ProductionRequirementsFreezeInputObject
>;

const addFreezeInputIssues = (
  freeze: ProductionRequirementsFreezeInput,
  context: z.RefinementCtx,
) => {
  const expectedPaths = {
    videoBrief: `src/projects/${freeze.storyId}/brief.json`,
    storySpec: `src/projects/${freeze.storyId}/story.json`,
    narrationSpec: `src/projects/${freeze.storyId}/narration.json`,
    renderSpec: `src/projects/${freeze.storyId}/render.json`,
    storyCheck: `src/projects/${freeze.storyId}/reviews/story-check.json`,
    projectSound: `src/projects/${freeze.storyId}/sound.json`,
  } as const;
  for (const [bindingId, expectedPath] of Object.entries(expectedPaths)) {
    const binding =
      freeze.sourceBindings[bindingId as keyof typeof expectedPaths];
    if (binding.repositoryPath !== expectedPath) {
      context.addIssue({
        code: "custom",
        message: "Production source binding path is not current.",
        path: ["sourceBindings", bindingId, "repositoryPath"],
      });
    }
  }
  const requirementIds = freeze.additionalRequirements.map(
    ({ requirementId }) => requirementId,
  );
  if (new Set(requirementIds).size !== requirementIds.length) {
    context.addIssue({
      code: "custom",
      message: "Production requirement IDs must be unique.",
      path: ["additionalRequirements"],
    });
  }
};

export const ProductionRequirementsFreezeInputSchema =
  ProductionRequirementsFreezeInputObject.superRefine((freeze, context) => {
    addFreezeInputIssues(freeze, context);
    if (
      freeze.readabilityPolicy.width !== freeze.normalizedSummary.width ||
      freeze.readabilityPolicy.height !== freeze.normalizedSummary.height
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Production readability policy dimensions must match the frozen RenderSpec.",
        path: ["readabilityPolicy"],
      });
    }
  }).readonly();

export const computeProductionRequirementsFingerprint = (rawInput: unknown) => {
  if (
    rawInput === null ||
    typeof rawInput !== "object" ||
    Array.isArray(rawInput)
  ) {
    return ProductionRequirementsFreezeInputSchema.parse(rawInput);
  }
  const inputRecord = { ...(rawInput as Record<string, unknown>) };
  delete inputRecord.requirementsFingerprint;
  const input = ProductionRequirementsFreezeInputSchema.parse(inputRecord);
  return createFingerprint({
    namespace: "production-requirements-freeze",
    version: input.schemaVersion,
    value: input,
  });
};

const ProductionRequirementsFreezeObject =
  ProductionRequirementsFreezeInputObject.extend({
    requirementsFingerprint: Sha256DigestSchema,
  }).strict();

const withCurrentFreezeFingerprint = (
  freeze: ProductionRequirementsFreezeInput & {
    readonly requirementsFingerprint: string;
  },
  context: z.RefinementCtx,
) => {
  const { requirementsFingerprint, ...input } = freeze;
  addFreezeInputIssues(input, context);
  let expectedFingerprint;
  try {
    expectedFingerprint = computeProductionRequirementsFingerprint(input);
  } catch {
    return;
  }
  if (requirementsFingerprint !== expectedFingerprint) {
    context.addIssue({
      code: "custom",
      message: "Production requirements fingerprint is stale.",
      path: ["requirementsFingerprint"],
    });
  }
};

export const ProductionRequirementsFreezeSchema =
  ProductionRequirementsFreezeObject.superRefine((freeze, context) => {
    withCurrentFreezeFingerprint(freeze, context);
    if (
      freeze.readabilityPolicy.width !== freeze.normalizedSummary.width ||
      freeze.readabilityPolicy.height !== freeze.normalizedSummary.height
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Production readability policy dimensions must match the frozen RenderSpec.",
        path: ["readabilityPolicy"],
      });
    }
  }).readonly();

const ProductionRequirementsSourceSchema = z
  .object({
    brief: VideoBriefSchema,
    story: StorySpecSchema,
    narration: NarrationSpecSchema,
    render: RenderSpecSchema,
    storyCheck: StoryCheckReportSchema,
    projectSound: ProjectSoundPlanSchema,
  })
  .strict()
  .superRefine((source, context) => {
    if (
      source.brief.storyId !== source.story.storyId ||
      source.storyCheck.storyId !== source.story.storyId ||
      source.projectSound.storyId !== source.story.storyId
    ) {
      context.addIssue({
        code: "custom",
        message: "Production requirement source story IDs must match.",
        path: ["story"],
      });
    }
  })
  .readonly();

const ProductionSourceChecksumsSchema = z
  .object({
    videoBrief: Sha256DigestSchema,
    storySpec: Sha256DigestSchema,
    narrationSpec: Sha256DigestSchema,
    renderSpec: Sha256DigestSchema,
    storyCheck: Sha256DigestSchema,
    projectSound: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const computeNarrationSpecFingerprint = (narration: unknown) =>
  createFingerprint({
    namespace: "narration-spec",
    version: 1,
    value: NarrationSpecSchema.parse(narration),
  });

const assertCurrentSource = (rawSource: unknown) => {
  const source = ProductionRequirementsSourceSchema.parse(rawSource);
  const storyCheck = validateStoryCheckReport({
    story: source.story,
    narration: source.narration,
    report: source.storyCheck,
  });
  if (storyCheck.decision !== "proceed") {
    throw new Error("Current StoryCheck must permit production to proceed.");
  }
  return { ...source, storyCheck } as const;
};

const assertCurrentRequirementTargets = ({
  requirements,
  meaningIds,
}: {
  readonly requirements: readonly z.infer<typeof ProductionRequirementSchema>[];
  readonly meaningIds: ReadonlySet<string>;
}) => {
  for (const requirement of requirements) {
    if (
      requirement.targetMeaningIds.some(
        (meaningId) => !meaningIds.has(meaningId),
      )
    ) {
      throw new Error(
        `Production requirement ${requirement.requirementId} targets an unknown meaningId.`,
      );
    }
  }
};

const buildProductionRequirementsBase = ({
  source: rawSource,
  sourceChecksums: rawSourceChecksums,
  enhancementSelection,
  resourcePolicy,
  additionalRequirements,
}: {
  readonly source: unknown;
  readonly sourceChecksums: unknown;
  readonly enhancementSelection: unknown;
  readonly resourcePolicy: unknown;
  readonly additionalRequirements: unknown;
}) => {
  const source = assertCurrentSource(rawSource);
  const sourceChecksums =
    ProductionSourceChecksumsSchema.parse(rawSourceChecksums);
  const selectedEnhancements =
    EnhancementSelectionSchema.parse(enhancementSelection);
  if (
    selectedEnhancements.sound === "none" &&
    source.projectSound.contributions.length > 0
  ) {
    throw new Error(
      "Production sound cannot be disabled while Project sound contributions are selected.",
    );
  }
  const requirements = z
    .array(ProductionRequirementSchema)
    .max(256)
    .readonly()
    .parse(additionalRequirements);
  assertCurrentRequirementTargets({
    requirements,
    meaningIds: new Set(source.story.beats.map(({ meaningId }) => meaningId)),
  });

  const storyId = source.story.storyId;
  return {
    storyId,
    sourceBindings: {
      videoBrief: {
        repositoryPath: `src/projects/${storyId}/brief.json`,
        checksum: sourceChecksums.videoBrief,
      },
      storySpec: {
        repositoryPath: `src/projects/${storyId}/story.json`,
        checksum: sourceChecksums.storySpec,
        fingerprint: computeStoryFingerprint(source.story),
      },
      narrationSpec: {
        repositoryPath: `src/projects/${storyId}/narration.json`,
        checksum: sourceChecksums.narrationSpec,
        fingerprint: computeNarrationSpecFingerprint(source.narration),
      },
      renderSpec: {
        repositoryPath: `src/projects/${storyId}/render.json`,
        checksum: sourceChecksums.renderSpec,
        fingerprint: computeRenderSpecFingerprint(source.render),
      },
      storyCheck: {
        repositoryPath: `src/projects/${storyId}/reviews/story-check.json`,
        checksum: sourceChecksums.storyCheck,
        fingerprint: computeStoryCheckFingerprint(source.storyCheck),
      },
      projectSound: {
        repositoryPath: `src/projects/${storyId}/sound.json`,
        checksum: sourceChecksums.projectSound,
        fingerprint: source.projectSound.soundPlanFingerprint,
      },
    },
    normalizedSummary: {
      locale: source.render.locale,
      fps: source.render.fps,
      width: source.render.width,
      height: source.render.height,
      voiceProfileId: source.narration.voiceProfileId,
    },
    enhancementSelection: selectedEnhancements,
    resourcePolicy,
    additionalRequirements: requirements,
  } as const;
};

type ProductionRequirementsBuildInput = Parameters<
  typeof buildProductionRequirementsBase
>[0] & { readonly readability: Readonly<{ edgeInsetPx: number }> };

export const buildProductionRequirementsFreeze = (
  input: ProductionRequirementsBuildInput,
) => {
  const base = buildProductionRequirementsBase(input);
  const readabilityPolicy = resolveProductionReadabilityPolicy({
    width: base.normalizedSummary.width,
    height: base.normalizedSummary.height,
    edgeInsetPx: input.readability.edgeInsetPx,
  });
  const source = assertCurrentSource(input.source);
  validateStoryCaptionReadability({
    story: source.story,
    policy: readabilityPolicy,
  });
  const freezeInput = ProductionRequirementsFreezeInputSchema.parse({
    ...base,
    schemaVersion: 1,
    contractVersion: PRODUCTION_REQUIREMENTS_CONTRACT_VERSION,
    readabilityPolicy,
    sceneBoundaryOwnership: {
      sceneCompositionBoundaryVersion: SCENE_COMPOSITION_BOUNDARY_VERSION,
      sceneSafeAreaOwner: "composition",
      captionOwner: "caption-layer",
    },
  });
  return ProductionRequirementsFreezeSchema.parse({
    ...freezeInput,
    requirementsFingerprint:
      computeProductionRequirementsFingerprint(freezeInput),
  });
};

export const resolveCurrentProductionRequirements = ({
  requirements: rawRequirements,
  source: rawSource,
  sourceChecksums,
}: {
  readonly requirements: unknown;
  readonly source: unknown;
  readonly sourceChecksums: unknown;
}) => {
  const requirements =
    ProductionRequirementsFreezeSchema.parse(rawRequirements);
  const source = assertCurrentSource(rawSource);
  const current = buildProductionRequirementsFreeze({
    source,
    sourceChecksums,
    enhancementSelection: requirements.enhancementSelection,
    resourcePolicy: requirements.resourcePolicy,
    additionalRequirements: requirements.additionalRequirements,
    readability: {
      edgeInsetPx: requirements.readabilityPolicy.baseEdgeInsetPx,
    },
  });
  if (
    serializeCanonicalJson(requirements.normalizedSummary) !==
    serializeCanonicalJson(current.normalizedSummary)
  ) {
    throw new Error("Production requirements normalized summary is stale.");
  }
  if (
    serializeCanonicalJson(requirements.sourceBindings) !==
    serializeCanonicalJson(current.sourceBindings)
  ) {
    throw new Error("Production requirements source binding is stale.");
  }
  if (
    requirements.storyId !== current.storyId ||
    requirements.requirementsFingerprint !== current.requirementsFingerprint
  ) {
    throw new Error("Production requirements identity is stale.");
  }
  validateStoryCaptionReadability({
    story: source.story,
    policy: requirements.readabilityPolicy,
  });
  return requirements;
};

export type ProductionArtifactBinding = z.infer<
  typeof ProductionArtifactBindingSchema
>;
export type FingerprintedProductionArtifactBinding = z.infer<
  typeof FingerprintedProductionArtifactBindingSchema
>;
export type ProductionRequirement = z.infer<typeof ProductionRequirementSchema>;
export type ProductionRequirementsFreeze = z.infer<
  typeof ProductionRequirementsFreezeSchema
>;
