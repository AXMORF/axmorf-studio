import { z } from "zod";

import { ExternalImageAssetAcquisitionSchema } from "./external-asset-acquisition";
import { createFingerprint } from "./fingerprint";
import { GeneratedArtworkRecordSchema } from "./generated-artwork";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";
import {
  ResourceAssetDescriptorSchema,
  ResourceIdSchema,
} from "./resource-catalog";

export const PROJECT_ASSET_MANIFEST_VERSION =
  "project-asset-manifest-v2" as const;

const RepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes(".") &&
      !value.split("/").includes(".."),
    "Project asset evidence path must be repository-relative.",
  );

export const ProjectExternalAssetEntrySchema = z
  .object({
    resourceId: ResourceIdSchema,
    role: z.enum(["scene-visual", "global-visual"]),
    acquisition: ExternalImageAssetAcquisitionSchema,
    evidence: z
      .object({
        providerReceiptPath: RepositoryPathSchema,
        providerReceiptChecksum: Sha256DigestSchema,
        acquisitionPath: RepositoryPathSchema,
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const ProjectGeneratedAssetEntrySchema = z
  .strictObject({
    resourceId: ResourceIdSchema,
    creation: GeneratedArtworkRecordSchema,
    evidencePath: RepositoryPathSchema,
  })
  .readonly();

const ProjectAssetManifestInputObject = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(PROJECT_ASSET_MANIFEST_VERSION),
    projectId: StoryIdSchema,
    assets: z.array(ResourceAssetDescriptorSchema).readonly(),
    externalAssets: z.array(ProjectExternalAssetEntrySchema).readonly(),
    generatedAssets: z
      .array(ProjectGeneratedAssetEntrySchema)
      .readonly()
      .optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const assetIds = manifest.assets.map(({ id }) => id);
    const externalIds = manifest.externalAssets.map(
      ({ resourceId }) => resourceId,
    );
    for (const [values, path] of [
      [assetIds, "assets"],
      [externalIds, "externalAssets"],
      [
        (manifest.generatedAssets ?? []).map(({ resourceId }) => resourceId),
        "generatedAssets",
      ],
    ] as const) {
      if (
        new Set(values).size !== values.length ||
        values.some(
          (value, index) =>
            index > 0 && values[index - 1]!.localeCompare(value) >= 0,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Project asset manifest entries must be unique and sorted.",
          path: [path],
        });
      }
    }
    const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
    const generatedById = new Map(
      (manifest.generatedAssets ?? []).map((entry) => [
        entry.resourceId,
        entry,
      ]),
    );
    for (const descriptor of manifest.assets) {
      const generated = generatedById.get(descriptor.id);
      if (descriptor.generatedSource === undefined && generated === undefined)
        continue;
      if (
        generated === undefined ||
        generated.evidencePath !==
          `src/projects/${manifest.projectId}/sources/assets/${descriptor.id}/generated-artwork.json` ||
        descriptor.generatedSource?.provenanceFingerprint !==
          generated.creation.provenanceFingerprint ||
        descriptor.checksum !== generated.creation.file.sha256 ||
        descriptor.media?.mimeType !== generated.creation.file.mimeType ||
        descriptor.media?.width !== generated.creation.file.width ||
        descriptor.media?.height !== generated.creation.file.height ||
        descriptor.media?.sizeBytes !== generated.creation.file.sizeBytes ||
        descriptor.generatedSource.kind !==
          generated.creation.provenance.kind ||
        descriptor.generatedSource.creator !==
          generated.creation.provenance.creator
      )
        context.addIssue({
          code: "custom",
          message:
            "Generated artwork evidence is stale against its descriptor.",
          path: ["generatedAssets"],
        });
    }
    if ([...generatedById.keys()].some((id) => !byId.has(id)))
      context.addIssue({
        code: "custom",
        message: "Generated artwork evidence has no asset descriptor.",
        path: ["generatedAssets"],
      });
    for (const [index, external] of manifest.externalAssets.entries()) {
      const descriptor = byId.get(external.resourceId);
      if (
        descriptor === undefined ||
        descriptor.assetKind !== "image" ||
        descriptor.mediaRole !== external.role ||
        descriptor.externalSource?.provenanceFingerprint !==
          external.acquisition.provenanceFingerprint
      ) {
        context.addIssue({
          code: "custom",
          message: "External asset evidence is stale against its descriptor.",
          path: ["externalAssets", index],
        });
      }
    }
  });

export const ProjectAssetManifestInputSchema =
  ProjectAssetManifestInputObject.readonly();

export const computeProjectAssetManifestFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.manifestFingerprint;
  const input = ProjectAssetManifestInputSchema.parse(record);
  return createFingerprint({
    namespace: "project-asset-manifest",
    version: 2,
    value: input,
  });
};

export const ProjectAssetManifestSchema =
  ProjectAssetManifestInputObject.extend({
    manifestFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((manifest, context) => {
      if (
        manifest.manifestFingerprint !==
        computeProjectAssetManifestFingerprint(manifest)
      ) {
        context.addIssue({
          code: "custom",
          message: "Project asset manifest fingerprint is stale.",
          path: ["manifestFingerprint"],
        });
      }
    })
    .readonly();

export const buildProjectAssetManifest = (rawInput: unknown) => {
  const record = rawInput as Record<string, unknown>;
  const assets = [...((record.assets ?? []) as readonly unknown[])].sort(
    (left, right) =>
      ResourceAssetDescriptorSchema.parse(left).id.localeCompare(
        ResourceAssetDescriptorSchema.parse(right).id,
      ),
  );
  const externalAssets = [
    ...((record.externalAssets ?? []) as readonly unknown[]),
  ].sort((left, right) =>
    ProjectExternalAssetEntrySchema.parse(left).resourceId.localeCompare(
      ProjectExternalAssetEntrySchema.parse(right).resourceId,
    ),
  );
  const input = ProjectAssetManifestInputSchema.parse({
    ...record,
    schemaVersion: 2,
    contractVersion: PROJECT_ASSET_MANIFEST_VERSION,
    assets,
    externalAssets,
    ...(record.generatedAssets === undefined
      ? {}
      : {
          generatedAssets: [
            ...(record.generatedAssets as readonly unknown[]),
          ].sort((left, right) =>
            ProjectGeneratedAssetEntrySchema.parse(
              left,
            ).resourceId.localeCompare(
              ProjectGeneratedAssetEntrySchema.parse(right).resourceId,
            ),
          ),
        }),
  });
  return ProjectAssetManifestSchema.parse({
    ...input,
    manifestFingerprint: computeProjectAssetManifestFingerprint(input),
  });
};

export type ProjectAssetManifest = z.infer<typeof ProjectAssetManifestSchema>;
