import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FilmMusicAccent } from "../../packages/studio/src/contracts/film-score";
import type { FilmMotionWarningSchema } from "@axmorf/studio/contracts";
import type { z } from "zod";
import { runMediaProcess } from "../shared/media-process";
import { resolveMediaToolCommand } from "../shared/media-tool-command";
import type { ProcessRunner } from "../shared/process";
import { decodeGrayPng, meanAbsoluteDifference } from "./frame-compare";

// Same scale/format as the v4 acceptance script; differences are in 0..255 luma units.
export const MOTION_ENERGY_WIDTH = 160;
export const MOTION_ENERGY_HEIGHT = 90;
// A single decode must finish within two minutes; fail visibly, without a retry.
export const MOTION_ENERGY_TIMEOUT_MS = 120_000;
// Strong accents belong among the film's largest actions, including transitions.
// v4's p95 (~4.69) let weak reveals pass; linear p99 (~22) reflects that hierarchy.
export const MOTION_ENERGY_STRONG_ACCENT = 0.9;
export const MOTION_ENERGY_ACCENT_PERCENTILE = 0.99;
// Inclusive landing window. This diagnoses magnitude, not the exact-sync requirement.
export const MOTION_ENERGY_WINDOW_BEFORE = 1;
export const MOTION_ENERGY_WINDOW_AFTER = 3;
// A visible preparation needs >=6 moving frames in the inclusive eight-frame
// window before the hit. Strictly >2x the film median excludes ordinary stillness;
// whole-frame energy can still come from the background, so inspect the subject too.
export const MOTION_ENERGY_ANTICIPATION_WINDOW = 8;
export const MOTION_ENERGY_ANTICIPATION_MIN_FRAMES = 6;
export const MOTION_ENERGY_ANTICIPATION_MEDIAN_MULTIPLIER = 2;

export type MotionEnergySample = Readonly<{
  frame: number;
  difference: number;
}>;
type Warning = z.infer<typeof FilmMotionWarningSchema>;

/** Stream raw gray frames. E[f] = MAD(frame f-1, frame f), with no invented E[0]. */
export const measureMotionEnergy = async (
  chunks: AsyncIterable<Uint8Array>,
) => {
  const size = MOTION_ENERGY_WIDTH * MOTION_ENERGY_HEIGHT;
  const samples: MotionEnergySample[] = [];
  let pending = Buffer.alloc(0);
  let previous: Uint8Array | undefined;
  let decodedFrames = 0;
  for await (const chunk of chunks) {
    const bytes = Buffer.concat([pending, chunk]);
    let offset = 0;
    while (offset + size <= bytes.length) {
      const pixels = bytes.subarray(offset, offset + size);
      if (previous)
        samples.push({
          frame: decodedFrames,
          difference: meanAbsoluteDifference(previous, pixels),
        });
      previous = pixels;
      decodedFrames++;
      offset += size;
    }
    pending = bytes.subarray(offset);
  }
  if (pending.length) throw new Error("Motion energy decode ended mid-frame.");
  return { samples, decodedFrames };
};

/** Decode consecutive body frames once, excluding both bookends, with existing FFmpeg.
 * Remotion's FFmpeg omits the rawvideo muxer: use lossless gray PNGs in scratch
 * instead. Pixel bytes are identical; read them one at a time to bound RAM. */
export const decodeMotionEnergy = async ({
  rootDir,
  videoPath,
  scratch,
  startFrame = 0,
  durationInFrames,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly videoPath: string;
  readonly scratch: string;
  readonly startFrame?: number;
  readonly durationInFrames: number;
  readonly runProcess?: ProcessRunner;
}) => {
  const directory = await mkdtemp(join(scratch, "motion-energy-"));
  try {
    const command = await resolveMediaToolCommand({
      rootDir,
      tool: "ffmpeg",
      args: [
        "-v",
        "error",
        "-nostdin",
        "-i",
        videoPath,
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        `trim=start_frame=${startFrame}:end_frame=${startFrame + durationInFrames},scale=${MOTION_ENERGY_WIDTH}:${MOTION_ENERGY_HEIGHT},format=gray`,
        "-vsync",
        "0",
        "-frames:v",
        String(durationInFrames),
        "-c:v",
        "png",
        "-start_number",
        "0",
        "-f",
        "image2",
        "-y",
        join(directory, "%06d.png"),
      ],
    });
    const started = performance.now();
    const result = await runProcess(command.command, command.args, {
      cwd: rootDir,
      timeoutMs: MOTION_ENERGY_TIMEOUT_MS,
    });
    if (result.status !== 0)
      throw new Error(
        `Motion energy decode failed: ${result.stderr.slice(-2048)}`,
      );
    const files = (await readdir(directory))
      .filter((f) => /^\d+\.png$/u.test(f))
      .sort();
    async function* pixels() {
      for (const file of files) {
        const image = decodeGrayPng(await readFile(join(directory, file)));
        if (
          image.width !== MOTION_ENERGY_WIDTH ||
          image.height !== MOTION_ENERGY_HEIGHT
        )
          throw new Error("Motion energy frame dimensions do not match.");
        yield image.pixels;
      }
    }
    const measured = await measureMotionEnergy(pixels());
    return { ...measured, decodeMs: Math.round(performance.now() - started) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/** NumPy percentile's default linear interpolation, also used for the median. */
export const motionEnergyQuantile = (values: readonly number[], q: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
};

export const analyzeMotionEnergy = ({
  samples,
  durationInFrames,
  sentences,
  accents,
  unavailableReason,
}: {
  readonly samples: readonly MotionEnergySample[] | null;
  readonly durationInFrames: number;
  readonly sentences: readonly Readonly<{
    startFrame: number;
    endFrame: number;
  }>[];
  readonly accents: readonly FilmMusicAccent[] | null;
  readonly unavailableReason?: string;
}) => {
  const motionWarnings: Warning[] = [];
  const unknown: { rule: Warning["rule"]; reason: string }[] = [];
  if (
    !samples ||
    samples.length !== durationInFrames - 1 ||
    !samples.length ||
    samples.some((sample, i) => sample.frame !== i + 1)
  ) {
    for (const rule of ["accent-underplayed", "beat-sections-static"] as const)
      unknown.push({
        rule,
        reason:
          unavailableReason ??
          "Requires every consecutive animatic body frame; sparse or incomplete frames cannot measure motion energy.",
      });
    return { motionWarnings, unknown, summary: null };
  }
  const differences = samples.map((s) => s.difference);
  // Retain p95 as a descriptive comparison for earlier reports, never as the gate.
  const p95 = motionEnergyQuantile(differences, 0.95)!;
  const p99 = motionEnergyQuantile(
    differences,
    MOTION_ENERGY_ACCENT_PERCENTILE,
  )!;
  const median = motionEnergyQuantile(differences, 0.5)!;
  const anticipationThreshold =
    median * MOTION_ENERGY_ANTICIPATION_MEDIAN_MULTIPLIER;
  const strongAccents =
    accents === null
      ? null
      : accents
          .filter(
            (a) =>
              a.strength >= MOTION_ENERGY_STRONG_ACCENT &&
              a.frame >= 0 &&
              a.frame < durationInFrames,
          )
          .map((accent) => {
            const from = Math.max(
              1,
              accent.frame - MOTION_ENERGY_WINDOW_BEFORE,
            );
            const to = Math.min(
              durationInFrames - 1,
              accent.frame + MOTION_ENERGY_WINDOW_AFTER,
            );
            const peak = Math.max(
              ...samples.slice(from - 1, to).map((s) => s.difference),
            );
            const anticipationFrom = Math.max(
              1,
              accent.frame - MOTION_ENERGY_ANTICIPATION_WINDOW,
            );
            const anticipationFrames = samples
              .slice(anticipationFrom - 1, Math.max(0, accent.frame - 1))
              .filter((s) => s.difference > anticipationThreshold).length;
            const missingAnticipation =
              anticipationFrames < MOTION_ENERGY_ANTICIPATION_MIN_FRAMES;
            const weakImpact = peak < p99;
            const reasons = [
              ...(missingAnticipation
                ? [
                    `缺预备：[f-8,f-1] 仅 ${anticipationFrames} 帧能量 > ${anticipationThreshold.toFixed(3)}（全片中位数 ${median.toFixed(3)} × ${MOTION_ENERGY_ANTICIPATION_MEDIAN_MULTIPLIER}），至少需要 ${MOTION_ENERGY_ANTICIPATION_MIN_FRAMES} 帧整帧运动`,
                  ]
                : []),
              ...(weakImpact
                ? [
                    `冲击不够：[f-1,f+3] 峰值 ${peak.toFixed(3)} < 全片 p99 ${p99.toFixed(3)}`,
                  ]
                : []),
            ];
            if (missingAnticipation || weakImpact)
              motionWarnings.push({
                rule: "accent-underplayed",
                frames: [
                  Math.max(
                    0,
                    accent.frame -
                      (missingAnticipation
                        ? MOTION_ENERGY_ANTICIPATION_WINDOW
                        : MOTION_ENERGY_WINDOW_BEFORE),
                  ),
                  weakImpact ? to : Math.max(0, accent.frame - 1),
                ],
                message: `强重音 f${accent.frame}（strength ${accent.strength}）：${reasons.join("；")}。像素预备条件仅检查整帧运动，无法判断配方过程是否被隐藏；逐张查看 strong-accent-strip，在 review-notes 按帧记录主体过程是否可见。`,
              });
            return { ...accent, peak, anticipationFrames };
          });
  if (strongAccents === null)
    unknown.push({
      rule: "accent-underplayed",
      reason:
        "Requires music.onsets.accents with strength; legacy frame-only accents remain unknown.",
    });
  const speech: number[] = [],
    beats: number[] = [];
  for (const sample of samples) {
    const narrating = sentences.some(
      (s) => sample.frame >= s.startFrame && sample.frame < s.endFrame,
    );
    (narrating ? speech : beats).push(sample.difference);
  }
  const speechMedian = motionEnergyQuantile(speech, 0.5);
  const beatMedian = motionEnergyQuantile(beats, 0.5);
  if (beatMedian === null)
    unknown.push({
      rule: "beat-sections-static",
      reason: "Requires non-narration body frames for a median measurement.",
    });
  else if (beatMedian === 0)
    motionWarnings.push({
      rule: "beat-sections-static",
      frames: [0, durationInFrames - 1],
      message: "非旁白时段中位数为0，请核对是否有意停留。",
    });
  return {
    motionWarnings,
    unknown,
    summary: {
      sampledFrames: samples.length,
      p95,
      p99,
      median,
      anticipationThreshold,
      strongAccents,
      speechFrames: speech.length,
      speechMedian,
      beatFrames: beats.length,
      beatMedian,
    },
  };
};
