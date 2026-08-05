import { isIP } from "node:net";

import {
  buildProductionStartPreflightFailure,
  type ProductionStartPreflight,
} from "../../../src/contracts";
import type { VoxcpmProfileMetadata } from "../../narration/adapters/private-config";

export const VOXCPM_HEALTH_ROUTE = "/health" as const;
export const VOXCPM_READY_ROUTE = "/ready" as const;

export type VoxcpmProbe = (input: Readonly<{
  baseUrl: string;
  route: typeof VOXCPM_HEALTH_ROUTE | typeof VOXCPM_READY_ROUTE;
  token?: string;
  timeoutMs: number;
}>) => Promise<Readonly<{ status: number; body: unknown }>>;

type Failure = Extract<ProductionStartPreflight, { status: "failed" }>;
export type VoxcpmPreflightResult =
  | Readonly<{
      status: "pass";
      domain: "voxcpm";
      serviceState: "resident-ready" | "cold-auto-load-on-first-tts";
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
  } catch {
    return failure({
      requirementsFingerprint,
      code: "VOXCPM_SERVICE_UNREACHABLE",
      summary: "The local speech service is unreachable.",
      remediation: "Restore local speech service access before starting production.",
    });
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
  } catch {
    return failure({
      requirementsFingerprint,
      code: "VOXCPM_SERVICE_UNREACHABLE",
      summary: "The local speech service readiness check is unreachable.",
      remediation: "Restore local speech service access before starting production.",
    });
  }
  if (ready.status === 500) {
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
    (ready.body as { ready?: unknown }).ready === true;
  const detail =
    ready.body !== null && typeof ready.body === "object"
      ? (ready.body as { detail?: unknown }).detail
      : undefined;
  const cold =
    ready.status === 503 &&
    detail !== null &&
    typeof detail === "object" &&
    (detail as { ready?: unknown }).ready === false &&
    (detail as { status?: unknown }).status === "loading";
  if (!resident && !cold) {
    return failure({
      requirementsFingerprint,
      code: "VOXCPM_READINESS_RESPONSE_UNRECOGNIZED",
      summary: "The local speech service readiness response is not recognized.",
      remediation: "Restore the supported speech service contract before starting production.",
    });
  }
  return {
    status: "pass",
    domain: "voxcpm",
    serviceState: resident
      ? "resident-ready"
      : "cold-auto-load-on-first-tts",
    profileMode: metadata.mode,
  };
};
