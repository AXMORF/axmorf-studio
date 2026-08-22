import { config } from "@remotion/eslint-config-flat";

export default [
  {
    ignores: [
      ".vite/**",
      ".agents/skills/remotion-best-practices/**",
      "desktop/resources/workspace-integration/rsp-client.cjs",
      "src/projects/*/scenes/configured-intro-scene/**",
      "src/projects/*/scenes/configured-outro-scene/**",
    ],
  },
  ...config,
];
