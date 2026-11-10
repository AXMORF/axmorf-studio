import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FILM_CONTACT_SHEET_ID } from "@axmorf/studio/contracts";
import type { FilmMusicAccent } from "../../packages/studio/src/contracts/film-score";
import { filmPaths, workspacePath } from "./files";
import { renderContactSheet } from "./media";
import {
  MOTION_ENERGY_STRONG_ACCENT,
  MOTION_ENERGY_ANTICIPATION_WINDOW,
} from "./motion-energy";

// Full-rate evidence: include all eight preparation frames, the hit and four
// release frames. These strips are mandatory viewing, even when pixel checks pass.
export const STRONG_ACCENT_STRIP_AFTER = 4;
export const STRONG_ACCENT_STRIP_CELL_WIDTH = 480;
export const STRONG_ACCENT_STRIP_COLUMNS = 3;
export const STRONG_ACCENT_STRIP_NOTE =
  "必须逐张检查预备、数字或文字变化过程是否可见，不能只露出终值；在 review-notes 按帧号记录结论。整帧像素运动不能判断配方过程是否被隐藏。";

export const selectStrongAccentStrips = (
  accents: readonly FilmMusicAccent[] | null,
  durationInFrames: number,
) => {
  const strengths = new Map<number, number>();
  for (const accent of accents ?? [])
    if (
      accent.strength >= MOTION_ENERGY_STRONG_ACCENT &&
      accent.frame >= 0 &&
      accent.frame < durationInFrames
    )
      strengths.set(
        accent.frame,
        Math.max(strengths.get(accent.frame) ?? 0, accent.strength),
      );
  return [...strengths]
    .sort(([a], [b]) => a - b)
    .map(([frame, strength]) => {
      const from = Math.max(0, frame - MOTION_ENERGY_ANTICIPATION_WINDOW);
      const to = Math.min(
        durationInFrames - 1,
        frame + STRONG_ACCENT_STRIP_AFTER,
      );
      return {
        frame,
        strength,
        frames: Array.from({ length: to - from + 1 }, (_, i) => from + i),
      };
    });
};

/** Reuse the normal contact-sheet Still and the existing review frame renderer.
 * Every strong accent gets a sheet, including ones with no warning. Overlapping
 * windows share source images; no filesystem/network access enters the renderer. */
export const renderStrongAccentStrips = async ({
  rootDir,
  filmId,
  scratch,
  width,
  height,
  durationInFrames,
  accents,
  timeoutMs,
  renderFrames,
  renderSheet = renderContactSheet,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly scratch: string;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
  readonly accents: readonly FilmMusicAccent[] | null;
  readonly timeoutMs: number;
  readonly renderFrames: (
    frames: readonly number[],
    onImage: (frame: number, path: string) => Promise<void>,
  ) => Promise<void>;
  readonly renderSheet?: typeof renderContactSheet;
}) => {
  const plans = selectStrongAccentStrips(accents, durationInFrames);
  if (!plans.length) return [];
  const paths = filmPaths(rootDir, filmId);
  const directory = join(paths.review, "strong-accent-strips");
  const publicDirectory = join(
    paths.publicDir,
    "review",
    "strong-accent-strips",
  );
  await mkdir(directory, { recursive: true });
  await mkdir(publicDirectory, { recursive: true });
  const frames = [...new Set(plans.flatMap((p) => p.frames))].sort(
    (a, b) => a - b,
  );
  const received = new Set<number>();
  await renderFrames(frames, async (frame, path) => {
    const name = `frame-${frame}.jpeg`;
    await copyFile(path, join(directory, name));
    await copyFile(path, join(publicDirectory, name));
    received.add(frame);
  });
  if (frames.some((frame) => !received.has(frame)))
    throw new Error(
      "Strong-accent strip frames are missing; cannot inspect hidden recipe processes.",
    );
  const strips = [];
  for (const plan of plans) {
    const propsPath = join(scratch, `strong-accent-${plan.frame}.json`);
    const image = join(directory, `f${plan.frame}.jpeg`);
    const cellWidth = STRONG_ACCENT_STRIP_CELL_WIDTH;
    await writeFile(
      propsPath,
      JSON.stringify({
        cells: plan.frames.map((frame) => ({
          image: `films/${paths.id}/review/strong-accent-strips/frame-${frame}.jpeg`,
          label: `f${frame} · ${frame < plan.frame ? "预备" : frame === plan.frame ? `重音 ${plan.strength.toFixed(2)}` : "回弹"}`,
        })),
        columns: Math.min(STRONG_ACCENT_STRIP_COLUMNS, plan.frames.length),
        cellWidth,
        cellHeight: Math.max(
          80,
          Math.min(1000, Math.round((cellWidth * height) / width)),
        ),
      }),
    );
    await renderSheet({
      rootDir,
      compositionId: FILM_CONTACT_SHEET_ID,
      propsPath,
      outputPath: image,
      timeoutMs,
    });
    strips.push({
      ...plan,
      image: workspacePath(rootDir, image),
      message: STRONG_ACCENT_STRIP_NOTE,
    });
  }
  return strips;
};
