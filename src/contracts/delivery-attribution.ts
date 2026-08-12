import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";
import {
  ResourceCatalogSchema,
  ResourceIdSchema,
  SelectedResourceRefSchema,
  validateSelectedResourceRef,
} from "./resource-catalog";

export const ASSET_ATTRIBUTIONS_VERSION = "asset-attributions-v1" as const;

const ResourceIdsSchema = z
  .array(ResourceIdSchema)
  .min(1)
  .superRefine((values, context) => {
    if (
      new Set(values).size !== values.length ||
      values.some(
        (value, index) =>
          index > 0 && values[index - 1]!.localeCompare(value) >= 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Attribution Resource IDs must be unique and sorted.",
      });
    }
  })
  .readonly();

const AttributionCommonShape = {
  resourceIds: ResourceIdsSchema,
  attributionText: z.string().trim().min(1).max(1_000),
  license: z
    .object({
      name: z.string().trim().min(1).max(200),
      url: z.url().nullable(),
    })
    .strict()
    .readonly(),
  sourceEvidenceFingerprint: Sha256DigestSchema,
} as const;

const ExternalAttributionEntrySchema = z
  .object({
    ...AttributionCommonShape,
    sourceKind: z.literal("external"),
    provider: z.string().trim().min(1).max(80),
    providerAssetId: z.string().trim().min(1).max(200),
    sourcePageUrl: z.url(),
    creator: z
      .object({
        name: z.string().trim().min(1).max(200),
        profileUrl: z.url(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

const CatalogLicenseAttributionEntrySchema = z
  .object({
    ...AttributionCommonShape,
    sourceKind: z.literal("catalog-license"),
  })
  .strict()
  .readonly();

export const AssetAttributionEntrySchema = z.discriminatedUnion("sourceKind", [
  ExternalAttributionEntrySchema,
  CatalogLicenseAttributionEntrySchema,
]);

const AssetAttributionsInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(ASSET_ATTRIBUTIONS_VERSION),
    storyId: StoryIdSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    renderPlanFingerprint: Sha256DigestSchema,
    entries: z.array(AssetAttributionEntrySchema).readonly(),
  })
  .strict();

export const AssetAttributionsInputSchema =
  AssetAttributionsInputObject.readonly();

export const computeAssetAttributionsFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.attributionsFingerprint;
  const input = AssetAttributionsInputSchema.parse(record);
  return createFingerprint({
    namespace: "delivery-asset-attributions",
    version: 1,
    value: input,
  });
};

export const AssetAttributionsSchema = AssetAttributionsInputObject.extend({
  attributionsFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((projection, context) => {
    if (
      projection.attributionsFingerprint !==
      computeAssetAttributionsFingerprint(projection)
    ) {
      context.addIssue({
        code: "custom",
        message: "Asset attribution projection fingerprint is stale.",
        path: ["attributionsFingerprint"],
      });
    }
  })
  .readonly();

const attributionKey = (
  entry: Omit<z.infer<typeof AssetAttributionEntrySchema>, "resourceIds">,
) => JSON.stringify(entry);

const withoutResourceIds = (
  entry: z.infer<typeof AssetAttributionEntrySchema>,
) => {
  const { resourceIds, ...rest } = entry;
  void resourceIds;
  return rest;
};

export const buildAssetAttributions = ({
  storyId,
  resourceCatalog: rawCatalog,
  renderPlanFingerprint,
  selectedResources: rawSelectedResources,
}: {
  readonly storyId: unknown;
  readonly resourceCatalog: unknown;
  readonly renderPlanFingerprint: unknown;
  readonly selectedResources: readonly unknown[];
}) => {
  const catalog = ResourceCatalogSchema.parse(rawCatalog);
  const catalogById = new Map<
    string,
    (typeof catalog.entries)[number]["descriptor"]
  >(catalog.entries.map((entry) => [entry.descriptor.id, entry.descriptor]));
  const selectedById = new Map<
    string,
    ReturnType<typeof SelectedResourceRefSchema.parse>
  >();
  for (const rawSelected of rawSelectedResources) {
    const selected = SelectedResourceRefSchema.parse(rawSelected);
    const descriptor = catalogById.get(selected.resourceId);
    if (descriptor === undefined) {
      throw new Error(
        "Used resource is missing from the bound ResourceCatalog.",
      );
    }
    validateSelectedResourceRef({
      selected,
      descriptor,
      currentCatalogFingerprint: catalog.catalogFingerprint,
    });
    selectedById.set(selected.resourceId, selected);
  }

  const grouped = new Map<
    string,
    {
      readonly base: Omit<
        z.infer<typeof AssetAttributionEntrySchema>,
        "resourceIds"
      >;
      readonly resourceIds: Set<string>;
    }
  >();
  for (const resourceId of [...selectedById.keys()].sort()) {
    const descriptor = catalogById.get(resourceId)!;
    if (
      descriptor.kind !== "asset" ||
      !descriptor.license.attributionRequired
    ) {
      continue;
    }
    const attributionText = descriptor.license.attributionText;
    const sourceEvidenceFingerprint =
      descriptor.license.sourceEvidenceFingerprint;
    if (attributionText === null || sourceEvidenceFingerprint === null) {
      throw new Error("Used attributed asset is missing verified evidence.");
    }
    const license = {
      name: descriptor.license.id,
      url: descriptor.license.sourceUrl,
    } as const;
    const base = descriptor.externalSource
      ? ({
          sourceKind: "external",
          attributionText,
          license,
          sourceEvidenceFingerprint,
          provider: descriptor.externalSource.provider,
          providerAssetId: descriptor.externalSource.providerAssetId,
          sourcePageUrl: descriptor.externalSource.sourcePageUrl,
          creator: descriptor.externalSource.creator,
        } as const)
      : ({
          sourceKind: "catalog-license",
          attributionText,
          license,
          sourceEvidenceFingerprint,
        } as const);
    const key = attributionKey(base);
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, { base, resourceIds: new Set([resourceId]) });
    } else {
      existing.resourceIds.add(resourceId);
    }
  }
  const entries = [...grouped.values()]
    .map(({ base, resourceIds }) =>
      AssetAttributionEntrySchema.parse({
        ...base,
        resourceIds: [...resourceIds].sort(),
      }),
    )
    .sort((left, right) =>
      attributionKey(withoutResourceIds(left)).localeCompare(
        attributionKey(withoutResourceIds(right)),
      ),
    );
  const input = AssetAttributionsInputSchema.parse({
    schemaVersion: 1,
    contractVersion: ASSET_ATTRIBUTIONS_VERSION,
    storyId,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    renderPlanFingerprint,
    entries,
  });
  return AssetAttributionsSchema.parse({
    ...input,
    attributionsFingerprint: computeAssetAttributionsFingerprint(input),
  });
};

export type AssetAttributions = z.infer<typeof AssetAttributionsSchema>;
