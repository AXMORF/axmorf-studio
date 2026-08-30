import type { CSSProperties, FC } from "react";

import type { RemotionTheme } from "../theme";

export const Kicker: FC<{
  children: string;
  style?: CSSProperties;
  theme: RemotionTheme;
}> = ({ children, style, theme }) => {
  return (
    <div
      style={{
        color: theme.secondary,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: 3,
        marginBottom: 18,
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
