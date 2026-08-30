import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
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
