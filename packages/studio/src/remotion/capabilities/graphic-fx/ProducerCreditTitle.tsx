import type { CSSProperties, FC } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

/** Installed heavy serif stacks; Songti SC ships with macOS, Noto/Source Han elsewhere. */
export const producerDisplaySerifFamily =
  '"Songti SC", "Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK SC", "STSong", serif';

const goldFill: CSSProperties = {
  color: "transparent",
  backgroundImage:
    "linear-gradient(172deg, #fff3c4 0%, #e8b84f 34%, #a86f1d 58%, #f6d985 82%, #c48a2c 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
};

export type ProducerCreditTitleProps = {
  /** Small role line above (or before, when vertical) the names. */
  readonly role?: string;
  readonly names: readonly string[];
  readonly orientation?: "horizontal" | "vertical";
  /** Font size of the names; the role line is about a third of it. */
  readonly sizePx: number;
  /** "gold" uses a foil gradient; any CSS color fills flat. */
  readonly fill?: "gold" | string;
  readonly roleColor?: string;
  readonly align?: "start" | "center" | "end";
  /**
   * "slam" scales each name down onto its place (poster titles); "fade"
   * lifts it in softly with a short blur (restrained staff credits).
   */
  readonly entrance?: "slam" | "fade";
  readonly weight?: number;
  /** First name lands here; later names follow every staggerFrames. */
  readonly startFrame?: number;
  readonly staggerFrames?: number;
  /**
   * Mirrored copy of the names, flipped below them (to the right when vertical)
   * with `gapPx` between, like a printed reflection.
   */
  readonly echo?: { readonly color: string; readonly gapPx?: number } | null;
  readonly fontFamily?: string;
  readonly minFontSizePx?: number;
  /** Defaults to the current Sequence frame. */
  readonly frame?: number;
  /** Place the block with absolute positioning here. */
  readonly style?: CSSProperties;
};

/**
 * Staff-credit typography: a quiet role label and serif names that land one
 * after another, either slammed in as a poster title or faded in as a credit.
 */
export const ProducerCreditTitle: FC<ProducerCreditTitleProps> = ({
  role,
  names,
  orientation = "horizontal",
  sizePx,
  fill = "#f7f2e8",
  roleColor = "rgba(247, 242, 232, 0.86)",
  align = "start",
  entrance = "slam",
  weight = 900,
  startFrame = 0,
  staggerFrames = 3,
  echo = null,
  fontFamily = producerDisplaySerifFamily,
  minFontSizePx = 32,
  frame: frameOverride,
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  if (names.length === 0 || names.some((name) => name.trim() === "")) {
    throw new Error("ProducerCreditTitle needs at least one non-empty name.");
  }
  if (!Number.isFinite(sizePx) || sizePx < minFontSizePx) {
    throw new Error(
      `ProducerCreditTitle sizePx must be at least minFontSizePx (${minFontSizePx}).`,
    );
  }
  if (!Number.isInteger(staggerFrames) || staggerFrames < 0) {
    throw new Error(
      "ProducerCreditTitle staggerFrames must be a non-negative integer.",
    );
  }
  const vertical = orientation === "vertical";
  const roleSize = Math.max(Math.round(sizePx * 0.32), minFontSizePx);
  const nameFill = fill === "gold" ? goldFill : { color: fill };
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const landing = (index: number) => {
    const local = frame - startFrame - index * staggerFrames;
    const easeOut = { ...clamp, easing: Easing.out(Easing.cubic) };
    if (entrance === "fade") {
      const lift = interpolate(local, [0, 12], [sizePx * 0.08, 0], easeOut);
      const blur = interpolate(local, [0, 10], [6, 0], clamp);
      return {
        opacity: interpolate(local, [0, 10], [0, 1], clamp),
        transform: vertical
          ? `translateX(${(-lift).toFixed(2)}px)`
          : `translateY(${lift.toFixed(2)}px)`,
        filter: blur > 0 ? `blur(${blur.toFixed(2)}px)` : "none",
      };
    }
    return {
      opacity: interpolate(local, [0, 3], [0, 1], clamp),
      transform: `scale(${interpolate(local, [0, 6], [1.32, 1], easeOut).toFixed(4)})`,
      filter: "none",
    };
  };
  const roleIn = interpolate(frame - startFrame, [-4, 2], [0, 1], clamp);
  const alignItems =
    align === "center" ? "center" : align === "end" ? "flex-end" : "flex-start";

  const echoGap = echo?.gapPx ?? Math.round(sizePx * 0.06);
  const nameBlock = (mode: "main" | "echo") => (
    <div
      aria-hidden={mode === "echo" || undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems,
        gap: sizePx * 0.12,
        ...(mode === "echo"
          ? {
              position: "absolute",
              inset: 0,
              transformOrigin: vertical ? "100% 50%" : "50% 100%",
              transform: vertical
                ? `translateX(${echoGap}px) scaleX(-1)`
                : `translateY(${echoGap}px) scaleY(-1)`,
              opacity: 0.85,
            }
          : { position: "relative" }),
      }}
    >
      {names.map((name, index) => {
        const { opacity, transform, filter } = landing(index);
        return (
          <span
            key={`${index}-${name}`}
            style={{
              display: "inline-block",
              fontSize: sizePx,
              fontWeight: weight,
              lineHeight: 1.04,
              letterSpacing: vertical ? "0.04em" : "0.02em",
              whiteSpace: "nowrap",
              opacity,
              transform,
              filter,
              transformOrigin: vertical
                ? "50% 0%"
                : align === "end"
                  ? "100% 50%"
                  : "0% 50%",
              ...(mode === "echo" ? { color: echo?.color } : nameFill),
            }}
          >
            {name}
          </span>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        alignItems,
        gap: roleSize * 0.4,
        fontFamily,
        writingMode: vertical ? "vertical-rl" : "horizontal-tb",
        filter: "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.45))",
        ...style,
      }}
    >
      {role === undefined ? null : (
        <span
          style={{
            fontSize: roleSize,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: roleColor,
            opacity: roleIn,
          }}
        >
          {role}
        </span>
      )}
      <div style={{ position: "relative" }}>
        {echo === null ? null : nameBlock("echo")}
        {nameBlock("main")}
      </div>
    </div>
  );
};
