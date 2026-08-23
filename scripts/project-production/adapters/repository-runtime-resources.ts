import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { ensureBrowser } from "@remotion/renderer";

import { getDesktopDarwinTarget } from "../../../desktop/configuration/darwin-target";
import { createFingerprint } from "../../../src/contracts";
import {
  createRuntimeExecutionResources,
  type RuntimeExecutionResources,
} from "../domain/production-locations";

const sha256File = async (path: string) =>
  `sha256:${createHash("sha256")
    .update(await readFile(path))
    .digest("hex")}` as const;

const compositorPackage = () => {
  if (process.platform === "darwin") {
    return getDesktopDarwinTarget(process.arch).compositorPackageJson;
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "@remotion/compositor-linux-x64-gnu/package.json";
  }
  throw new Error("Repository renderer runtime architecture is unsupported.");
};

export type RepositoryRuntimeResolutionMode = "read-only" | "ensure";

type RepositoryRuntimeResolverDependencies = Readonly<{
  ensureBrowser: typeof ensureBrowser;
}>;

export const resolveRepositoryRuntimeExecutionResources = async (
  { mode }: { readonly mode: RepositoryRuntimeResolutionMode },
  dependencies: RepositoryRuntimeResolverDependencies = { ensureBrowser },
): Promise<RuntimeExecutionResources> => {
  const browser = await dependencies.ensureBrowser({
    chromeMode: "headless-shell",
    logLevel: "error",
    ...(mode === "read-only"
      ? {
          onBrowserDownload: () => {
            throw new Error(
              "Repository renderer browser is unavailable during read-only inspection.",
            );
          },
        }
      : {}),
  });
  if (browser.type === "no-browser" || browser.type === "version-mismatch") {
    throw new Error(
      "Repository renderer browser is unavailable or incompatible.",
    );
  }
  const require = createRequire(import.meta.url);
  const binariesDirectory = dirname(require.resolve(compositorPackage()));
  const ffmpegExecutable = join(binariesDirectory, "ffmpeg");
  const ffprobeExecutable = join(binariesDirectory, "ffprobe");
  const rendererRuntimeFingerprint = createFingerprint({
    namespace: "repository-renderer-runtime",
    version: 1,
    value: {
      platform: process.platform,
      architecture: process.arch,
      codecBuildPolicy: "h264-aac-png-eof-v1",
      rendererBrowser: await sha256File(browser.path),
      ffmpeg: await sha256File(ffmpegExecutable),
      ffprobe: await sha256File(ffprobeExecutable),
    },
  });
  return createRuntimeExecutionResources({
    rendererRuntimeFingerprint,
    browserExecutable: browser.path,
    binariesDirectory,
    ffmpegExecutable,
    ffprobeExecutable,
  });
};
