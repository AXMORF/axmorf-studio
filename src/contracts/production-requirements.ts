import { z } from "zod";

import {
  computeRenderSpecFingerprint,
  computeStoryCheckFingerprint,
} from "./auto-check";
import { VideoBriefSchema } from "./brief";
import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { computeStoryFingerprint } from "./generation-input";
import { NarrationSpecSchema } from "./narration";
import {
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  VoiceProfileIdSchema,
} from "./primitives";
import { CaptionSafeAreaSchema, RenderSpecSchema } from "./render";
import {
  StoryCheckReportSchema,
  validateStoryCheckReport,
} from "./story-check";
import { StorySpecSchema } from "./story";

export const PRODUCTION_REQUIREMENTS_CONTRACT_VERSION =
  "production-requirements-freeze-v1" as const;

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
    captionSafeArea: CaptionSafeAreaSchema,
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
    scope: z.enum([
      "production",
      "narrative",
      "all-scenes",
      "scene",
      "final-preview",
    ]),
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
    owner: z.enum(["main-agent", "scene-agent", "script", "user-preview"]),
    verification: z.enum(["contract", "mechanical", "user-preview"]),
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
      (requirement.verification === "user-preview") !==
      (requirement.owner === "user-preview")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "User-preview verification and user-preview ownership must be declared together.",
        path: ["verification"],
      });
    }
    if (
      requirement.owner === "user-preview" &&
      requirement.scope !== "final-preview"
    ) {
      context.addIssue({
        code: "custom",
        message: "User-preview requirements must target the final preview.",
        path: ["scope"],
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
    sceneLocalSound: z.enum(["allowed", "none"]),
    globalSound: z.literal("none"),
    globalVisual: z.literal("none"),
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
  })
  .strict();

const addFreezeInputIssues = (
  freeze: z.infer<typeof ProductionRequirementsFreezeInputObject>,
  context: z.RefinementCtx,
) => {
  const expectedPaths = {
    videoBrief: `src/projects/${freeze.storyId}/brief.json`,
    storySpec: `src/projects/${freeze.storyId}/story.json`,
    narrationSpec: `src/projects/${freeze.storyId}/narration.json`,
    renderSpec: `src/projects/${freeze.storyId}/render.json`,
    storyCheck: `src/projects/${freeze.storyId}/reviews/story-check.json`,
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
  ProductionRequirementsFreezeInputObject.superRefine(
    addFreezeInputIssues,
  ).readonly();

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
    version: 1,
    value: input,
  });
};

const ProductionRequirementsFreezeObject =
  ProductionRequirementsFreezeInputObject.extend({
    requirementsFingerprint: Sha256DigestSchema,
  }).strict();

export const ProductionRequirementsFreezeSchema =
  ProductionRequirementsFreezeObject.superRefine((freeze, context) => {
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
  }).readonly();

const ProductionRequirementsSourceSchema = z
  .object({
    brief: VideoBriefSchema,
    story: StorySpecSchema,
    narration: NarrationSpecSchema,
    render: RenderSpecSchema,
    storyCheck: StoryCheckReportSchema,
  })
  .strict()
  .superRefine((source, context) => {
    if (
      source.brief.storyId !== source.story.storyId ||
      source.storyCheck.storyId !== source.story.storyId
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

export const buildProductionRequirementsFreeze = ({
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
  const input = ProductionRequirementsFreezeInputSchema.parse({
    schemaVersion: 1,
    contractVersion: PRODUCTION_REQUIREMENTS_CONTRACT_VERSION,
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
    },
    normalizedSummary: {
      locale: source.render.locale,
      fps: source.render.fps,
      width: source.render.width,
      height: source.render.height,
      voiceProfileId: source.narration.voiceProfileId,
      captionSafeArea: source.render.captionSafeAreaPx,
    },
    enhancementSelection,
    resourcePolicy,
    additionalRequirements: requirements,
  });
  return ProductionRequirementsFreezeSchema.parse({
    ...input,
    requirementsFingerprint: computeProductionRequirementsFingerprint(input),
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
