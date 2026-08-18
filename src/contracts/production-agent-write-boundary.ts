import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { ProductionRunIdSchema } from "./production-run";

export const PRODUCTION_AGENT_WRITE_BOUNDARY_VERSION =
  "production-agent-write-boundary-v1" as const;

export const ProductionAgentWriteBoundaryPhaseSchema = z.enum([
  "project-authoring",
  "project-authoring-after-narrative",
  "owner-authoring",
  "cover-authoring-after-render-ready",
]);

const RepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.includes("\\") &&
      !value.includes("://") &&
      !value
        .split("/")
        .some((part) => part === "" || part === "." || part === ".."),
    "Agent write boundary paths must be normalized repository-relative paths.",
  );

export const ProductionAgentWriteScopeSchema = z
  .object({
    kind: z.enum(["file", "directory"]),
    repositoryPath: RepositoryPathSchema,
  })
  .strict()
  .readonly();

const addScopeIssues = (
  boundary: Readonly<{
    allowedWriteScopes: readonly z.infer<
      typeof ProductionAgentWriteScopeSchema
    >[];
  }>,
  context: z.RefinementCtx,
) => {
  const identities = boundary.allowedWriteScopes.map(
    ({ kind, repositoryPath }) => `${kind}:${repositoryPath}`,
  );
  if (
    new Set(identities).size !== identities.length ||
    identities.some(
      (identity, index) =>
        index > 0 && identity.localeCompare(identities[index - 1]!) <= 0,
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Agent write boundary scopes must be unique and sorted.",
      path: ["allowedWriteScopes"],
    });
  }
};

const BoundaryInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_AGENT_WRITE_BOUNDARY_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    phase: ProductionAgentWriteBoundaryPhaseSchema,
    allowedWriteScopes: z
      .array(ProductionAgentWriteScopeSchema)
      .max(4096)
      .readonly(),
    workspaceFingerprint: Sha256DigestSchema,
  })
  .strict();

const BoundaryInputSchema =
  BoundaryInputObject.superRefine(addScopeIssues).readonly();

export const computeProductionAgentWriteBoundaryFingerprint = (
  rawInput: unknown,
) =>
  createFingerprint({
    namespace: "production-agent-write-boundary",
    version: 1,
    value: BoundaryInputSchema.parse(rawInput),
  });

export const ProductionAgentWriteBoundarySchema = BoundaryInputObject.extend({
  boundaryFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((boundary, context) => {
    addScopeIssues(boundary, context);
    const { boundaryFingerprint, ...input } = boundary;
    if (
      boundaryFingerprint !==
      computeProductionAgentWriteBoundaryFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production agent write boundary fingerprint is stale.",
        path: ["boundaryFingerprint"],
      });
    }
  })
  .readonly();

export const buildProductionAgentWriteBoundary = (rawInput: unknown) => {
  const input = BoundaryInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCTION_AGENT_WRITE_BOUNDARY_VERSION,
  });
  return ProductionAgentWriteBoundarySchema.parse({
    ...input,
    boundaryFingerprint: computeProductionAgentWriteBoundaryFingerprint(input),
  });
};

export type ProductionAgentWriteBoundary = z.infer<
  typeof ProductionAgentWriteBoundarySchema
>;
export type ProductionAgentWriteScope = z.infer<
  typeof ProductionAgentWriteScopeSchema
>;
