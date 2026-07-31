import type { FC } from "react";

import type { RemotionTheme } from "../theme";

export const CalloutGrid: FC<{
  callouts: string[];
  theme: RemotionTheme;
}> = ({ callouts, theme }) => {
  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        gridTemplateColumns: `repeat(${Math.min(callouts.length, 4)}, minmax(0, 1fr))`,
      }}
    >
      {callouts.map((callout, index) => (
        <div
          key={`${callout}-${index}`}
          style={{
            borderTop: `4px solid ${index % 2 === 0 ? theme.primary : theme.secondary}`,
            color: theme.text,
            fontSize: 25,
            fontWeight: 700,
            lineHeight: 1.28,
            paddingTop: 18,
          }}
        >
          {callout}
        </div>
      ))}
    </div>
  );
};
