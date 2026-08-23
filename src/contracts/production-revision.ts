import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { MeaningIdSchema, Sha256DigestSchema, StoryIdSchema } from "./primitives";

export const PRODUCTION_REVISION_VERSION = "production-revision-v1" as const;

export const ProductionRevisionIdSchema = z
  .string()
  .regex(/^revision-[0-9a-f]{64}$/u)
  .brand<"ProductionRevisionId">();

const NamedFingerprintSchema = z
  .object({ id: z.string().min(1).max(160), fingerprint: Sha256DigestSchema })
  .strict()
  .readonly();

const SceneRevisionInputSchema = z
  .object({
    meaningId: MeaningIdSchema,
    beatFingerprint: Sha256DigestSchema,
    timingFingerprint: Sha256DigestSchema,
    readabilityFingerprint: Sha256DigestSchema,
    briefFingerprint: Sha256DigestSchema,
    requirementsFingerprint: Sha256DigestSchema,
    resourcePoolFingerprint: Sha256DigestSchema,
    selectedResourcesFingerprint: Sha256DigestSchema,
    templateInstanceFingerprint: Sha256DigestSchema.nullable(),
  })
  .strict()
  .readonly();

const RevisionIdentityShape = {
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_REVISION_VERSION),
    storyId: StoryIdSchema,
    storyFingerprint: Sha256DigestSchema,
    narrationFingerprint: Sha256DigestSchema,
    renderFingerprint: Sha256DigestSchema,
    visualStyleFingerprint: Sha256DigestSchema,
    projectSoundFingerprint: Sha256DigestSchema,
    authoringRequirementsFingerprint: Sha256DigestSchema,
    globalVisualBriefFingerprint: Sha256DigestSchema,
    storyResourcePoolFingerprint: Sha256DigestSchema,
    projectAssetManifestFingerprint: Sha256DigestSchema,
    narrationGenerationFingerprint: Sha256DigestSchema,
    scenes: z.array(SceneRevisionInputSchema),
    selectedResources: z.array(NamedFingerprintSchema),
    policyFingerprints: z.array(NamedFingerprintSchema),
} as const;

const validateOrdering = (
  revision: z.infer<ReturnType<typeof z.object<typeof RevisionIdentityShape>>>,
  context: z.RefinementCtx,
) => {
    const assertSortedUnique = (values: readonly string[], path: string) => {
      const sorted = [...values].sort();
      if (
        values.some((value, index) => value !== sorted[index]) ||
        new Set(values).size !== values.length
      ) {
        context.addIssue({ code: "custom", message: `${path} must be sorted and unique.`, path: [path] });
      }
    };
    assertSortedUnique(revision.scenes.map(({ meaningId }) => meaningId), "scenes");
    assertSortedUnique(revision.selectedResources.map(({ id }) => id), "selectedResources");
    assertSortedUnique(revision.policyFingerprints.map(({ id }) => id), "policyFingerprints");
};

const RevisionIdentitySchema = z
  .object(RevisionIdentityShape)
  .superRefine((revision, context) => {
    validateOrdering(revision, context);
  })
  .readonly();

const computeRevisionId = (identity: z.infer<typeof RevisionIdentitySchema>) => {
  const fingerprint = createFingerprint({
    namespace: "production-revision",
    version: 1,
    value: identity,
  });
  return ProductionRevisionIdSchema.parse(
    `revision-${fingerprint.slice("sha256:".length)}`,
  );
};

export const ProductionRevisionSchema = z
  .object({ ...RevisionIdentityShape, revisionId: ProductionRevisionIdSchema })
  .strict()
  .superRefine((revision, context) => {
    validateOrdering(revision, context);
    const { revisionId, ...identity } = revision;
    if (revisionId !== computeRevisionId(RevisionIdentitySchema.parse(identity))) {
      context.addIssue({
        code: "custom",
        message: "Production Revision identity is stale.",
        path: ["revisionId"],
      });
    }
  })
  .readonly();

export const buildProductionRevision = (rawInput: unknown) => {
  const input = rawInput as Record<string, unknown>;
  const identity = RevisionIdentitySchema.parse({
    ...input,
    schemaVersion: 1,
    contractVersion: PRODUCTION_REVISION_VERSION,
  });
  return ProductionRevisionSchema.parse({
    ...identity,
    revisionId: computeRevisionId(identity),
  });
};

export type ProductionRevision = z.infer<typeof ProductionRevisionSchema>;
export type ProductionRevisionId = z.infer<typeof ProductionRevisionIdSchema>;
