import type { CSSProperties, FC } from "react";

export const AXMORF_WORDMARK = "AXMORF";

export const AXMORF_MARK_PATHS = [
  "M272 18H368V228L320 180L272 228Z",
  "M22 320L224 118V258L162 320L224 382V522Z",
  "M320 214L426 320L320 426L214 320Z",
  "M618 320L416 118V258L478 320L416 382V522Z",
  "M272 424L320 472L368 424V622H272Z",
] as const;

export const AxmorfMark: FC<{
  readonly color?: string;
  readonly style?: CSSProperties;
  readonly ariaLabel?: string;
}> = ({ color = "currentColor", style, ariaLabel }) => (
  <svg
    aria-hidden={ariaLabel === undefined ? true : undefined}
    aria-label={ariaLabel}
    role={ariaLabel === undefined ? undefined : "img"}
    viewBox="0 0 640 640"
    style={{ display: "block", fontSize: 36, ...style }}
  >
    {AXMORF_MARK_PATHS.map((path) => (
      <path key={path} d={path} fill={color} />
    ))}
  </svg>
);
