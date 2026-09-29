import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import process from "node:process";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
if (process.env.AXMORF_BROWSER_EXECUTABLE?.trim()) {
  Config.setBrowserExecutable(process.env.AXMORF_BROWSER_EXECUTABLE.trim());
}
Config.overrideWebpackConfig((configuration) => {
  const withTailwind = enableTailwind(configuration);
  return {
    ...withTailwind,
    experiments: {
      ...withTailwind.experiments,
      lazyCompilation: false,
    },
  };
});
