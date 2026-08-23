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
  resolve: {
    alias: [
      {
        find: "./native-smoke-port",
        replacement: resolve(
          process.cwd(),
          process.env.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1"
            ? "desktop/main/native-smoke.ts"
            : "desktop/main/native-smoke-disabled.ts",
        ),
      },
    ],
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: "desktop/main/entry.ts",
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    outDir: ".vite/build",
    rollupOptions: { external: nodeExternals },
    target: "node22",
  },
});
