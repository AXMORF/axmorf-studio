import { z } from "zod";

import { createFingerprint } from "../../src/contracts/fingerprint";
import { Sha256DigestSchema } from "../../src/contracts/primitives";
import {
  DesktopDarwinArchitectureSchema,
  getDesktopDarwinTarget,
} from "../configuration/darwin-target";

export const DESKTOP_RUNTIME_PACK_CONTRACT_VERSION =
  "desktop-runtime-pack-v1" as const;
export const DESKTOP_COMPATIBILITY_CONTRACT_VERSION =
  "desktop-compatibility-v1" as const;
export const DESKTOP_RUNTIME_PACK_VERSION = 1 as const;
export const DESKTOP_ENGINE_VERSION = "desktop-engine-phase-b-v1" as const;
export const DESKTOP_SKILL_VERSION = "workspace-production-skill-v1" as const;
export const DESKTOP_REMOTION_VERSION = "4.0.489" as const;
export const DESKTOP_REQUIRED_REMOTION_PACKAGES = Object.freeze([
  "@remotion/bundler",
  "@remotion/renderer",
  "@remotion/studio",
  "@remotion/studio-shared",
] as const);
export const DESKTOP_UNSUPPORTED_REMOTION_PACKAGES = Object.freeze([
  "@remotion/cli",
  "@remotion/google-fonts",
  "@remotion/light-leaks",
  "@remotion/studio-server",
  "@remotion/tailwind-v4",
] as const);
const unsupportedRemotionPackages = new Set<string>(
  DESKTOP_UNSUPPORTED_REMOTION_PACKAGES,
);

const VersionSchema = z.string().min(1).max(80);
const RelativeFilePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      value
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
    "Runtime Pack paths must be normalized and relative.",
  );

export const RuntimePackFileSchema = z
  .strictObject({
    path: RelativeFilePathSchema,
    sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    executable: z.boolean(),
  })
  .readonly();

export const RuntimeBinaryIdentitySchema = z
  .strictObject({
    relativePath: RelativeFilePathSchema,
    version: VersionSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .readonly();

export const RuntimePackageIdentitySchema = z
  .strictObject({
    name: z.string().min(1).max(120),
    version: VersionSchema,
  })
  .readonly();

const RuntimePackIdentityShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(DESKTOP_RUNTIME_PACK_CONTRACT_VERSION),
  runtimePackVersion: z.literal(DESKTOP_RUNTIME_PACK_VERSION),
  platform: z.literal("darwin"),
  architecture: DesktopDarwinArchitectureSchema,
  engineVersion: z.literal(DESKTOP_ENGINE_VERSION),
  protocolVersion: z.literal("rsp-local-v2"),
  skillVersion: z.literal(DESKTOP_SKILL_VERSION),
  workspaceSchemaVersion: z.literal(2),
  remotionPackages: z.array(RuntimePackageIdentitySchema).min(1).readonly(),
  rendererBrowser: RuntimeBinaryIdentitySchema,
  ffmpeg: RuntimeBinaryIdentitySchema,
  ffprobe: RuntimeBinaryIdentitySchema,
  node: RuntimeBinaryIdentitySchema,
  rspClient: RuntimeBinaryIdentitySchema,
  files: z.array(RuntimePackFileSchema).min(1).readonly(),
} as const;

type RuntimePackIdentity = z.infer<
  ReturnType<typeof z.strictObject<typeof RuntimePackIdentityShape>>
>;

const validateRuntimePackOrdering = (
  value: RuntimePackIdentity,
  context: z.RefinementCtx,
) => {
  const collections = [
    ["remotionPackages", value.remotionPackages.map(({ name }) => name)],
    ["files", value.files.map(({ path }) => path)],
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

const remotionPackageRoots = (files: readonly Readonly<{ path: string }>[]) =>
  [
    ...new Set(
      files.flatMap(({ path }) => {
        const match = /^node_modules\/(remotion|@remotion\/[^/]+)\//u.exec(
          path,
        );
        return match?.[1] === undefined ? [] : [match[1]];
      }),
    ),
  ].sort();

const unsupportedNestedRemotionPackage = (path: string) => {
  const match = /(?:^|\/)node_modules\/(remotion|@remotion\/[^/]+)\//u.exec(
    path,
  );
  if (match?.index === undefined || match.index === 0) return null;
  return match[1] ?? null;
};

const unsupportedRemotionLaunchSurface = (path: string) => {
  const packageMatch =
    /(?:^|\/)node_modules\/(@remotion\/(?:cli|studio-server))(?:\/|$)/u.exec(
      path,
    );
  if (packageMatch?.[1] !== undefined) return packageMatch[1];
  return /(?:^|\/)node_modules\/\.bin\/(?:remotion|remotionb|remotiond)(?:$|\/)/u.test(
    path,
  )
    ? "Remotion CLI launch surface"
    : null;
};

const RuntimePackIdentitySchema = z
  .strictObject(RuntimePackIdentityShape)
  .superRefine(validateRuntimePackOrdering)
  .readonly();

const runtimePackId = (identity: RuntimePackIdentity) => {
  const digest = createFingerprint({
    namespace: "desktop-runtime-pack",
    version: 1,
    value: identity,
  });
  return `runtime-pack-${digest.slice("sha256:".length)}` as const;
};

export const RuntimePackManifestSchema = z
  .strictObject({
    ...RuntimePackIdentityShape,
    runtimePackId: z.string().regex(/^runtime-pack-[a-f0-9]{64}$/u),
  })
  .superRefine((value, context) => {
    validateRuntimePackOrdering(value, context);
    const { runtimePackId: recorded, ...rawIdentity } = value;
    const identity = RuntimePackIdentitySchema.parse(rawIdentity);
    if (recorded !== runtimePackId(identity)) {
      context.addIssue({
        code: "custom",
        message: "Runtime Pack identity is stale.",
        path: ["runtimePackId"],
      });
    }
    const fileMap = new Map(value.files.map((file) => [file.path, file]));
    const recordedRemotionPackages = value.remotionPackages.map(
      ({ name }) => name,
    );
    const target = getDesktopDarwinTarget(value.architecture);
    for (const required of [
      ...DESKTOP_REQUIRED_REMOTION_PACKAGES,
      target.compositorPackageName,
    ]) {
      if (!recordedRemotionPackages.includes(required)) {
        context.addIssue({
          code: "custom",
          message: `Runtime Pack is missing required Remotion package: ${required}.`,
          path: ["remotionPackages"],
        });
      }
    }
    const remotionVersions = new Set(
      value.remotionPackages.map(({ version }) => version),
    );
    if (
      remotionVersions.size !== 1 ||
      !remotionVersions.has(DESKTOP_REMOTION_VERSION)
    ) {
      context.addIssue({
        code: "custom",
        message: `All Runtime Pack Remotion packages must use exact version ${DESKTOP_REMOTION_VERSION}.`,
        path: ["remotionPackages"],
      });
    }
    for (const name of recordedRemotionPackages) {
      if (unsupportedRemotionPackages.has(name)) {
        context.addIssue({
          code: "custom",
          message: `Unsupported Runtime Pack package: ${name}.`,
          path: ["remotionPackages"],
        });
      }
    }
    for (const architecture of DesktopDarwinArchitectureSchema.options) {
      const compositor =
        getDesktopDarwinTarget(architecture).compositorPackageName;
      if (
        architecture !== value.architecture &&
        recordedRemotionPackages.includes(compositor)
      ) {
        context.addIssue({
          code: "custom",
          message: `Runtime Pack contains a foreign-architecture compositor: ${compositor}.`,
          path: ["remotionPackages"],
        });
      }
    }
    for (const file of value.files) {
      const launchSurface = unsupportedRemotionLaunchSurface(file.path);
      if (launchSurface !== null) {
        context.addIssue({
          code: "custom",
          message: `Unsupported Runtime Pack package: ${launchSurface}.`,
          path: ["files"],
        });
      }
      const nestedRemotionPackage = unsupportedNestedRemotionPackage(file.path);
      if (nestedRemotionPackage !== null) {
        context.addIssue({
          code: "custom",
          message: `Nested Remotion package roots are unsupported: ${nestedRemotionPackage}.`,
          path: ["files"],
        });
      }
    }
    const copiedRemotionPackages = remotionPackageRoots(value.files);
    if (
      JSON.stringify(recordedRemotionPackages) !==
      JSON.stringify(copiedRemotionPackages)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "remotionPackages must exactly match copied Remotion node_modules roots.",
        path: ["remotionPackages"],
      });
    }
    for (const name of recordedRemotionPackages) {
      if (!fileMap.has(`node_modules/${name}/package.json`)) {
        context.addIssue({
          code: "custom",
          message: `Remotion package identity is not bound to package.json: ${name}.`,
          path: ["files"],
        });
      }
    }
    for (const [label, binary] of Object.entries({
      rendererBrowser: value.rendererBrowser,
      ffmpeg: value.ffmpeg,
      ffprobe: value.ffprobe,
      node: value.node,
      rspClient: value.rspClient,
    })) {
      const file = fileMap.get(binary.relativePath);
      if (
        file === undefined ||
        file.sha256 !== binary.sha256 ||
        !file.executable
      ) {
        context.addIssue({
          code: "custom",
          message: `${label} must bind an executable Runtime Pack file.`,
          path: [label],
        });
      }
    }
  })
  .readonly();

export const buildRuntimePackManifest = (raw: unknown) => {
  const input = raw as Record<string, unknown>;
  const identity = RuntimePackIdentitySchema.parse({
    ...input,
    schemaVersion: 1,
    contractVersion: DESKTOP_RUNTIME_PACK_CONTRACT_VERSION,
    runtimePackVersion: DESKTOP_RUNTIME_PACK_VERSION,
    engineVersion: DESKTOP_ENGINE_VERSION,
    protocolVersion: "rsp-local-v2",
    skillVersion: DESKTOP_SKILL_VERSION,
    workspaceSchemaVersion: 2,
  });
  return RuntimePackManifestSchema.parse({
    ...identity,
    runtimePackId: runtimePackId(identity),
  });
};

export type RuntimePackManifest = z.infer<typeof RuntimePackManifestSchema>;

export const createRendererRuntimeFingerprint = (
  manifest: RuntimePackManifest,
): z.infer<typeof Sha256DigestSchema> =>
  createFingerprint({
    namespace: "renderer-runtime",
    version: 1,
    value: {
      runtimePackId: manifest.runtimePackId,
      remotionPackages: manifest.remotionPackages,
      rendererBrowser: manifest.rendererBrowser,
      ffmpeg: manifest.ffmpeg,
      ffprobe: manifest.ffprobe,
      platform: manifest.platform,
      architecture: manifest.architecture,
      codecBuildPolicy: "h264-aac-png-eof-v1",
    },
  });

export const DesktopCompatibilityManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(DESKTOP_COMPATIBILITY_CONTRACT_VERSION),
    appVersion: VersionSchema,
    engineVersion: z.literal(DESKTOP_ENGINE_VERSION),
    protocolVersion: z.literal("rsp-local-v2"),
    skillVersion: z.literal(DESKTOP_SKILL_VERSION),
    workspaceSchemaVersion: z.literal(2),
    projectSchemaReadRange: z.strictObject({
      minimum: z.number().int().positive(),
      maximum: z.number().int().positive(),
    }),
    projectSchemaWriteVersion: z.number().int().positive(),
    runtimePackId: z.string().regex(/^runtime-pack-[a-f0-9]{64}$/u),
    platform: z.literal("darwin"),
    architecture: DesktopDarwinArchitectureSchema,
    minimumMacOSVersion: z.literal("13.0"),
  })
  .superRefine((value, context) => {
    if (
      value.projectSchemaReadRange.minimum >
        value.projectSchemaReadRange.maximum ||
      value.projectSchemaWriteVersion < value.projectSchemaReadRange.minimum ||
      value.projectSchemaWriteVersion > value.projectSchemaReadRange.maximum
    ) {
      context.addIssue({
        code: "custom",
        message: "Project schema compatibility range is invalid.",
        path: ["projectSchemaReadRange"],
      });
    }
  })
  .readonly();

export type DesktopCompatibilityManifest = z.infer<
  typeof DesktopCompatibilityManifestSchema
>;

export const buildDesktopCompatibilityManifest = ({
  appVersion,
  runtimePack,
}: {
  readonly appVersion: string;
  readonly runtimePack: RuntimePackManifest;
}): DesktopCompatibilityManifest =>
  DesktopCompatibilityManifestSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_COMPATIBILITY_CONTRACT_VERSION,
    appVersion,
    engineVersion: DESKTOP_ENGINE_VERSION,
    protocolVersion: "rsp-local-v2",
    skillVersion: DESKTOP_SKILL_VERSION,
    workspaceSchemaVersion: 2,
    projectSchemaReadRange: { minimum: 1, maximum: 1 },
    projectSchemaWriteVersion: 1,
    runtimePackId: runtimePack.runtimePackId,
    platform: runtimePack.platform,
    architecture: runtimePack.architecture,
    minimumMacOSVersion: "13.0",
  });

export const assertDesktopRuntimeCompatibility = ({
  compatibility,
  runtimePack,
}: {
  readonly compatibility: DesktopCompatibilityManifest;
  readonly runtimePack: RuntimePackManifest;
}) => {
  const parsed = DesktopCompatibilityManifestSchema.parse(compatibility);
  if (
    parsed.runtimePackId !== runtimePack.runtimePackId ||
    parsed.platform !== runtimePack.platform ||
    parsed.architecture !== runtimePack.architecture ||
    parsed.engineVersion !== runtimePack.engineVersion ||
    parsed.protocolVersion !== runtimePack.protocolVersion ||
    parsed.skillVersion !== runtimePack.skillVersion ||
    parsed.workspaceSchemaVersion !== runtimePack.workspaceSchemaVersion
  ) {
    throw new Error("Desktop App and Runtime Pack are incompatible.");
  }
  return parsed;
};
