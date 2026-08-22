import { builtinModules } from "node:module";

import { defineConfig } from "vite";

import { DESKTOP_PHASE_A_REPOSITORY_ROOT } from "./scripts/desktop/repository-locator";

const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
];

export default defineConfig({
  define: {
    DESKTOP_PHASE_A_REPOSITORY_ROOT: JSON.stringify(
      DESKTOP_PHASE_A_REPOSITORY_ROOT,
    ),
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
