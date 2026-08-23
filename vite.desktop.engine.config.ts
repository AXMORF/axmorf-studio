import { builtinModules } from "node:module";
import { resolve } from "node:path";

import { defineConfig } from "vite";

const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
];

export default defineConfig({
  publicDir: false,
  define: {
    "import.meta.url": 'require("node:url").pathToFileURL(__filename).href',
  },
  resolve: {
    alias:
      process.env.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1"
        ? [
            {
              find: "./workspace-narration-port",
              replacement: resolve(
                process.cwd(),
                "scripts/desktop/native-test-provider.ts",
              ),
            },
            {
              find: "./workspace-delivery-lifecycle",
              replacement: resolve(
                process.cwd(),
                "scripts/desktop/native-delivery-lifecycle.ts",
              ),
            },
          ]
        : [],
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: "desktop/engine/entry.ts",
      formats: ["cjs"],
      fileName: () => "engine.js",
    },
    outDir: ".vite/build",
    rollupOptions: { external: nodeExternals },
    target: "node22",
  },
});
