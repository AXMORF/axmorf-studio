import { builtinModules } from "node:module";
import { resolve } from "node:path";

import { defineConfig } from "vite";

const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
];

const prettierEsmEntry = resolve(process.cwd(), "node_modules/prettier/index.mjs");
const prettierEsmHeader = `import { createRequire as __prettierCreateRequire } from "module";
import { fileURLToPath as __prettierFileUrlToPath } from "url";
import { dirname as __prettierDirname } from "path";
const require = __prettierCreateRequire(import.meta.url);
const __filename = __prettierFileUrlToPath(import.meta.url);
const __dirname = __prettierDirname(__filename);`;
const prettierCjsHeader = `import { createRequire as __prettierCreateRequire } from "module";
import { dirname as __prettierDirname } from "path";
const require = __prettierCreateRequire(__filename);
const __dirname = __prettierDirname(__filename);`;

export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: "desktop-prettier-cjs-entry",
      enforce: "pre",
      transform(source, id) {
        if (id !== prettierEsmEntry) return null;
        if (!source.startsWith(prettierEsmHeader)) {
          throw new Error("desktop-prettier-entry-header-drift");
        }
        return source.replace(prettierEsmHeader, prettierCjsHeader);
      },
    },
  ],
  resolve: {
    alias: [
      ...(process.env.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1"
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
        : []),
    ],
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
