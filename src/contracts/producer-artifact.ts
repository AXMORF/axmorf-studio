import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import {
  ProducerLogicalPathSchema,
  ProducerTaskKindSchema,
  TaskRevisionSchema,
} from "./producer-task";

export const PRODUCER_ARTIFACT_VERSION = "producer-artifact-v1" as const;

const OutputManifestEntrySchema = z
  .object({
    logicalPath: ProducerLogicalPathSchema,
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
    kind: z.literal("file"),
  })
  .strict()
  .readonly();

const ArtifactDependencySchema = z
  .object({
    taskRevision: TaskRevisionSchema,
    artifactFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const ArtifactIdentityShape = {
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCER_ARTIFACT_VERSION),
    storyId: StoryIdSchema,
    taskKind: ProducerTaskKindSchema,
    semanticId: MeaningIdSchema.nullable(),
    taskRevision: TaskRevisionSchema,
    validatorPolicyVersion: z.string().min(1).max(160),
    dependencyArtifacts: z.array(ArtifactDependencySchema),
    outputManifest: z.array(OutputManifestEntrySchema).min(1),
} as const;

const validateArtifactIdentity = (
  artifact: z.infer<ReturnType<typeof z.object<typeof ArtifactIdentityShape>>>,
  context: z.RefinementCtx,
) => {
    const collections = [
      ["dependencyArtifacts", artifact.dependencyArtifacts.map(({ taskRevision }) => taskRevision)],
      ["outputManifest", artifact.outputManifest.map(({ logicalPath }) => logicalPath)],
    ] as const;
  for (const [path, values] of collections) {
      const sorted = [...values].sort();
      if (values.some((value, index) => value !== sorted[index]) || new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: `${path} must be sorted and unique.`, path: [path] });
      }
  }
  const sceneArtifact =
    artifact.taskKind === "scene-owner" || artifact.taskKind === "scene-template";
  if (sceneArtifact !== (artifact.semanticId !== null)) {
    context.addIssue({
      code: "custom",
      message: "Only Scene artifacts have a semanticId.",
      path: ["semanticId"],
    });
  }
};

const ArtifactIdentitySchema = z
  .object(ArtifactIdentityShape)
  .superRefine((artifact, context) => {
    validateArtifactIdentity(artifact, context);
  })
  .readonly();

const computeArtifactFingerprint = (
  identity: z.infer<typeof ArtifactIdentitySchema>,
) =>
  createFingerprint({
    namespace: "producer-artifact-attestation",
    version: 1,
    value: identity,
  });

export const ArtifactAttestationSchema = z
  .object({ ...ArtifactIdentityShape, artifactFingerprint: Sha256DigestSchema })
  .strict()
  .superRefine((artifact, context) => {
    validateArtifactIdentity(artifact, context);
    const { artifactFingerprint, ...identity } = artifact;
    if (
      artifactFingerprint !==
      computeArtifactFingerprint(ArtifactIdentitySchema.parse(identity))
    ) {
      context.addIssue({
        code: "custom",
        message: "Artifact attestation fingerprint is stale.",
        path: ["artifactFingerprint"],
      });
    }
  })
  .readonly();

export const buildArtifactAttestation = (rawInput: unknown) => {
  const input = rawInput as Record<string, unknown>;
  const identity = ArtifactIdentitySchema.parse({
    ...input,
    schemaVersion: 1,
    contractVersion: PRODUCER_ARTIFACT_VERSION,
  });
  return ArtifactAttestationSchema.parse({
    ...identity,
    artifactFingerprint: computeArtifactFingerprint(identity),
  });
};

export type ArtifactAttestation = z.infer<typeof ArtifactAttestationSchema>;
export type ArtifactOutputManifestEntry = z.infer<typeof OutputManifestEntrySchema>;
