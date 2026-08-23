import { z } from "zod";

import { DesktopDarwinArchitectureSchema } from "../configuration/darwin-target";
import { DesktopAppVersionSchema } from "../configuration/product";

const HexSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const RuntimePackIdSchema = z.string().regex(/^runtime-pack-[a-f0-9]{64}$/u);
const ReleaseFileSchema = z.strictObject({
  fileName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._ -]+$/u),
  sizeBytes: z.number().int().positive(),
  sha256: HexSha256Schema,
});

export const DesktopInstallerVerificationSchema = z.strictObject({
  contractVersion: z.literal("desktop-unsigned-installer-verification-v1"),
  architecture: DesktopDarwinArchitectureSchema,
  appVersion: DesktopAppVersionSchema,
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  runtimePackId: RuntimePackIdSchema,
  ordinaryProductionPackage: z.literal(true),
  nativeProductionGate: z.literal(true),
  mountedDmg: z.literal(true),
  isolatedApplicationsCopy: z.literal(true),
  firstRun: z.literal(true),
  doctor: z.literal(true),
  previewLaunch: z.literal(true),
  hostToolsRequiredAtRuntime: z.literal(false),
  cleanup: z.literal(true),
  developerIdSigned: z.literal(false),
  notarized: z.literal(false),
  publicReleasePublished: z.literal(false),
});

export type DesktopInstallerVerification = z.infer<
  typeof DesktopInstallerVerificationSchema
>;

export const DesktopUnsignedReleaseManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contractVersion: z.literal("desktop-unsigned-dmg-release-v1"),
  channel: z.literal("internal-manual-only"),
  product: z.strictObject({
    name: z.literal("AXMORF Studio"),
    bundleId: z.literal("com.axmorf.studio"),
    appVersion: DesktopAppVersionSchema,
    minimumMacOSVersion: z.literal("13.0"),
  }),
  source: z.strictObject({
    exactCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  }),
  target: z.strictObject({
    platform: z.literal("darwin"),
    architecture: DesktopDarwinArchitectureSchema,
    native: z.literal(true),
    universalBinary: z.literal(false),
  }),
  security: z.strictObject({
    developerIdSigned: z.literal(false),
    notarized: z.literal(false),
    autoUpdate: z.literal(false),
    publicReleasePublished: z.literal(false),
    remotionRuntimeRedistributionPermission: z.literal("not-satisfied"),
  }),
  installer: ReleaseFileSchema,
  application: z.strictObject({
    relativePath: z.literal("AXMORF Studio.app"),
    asarSha256: HexSha256Schema,
    runtimePackId: RuntimePackIdSchema,
    runtimePackFiles: z.number().int().positive(),
    workspaceIntegrationFiles: z.number().int().positive(),
    workspaceIntegrationSha256: HexSha256Schema,
  }),
  runtimeSbomInput: ReleaseFileSchema,
  installInstructions: ReleaseFileSchema,
  verificationReport: ReleaseFileSchema,
  verification: z.strictObject({
    ordinaryProductionPackage: z.literal(true),
    nativeProductionGate: z.literal(true),
    mountedDmg: z.literal(true),
    isolatedApplicationsCopy: z.literal(true),
    firstRun: z.literal(true),
    doctor: z.literal(true),
    previewLaunch: z.literal(true),
    hostToolsRequiredAtRuntime: z.literal(false),
    cleanup: z.literal(true),
  }),
  provenance: z.strictObject({
    githubRunId: z.string().regex(/^[0-9]+$/u),
    githubRunAttempt: z.string().regex(/^[0-9]+$/u),
    githubJob: z.string().min(1).max(128),
  }),
});

export type DesktopUnsignedReleaseManifest = z.infer<
  typeof DesktopUnsignedReleaseManifestSchema
>;

export const DesktopDualReleaseManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contractVersion: z.literal("desktop-dual-unsigned-dmg-release-v1"),
  channel: z.literal("internal-manual-only"),
  productName: z.literal("AXMORF Studio"),
  appVersion: DesktopAppVersionSchema,
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  complete: z.literal(true),
  architectures: z.tuple([
    z.strictObject({
      architecture: z.literal("arm64"),
      directory: z.literal("arm64"),
      manifestSha256: HexSha256Schema,
      installerSha256: HexSha256Schema,
    }),
    z.strictObject({
      architecture: z.literal("x64"),
      directory: z.literal("x64"),
      manifestSha256: HexSha256Schema,
      installerSha256: HexSha256Schema,
    }),
  ]),
});
