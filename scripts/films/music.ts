import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeFilmMusicInputFingerprint,
  computeFilmTimingInputFingerprint,
  FilmMusicSchema,
  FilmTimingSchema,
  resolveSceneMusicTiming,
  SynthesizedMusicTimelineSchema,
  type FilmSpec,
  type FilmTiming,
} from "@axmorf/studio/contracts";

import {
  generateScore,
  master,
} from "../../.agents/skills/axmorf-video/scripts/synth-score.mjs";
import { writeBinaryFileAtomic } from "../shared/atomic-file";
import {
  filmPaths,
  loadFilmSpec,
  readOptionalJsonFile,
  sha256,
  withWorkspaceLock,
  workspacePath,
  writeJsonFile,
} from "./files";
import { generateFilmRegistry } from "./registry";

export type ScoreRenderer = (recipe: Record<string, unknown>) => {
  readonly timeline: Record<string, unknown> & { durationInFrames: number };
  readonly audio: Buffer;
};

const renderMasteredScore: ScoreRenderer = (recipe) => {
  const result = generateScore(recipe);
  return { timeline: result.timeline, audio: result.audio };
};

/** Requires timing generated from the current film.json. */
export const loadCurrentFilmTiming = async (
  rootDir: string,
  spec: FilmSpec,
): Promise<FilmTiming> => {
  const timing = await readOptionalJsonFile(
    filmPaths(rootDir, spec.filmId).timing,
    FilmTimingSchema,
    "generated/timing.json",
  );
  if (
    timing === null ||
    timing.inputFingerprint !== computeFilmTimingInputFingerprint(spec)
  ) {
    throw new Error(
      `Timing for ${spec.filmId} is missing or older than film.json; run film:voice first.`,
    );
  }
  return timing;
};

/**
 * Projects the score grid onto absolute film frames. The score starts at
 * `startFrame` and repeats when the film outlasts one pass.
 */
export const projectFilmMusicGrid = ({
  timeline,
  startFrame,
  durationInFrames,
}: {
  readonly timeline: unknown;
  readonly startFrame: number;
  readonly durationInFrames: number;
}) => {
  const local = resolveSceneMusicTiming({
    timeline: SynthesizedMusicTimelineSchema.parse(timeline),
    sceneStartFrame: 0,
    durationInFrames: durationInFrames - startFrame,
  });
  const shift = (frames: readonly number[] | undefined) =>
    (frames ?? []).map((frame) => frame + startFrame);
  return {
    beatFrames: shift(local.beatFrames),
    barFrames: shift(local.barFrames),
    sectionFrames: shift(local.sectionFrames),
    accentFrames: shift(local.accentFrames),
  };
};

export const runFilmMusic = async ({
  rootDir,
  filmId,
  renderScore = renderMasteredScore,
  masterScore = master,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly renderScore?: ScoreRenderer;
  readonly masterScore?: (raw: Buffer, directory: string) => Buffer;
}) =>
  withWorkspaceLock(rootDir, "film-music", async () => {
    const spec = await loadFilmSpec(rootDir, filmId);
    if (spec.music === null) {
      throw new Error(
        "film.json has no music recipe; add music.score (studio-v2) first.",
      );
    }
    const timing = await loadCurrentFilmTiming(rootDir, spec);
    const { startFrame } = spec.music;
    if (startFrame >= timing.durationInFrames) {
      throw new Error("music.startFrame is after the end of the film.");
    }
    const { timeline, audio: raw } = renderScore({
      ...spec.music.score,
      fps: spec.render.fps,
    });
    const scratch = await mkdtemp(join(tmpdir(), "axmorf-film-music-"));
    let audio: Buffer;
    try {
      audio = masterScore(raw, scratch);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
    const checksum = sha256(audio);
    const scoreTimeline = { ...timeline, audioChecksum: checksum };
    const grid = projectFilmMusicGrid({
      timeline: scoreTimeline,
      startFrame,
      durationInFrames: timing.durationInFrames,
    });
    const parsedTimeline = SynthesizedMusicTimelineSchema.parse(scoreTimeline);
    const paths = filmPaths(rootDir, filmId);
    await mkdir(paths.publicDir, { recursive: true });
    await writeBinaryFileAtomic({
      destination: paths.musicWav,
      bytes: Uint8Array.from(audio),
      mode: "replace",
    });
    const music = FilmMusicSchema.parse({
      schemaVersion: 1,
      filmId: spec.filmId,
      inputFingerprint: computeFilmMusicInputFingerprint({
        spec,
        durationInFrames: timing.durationInFrames,
      }),
      publicPath: workspacePath(rootDir, paths.musicWav),
      checksum,
      startFrame,
      scoreDurationInFrames: parsedTimeline.durationInFrames,
      volume: spec.music.volume,
      underSpeechVolume: spec.music.underSpeechVolume,
      fadeOutFrames: spec.music.fadeOutFrames,
      bpm: parsedTimeline.bpm,
      beatsPerBar: parsedTimeline.beatsPerBar,
      ...grid,
    });
    await writeJsonFile(paths.music, music);
    await generateFilmRegistry(rootDir);
    const window = timing.durationInFrames - startFrame;
    const framesPerBar =
      (parsedTimeline.beatsPerBar * 60 * spec.render.fps) / parsedTimeline.bpm;
    return {
      status: "film-music-ready",
      filmId: spec.filmId,
      scoreDurationInFrames: music.scoreDurationInFrames,
      filmMusicFrames: window,
      ...(music.scoreDurationInFrames < window
        ? {
            warning: `The score is shorter than the film and will loop; ${Math.ceil(window / framesPerBar)} bars would cover it.`,
          }
        : {}),
      sectionFrames: music.sectionFrames,
      accentFrames: music.accentFrames,
      barFrames: music.barFrames,
    } as const;
  });
