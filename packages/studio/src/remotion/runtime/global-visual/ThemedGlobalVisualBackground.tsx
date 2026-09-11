import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import {
  VISUAL_THEME_DECORATION_MAX_OPACITY,
  type VisualTheme,
} from "../../../contracts/visual-theme";

export type ThemedGlobalVisualBackgroundProps = Readonly<{
  theme: VisualTheme;
  children?: ReactNode;
}>;

export const ThemedGlobalVisualBackground = ({
  theme,
  children,
}: ThemedGlobalVisualBackgroundProps) => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.background,
      isolation: "isolate",
      pointerEvents: "none",
    }}
  >
    <AbsoluteFill
      style={{
        // Composite the entire decoration once: descendants cannot increase
        // this opacity or escape behind-Scene stacking with their own z-index.
        opacity: VISUAL_THEME_DECORATION_MAX_OPACITY,
        isolation: "isolate",
        clipPath: "inset(0)",
        pointerEvents: "none",
      }}
    >
      {children}
    </AbsoluteFill>
  </AbsoluteFill>
);
