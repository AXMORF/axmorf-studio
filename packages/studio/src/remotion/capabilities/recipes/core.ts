import type { FilmSoundEffectCue } from "../../film/FilmSoundEffects";
import type { FilmSoundEffectKind } from "../../../contracts/film-sfx";

export type ProducerRecipeTiming = Readonly<{
  /** Absolute composition frames, including any enclosing Sequence offset. */
  startFrame: number;
  durationInFrames: number;
}>;
/** Components read their local Remotion frame by default. Inside a Sequence,
 * capture useCurrentFrame() at the composition root and pass it here so visuals
 * and the resolver's absolute sound anchors use the same clock. */
export type ProducerRecipeFrameProps = Readonly<{ frame?: number }>;
export type ProducerRecipePhase =
  | "before"
  | "anticipate"
  | "move"
  | "land"
  | "settle"
  | "hold";
export type ProducerRecipeMeta = Readonly<{
  id: string;
  title: string;
  useWhen: string;
  avoidWhen: string;
  recommendedDurationSeconds: readonly [number, number];
  keyframes: Readonly<
    Record<"anticipate" | "move" | "land" | "settle", string>
  >;
  sfxCues: readonly Readonly<{
    at: "move" | "land";
    role: string;
    kind?: FilmSoundEffectKind;
    /** Suggested duration at 30 fps; resolver cues use actual action frames. */
    durationFrames?: number;
  }>[];
}>;
export const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
};
export const positive = (value: number, label: string) => {
  finite(value, label);
  if (value <= 0) throw new Error(`${label} must be positive.`);
};
export const integer = (
  value: number,
  min: number,
  max: number,
  label: string,
) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${label} must be an integer in [${min}, ${max}].`);
};
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shared five-part curve: preload, travel, contact, overshoot/rebound, exact rest.
 * Fractional frames are supported for motion-blur sampling. Cue anchors are integers. */
export const resolveProducerRecipeTiming = (
  frame: number,
  options: ProducerRecipeTiming,
) => {
  finite(frame, "frame");
  integer(options.startFrame, 0, Number.MAX_SAFE_INTEGER, "startFrame");
  integer(
    options.durationInFrames,
    12,
    Number.MAX_SAFE_INTEGER,
    "durationInFrames",
  );
  const anticipate = options.startFrame;
  const move = anticipate + Math.floor(options.durationInFrames * 0.16);
  const land = anticipate + Math.floor(options.durationInFrames * 0.72);
  const settle = anticipate + options.durationInFrames - 1;
  integer(settle, 0, Number.MAX_SAFE_INTEGER, "settle");
  const phase: ProducerRecipePhase =
    frame < anticipate
      ? "before"
      : frame < move
        ? "anticipate"
        : frame < land
          ? "move"
          : frame === land
            ? "land"
            : frame < settle
              ? "settle"
              : "hold";
  const travel = smooth(clamp((frame - move) / (land - move)));
  const rebound = clamp((frame - land) / (settle - land));
  const progress =
    frame < move
      ? -0.04 *
        Math.sin(clamp((frame - anticipate) / (move - anticipate)) * Math.PI)
      : frame < land
        ? travel
        : frame < settle
          ? 1 + 0.08 * Math.sin(rebound * 2 * Math.PI) * (1 - rebound) ** 2
          : 1;
  return { anticipate, move, land, settle, phase, travel, progress };
};
export const recipeCues = (
  id: string,
  timing: ReturnType<typeof resolveProducerRecipeTiming>,
  roles: readonly ProducerRecipeMeta["sfxCues"][number][],
): FilmSoundEffectCue[] =>
  roles.map(({ at, role, kind }) => ({
    frame: timing[at],
    sfx: role,
    for: `${id}: ${at}`,
    snap: "none",
    kind,
    durationFrames:
      at === "move"
        ? timing.land - timing.move
        : timing.settle - timing.land + 1,
  }));

const keys: ProducerRecipeMeta["keyframes"] = {
  anticipate: "Preload before travel",
  move: "Travel or fracture starts",
  land: "Contact / target reached; sound anchor",
  settle: "Rebound ends; exact rest",
};
const meta = (
  id: string,
  title: string,
  useWhen: string,
  avoidWhen: string,
  range: readonly [number, number],
  sfxCues: ProducerRecipeMeta["sfxCues"],
): ProducerRecipeMeta => ({
  id,
  title,
  useWhen,
  avoidWhen,
  recommendedDurationSeconds: range,
  keyframes: keys,
  sfxCues,
});
export const PRODUCER_RECIPE_CATALOG = {
  AxiomMorph: meta(
    "AxiomMorph",
    "文字形变",
    "旧公理被证据打破、文字重组",
    "长段正文或需要连续阅读时",
    [1.2, 3],
    [
      { at: "move", role: "glitch-tick", kind: "glitch", durationFrames: 12 },
      { at: "land", role: "soft-impact", kind: "impact", durationFrames: 18 },
    ],
  ),
  NumberRoll: meta(
    "NumberRoll",
    "逐位数字滚动",
    "金额、计数或量级揭示",
    "精确读数需要始终可读时",
    [0.8, 2],
    [{ at: "land", role: "soft-impact", kind: "tick", durationFrames: 8 }],
  ),
  BarGrow: meta(
    "BarGrow",
    "柱条回弹",
    "比较非负数量",
    "负数、密集时间序列",
    [1, 3],
    [{ at: "land", role: "soft-impact", kind: "thud", durationFrames: 18 }],
  ),
  CameraMove: meta(
    "CameraMove",
    "世界镜头推拉摇移",
    "沿因果路径移动或揭示范围",
    "没有空间关系的无动机漂移",
    [1.2, 4],
    [
      { at: "move", role: "whoosh-sweep", kind: "whoosh", durationFrames: 30 },
      { at: "land", role: "soft-impact", kind: "impact", durationFrames: 18 },
    ],
  ),
  ParticleField: meta(
    "ParticleField",
    "粒子散聚",
    "分散的证据聚成形状",
    "正文与精确数据标注",
    [1.2, 3],
    [
      { at: "move", role: "shimmer", kind: "shimmer", durationFrames: 30 },
      { at: "land", role: "soft-impact", kind: "chime", durationFrames: 18 },
    ],
  ),
  ParallaxLayers: meta(
    "ParallaxLayers",
    "深度视差",
    "背、中、主、前景建立空间",
    "所有层必须固定对齐的图表",
    [1.5, 4],
    [
      { at: "move", role: "whoosh-sweep", kind: "whoosh", durationFrames: 30 },
      { at: "land", role: "soft-impact", kind: "impact", durationFrames: 18 },
    ],
  ),
} as const satisfies Record<string, ProducerRecipeMeta>;
