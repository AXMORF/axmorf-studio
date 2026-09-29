/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
if (process.env.AXMORF_BROWSER_EXECUTABLE?.trim()) {
  Config.setBrowserExecutable(process.env.AXMORF_BROWSER_EXECUTABLE.trim());
}
Config.overrideWebpackConfig((currentConfiguration) => {
  const withTailwind = enableTailwind(currentConfiguration);
  return {
    ...withTailwind,
    experiments: {
      ...withTailwind.experiments,
      lazyCompilation: false,
    },
  };
});
