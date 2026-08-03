import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  type M1ArtifactBundle,
  validateM1ArtifactBundle,
} from "./m1-validation";
import {
  CompositionIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  type Sha256Digest,
} from "./primitives";
import {
  NarrativeProjectSourceSchema,
  StoryCompositionPropsSchema,
  type NarrativeProjectSource,
  type StoryCompositionProps,
} from "./project";
import { SemanticTimingSchema, type SemanticTiming } from "./semantic-timing";

export const PROJECT_REGISTRY_GENERATOR_ID =
  "project-registry-generator-v1" as const;
export const NARRATIVE_CORE_VERSION = "narrative-core-v2" as const;
export const M3_EVIDENCE_SCHEMA_VERSION = 1 as const;

const CompositionModulePathSchema = z
  .string()
  .regex(/^\.\/[a-z0-9]+(?:-[a-z0-9]+)*\/Composition$/)
  .transform((value) => value as `./${string}/Composition`);

export const ProjectRegistrationDescriptorSchema = z
  .object({
    storyId: StoryIdSchema,
    id: CompositionIdSchema,
    fps: PositiveIntegerSchema.max(120),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    durationInFrames: PositiveIntegerSchema,
    defaultProps: StoryCompositionPropsSchema,
    compositionModulePath: CompositionModulePathSchema,
  })
  .strict()
  .superRefine((descriptor, context) => {
    if (descriptor.defaultProps.projectId !== descriptor.storyId) {
      context.addIssue({
        code: "custom",
        message: "defaultProps.projectId must match storyId.",
        path: ["defaultProps", "projectId"],
      });
    }
    if (
      descriptor.compositionModulePath !== `./${descriptor.storyId}/Composition`
    ) {
      context.addIssue({
        code: "custom",
        message: "compositionModulePath must be derived from storyId.",
        path: ["compositionModulePath"],
      });
    }
  })
  .readonly();

export type ProjectRegistrationDescriptor = z.infer<
  typeof ProjectRegistrationDescriptorSchema
>;

export const createProjectRegistrationDescriptor = ({
  projectSource: rawProjectSource,
  semanticTiming: rawSemanticTiming,
  compositionModulePath,
}: {
  readonly projectSource: NarrativeProjectSource;
  readonly semanticTiming: SemanticTiming;
  readonly compositionModulePath: `./${string}/Composition`;
}): ProjectRegistrationDescriptor => {
  const projectSource = NarrativeProjectSourceSchema.parse(rawProjectSource);
  const semanticTiming = SemanticTimingSchema.parse(rawSemanticTiming);
  const { story, render } = projectSource;
  if (semanticTiming.storyId !== story.storyId) {
    throw new Error("SemanticTiming.storyId must match StorySpec.storyId.");
  }
  if (semanticTiming.fps !== render.fps) {
    throw new Error("SemanticTiming.fps must match RenderSpec.fps.");
  }

  return ProjectRegistrationDescriptorSchema.parse({
    storyId: story.storyId,
    id: render.compositionId,
    fps: render.fps,
    width: render.width,
    height: render.height,
    durationInFrames: semanticTiming.durationInFrames,
    defaultProps: { projectId: story.storyId } satisfies StoryCompositionProps,
    compositionModulePath,
  });
};

export const computeGeneratedRegistryEntryChecksum = (
  input: ProjectRegistrationDescriptor,
): Sha256Digest => {
  const descriptor = ProjectRegistrationDescriptorSchema.parse(input);
  return createFingerprint({
    namespace: "project-registry-generated-entry",
    version: 1,
    value: descriptor,
  });
};

export const computeProjectRegistryEntryFingerprint = (input: {
  readonly descriptor: ProjectRegistrationDescriptor;
  readonly semanticTimingFingerprint: Sha256Digest;
  readonly generatedEntryChecksum: Sha256Digest;
  readonly generatorId: typeof PROJECT_REGISTRY_GENERATOR_ID;
}): Sha256Digest => {
  const descriptor = ProjectRegistrationDescriptorSchema.parse(
    input.descriptor,
  );
  const semanticTimingFingerprint = Sha256DigestSchema.parse(
    input.semanticTimingFingerprint,
  );
  const generatedEntryChecksum = Sha256DigestSchema.parse(
    input.generatedEntryChecksum,
  );
  if (
    generatedEntryChecksum !== computeGeneratedRegistryEntryChecksum(descriptor)
  ) {
    throw new Error("Generated registry entry checksum is stale.");
  }
  if (typeof input.generatorId !== "string" || input.generatorId.length === 0) {
    throw new Error("ProjectRegistry generator identity is required.");
  }
  return createFingerprint({
    namespace: "project-registry-entry",
    version: 1,
    value: {
      descriptor,
      semanticTimingFingerprint,
      generatedEntryChecksum,
      generatorId: input.generatorId,
    },
  });
};

export const computeNarrativeBaselineFingerprint = (input: {
  readonly artifactBundle: M1ArtifactBundle;
  readonly projectRegistryEntryFingerprint: Sha256Digest;
  readonly narrativeCoreVersion: typeof NARRATIVE_CORE_VERSION;
}): Sha256Digest => {
  const artifactBundle = validateM1ArtifactBundle(input.artifactBundle);
  const projectRegistryEntryFingerprint = Sha256DigestSchema.parse(
    input.projectRegistryEntryFingerprint,
  );
  if (
    typeof input.narrativeCoreVersion !== "string" ||
    input.narrativeCoreVersion.length === 0
  ) {
    throw new Error("NarrativeCore version is required.");
  }
  return createFingerprint({
    namespace: "narrative-baseline",
    version: 1,
    value: {
      storySpec: artifactBundle.projectSource.story,
      renderSpec: artifactBundle.projectSource.render,
      sealedNarration: artifactBundle.sealedNarration,
      semanticTiming: artifactBundle.semanticTiming,
      projectRegistryEntryFingerprint,
      narrativeCoreVersion: input.narrativeCoreVersion,
    },
  });
};

const AlphaValueSchema = z.number().int().min(0).max(255);
const EvidenceArtifactsSchema = z
  .object({
    transparentStill: z
      .object({
        localPath: z.string().min(1),
        checksum: Sha256DigestSchema,
        frame: z.literal(0),
        alphaMin: z.literal(0),
        alphaMax: z.literal(0),
      })
      .strict()
      .readonly(),
    captionStill: z
      .object({
        localPath: z.string().min(1),
        checksum: Sha256DigestSchema,
        frame: NonNegativeIntegerSchema,
        alphaMin: z.literal(0),
        alphaMax: AlphaValueSchema.min(1),
        topLeftAlphaMax: z.literal(0),
      })
      .strict()
      .readonly(),
    render: z
      .object({
        localPath: z.string().min(1),
        checksum: Sha256DigestSchema,
        fps: PositiveIntegerSchema.max(120),
        durationInFrames: PositiveIntegerSchema,
        videoStreamCount: z.literal(1),
        audioStreamCount: z.literal(1),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

const EvidenceReceiptInputObject = z
  .object({
    schemaVersion: z.literal(M3_EVIDENCE_SCHEMA_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    sealedNarrationFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    generatedRegistryChecksum: Sha256DigestSchema,
    projectRegistryEntryFingerprint: Sha256DigestSchema,
    narrativeBaselineFingerprint: Sha256DigestSchema,
    artifacts: EvidenceArtifactsSchema,
  })
  .strict();

const addEvidencePathIssues = (
  receipt: z.infer<typeof EvidenceReceiptInputObject>,
  context: z.RefinementCtx,
) => {
  const prefix = `out/${receipt.storyId}/`;
  const expectedPaths = {
    transparentStill: `${prefix}m3-transparent-frame-0.png`,
    captionStill: `${prefix}m3-caption-frame-${receipt.artifacts.captionStill.frame}.png`,
    render: `${prefix}m3-narrative-baseline.mp4`,
  } as const;
  for (const [artifact, expectedPath] of Object.entries(expectedPaths)) {
    const actualPath =
      receipt.artifacts[artifact as keyof typeof expectedPaths].localPath;
    if (actualPath !== expectedPath) {
      context.addIssue({
        code: "custom",
        message: `${artifact} must use the fixed project evidence path.`,
        path: ["artifacts", artifact, "localPath"],
      });
    }
  }
  if (
    receipt.artifacts.captionStill.frame >=
    receipt.artifacts.render.durationInFrames
  ) {
    context.addIssue({
      code: "custom",
      message: "captionStill frame must be inside the Baseline render.",
      path: ["artifacts", "captionStill", "frame"],
    });
  }
};

export const M3NarrativeBaselineEvidenceReceiptInputSchema =
  EvidenceReceiptInputObject.superRefine(addEvidencePathIssues).readonly();

export type M3NarrativeBaselineEvidenceReceiptInput = z.infer<
  typeof M3NarrativeBaselineEvidenceReceiptInputSchema
>;

export const computeM3EvidenceFingerprint = (
  input: M3NarrativeBaselineEvidenceReceiptInput,
): Sha256Digest =>
  createFingerprint({
    namespace: "m3-narrative-baseline-evidence",
    version: 1,
    value: input,
  });

export const M3NarrativeBaselineEvidenceReceiptSchema =
  EvidenceReceiptInputObject.extend({
    evidenceFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((receipt, context) => {
      addEvidencePathIssues(receipt, context);
      const { evidenceFingerprint, ...input } = receipt;
      if (computeM3EvidenceFingerprint(input) !== evidenceFingerprint) {
        context.addIssue({
          code: "custom",
          message: "M3 evidence fingerprint is stale.",
          path: ["evidenceFingerprint"],
        });
      }
    })
    .readonly();

export type M3NarrativeBaselineEvidenceReceipt = z.infer<
  typeof M3NarrativeBaselineEvidenceReceiptSchema
>;
