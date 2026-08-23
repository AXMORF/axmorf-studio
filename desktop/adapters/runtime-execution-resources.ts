import { join } from "node:path";

import { verifyRuntimePack } from "./runtime-pack-filesystem";
import { createRendererRuntimeFingerprint } from "../contracts/runtime-pack";
import {
  createRuntimeExecutionResources,
  type RuntimeExecutionResources,
} from "../../scripts/project-production/domain/production-locations";

export const resolveEmbeddedRuntimeExecutionResources = async ({
  runtimePackRoot,
}: {
  readonly runtimePackRoot: string;
}): Promise<RuntimeExecutionResources> => {
  const manifest = await verifyRuntimePack({ runtimePackRoot });
  const root = runtimePackRoot;
  return createRuntimeExecutionResources({
    rendererRuntimeFingerprint: createRendererRuntimeFingerprint(manifest),
    browserExecutable: join(root, manifest.rendererBrowser.relativePath),
    binariesDirectory: join(root, "bin"),
    ffmpegExecutable: join(root, manifest.ffmpeg.relativePath),
    ffprobeExecutable: join(root, manifest.ffprobe.relativePath),
  });
};
