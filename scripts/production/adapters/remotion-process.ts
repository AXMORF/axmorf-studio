import { join } from "node:path";

import {
  buildProductionStartPreflightFailure,
  type ProductionStartPreflight,
} from "../../../src/contracts";
import type { ProcessRunner } from "../../baseline/evidence";
import { runProductionMediaProcess } from "./process-runner";

export const PRODUCTION_REMOTION_ENTRY = "src/index.ts" as const;

export const resolveProductionRemotionCommand = (rootDir: string) =>
  join(rootDir, "node_modules/.bin/remotion");

export const buildProductionCompositionsArgs = () =>
  ["compositions", PRODUCTION_REMOTION_ENTRY] as const;

export const buildProductionStillArgs = ({
  compositionId,
  outputPath,
  frame,
}: {
  readonly compositionId: string;
  readonly outputPath: string;
  readonly frame: number;
}) =>
  [
    "still",
    PRODUCTION_REMOTION_ENTRY,
    compositionId,
    outputPath,
    `--frame=${frame}`,
    "--image-format=png",
    "--overwrite",
    "--log=error",
  ] as const;

export const buildProductionRenderArgs = ({
  compositionId,
  outputPath,
}: {
  readonly compositionId: string;
  readonly outputPath: string;
}) =>
  [
    "render",
    PRODUCTION_REMOTION_ENTRY,
    compositionId,
    outputPath,
    "--codec=h264",
    "--audio-codec=aac",
    "--overwrite",
    "--log=error",
  ] as const;

type Failure = Extract<ProductionStartPreflight, { status: "failed" }>;
export type RemotionBrowserPreflightResult =
  | Readonly<{ status: "pass"; domain: "remotion-browser" }>
  | Failure;

const failure = ({
  requirementsFingerprint,
  code,
  kind,
  summary,
  remediation,
}: {
  readonly requirementsFingerprint: string;
  readonly code: Failure["code"];
  readonly kind: Failure["kind"];
  readonly summary: string;
  readonly remediation: string;
}) =>
  buildProductionStartPreflightFailure({
    domain: "remotion-browser",
    kind,
    code,
    summary,
    remediation,
    requirementsFingerprint,
  });

export const preflightRemotionBrowser = async ({
  rootDir,
  requirementsFingerprint,
  runProcess = runProductionMediaProcess,
}: {
  readonly rootDir: string;
  readonly requirementsFingerprint: string;
  readonly runProcess?: ProcessRunner;
}): Promise<RemotionBrowserPreflightResult> => {
  let result: Awaited<ReturnType<ProcessRunner>>;
  try {
    result = await runProcess(
      resolveProductionRemotionCommand(rootDir),
      buildProductionCompositionsArgs(),
    );
  } catch {
    return failure({
      requirementsFingerprint,
      code: "REMOTION_BROWSER_UNAVAILABLE",
      kind: "external-blocker",
      summary: "The production browser executable is unavailable.",
      remediation: "Restore the supported Remotion browser environment before starting production.",
    });
  }
  if (result.status === 0) {
    return { status: "pass", domain: "remotion-browser" };
  }
  const bounded = `${result.stderr}\n${result.stdout}`.slice(0, 32_768);
  if (
    /sandbox_host_linux\.cc|Failed to move to new namespace|Operation not permitted/iu.test(
      bounded,
    )
  ) {
    return failure({
      requirementsFingerprint,
      code: "REMOTION_BROWSER_SANDBOX_DENIED",
      kind: "external-blocker",
      summary: "The production browser sandbox is denied by the host environment.",
      remediation: "Run with the required host browser permissions without weakening sandbox settings.",
    });
  }
  if (/EACCES|permission denied/iu.test(bounded)) {
    return failure({
      requirementsFingerprint,
      code: "REMOTION_BROWSER_PERMISSION_DENIED",
      kind: "external-blocker",
      summary: "The production browser process lacks host permission.",
      remediation: "Restore the required host browser permission before starting production.",
    });
  }
  return failure({
    requirementsFingerprint,
    code: "REMOTION_PREFLIGHT_FAILED",
    kind: "fixed-flow-defect",
    summary: "The fixed Remotion preflight command failed.",
    remediation: "Diagnose the fixed production command before starting a Run.",
  });
};
