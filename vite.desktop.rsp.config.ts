import { builtinModules } from "node:module";

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: "desktop-rsp-trim-generated-whitespace",
      generateBundle: (_options, bundle) => {
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk") {
            output.code = output.code.replace(/[\t ]+$/gmu, "");
          }
        }
      },
    },
  ],
  build: {
    emptyOutDir: true,
    lib: {
      entry: "desktop/rsp/cli.ts",
      formats: ["cjs"],
      fileName: () => "rsp-sea.cjs",
    },
    minify: "oxc",
    outDir: ".vite/rsp",
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((module) => `node:${module}`),
      ],
    },
    target: "node24",
  },
});
