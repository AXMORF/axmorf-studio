import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const settingsRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: settingsRoot,
  plugins: [react()],
  build: {
    outDir: resolve(
      settingsRoot,
      "../packages/studio/dist/web",
    ),
    emptyOutDir: true,
  },
});
