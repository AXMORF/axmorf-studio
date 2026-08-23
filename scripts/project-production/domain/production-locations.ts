import { isAbsolute, resolve } from "node:path";

import { Sha256DigestSchema } from "../../../src/contracts";

export type ProductionLayoutKind = "repository" | "workspace";

/** Caller-selected roots consumed by production ports and adapters. */
export type ProductionLocations = Readonly<{
  layoutKind: ProductionLayoutKind;
  projectSourceRoot: string;
  projectMediaRoot: string;
  taskWorkspaceRoot: string;
  artifactStoreRoot: string;
  attemptStoreRoot: string;
  sourceCurrentRoot: string;
  deliveryRoot: string;
  privateConfigRoot: string;
  providerMaterialRoot: string;
  runtimeResources: string;
  disposableBuildRoot: string;
  evidenceRoot: string;
  operationLockRoot: string;
}>;

export type RuntimeExecutionResources = Readonly<{
  rendererRuntimeFingerprint: string;
  browserExecutable: string;
  binariesDirectory: string;
  ffmpegExecutable: string;
  ffprobeExecutable: string;
}>;

const absolute = (value: string, label: string) => {
  if (!isAbsolute(value)) throw new Error(`${label} must be absolute.`);
  return resolve(value);
};

export const createRuntimeExecutionResources = (
  raw: RuntimeExecutionResources,
): RuntimeExecutionResources =>
  Object.freeze({
    rendererRuntimeFingerprint: Sha256DigestSchema.parse(
      raw.rendererRuntimeFingerprint,
    ),
    browserExecutable: absolute(
      raw.browserExecutable,
      "Renderer browser executable",
    ),
    binariesDirectory: absolute(
      raw.binariesDirectory,
      "Renderer binaries directory",
    ),
    ffmpegExecutable: absolute(raw.ffmpegExecutable, "FFmpeg executable"),
    ffprobeExecutable: absolute(raw.ffprobeExecutable, "FFprobe executable"),
  });
