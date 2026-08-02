import {
  RESOURCE_CATALOG_GENERATOR_ID,
  ResourceCatalogSchema,
  ResourceDescriptorSchema,
  computeResourceCatalogFingerprint,
  computeResourceDescriptorFingerprint,
  serializeCanonicalJson,
  type ResourceCatalog,
  type ResourceCatalogEntry,
  type ResourceDescriptor,
} from "../../src/contracts";

export const buildResourceCatalog = (
  rawDescriptors: readonly unknown[],
): ResourceCatalog => {
  const descriptors = rawDescriptors
    .map((descriptor) => ResourceDescriptorSchema.parse(descriptor))
    .sort((left, right) => left.id.localeCompare(right.id));
  const entries: readonly ResourceCatalogEntry[] = descriptors.map(
    (descriptor) => ({
      descriptor,
      descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
    }),
  );
  const input = {
    schemaVersion: 1,
    generatorId: RESOURCE_CATALOG_GENERATOR_ID,
    entries,
  } as const;
  return ResourceCatalogSchema.parse({
    ...input,
    catalogFingerprint: computeResourceCatalogFingerprint(input),
  });
};

export const renderResourceCatalogJson = (catalog: ResourceCatalog): string =>
  `${serializeCanonicalJson(ResourceCatalogSchema.parse(catalog))}\n`;

export type ResourceCatalogQuery = {
  readonly kind: ResourceDescriptor["kind"];
  readonly tag: string | null;
  readonly text: string | null;
};

export const queryResourceCatalog = (
  rawCatalog: unknown,
  query: ResourceCatalogQuery,
): readonly ResourceCatalogEntry[] => {
  const catalog = ResourceCatalogSchema.parse(rawCatalog);
  const normalizedText = query.text?.toLocaleLowerCase("en-US") ?? null;
  return catalog.entries.filter(({ descriptor }) => {
    if (descriptor.kind !== query.kind) return false;
    if (query.tag !== null && !descriptor.tags.includes(query.tag))
      return false;
    if (normalizedText === null) return true;
    return [
      descriptor.title,
      descriptor.description,
      ...descriptor.useCases,
    ].some((value) =>
      value.toLocaleLowerCase("en-US").includes(normalizedText),
    );
  });
};
