import { resolveRenderTimeoutMs } from "@axmorf/studio/contracts";

import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../config/producer-config";

/**
 * The Workspace's render time limit. A Workspace without a readable config
 * (for example a test fixture) uses the default instead of failing a render.
 */
export const readWorkspaceRenderTimeoutMs = async ({
  rootDir,
  env = process.env,
}: {
  readonly rootDir: string;
  readonly env?: NodeJS.ProcessEnv;
}) => {
  try {
    const config = await readProducerConfig({
      configPath: await resolveProducerConfigPathFromEnvironment({
        rootDir,
        env,
      }),
    });
    return resolveRenderTimeoutMs(config);
  } catch (error) {
    // readProducerConfig wraps the read error; only a missing file falls back.
    const cause = (error as { cause?: NodeJS.ErrnoException }).cause;
    if (cause?.code === "ENOENT") {
      return resolveRenderTimeoutMs({ renderDefaults: {} });
    }
    throw error;
  }
};
