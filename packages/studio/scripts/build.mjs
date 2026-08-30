import { build } from "esbuild";
import { chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "src");
const outputRoot = resolve(packageRoot, "dist");

const sharedOptions = {
  bundle: true,
  entryNames: "[dir]/[name]",
  format: "esm",
  logLevel: "info",
  outbase: sourceRoot,
  outdir: outputRoot,
  packages: "external",
  sourcemap: true,
  sourcesContent: false,
  target: "es2022",
};

await build({
  ...sharedOptions,
  entryPoints: {
    index: resolve(sourceRoot, "index.ts"),
    contracts: resolve(sourceRoot, "contracts.ts"),
    remotion: resolve(sourceRoot, "remotion.ts"),
    "remotion-preflight": resolve(sourceRoot, "remotion-preflight.ts"),
  },
  platform: "neutral",
});

await build({
  ...sharedOptions,
  banner: { js: "#!/usr/bin/env node" },
  entryPoints: {
    "cli/main": resolve(sourceRoot, "cli/main.ts"),
  },
  platform: "node",
});

await chmod(resolve(outputRoot, "cli/main.js"), 0o755);
