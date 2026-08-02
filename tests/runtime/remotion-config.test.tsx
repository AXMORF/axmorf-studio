import assert from "node:assert/strict";
import test from "node:test";

import { ConfigInternals } from "@remotion/cli/config";

test("Studio disables Webpack lazy compilation for LAN clients", async () => {
  await import("../../remotion.config");
  const overrideWebpackConfig = ConfigInternals.getWebpackOverrideFn();
  const config = await overrideWebpackConfig({
    experiments: { lazyCompilation: { entries: false } },
    module: { rules: [] },
  });

  assert.equal(config.experiments?.lazyCompilation, false);
});
