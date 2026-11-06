import { useCurrentFrame } from "remotion";
import {
  integer,
  mix,
  positive,
  PRODUCER_RECIPE_CATALOG,
  recipeCues,
  resolveProducerRecipeTiming,
  type ProducerRecipeTiming,
  type ProducerRecipeFrameProps,
} from "./core";
export type BarGrowOptions = ProducerRecipeTiming &
  Readonly<{
    values: readonly number[];
    maxValue?: number;
    staggerInFrames?: number;
    ticks?: number;
  }>;
export const resolveBarGrow = (frame: number, options: BarGrowOptions) => {
  const timing = resolveProducerRecipeTiming(frame, options);
  integer(options.values.length, 1, 32, "bar count");
  options.values.forEach((value) => {
    if (!Number.isFinite(value) || value < 0)
      throw new Error("Bar values must be finite and non-negative.");
  });
  const max = options.maxValue ?? Math.max(1, ...options.values);
  positive(max, "maxValue");
  if (options.values.some((v) => v > max))
    throw new Error("Bar exceeds maxValue.");
  const stagger = options.staggerInFrames ?? 3;
  integer(stagger, 0, 120, "staggerInFrames");
  const ticks = options.ticks ?? 4;
  integer(ticks, 1, 12, "ticks");
  const perBar =
    options.durationInFrames - stagger * (options.values.length - 1);
  integer(perBar, 12, Number.MAX_SAFE_INTEGER, "per-bar duration");
  const bars = options.values.map((value, index) => {
    const local = resolveProducerRecipeTiming(frame, {
      startFrame: options.startFrame + index * stagger,
      durationInFrames: perBar,
    });
    return {
      ...local,
      value,
      height: (Math.max(0, local.progress) * value) / max,
    };
  });
  const move = bars[0].move;
  const land = bars.at(-1)!.land;
  // Summarize the whole stagger: first movement through last contact, then rest.
  const mappedFrame =
    frame < move
      ? mix(
          timing.anticipate,
          timing.move,
          (frame - timing.anticipate) / (move - timing.anticipate),
        )
      : frame < land
        ? mix(timing.move, timing.land, (frame - move) / (land - move))
        : mix(
            timing.land,
            timing.settle,
            (frame - land) / (timing.settle - land),
          );
  const summary = resolveProducerRecipeTiming(mappedFrame, options);
  return {
    ...summary,
    move,
    land,
    bars,
    ticks: Array.from({ length: ticks + 1 }, (_, i) => (i * max) / ticks),
    sfxCues: bars.flatMap((bar, index) =>
      recipeCues(
        `BarGrow bar ${index + 1}`,
        bar,
        PRODUCER_RECIPE_CATALOG.BarGrow.sfxCues,
      ),
    ),
  };
};
export type BarGrowProps = ProducerRecipeFrameProps &
  BarGrowOptions &
  Readonly<{
    width?: number;
    height?: number;
    color?: string;
    labels?: readonly string[];
  }>;
export const BarGrow = ({
  frame: frameOverride,
  width = 1400,
  height = 540,
  color = "#4bd9dc",
  labels,
  ...options
}: BarGrowProps) => {
  positive(width, "width");
  positive(height, "height");
  if (width <= 100 || height <= 110)
    throw new Error("BarGrow plot must exceed its axis margins (100 × 110).");
  const currentFrame = useCurrentFrame();
  const state = resolveBarGrow(frameOverride ?? currentFrame, options);
  const left = 100,
    bottom = height - 60,
    plotHeight = height - 110,
    step = (width - left) / state.bars.length;
  return (
    <svg
      data-recipe="BarGrow"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: "visible" }}
    >
      {state.ticks.map((tick, i) => (
        <g key={i}>
          <line
            x1={left}
            x2={width}
            y1={bottom - (i / (state.ticks.length - 1)) * plotHeight}
            y2={bottom - (i / (state.ticks.length - 1)) * plotHeight}
            stroke="currentColor"
            opacity={i === 0 ? 0.7 : 0.15}
          />
          <text
            x={left - 20}
            y={bottom - (i / (state.ticks.length - 1)) * plotHeight + 10}
            textAnchor="end"
            fill="currentColor"
            fontSize={28}
          >
            {Number(tick.toFixed(2))}
          </text>
        </g>
      ))}
      {state.bars.map((bar, i) => (
        <g key={i}>
          <rect
            x={left + step * i + step * 0.15}
            y={bottom - bar.height * plotHeight}
            width={step * 0.7}
            height={bar.height * plotHeight}
            fill={color}
          />
          <text
            x={left + step * (i + 0.5)}
            y={bottom + 44}
            textAnchor="middle"
            fill="currentColor"
            fontSize={28}
          >
            {labels?.[i] ?? String(i + 1)}
          </text>
        </g>
      ))}
    </svg>
  );
};
