import { config } from "@remotion/eslint-config-flat";

export default [
  {
    ignores: [
      ".agents/skills/remotion-best-practices/**",
      "src/projects/*/scenes/configured-intro-scene/**",
      "src/projects/*/scenes/configured-outro-scene/**",
    ],
  },
  ...config,
];
