import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { Sha256DigestSchema, type Sha256Digest } from "./primitives";
import { StyleProfileIdSchema } from "./scene-primitives";

export const RESOURCE_DESCRIPTOR_FINGERPRINT_VERSION =
  "resource-descriptor-fingerprint-v1" as const;

export const ResourceIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
  .brand<"ResourceId">();

export const ResourceAllowedUseSchema = z.enum([
  "runtime-approved",
  "localize-code",
  "localize-asset",
  "reference-only",
  "blocked",
]);

export const LicenseVerificationStatusSchema = z.enum([
  "verified",
  "unverified",
  "unknown",
  "restricted",
]);

const NullableUrlSchema = z.url().nullable();

export const LicenseRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    verificationStatus: LicenseVerificationStatusSchema,
    sourceUrl: NullableUrlSchema,
    attributionRequired: z.boolean(),
    attributionText: z.string().trim().min(1).max(1000).nullable(),
    verifiedAt: z.iso.datetime().nullable(),
    sourceEvidenceFingerprint: Sha256DigestSchema.nullable(),
  })
  .strict()
  .superRefine((license, context) => {
    if (license.attributionRequired && license.attributionText === null) {
      context.addIssue({
        code: "custom",
        message: "Required attribution text is missing.",
        path: ["attributionText"],
      });
    }
    if (
      license.verificationStatus === "verified" &&
      (license.verifiedAt === null ||
        license.sourceEvidenceFingerprint === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Verified licenses require timestamped evidence.",
        path: ["verificationStatus"],
      });
    }
  })
  .readonly();

const RepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      !value.split("/").includes("."),
    "Path must be a normalized repository-relative POSIX path.",
  );

const PublicAssetPathSchema = RepositoryPathSchema.refine(
  (value) => value.startsWith("public/") && value.length > "public/".length,
  "Runtime assets must stay under public/.",
);

const SourceFilePathSchema = RepositoryPathSchema.refine(
  (value) => value.startsWith("src/") && value.length > "src/".length,
  "Source files must stay under src/.",
);

const CanonicalStringArraySchema = z
  .array(z.string().trim().min(1).max(160))
  .min(1)
  .max(32)
  .superRefine((values, context) => {
    const sorted = [...values].sort((left, right) => left.localeCompare(right));
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          message: "Catalog metadata arrays must not contain duplicates.",
          path: [index],
        });
      }
      if (value !== sorted[index]) {
        context.addIssue({
          code: "custom",
          message: "Catalog metadata arrays must be canonically sorted.",
          path: [index],
        });
      }
      seen.add(value);
    });
  })
  .readonly();

const ResourceDescriptorCommonShape = {
  schemaVersion: z.literal(1),
  id: ResourceIdSchema,
  status: z.enum(["approved", "blocked"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(1000),
  useCases: CanonicalStringArraySchema,
  tags: CanonicalStringArraySchema,
  authority: z
    .object({
      kind: z.literal("repository-file"),
      repositoryPath: RepositoryPathSchema,
    })
    .strict()
    .readonly(),
  allowedUse: ResourceAllowedUseSchema,
} as const;

export const ResourceAssetKindSchema = z.enum([
  "image",
  "video",
  "svg",
  "audio",
  "font",
  "lottie",
  "rive",
  "gltf",
  "texture",
]);

export const ResourceMediaRoleSchema = z.enum([
  "scene-visual",
  "scene-ambience",
  "scene-sfx",
  "narration",
  "global-bgm",
]);

const ResourceMediaMetadataSchema = z
  .object({
    width: z.number().int().positive().safe().optional(),
    height: z.number().int().positive().safe().optional(),
    durationInSeconds: z.number().positive().finite().optional(),
    codec: z.string().trim().min(1).max(80).optional(),
    sampleRate: z.number().int().positive().safe().optional(),
  })
  .strict()
  .readonly();

const ResourceAssetDescriptorObject = z
  .object({
    ...ResourceDescriptorCommonShape,
    kind: z.literal("asset"),
    assetKind: ResourceAssetKindSchema,
    mediaRole: ResourceMediaRoleSchema,
    localPath: PublicAssetPathSchema,
    checksum: Sha256DigestSchema,
    license: LicenseRecordSchema,
    media: ResourceMediaMetadataSchema.optional(),
  })
  .strict()
  .superRefine((descriptor, context) => {
    const isAudio = descriptor.assetKind === "audio";
    const isAudioRole = descriptor.mediaRole !== "scene-visual";
    if (isAudio !== isAudioRole) {
      context.addIssue({
        code: "custom",
        message: "Asset kind and media role are incompatible.",
        path: ["mediaRole"],
      });
    }
    if (
      !["runtime-approved", "localize-asset", "blocked"].includes(
        descriptor.allowedUse,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Asset allowed-use is incompatible with its descriptor kind.",
        path: ["allowedUse"],
      });
    }
    addStatusAndLicenseIssues(descriptor, context);
  })
  .readonly();

const RuntimeSourceDescriptorShape = {
  ...ResourceDescriptorCommonShape,
  allowedUse: z.enum(["runtime-approved", "blocked"]),
  exportName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  sourceFile: SourceFilePathSchema,
} as const;

const ResourceStyleProfileDescriptorObject = z
  .object({
    ...RuntimeSourceDescriptorShape,
    kind: z.literal("style-profile"),
    styleProfileId: StyleProfileIdSchema,
  })
  .strict()
  .superRefine(addStatusIssues)
  .readonly();

const ResourceCapabilityDescriptorObject = z
  .object({
    ...RuntimeSourceDescriptorShape,
    kind: z.literal("capability"),
  })
  .strict()
  .superRefine(addStatusIssues)
  .readonly();

const ResourceAuthoringReferenceDescriptorObject = z
  .object({
    ...ResourceDescriptorCommonShape,
    kind: z.literal("authoring-reference"),
    allowedUse: z.enum([
      "localize-code",
      "localize-asset",
      "reference-only",
      "blocked",
    ]),
    referenceType: z.enum([
      "shot-recipe",
      "demo-source",
      "preview",
      "sequence-pattern",
    ]),
    sourceId: ResourceIdSchema,
    sourceSnapshotFingerprint: Sha256DigestSchema,
    repositoryPath: RepositoryPathSchema,
    contentChecksum: Sha256DigestSchema,
    license: LicenseRecordSchema,
  })
  .strict()
  .superRefine((descriptor, context) =>
    addStatusAndLicenseIssues(descriptor, context),
  )
  .readonly();

type StatusDescriptor = {
  readonly status: "approved" | "blocked";
  readonly allowedUse: string;
};

function addStatusIssues(
  descriptor: StatusDescriptor,
  context: z.RefinementCtx,
): void {
  if (
    (descriptor.status === "approved") !==
    (descriptor.allowedUse !== "blocked")
  ) {
    context.addIssue({
      code: "custom",
      message: "Blocked status and allowed-use must agree.",
      path: ["status"],
    });
  }
}

function addStatusAndLicenseIssues(
  descriptor: StatusDescriptor & {
    readonly license: z.infer<typeof LicenseRecordSchema>;
  },
  context: z.RefinementCtx,
): void {
  addStatusIssues(descriptor, context);
  if (
    descriptor.license.verificationStatus !== "verified" &&
    (descriptor.status !== "blocked" || descriptor.allowedUse !== "blocked")
  ) {
    context.addIssue({
      code: "custom",
      message: "Unverified or restricted resources must be blocked.",
      path: ["license", "verificationStatus"],
    });
  }
}

export const ResourceAssetDescriptorSchema = ResourceAssetDescriptorObject;
export const ResourceStyleProfileDescriptorSchema =
  ResourceStyleProfileDescriptorObject;
export const ResourceCapabilityDescriptorSchema =
  ResourceCapabilityDescriptorObject;
export const ResourceAuthoringReferenceDescriptorSchema =
  ResourceAuthoringReferenceDescriptorObject;

export const ResourceDescriptorSchema = z.discriminatedUnion("kind", [
  ResourceAssetDescriptorSchema,
  ResourceStyleProfileDescriptorSchema,
  ResourceCapabilityDescriptorSchema,
  ResourceAuthoringReferenceDescriptorSchema,
]);

export type ResourceAssetDescriptor = z.infer<
  typeof ResourceAssetDescriptorSchema
>;
export type ResourceDescriptor = z.infer<typeof ResourceDescriptorSchema>;

export const SelectedResourceRefSchema = z
  .object({
    schemaVersion: z.literal(1),
    resourceId: ResourceIdSchema,
    kind: z.enum(["asset", "style-profile", "capability"]),
    role: z.enum([
      "scene-visual",
      "scene-ambience",
      "scene-sfx",
      "style-profile",
      "capability",
    ]),
    descriptorFingerprint: Sha256DigestSchema,
    catalogFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export type SelectedResourceRef = z.infer<typeof SelectedResourceRefSchema>;

export const computeResourceDescriptorFingerprint = (
  rawDescriptor: unknown,
): Sha256Digest => {
  const descriptor = ResourceDescriptorSchema.parse(rawDescriptor);
  return createFingerprint({
    namespace: "resource-descriptor",
    version: 1,
    value: {
      fingerprintVersion: RESOURCE_DESCRIPTOR_FINGERPRINT_VERSION,
      descriptor,
    },
  });
};

export type ResourceUseContext =
  | "scene-visual"
  | "scene-ambience"
  | "scene-sfx"
  | "style-profile"
  | "capability"
  | "localize-code"
  | "localize-asset"
  | "reference-only";

export const assertResourceAllowedForUse = (
  rawDescriptor: unknown,
  useContext: ResourceUseContext,
): ResourceDescriptor => {
  const descriptor = ResourceDescriptorSchema.parse(rawDescriptor);
  if (descriptor.status !== "approved" || descriptor.allowedUse === "blocked") {
    throw new Error("Blocked resources cannot be selected.");
  }

  if (descriptor.kind === "asset") {
    if (descriptor.license.verificationStatus !== "verified") {
      throw new Error(
        "Runtime assets require verified item-level authorization.",
      );
    }
    const expectedRole =
      useContext === "scene-visual" ||
      useContext === "scene-ambience" ||
      useContext === "scene-sfx"
        ? useContext
        : null;
    if (
      expectedRole === null ||
      descriptor.allowedUse !== "runtime-approved" ||
      descriptor.mediaRole !== expectedRole
    ) {
      throw new Error(
        "Asset kind role or allowed-use does not match selection.",
      );
    }
    return descriptor;
  }

  if (
    descriptor.kind === "style-profile" &&
    useContext === "style-profile" &&
    descriptor.allowedUse === "runtime-approved"
  ) {
    return descriptor;
  }
  if (
    descriptor.kind === "capability" &&
    useContext === "capability" &&
    descriptor.allowedUse === "runtime-approved"
  ) {
    return descriptor;
  }
  if (
    descriptor.kind === "authoring-reference" &&
    descriptor.allowedUse === useContext &&
    descriptor.license.verificationStatus === "verified"
  ) {
    return descriptor;
  }
  throw new Error("Descriptor is not allowed for the requested use context.");
};

export const validateSelectedResourceRef = ({
  selected: rawSelected,
  descriptor: rawDescriptor,
  currentCatalogFingerprint: rawCatalogFingerprint,
}: {
  readonly selected: unknown;
  readonly descriptor: unknown;
  readonly currentCatalogFingerprint: unknown;
}): SelectedResourceRef => {
  const selected = SelectedResourceRefSchema.parse(rawSelected);
  const descriptor = ResourceDescriptorSchema.parse(rawDescriptor);
  const currentCatalogFingerprint = Sha256DigestSchema.parse(
    rawCatalogFingerprint,
  );
  if (selected.catalogFingerprint !== currentCatalogFingerprint) {
    throw new Error("Selected resource Catalog fingerprint is stale.");
  }
  if (
    selected.resourceId !== descriptor.id ||
    selected.kind !== descriptor.kind ||
    selected.descriptorFingerprint !==
      computeResourceDescriptorFingerprint(descriptor)
  ) {
    throw new Error("Selected resource descriptor identity is stale.");
  }
  assertResourceAllowedForUse(descriptor, selected.role);
  return selected;
};
