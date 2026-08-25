import { join } from "node:path";

export const DESKTOP_RELEASE_NODE_VERSION = "22.23.1" as const;

export const desktopReleaseToolchain = (checkoutRoot = process.cwd()) => ({
  node: join(checkoutRoot, "node_modules/node/bin/node"),
  forgeCli: join(
    checkoutRoot,
    "node_modules/@electron-forge/cli/dist/electron-forge.js",
  ),
});
