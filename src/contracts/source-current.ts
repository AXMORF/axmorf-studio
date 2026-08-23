import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { TaskRevisionSchema } from "./producer-task";
import { ProductionRevisionIdSchema } from "./production-revision";

export const SOURCE_CURRENT_ATTESTATION_VERSION =
  "source-current-attestation-v1" as const;

export const SourceCurrentIdSchema = z
  .string()
  .regex(/^source-current-[0-9a-f]{64}$/u)
  .brand<"SourceCurrentId">();

export const SourceCurrentArtifactBindingSchema = z
  .strictObject({
    taskRevision: TaskRevisionSchema,
    artifactFingerprint: Sha256DigestSchema,
  })
  .readonly();

export const SourceCurrentFileSchema = z
  .strictObject({
    logicalPath: z
      .string()
      .min(1)
      .max(512)
      .regex(/^(?:project|public)\/(?!.*(?:^|\/)\.\.?\/)[^\\]+$/u),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
  })
  .readonly();

export const SourceCurrentValidatorBindingSchema = z
  .strictObject({
    id: z.string().min(1).max(160).regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u),
    version: z.string().min(1).max(160),
  })
  .readonly();

const SourceCurrentIdentityShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(SOURCE_CURRENT_ATTESTATION_VERSION),
  storyId: StoryIdSchema,
  revisionId: ProductionRevisionIdSchema,
  artifacts: z.array(SourceCurrentArtifactBindingSchema).min(1).readonly(),
  files: z.array(SourceCurrentFileSchema).min(1).readonly(),
  validators: z.array(SourceCurrentValidatorBindingSchema).min(1).readonly(),
} as const;

type SourceCurrentIdentity = z.infer<
  ReturnType<typeof z.strictObject<typeof SourceCurrentIdentityShape>>
>;

const assertSortedUnique = (
  value: SourceCurrentIdentity,
  context: z.RefinementCtx,
) => {
  const collections = [
    ["artifacts", value.artifacts.map(({ taskRevision }) => taskRevision)],
    ["files", value.files.map(({ logicalPath }) => logicalPath)],
    ["validators", value.validators.map(({ id }) => id)],
  ] as const;
  for (const [path, entries] of collections) {
    const sorted = [...entries].sort();
    if (
      entries.some((entry, index) => entry !== sorted[index]) ||
      new Set(entries).size !== entries.length
    ) {
      context.addIssue({
        code: "custom",
        message: `${path} must be sorted and unique.`,
        path: [path],
      });
    }
  }
};

const SourceCurrentIdentitySchema = z
  .strictObject(SourceCurrentIdentityShape)
  .superRefine(assertSortedUnique)
  .readonly();

const createSourceCurrentId = (identity: SourceCurrentIdentity) => {
  const fingerprint = createFingerprint({
    namespace: "source-current-attestation",
    version: 1,
    value: identity,
  });
  return SourceCurrentIdSchema.parse(
    `source-current-${fingerprint.slice("sha256:".length)}`,
  );
};

export const SourceCurrentAttestationSchema = z
  .strictObject({
    ...SourceCurrentIdentityShape,
    sourceCurrentId: SourceCurrentIdSchema,
  })
  .superRefine((value, context) => {
    assertSortedUnique(value, context);
    const { sourceCurrentId, ...rawIdentity } = value;
    const identity = SourceCurrentIdentitySchema.parse(rawIdentity);
    if (sourceCurrentId !== createSourceCurrentId(identity)) {
      context.addIssue({
        code: "custom",
        message: "Source current identity is stale.",
        path: ["sourceCurrentId"],
      });
    }
  })
  .readonly();

export const buildSourceCurrentAttestation = (raw: unknown) => {
  const input = raw as Record<string, unknown>;
  const identity = SourceCurrentIdentitySchema.parse({
    ...input,
    schemaVersion: 1,
    contractVersion: SOURCE_CURRENT_ATTESTATION_VERSION,
  });
  return SourceCurrentAttestationSchema.parse({
    ...identity,
    sourceCurrentId: createSourceCurrentId(identity),
  });
};

export type SourceCurrentAttestation = z.infer<
  typeof SourceCurrentAttestationSchema
>;
export type SourceCurrentId = z.infer<typeof SourceCurrentIdSchema>;

export const DeliveryPolicySchema = z.enum(["manual", "automatic"]);
export type DeliveryPolicy = z.infer<typeof DeliveryPolicySchema>;

export const resolveDeliveryPolicy = ({
  override,
  project,
  appDefault = "manual",
}: {
  readonly override?: unknown;
  readonly project?: unknown;
  readonly appDefault?: unknown;
}): DeliveryPolicy =>
  DeliveryPolicySchema.parse(
    override ?? project ?? DeliveryPolicySchema.parse(appDefault),
  );
