import { useCurrentFrame } from "remotion";
import {
  clamp,
  finite,
  integer,
  positive,
  PRODUCER_RECIPE_CATALOG,
  recipeCues,
  resolveProducerRecipeTiming,
  type ProducerRecipeTiming,
  type ProducerRecipeFrameProps,
} from "./core";

export type NumberRollOptions = ProducerRecipeTiming &
  Readonly<{
    value: number;
    decimals?: number;
    grouping?: boolean;
    prefix?: string;
    suffix?: string;
    turns?: number;
  }>;
export const resolveNumberRoll = (
  frame: number,
  options: NumberRollOptions,
) => {
  const timing = resolveProducerRecipeTiming(frame, options);
  finite(options.value, "value");
  if (Math.abs(options.value) >= 1e15)
    throw new Error("NumberRoll value must be below 1e15.");
  const decimals = options.decimals ?? 0;
  integer(decimals, 0, 8, "decimals");
  const turns = options.turns ?? 2;
  integer(turns, 1, 6, "turns");
  const [whole, fraction] = Math.abs(options.value)
    .toFixed(decimals)
    .split(".");
  const numericText = `${options.value < 0 ? "−" : ""}${options.grouping === false ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
  const prefix = options.prefix ?? "";
  const suffix = options.suffix ?? "";
  const formatted = `${prefix}${numericText}${suffix}`;
  const prefixLength = Array.from(prefix).length;
  const numericLength = Array.from(numericText).length;
  // Overshoot happens before contact: at land every digit is exactly its final value.
  const t = clamp((frame - timing.move) / (timing.land - timing.move));
  const columns = Array.from(formatted, (character, index) => {
    const digit =
      index >= prefixLength &&
      index < prefixLength + numericLength &&
      /^[0-9]$/.test(character)
        ? Number(character)
        : null;
    const target = digit === null ? 0 : turns * 10 + digit;
    const delay = (index / formatted.length) * 0.15;
    const local = clamp((t - delay) / (1 - delay));
    const progress =
      t === 1
        ? 1
        : local < 0.85
          ? (1 - (1 - local / 0.85) ** 3) * 1.015
          : 1 + 0.015 * Math.sin(((1 - (local - 0.85) / 0.15) * Math.PI) / 2);
    return { character, digit, position: target * progress, target };
  });
  return {
    ...timing,
    formatted,
    columns,
    sfxCues: recipeCues(
      "NumberRoll",
      timing,
      PRODUCER_RECIPE_CATALOG.NumberRoll.sfxCues,
    ),
  };
};
export type NumberRollProps = ProducerRecipeFrameProps &
  NumberRollOptions &
  Readonly<{ fontSize?: number; color?: string }>;
export const NumberRoll = ({
  frame: frameOverride,
  fontSize = 140,
  color = "currentColor",
  ...options
}: NumberRollProps) => {
  positive(fontSize, "fontSize");
  const currentFrame = useCurrentFrame();
  const state = resolveNumberRoll(frameOverride ?? currentFrame, options);
  return (
    <div
      data-recipe="NumberRoll"
      aria-label={state.formatted}
      style={{
        display: "flex",
        fontSize,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.2,
        color,
      }}
    >
      {state.columns.map((column, index) =>
        column.digit === null ? (
          <span key={index}>{column.character}</span>
        ) : (
          <div
            key={index}
            style={{
              height: fontSize * 1.2,
              width: "0.65em",
              overflow: "hidden",
              textAlign: "center",
            }}
          >
            <div
              style={{
                transform: `translateY(${-column.position * fontSize * 1.2}px)`,
              }}
            >
              {Array.from({ length: column.target + 3 }, (_, i) => (
                <div key={i} style={{ height: fontSize * 1.2 }}>
                  {i % 10}
                </div>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
};
