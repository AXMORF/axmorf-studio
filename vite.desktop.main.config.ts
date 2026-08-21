import { builtinModules } from "node:module";

import { defineConfig } from "vite";

const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
];

export default defineConfig({
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
