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
