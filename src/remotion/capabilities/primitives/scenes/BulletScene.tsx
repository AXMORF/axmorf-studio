import type { FC } from "react";

import { Kicker } from "../elements/Kicker";
import type { RemotionTheme } from "../theme";

export const BulletScene: FC<{
  bullets: string[];
  kicker?: string;
  theme: RemotionTheme;
  title: string;
}> = ({ bullets, kicker, theme, title }) => {
  return (
    <>
      {kicker ? <Kicker theme={theme}>{kicker}</Kicker> : null}
      <h2
        style={{
          color: theme.text,
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <div style={{ marginTop: 28 }}>
        {bullets.map((bullet) => (
          <div
            key={bullet}
            style={{
              color: theme.text,
              fontSize: 30,
              lineHeight: 1.45,
              marginBottom: 18,
            }}
          >
            * {bullet}
          </div>
        ))}
      </div>
    </>
  );
};
