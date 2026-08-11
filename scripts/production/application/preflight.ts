import {
  NarrationSpecSchema,
  buildProductionStartPreflightFailure,
  buildProductionStartPreflightPass,
  type ProductionRequirementsFreeze,
  type ProductionStartPreflight,
  type NarrationExecutionSnapshot,
} from "../../../src/contracts";
import { resolveProducerNarrationExecution } from "../../config/narration-execution";
import {
  preflightRemotionBrowser,
  type RemotionBrowserPreflightResult,
} from "../adapters/remotion-process";
import {
  preflightVoxcpm,
  type VoxcpmPreflightResult,
  type VoxcpmProbe,
} from "../adapters/voxcpm-preflight";

type CurrentInputs = Readonly<{
  requirements: ProductionRequirementsFreeze;
  source: Readonly<{ narration: unknown }>;
}>;

type PreparedProductionPreflight =
  | Readonly<{
      preflight: Extract<ProductionStartPreflight, { status: "failed" }>;
    }>
  | Readonly<{
      preflight: Extract<ProductionStartPreflight, { status: "pass" }>;
      narrationExecution: NarrationExecutionSnapshot;
    }>;

const defaultProbe: VoxcpmProbe = async ({
  baseUrl,
  route,
  token,
  timeoutMs,
}) => {
  const response = await fetch(new URL(route, `${baseUrl}/`), {
    method: "GET",
    redirect: "manual",
    ...(token === undefined
      ? {}
      : { headers: { Authorization: `Bearer ${token}` } }),
    signal: AbortSignal.timeout(Math.min(timeoutMs, 5_000)),
  });
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
};

export type ProductionPreflightDependencies = Readonly<{
  voxcpm: (
    request: Readonly<{
      rootDir: string;
      requirements: ProductionRequirementsFreeze;
      narration: unknown;
    }>,
  ) => Promise<
    VoxcpmPreflightResult &
      Readonly<{ narrationExecution?: NarrationExecutionSnapshot }>
  >;
  browser: (
    request: Readonly<{
      rootDir: string;
      requirementsFingerprint: string;
    }>,
  ) => Promise<RemotionBrowserPreflightResult>;
}>;

const createDefaultDependencies = (): ProductionPreflightDependencies => ({
  voxcpm: async ({ rootDir, requirements, narration: rawNarration }) => {
    const narration = NarrationSpecSchema.parse(rawNarration);
    let execution;
    try {
      execution = await resolveProducerNarrationExecution({
        rootDir,
        env: process.env,
        narration,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const protectedSource = /protected/iu.test(message);
      const unavailableProfile =
        protectedSource || /profile|voice|prompt|reference/iu.test(message);
      return buildProductionStartPreflightFailure({
        domain: "voxcpm",
        kind: "external-blocker",
        code: protectedSource
          ? "VOXCPM_PROFILE_PROTECTED"
          : unavailableProfile
            ? "VOXCPM_PROFILE_UNAVAILABLE"
            : "VOXCPM_PRIVATE_CONFIG_UNAVAILABLE",
        summary: protectedSource
          ? "The selected speech profile uses a protected source."
          : unavailableProfile
            ? "The selected speech profile is unavailable."
            : "The private speech configuration is unavailable.",
        remediation: unavailableProfile
          ? "Select an accessible non-protected speech profile before starting production."
          : "Restore the private speech configuration before starting production.",
        requirementsFingerprint: requirements.requirementsFingerprint,
      });
    }
    const result = await preflightVoxcpm({
      requirementsFingerprint: requirements.requirementsFingerprint,
      metadata: execution.metadata,
      probe: defaultProbe,
    });
    return result.status === "pass"
      ? { ...result, narrationExecution: execution.snapshot }
      : result;
  },
  browser: ({ rootDir, requirementsFingerprint }) =>
    preflightRemotionBrowser({ rootDir, requirementsFingerprint }),
});

export const runProductionPreflightForInputs = async ({
  rootDir,
  inputs,
  dependencies = createDefaultDependencies(),
}: {
  readonly rootDir: string;
  readonly inputs: CurrentInputs;
  readonly dependencies?: ProductionPreflightDependencies;
}): Promise<PreparedProductionPreflight> => {
  const voxcpm = await dependencies.voxcpm({
    rootDir,
    requirements: inputs.requirements,
    narration: inputs.source.narration,
  });
  if (voxcpm.status === "failed") return { preflight: voxcpm };
  if (voxcpm.narrationExecution === undefined) {
    throw new Error("VoxCPM preflight did not bind narration execution.");
  }
  const browser = await dependencies.browser({
    rootDir,
    requirementsFingerprint: inputs.requirements.requirementsFingerprint,
  });
  if (browser.status === "failed") return { preflight: browser };
  return {
    preflight: buildProductionStartPreflightPass({
      requirementsFingerprint: inputs.requirements.requirementsFingerprint,
      voxcpmServiceState: voxcpm.serviceState,
    }),
    narrationExecution: voxcpm.narrationExecution,
  };
};

export const runProductionPreflight = async ({
  rootDir,
  projectId,
  dependencies,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly dependencies?: ProductionPreflightDependencies;
}) => {
  const { loadCurrentProductionInputs } = await import("./start");
  const inputs = await loadCurrentProductionInputs({ rootDir, projectId });
  return (
    await runProductionPreflightForInputs({
      rootDir,
      inputs,
      ...(dependencies === undefined ? {} : { dependencies }),
    })
  ).preflight;
};
