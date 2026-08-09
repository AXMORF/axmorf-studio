import { isIP } from "node:net";

import {
  buildProductionStartPreflightFailure,
  type ProductionStartPreflight,
} from "../../../src/contracts";
import type { VoxcpmProfileMetadata } from "../../narration/adapters/private-config";

export const VOXCPM_HEALTH_ROUTE = "/health" as const;
export const VOXCPM_READY_ROUTE = "/ready" as const;
export const VOXCPM_INFO_ROUTE = "/info" as const;

export type VoxcpmProbe = (input: Readonly<{
  baseUrl: string;
  route:
    | typeof VOXCPM_HEALTH_ROUTE
    | typeof VOXCPM_READY_ROUTE
    | typeof VOXCPM_INFO_ROUTE;
  token?: string;
  timeoutMs: number;
}>) => Promise<Readonly<{ status: number; body: unknown }>>;

type Failure = Extract<ProductionStartPreflight, { status: "failed" }>;
export type VoxcpmPreflightResult =
  | Readonly<{
      status: "pass";
      domain: "voxcpm";
      serviceState:
        | "resident-ready"
        | "loading"
        | "offloaded-auto-reload-on-first-generation";
      profileMode: VoxcpmProfileMetadata["mode"];
    }>
  | Failure;

const failure = ({
  requirementsFingerprint,
  code,
  summary,
  remediation,
}: {
  readonly requirementsFingerprint: string;
  readonly code: Failure["code"];
  readonly summary: string;
  readonly remediation: string;
}) =>
  buildProductionStartPreflightFailure({
    domain: "voxcpm",
    kind: "external-blocker",
    code,
    summary,
    remediation,
    requirementsFingerprint,
  });

const isLoopback = (baseUrl: string) => {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const address = isIP(url.hostname);
  return (
    (address === 4 && url.hostname.startsWith("127.")) ||
    (address === 6 && (url.hostname === "::1" || url.hostname === "[::1]"))
  );
};

const isEnvironmentPermissionDenied = (rawError: unknown) => {
  let error = rawError;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 4 && error !== null && typeof error === "object"; depth += 1) {
    if (seen.has(error)) return false;
    seen.add(error);
    const record = error as { code?: unknown; message?: unknown; cause?: unknown };
    if (
      record.code === "EPERM" ||
      record.code === "EACCES" ||
      (typeof record.message === "string" &&
        /operation not permitted|permission denied/iu.test(record.message))
    ) {
      return true;
    }
    error = record.cause;
  }
  return false;
};

const probeFailure = ({
  error,
  requirementsFingerprint,
  phase,
}: {
  readonly error: unknown;
  readonly requirementsFingerprint: string;
  readonly phase: "liveness" | "readiness" | "denoiser capability";
}) =>
  isEnvironmentPermissionDenied(error)
    ? failure({
        requirementsFingerprint,
        code: "VOXCPM_ENVIRONMENT_PERMISSION_DENIED",
        summary: "The environment denied access to the local speech service.",
        remediation: "Run the fixed preflight with required host permissions.",
      })
    : failure({
        requirementsFingerprint,
        code: "VOXCPM_SERVICE_UNREACHABLE",
        summary: `The local speech service ${phase} check is unreachable.`,
        remediation: "Restore local speech service access before starting production.",
      });

export const preflightVoxcpm = async ({
  requirementsFingerprint,
  metadata,
  probe,
}: {
  readonly requirementsFingerprint: string;
  readonly metadata: VoxcpmProfileMetadata;
  readonly probe: VoxcpmProbe;
}): Promise<VoxcpmPreflightResult> => {
  if (!isLoopback(metadata.baseUrl)) {
    return failure({
      requirementsFingerprint,
      code: "VOXCPM_PROVIDER_NOT_LOOPBACK",
      summary: "The speech provider is not bound to a loopback address.",
      remediation: "Configure the local speech provider before starting production.",
    });
  }
  let health: Awaited<ReturnType<VoxcpmProbe>>;
  try {
    health = await probe({
      baseUrl: metadata.baseUrl,
      route: VOXCPM_HEALTH_ROUTE,
      ...(metadata.token === undefined ? {} : { token: metadata.token }),
      timeoutMs: metadata.timeoutMs,
    });
  } catch (error) {
    return probeFailure({ error, requirementsFingerprint, phase: "liveness" });
  }
  if (
    health.status !== 200 ||
    health.body === null ||
    typeof health.body !== "object" ||
    (health.body as { status?: unknown }).status !== "ok"
  ) {
    return failure({
      requirementsFingerprint,
      code: "VOXCPM_HEALTH_RESPONSE_UNRECOGNIZED",
      summary: "The local speech service liveness response is not recognized.",
      remediation: "Restore the supported speech service contract before starting production.",
    });
  }
  let ready: Awaited<ReturnType<VoxcpmProbe>>;
  try {
    ready = await probe({
      baseUrl: metadata.baseUrl,
      route: VOXCPM_READY_ROUTE,
      ...(metadata.token === undefined ? {} : { token: metadata.token }),
      timeoutMs: metadata.timeoutMs,
    });
  } catch (error) {
    return probeFailure({ error, requirementsFingerprint, phase: "readiness" });
  }
  const detail =
    ready.body !== null && typeof ready.body === "object"
      ? (ready.body as { detail?: unknown }).detail
      : undefined;
  const detailRecord =
    detail !== null && typeof detail === "object"
      ? (detail as Record<string, unknown>)
      : undefined;
  if (
    ready.status === 500 &&
    detailRecord?.ready === false &&
    detailRecord.error === "model_load_failed"
  ) {
    return failure({
      requirementsFingerprint,
      code: "VOXCPM_MODEL_LOAD_FAILED",
      summary: "The speech model reported a load failure.",
      remediation: "Restore the local speech model before starting production.",
    });
  }
  const resident =
    ready.status === 200 &&
    ready.body !== null &&
    typeof ready.body === "object" &&
    (ready.body as { ready?: unknown }).ready === true &&
    typeof (ready.body as { denoiser_ready?: unknown }).denoiser_ready ===
      "boolean";
  const loading =
    ready.status === 503 &&
    detailRecord?.ready === false &&
    detailRecord.status === "loading";
  const offloaded =
    ready.status === 503 &&
    detailRecord?.ready === false &&
    detailRecord.status === "offloaded";
  if (!resident && !loading && !offloaded) {
    return failure({
      requirementsFingerprint,
      code: "VOXCPM_READINESS_RESPONSE_UNRECOGNIZED",
      summary: "The local speech service readiness response is not recognized.",
      remediation: "Restore the supported speech service contract before starting production.",
    });
  }
  if (metadata.denoise) {
    if (
      resident &&
      (ready.body as { denoiser_ready: boolean }).denoiser_ready === false
    ) {
      return failure({
        requirementsFingerprint,
        code: "VOXCPM_DENOISER_UNAVAILABLE",
        summary: "The requested speech denoiser is unavailable.",
        remediation:
          "Load the supported denoiser before starting production.",
      });
    }
    if (!resident) {
      let info: Awaited<ReturnType<VoxcpmProbe>>;
      try {
        info = await probe({
          baseUrl: metadata.baseUrl,
          route: VOXCPM_INFO_ROUTE,
          ...(metadata.token === undefined ? {} : { token: metadata.token }),
          timeoutMs: metadata.timeoutMs,
        });
      } catch (error) {
        return probeFailure({
          error,
          requirementsFingerprint,
          phase: "denoiser capability",
        });
      }
      if (
        info.status !== 200 ||
        info.body === null ||
        typeof info.body !== "object" ||
        (info.body as { load_denoiser?: unknown }).load_denoiser !== true
      ) {
        return failure({
          requirementsFingerprint,
          code: "VOXCPM_DENOISER_UNAVAILABLE",
          summary: "The requested speech denoiser is unavailable.",
          remediation:
            "Enable the supported denoiser before starting production.",
        });
      }
    }
  }
  return {
    status: "pass",
    domain: "voxcpm",
    serviceState: resident
      ? "resident-ready"
      : loading
        ? "loading"
        : "offloaded-auto-reload-on-first-generation",
    profileMode: metadata.mode,
  };
};
