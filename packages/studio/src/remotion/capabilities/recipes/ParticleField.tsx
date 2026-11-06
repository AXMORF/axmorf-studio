import { getLength, getPointAtLength } from "@remotion/paths";
import { random, useCurrentFrame } from "remotion";
import {
  clamp,
  integer,
  mix,
  positive,
  PRODUCER_RECIPE_CATALOG,
  recipeCues,
  resolveProducerRecipeTiming,
  type ProducerRecipeTiming,
  type ProducerRecipeFrameProps,
} from "./core";
export const PARTICLE_FIELD_MAX_COUNT = 400;
export type ParticleFieldOptions = ProducerRecipeTiming &
  Readonly<{
    mode: "scatter" | "assemble";
    /** Target outline in the same pixel coordinates as the field. */
    path: string;
    width: number;
    height: number;
    count?: number;
    seed?: string;
  }>;
export const resolveParticleField = (
  frame: number,
  options: ParticleFieldOptions,
) => {
  const timing = resolveProducerRecipeTiming(frame, options);
  if (options.mode !== "scatter" && options.mode !== "assemble")
    throw new Error("Unknown particle mode.");
  positive(options.width, "width");
  positive(options.height, "height");
  const count = options.count ?? 120;
  integer(count, 2, PARTICLE_FIELD_MAX_COUNT, "count");
  const length = getLength(options.path);
  positive(length, "path length");
  const seed = options.seed ?? "particles";
  const particles = Array.from({ length: count }, (_, i) => {
    const target = getPointAtLength(options.path, (length * i) / (count - 1));
    const dispersed = {
      x: random(`${seed}:${i}:x`) * options.width,
      y: random(`${seed}:${i}:y`) * options.height,
    };
    const p =
      options.mode === "assemble" ? timing.progress : 1 - timing.progress;
    return {
      x: mix(dispersed.x, target.x, p),
      y: mix(dispersed.y, target.y, p),
      radius: 2 + random(`${seed}:${i}:r`) * 4,
      opacity:
        options.mode === "assemble"
          ? 0.25 + 0.75 * clamp(p)
          : 1 - 0.65 * clamp(timing.progress),
    };
  });
  return {
    ...timing,
    particles,
    sfxCues: recipeCues(
      "ParticleField",
      timing,
      PRODUCER_RECIPE_CATALOG.ParticleField.sfxCues,
    ),
  };
};
export type ParticleFieldProps = ProducerRecipeFrameProps &
  ParticleFieldOptions &
  Readonly<{ color?: string }>;
export const ParticleField = ({
  frame: frameOverride,
  color = "currentColor",
  ...options
}: ParticleFieldProps) => {
  const currentFrame = useCurrentFrame();
  const state = resolveParticleField(frameOverride ?? currentFrame, options);
  return (
    <svg
      data-recipe="ParticleField"
      width={options.width}
      height={options.height}
      viewBox={`0 0 ${options.width} ${options.height}`}
    >
      <g fill={color}>
        {state.particles.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.radius} opacity={p.opacity} />
        ))}
      </g>
    </svg>
  );
};
