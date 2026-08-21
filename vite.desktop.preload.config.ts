import { builtinModules } from "node:module";

import { defineConfig } from "vite";

const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
];

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: ".vite/build",
    rollupOptions: {
      external: nodeExternals,
      input: "desktop/preload/shell.ts",
      output: {
        entryFileNames: "preload.js",
        format: "cjs",
      },
    },
    target: "node22",
  },
});
