import { z } from "zod";

import { Sha256DigestSchema } from "./primitives";
import { StyleProfileIdSchema } from "./scene-primitives";

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
      sourceChecksum: Sha256DigestSchema.optional(),
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
  "sound-effect",
  "narration",
  "background-music",
  "global-visual",
]);

const ResourceMediaMetadataSchema = z
  .object({
    mimeType: z
      .string()
      .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u)
      .optional(),
    sizeBytes: z.number().int().positive().safe().optional(),
    width: z.number().int().positive().safe().optional(),
    height: z.number().int().positive().safe().optional(),
    durationInSeconds: z.number().positive().finite().optional(),
    codec: z.string().trim().min(1).max(80).optional(),
    sampleRate: z.number().int().positive().safe().optional(),
  })
  .strict()
  .readonly();

const ExternalAssetSourceSchema = z
  .object({
    provider: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u),
    providerAssetId: z.string().trim().min(1).max(200),
    sourcePageUrl: z
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "External source page must use HTTPS.",
      ),
    creator: z
      .object({
        name: z.string().trim().min(1).max(200),
        profileUrl: z
          .url()
          .refine(
            (value) => new URL(value).protocol === "https:",
            "External creator profile must use HTTPS.",
          ),
      })
      .strict()
      .readonly(),
    provenanceFingerprint: Sha256DigestSchema,
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
    externalSource: ExternalAssetSourceSchema.optional(),
    media: ResourceMediaMetadataSchema.optional(),
  })
  .strict()
  .superRefine((descriptor, context) => {
    const isAudio = descriptor.assetKind === "audio";
    const isAudioRole = !["scene-visual", "global-visual"].includes(
      descriptor.mediaRole,
    );
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

export const CapabilityAuthoringGuideSchema = z
  .object({
    importSource: z.literal("@axmorf/studio/remotion"),
    exports: z
      .array(z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/))
      .min(1)
      .max(128)
      .readonly(),
    parameters: z
      .array(z.string().trim().min(1).max(1000))
      .min(1)
      .max(16)
      .readonly(),
    example: z.string().trim().min(1).max(10000),
    recipes: z
      .array(
        z
          .strictObject({
            id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
            whenToUse: z.string().trim().min(1).max(1000),
            exports: z
              .array(z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/u))
              .min(1)
              .max(32)
              .readonly(),
            example: z.string().trim().min(1).max(10000),
          })
          .readonly(),
      )
      .max(16)
      .readonly()
      .optional(),
    demoOnlyExports: z
      .array(z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/u))
      .max(128)
      .readonly()
      .optional(),
    selectionAdvice: z
      .array(z.string().trim().min(1).max(1000))
      .min(1)
      .max(16)
      .readonly(),
  })
  .strict()
  .superRefine((guide, context) => {
    const demos = guide.demoOnlyExports ?? [];
    const recipes = guide.recipes ?? [];
    const exports = new Set(guide.exports);
    const demoNames = new Set(demos);
    if (
      demoNames.size !== demos.length ||
      demos.some((name) => !exports.has(name)) ||
      new Set(recipes.map(({ id }) => id)).size !== recipes.length ||
      recipes.some((recipe) =>
        recipe.exports.some(
          (name) => !exports.has(name) || demoNames.has(name),
        ),
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Capability recipes must name unique recipes and available non-demo exports; demo exports must be declared and unique.",
      });
  })
  .readonly();

const ResourceCapabilityDescriptorObject = z
  .object({
    ...RuntimeSourceDescriptorShape,
    kind: z.literal("capability"),
    authoring: CapabilityAuthoringGuideSchema.optional(),
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

export type ResourceUseContext =
  | "scene-visual"
  | "sound-effect"
  | "background-music"
  | "global-visual"
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
      useContext === "sound-effect" ||
      useContext === "background-music" ||
      useContext === "global-visual"
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
