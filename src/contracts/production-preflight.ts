import { z } from "zod";

import { Sha256DigestSchema } from "./primitives";
import { SPEECH_SDK_VENDORS } from "./tts-provider-registry";

export const PRODUCTION_START_PREFLIGHT_VERSION =
  "production-start-preflight-v4" as const;

const SafeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .refine(
    (value) =>
      !/(?:https?:\/\/|Bearer\s|(?:^|\s)\/(?:home|data|tmp)\/|[A-Za-z]:\\|\b(?:token|secret|private[-_ ]?config|provider[-_ ]?endpoint)\b)/iu.test(
        value,
      ),
    "Preflight text must not contain private diagnostics.",
  );

const CommonShape = {
  schemaVersion: z.literal(4),
  contractVersion: z.literal(PRODUCTION_START_PREFLIGHT_VERSION),
  requirementsFingerprint: Sha256DigestSchema,
  redactionApplied: z.boolean(),
} as const;

const FailureCodeSchema = z.enum([
  "VOXCPM_PRIVATE_CONFIG_UNAVAILABLE",
  "VOXCPM_PROVIDER_NOT_LOOPBACK",
  "VOXCPM_PROFILE_UNAVAILABLE",
  "VOXCPM_PROFILE_PROTECTED",
  "VOXCPM_SERVICE_UNREACHABLE",
  "VOXCPM_ENVIRONMENT_PERMISSION_DENIED",
  "VOXCPM_HEALTH_RESPONSE_UNRECOGNIZED",
  "VOXCPM_READINESS_RESPONSE_UNRECOGNIZED",
  "VOXCPM_MODEL_LOAD_FAILED",
  "VOXCPM_DENOISER_UNAVAILABLE",
  "SPEECH_SDK_CONFIG_UNAVAILABLE",
  "SPEECH_SDK_PROFILE_UNAVAILABLE",
  "EDGE_TTS_CONFIG_UNAVAILABLE",
  "EDGE_TTS_PROFILE_UNAVAILABLE",
  "REMOTION_BROWSER_UNAVAILABLE",
  "REMOTION_BROWSER_PERMISSION_DENIED",
  "REMOTION_BROWSER_SANDBOX_DENIED",
  "REMOTION_PREFLIGHT_FAILED",
]);

const ProductionStartPreflightPassSchema = z
  .object({
    ...CommonShape,
    status: z.literal("pass"),
    checks: z.tuple([
      z.union([
        z
          .object({
            domain: z.literal("voxcpm"),
            status: z.literal("pass"),
            serviceState: z.enum([
              "resident-ready",
              "loading",
              "offloaded-auto-reload-on-first-generation",
            ]),
          })
          .strict(),
        z
          .object({
            domain: z.literal("speech-sdk"),
            status: z.literal("pass"),
            vendor: z.enum(SPEECH_SDK_VENDORS),
            validationState: z.literal(
              "configuration-validated-generation-not-probed",
            ),
          })
          .strict(),
        z
          .object({
            domain: z.literal("edge-tts"),
            status: z.literal("pass"),
            vendor: z.literal("microsoft-edge-read-aloud"),
            validationState: z.literal(
              "configuration-validated-generation-not-probed",
            ),
          })
          .strict(),
      ]),
      z
        .object({
          domain: z.literal("remotion-browser"),
          status: z.literal("pass"),
        })
        .strict(),
    ]),
  })
  .strict()
  .readonly();

const ProductionStartPreflightFailureSchema = z
  .object({
    ...CommonShape,
    status: z.literal("failed"),
    domain: z.enum([
      "voxcpm",
      "speech-sdk",
      "edge-tts",
      "remotion-browser",
    ]),
    kind: z.enum(["external-blocker", "fixed-flow-defect"]),
    code: FailureCodeSchema,
    summary: SafeTextSchema,
    remediation: SafeTextSchema,
  })
  .strict()
  .readonly();

export const ProductionStartPreflightSchema = z.union([
  ProductionStartPreflightPassSchema,
  ProductionStartPreflightFailureSchema,
]);
export type ProductionStartPreflight = z.infer<
  typeof ProductionStartPreflightSchema
>;

export const buildProductionStartPreflightPass = (raw: {
  readonly requirementsFingerprint: unknown;
  readonly ttsProviderCheck: unknown;
}) =>
  ProductionStartPreflightPassSchema.parse({
    schemaVersion: 4,
    contractVersion: PRODUCTION_START_PREFLIGHT_VERSION,
    status: "pass",
    requirementsFingerprint: raw.requirementsFingerprint,
    redactionApplied: true,
    checks: [
      raw.ttsProviderCheck,
      { domain: "remotion-browser", status: "pass" },
    ],
  });

export const buildProductionStartPreflightFailure = (raw: unknown) =>
  ProductionStartPreflightFailureSchema.parse({
    ...(raw as Record<string, unknown>),
    schemaVersion: 4,
    contractVersion: PRODUCTION_START_PREFLIGHT_VERSION,
    status: "failed",
    redactionApplied: true,
  });
