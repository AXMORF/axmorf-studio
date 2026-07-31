import type { FC } from "react";

import { Kicker } from "../elements/Kicker";
import type { RemotionTheme } from "../theme";

export const QuoteScene: FC<{
  author?: string;
  kicker?: string;
  quote: string;
  theme: RemotionTheme;
}> = ({ author, kicker, quote, theme }) => {
  return (
    <>
      {kicker ? <Kicker theme={theme}>{kicker}</Kicker> : null}
      <p
        style={{
          color: theme.text,
          fontSize: 42,
          fontWeight: 700,
          lineHeight: 1.45,
          margin: 0,
        }}
      >
        "{quote}"
      </p>
      {author ? (
        <div
          style={{
            color: theme.secondary,
            fontSize: 24,
            marginTop: 24,
          }}
        >
          - {author}
        </div>
      ) : null}
    </>
  );
};
