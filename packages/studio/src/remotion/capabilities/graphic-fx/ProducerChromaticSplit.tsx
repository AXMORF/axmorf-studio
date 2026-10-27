import { useId, type CSSProperties, type FC, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { toProducerSvgId } from "./resolve";

export type ProducerChromaticSplitProps = {
  readonly children: ReactNode;
  /** Red/blue channel separation in pixels; 0 leaves the children untouched. */
  readonly amountPx: number;
  /** Split direction in degrees; 0 separates horizontally. */
  readonly angle?: number;
  readonly style?: CSSProperties;
};

const isolate = (channel: 0 | 1 | 2) =>
  [0, 1, 2]
    .map((row) =>
      row === channel
        ? [0, 1, 2].map((column) => (column === row ? 1 : 0))
        : [0, 0, 0],
    )
    .map((row) => [...row, 0, 0].join(" "))
    .concat("0 0 0 1 0")
    .join(" ");

/**
 * RGB channel misregistration for any subtree (characters, type, whole shots).
 * Implemented as an SVG filter so it needs no WebGL or experimental canvas APIs.
 */
export const ProducerChromaticSplit: FC<ProducerChromaticSplitProps> = ({
  children,
  amountPx,
  angle = 0,
  style,
}) => {
  const id = toProducerSvgId("axmorf-chromatic", useId());
  if (!Number.isFinite(amountPx) || amountPx < 0 || amountPx > 120) {
    throw new Error(
      "ProducerChromaticSplit amountPx must be between 0 and 120.",
    );
  }
  const radians = (angle * Math.PI) / 180;
  const dx = Number((Math.cos(radians) * amountPx).toFixed(2));
  const dy = Number((Math.sin(radians) * amountPx).toFixed(2));
  return (
    <AbsoluteFill style={style}>
      <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
        <filter
          id={id}
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={isolate(0)}
            result="red"
          />
          <feOffset in="red" dx={dx} dy={dy} result="redShifted" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={isolate(1)}
            result="green"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={isolate(2)}
            result="blue"
          />
          <feOffset in="blue" dx={-dx} dy={-dy} result="blueShifted" />
          <feBlend
            in="redShifted"
            in2="green"
            mode="screen"
            result="redGreen"
          />
          <feBlend in="redGreen" in2="blueShifted" mode="screen" />
        </filter>
      </svg>
      {/* Keep one tree when amountPx animates through 0 so media never remounts. */}
      <AbsoluteFill style={{ filter: amountPx === 0 ? "none" : `url(#${id})` }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
