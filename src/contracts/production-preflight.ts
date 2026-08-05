import { z } from "zod";

import { Sha256DigestSchema } from "./primitives";

export const PRODUCTION_START_PREFLIGHT_VERSION =
  "production-start-preflight-v1" as const;

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
  schemaVersion: z.literal(1),
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
      z.object({ domain: z.literal("voxcpm"), status: z.literal("pass"), serviceState: z.enum(["resident-ready", "cold-auto-load-on-first-tts"]) }).strict(),
      z.object({ domain: z.literal("remotion-browser"), status: z.literal("pass") }).strict(),
    ]),
  })
  .strict()
  .readonly();

const ProductionStartPreflightFailureSchema = z
  .object({
    ...CommonShape,
    status: z.literal("failed"),
    domain: z.enum(["voxcpm", "remotion-browser"]),
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

export const buildProductionStartPreflightPass = (raw: {
  readonly requirementsFingerprint: unknown;
  readonly voxcpmServiceState: unknown;
}) =>
  ProductionStartPreflightPassSchema.parse({
    schemaVersion: 1,
    contractVersion: PRODUCTION_START_PREFLIGHT_VERSION,
    status: "pass",
    requirementsFingerprint: raw.requirementsFingerprint,
    redactionApplied: true,
    checks: [
      { domain: "voxcpm", status: "pass", serviceState: raw.voxcpmServiceState },
      { domain: "remotion-browser", status: "pass" },
    ],
  });

export const buildProductionStartPreflightFailure = (raw: unknown) =>
  ProductionStartPreflightFailureSchema.parse({
    ...(raw as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCTION_START_PREFLIGHT_VERSION,
    status: "failed",
    redactionApplied: true,
  });
