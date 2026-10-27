import { useId, type CSSProperties, type FC, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { resolveProducerGradientMapTables, toProducerSvgId } from "./resolve";

export type ProducerGradientMapProps = {
  readonly children: ReactNode;
  /** Dark → light hex stops; two stops give a duotone, more give false color. */
  readonly stops: readonly string[];
  /** Mix between source (0) and mapped colors (1). */
  readonly amount?: number;
  readonly style?: CSSProperties;
};

/**
 * Recolors a subtree by luminance, e.g. neon false color or ink duotone.
 * Animate `amount` or swap `stops` on a cut to change palettes between shots.
 */
export const ProducerGradientMap: FC<ProducerGradientMapProps> = ({
  children,
  stops,
  amount = 1,
  style,
}) => {
  const id = toProducerSvgId("axmorf-gradient-map", useId());
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
    throw new Error("ProducerGradientMap amount must be between 0 and 1.");
  }
  const tables = resolveProducerGradientMapTables(stops);
  return (
    <AbsoluteFill style={style}>
      <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={[
              "0.2126 0.7152 0.0722 0 0",
              "0.2126 0.7152 0.0722 0 0",
              "0.2126 0.7152 0.0722 0 0",
              "0 0 0 1 0",
            ].join(" ")}
            result="luminance"
          />
          <feComponentTransfer in="luminance" result="mapped">
            <feFuncR type="table" tableValues={tables.red} />
            <feFuncG type="table" tableValues={tables.green} />
            <feFuncB type="table" tableValues={tables.blue} />
          </feComponentTransfer>
          <feComposite
            in="mapped"
            in2="SourceGraphic"
            operator="arithmetic"
            k1={0}
            k2={amount}
            k3={1 - amount}
            k4={0}
          />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: amount === 0 ? "none" : `url(#${id})` }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
