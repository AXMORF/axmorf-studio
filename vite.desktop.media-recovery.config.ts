import { builtinModules } from "node:module";

import { defineConfig } from "vite";

const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
];

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: "scripts/desktop/media-recovery-electron.ts",
      formats: ["cjs"],
      fileName: () => "media-recovery-electron.cjs",
    },
    outDir: ".vite/build",
    rollupOptions: { external: nodeExternals },
    target: "node22",
  },
});
