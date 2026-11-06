import { useReviewMotion } from "../../film/review-motion";
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
  const fixed = Math.abs(options.value).toFixed(decimals);
  // Integer fixed-point units avoid unsafe Number arithmetic at high precision.
  const rounded = BigInt(fixed.replace(".", ""));
  const signed = options.value < 0 ? -rounded : rounded;
  // If precision would round above the factual target, use the lower unit.
  const targetUnits =
    Number(`${options.value < 0 ? "-" : ""}${fixed}`) > options.value
      ? signed - 1n
      : signed;
  const magnitude = targetUnits < 0n ? -targetUnits : targetUnits;
  const format = (units: bigint) => {
    const negative = units < 0n || (units === 0n && options.value < 0);
    const digits = (units < 0n ? -units : units)
      .toString()
      .padStart(decimals + 1, "0");
    const whole = decimals ? digits.slice(0, -decimals) : digits;
    const fraction = decimals ? `.${digits.slice(-decimals)}` : "";
    return `${negative ? "−" : ""}${options.grouping === false ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}`;
  };
  const prefix = options.prefix ?? "";
  const suffix = options.suffix ?? "";
  const formatted = `${prefix}${format(targetUnits)}${suffix}`;
  const t = clamp((frame - timing.move) / (timing.land - timing.move));
  // turns remains compatible as a speed control, never independent column cycles.
  const progress = 1 - (1 - t) ** (turns + 1);
  const travelUnits =
    (magnitude * BigInt(Math.floor(progress * 1_000_000_000))) / 1_000_000_000n;
  // Negative targets approach from below as well; no signed value overshoots.
  const units =
    targetUnits < 0n ? targetUnits - magnitude + travelUnits : travelUnits;
  const numericText = format(units);
  const displayText = `${prefix}${numericText}${suffix}`;
  const prefixLength = Array.from(prefix).length;
  const numericLength = Array.from(numericText).length;
  const columns = Array.from(displayText, (character, index) => {
    const digit =
      index >= prefixLength &&
      index < prefixLength + numericLength &&
      /^[0-9]$/.test(character)
        ? Number(character)
        : null;
    return { character, digit, position: digit ?? 0, target: digit ?? 0 };
  });
  return {
    ...timing,
    formatted,
    displayText,
    // Rebound moves the already fixed readout, never its numeric value.
    offsetInEm: frame >= timing.land ? (timing.progress - 1) * 0.8 : 0,
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
  useReviewMotion({
    type: "recipe",
    id: "NumberRoll",
    anticipate: state.anticipate,
    move: state.move,
    land: state.land,
    settle: state.settle,
  });
  return (
    <div
      data-recipe="NumberRoll"
      aria-label={state.displayText}
      style={{
        display: "flex",
        fontSize,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.2,
        color,
        transform: `translateY(${state.offsetInEm}em)`,
      }}
    >
      {state.columns.map((column, index) => (
        <span
          key={index}
          style={
            column.digit === null
              ? undefined
              : { width: "0.65em", textAlign: "center" }
          }
        >
          {column.character}
        </span>
      ))}
    </div>
  );
};
