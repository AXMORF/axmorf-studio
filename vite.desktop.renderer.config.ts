import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "desktop/renderer",
  plugins: [react()],
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: "../../.vite/renderer/main_window",
  },
});
