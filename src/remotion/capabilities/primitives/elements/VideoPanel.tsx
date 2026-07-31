import type { CSSProperties, FC, ReactNode } from "react";

import type { RemotionTheme } from "../theme";

export const VideoPanel: FC<{
  children: ReactNode;
  entrance?: number;
  maxWidth?: number | string;
  padding?: number | string;
  style?: CSSProperties;
  theme: RemotionTheme;
}> = ({ children, entrance = 1, maxWidth = 980, padding = "48px 56px", style, theme }) => {
  return (
    <div
      style={{
        backgroundColor: theme.panel,
        border: `1px solid ${theme.primary}33`,
        borderRadius: 36,
        boxShadow: `0 30px 80px ${theme.background}55`,
        maxWidth,
        opacity: entrance,
        padding,
        transform: `translateY(${(1 - entrance) * 50}px) scale(${0.96 + entrance * 0.04})`,
        width: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
