import {
  NarrationSpecSchema,
  buildProductionStartPreflightFailure,
  buildProductionStartPreflightPass,
  type ProductionRequirementsFreeze,
  type ProductionStartPreflight,
} from "../../../src/contracts";
import { resolveVoxcpmProfileMetadata } from "../../narration/adapters/private-config";
import {
  readProducerConfig,
  resolveDefaultTtsProvider,
  resolveProducerConfigPathFromEnvironment,
  toVoxcpmPrivateConfig,
} from "../../config/producer-config";
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
  ) => Promise<VoxcpmPreflightResult>;
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
    let config;
    try {
      const producerConfig = await readProducerConfig({
        configPath: await resolveProducerConfigPathFromEnvironment({
          rootDir,
          env: process.env,
        }),
      });
      config = toVoxcpmPrivateConfig(
        resolveDefaultTtsProvider(producerConfig),
        rootDir,
      );
    } catch {
      return buildProductionStartPreflightFailure({
        domain: "voxcpm",
        kind: "external-blocker",
        code: "VOXCPM_PRIVATE_CONFIG_UNAVAILABLE",
        summary: "The private speech configuration is unavailable.",
        remediation:
          "Restore the private speech configuration before starting production.",
        requirementsFingerprint: requirements.requirementsFingerprint,
      });
    }
    let metadata;
    try {
      metadata = await resolveVoxcpmProfileMetadata({
        config,
        narration,
        rootDir,
      });
    } catch (error) {
      const protectedSource =
        error instanceof Error && /protected/iu.test(error.message);
      return buildProductionStartPreflightFailure({
        domain: "voxcpm",
        kind: "external-blocker",
        code: protectedSource
          ? "VOXCPM_PROFILE_PROTECTED"
          : "VOXCPM_PROFILE_UNAVAILABLE",
        summary: protectedSource
          ? "The selected speech profile uses a protected source."
          : "The selected speech profile is unavailable.",
        remediation:
          "Select an accessible non-protected speech profile before starting production.",
        requirementsFingerprint: requirements.requirementsFingerprint,
      });
    }
    return preflightVoxcpm({
      requirementsFingerprint: requirements.requirementsFingerprint,
      metadata,
      probe: defaultProbe,
    });
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
}): Promise<ProductionStartPreflight> => {
  const voxcpm = await dependencies.voxcpm({
    rootDir,
    requirements: inputs.requirements,
    narration: inputs.source.narration,
  });
  if (voxcpm.status === "failed") return voxcpm;
  const browser = await dependencies.browser({
    rootDir,
    requirementsFingerprint: inputs.requirements.requirementsFingerprint,
  });
  if (browser.status === "failed") return browser;
  return buildProductionStartPreflightPass({
    requirementsFingerprint: inputs.requirements.requirementsFingerprint,
    voxcpmServiceState: voxcpm.serviceState,
  });
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
  return runProductionPreflightForInputs({
    rootDir,
    inputs,
    ...(dependencies === undefined ? {} : { dependencies }),
  });
};
