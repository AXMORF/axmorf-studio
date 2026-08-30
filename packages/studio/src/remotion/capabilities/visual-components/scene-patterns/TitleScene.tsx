import type { FC } from "react";

import { Kicker } from "../elements/Kicker";
import type { RemotionTheme } from "../theme";

export const TitleScene: FC<{
  kicker?: string;
  subtitle?: string;
  theme: RemotionTheme;
  title: string;
}> = ({ kicker, subtitle, theme, title }) => {
  return (
    <>
      {kicker ? <Kicker theme={theme}>{kicker}</Kicker> : null}
      <h1
        style={{
          color: theme.text,
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {title}
      </h1>
      {subtitle ? (
        <div
          style={{
            color: theme.muted,
            fontSize: 28,
            lineHeight: 1.5,
            marginTop: 22,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </>
  );
};
