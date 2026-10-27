import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeFilmMusicInputFingerprint,
  computeFilmTimingInputFingerprint,
  FilmAssetsSchema,
  FilmMusicSchema,
  FilmTimingSchema,
  resolveSceneMusicTiming,
  SynthesizedMusicTimelineSchema,
  type FilmMusicSpec,
  type FilmSpec,
  type FilmTiming,
} from "@axmorf/studio/contracts";

import { generateScore, master } from "./score/synth-score.mjs";
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
import {
  buildTrackGrid,
  canonicalizeWav,
  decodeTrackWithFfmpeg,
  estimateTrackTempo,
  readWavMono,
  TRACK_SAMPLE_RATE,
  type TrackDecoder,
} from "./music-track";

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
  decodeTrack = decodeTrackWithFfmpeg,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly renderScore?: ScoreRenderer;
  readonly masterScore?: (raw: Buffer, directory: string) => Buffer;
  readonly decodeTrack?: TrackDecoder;
}) =>
  withWorkspaceLock(rootDir, "film-music", async () => {
    const spec = await loadFilmSpec(rootDir, filmId);
    if (spec.music === null) {
      throw new Error(
        "film.json has no music; add music.score (studio-v2) or music.track (a registered audio file) first.",
      );
    }
    const timing = await loadCurrentFilmTiming(rootDir, spec);
    const { startFrame } = spec.music;
    if (startFrame >= timing.durationInFrames) {
      throw new Error("music.startFrame is after the end of the film.");
    }
    const mastered = (raw: Buffer) => masterInScratch(raw, masterScore);
    const source =
      spec.music.track !== undefined
        ? await prepareTrack({
            rootDir,
            spec,
            music: spec.music,
            durationInFrames: timing.durationInFrames,
            decodeTrack,
            mastered,
          })
        : await prepareScore({
            spec,
            music: spec.music,
            durationInFrames: timing.durationInFrames,
            renderScore,
            mastered,
          });
    const paths = filmPaths(rootDir, filmId);
    await mkdir(paths.publicDir, { recursive: true });
    await writeBinaryFileAtomic({
      destination: paths.musicWav,
      bytes: Uint8Array.from(source.audio),
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
      checksum: sha256(source.audio),
      startFrame,
      scoreDurationInFrames: source.durationInFrames,
      volume: spec.music.volume,
      underSpeechVolume: spec.music.underSpeechVolume,
      fadeOutFrames: spec.music.fadeOutFrames,
      bpm: source.bpm,
      beatsPerBar: source.beatsPerBar,
      ...source.grid,
      ...(source.trackChecksum ? { trackChecksum: source.trackChecksum } : {}),
    });
    await writeJsonFile(paths.music, music);
    await generateFilmRegistry(rootDir);
    const window = timing.durationInFrames - startFrame;
    const framesPerBar =
      (source.beatsPerBar * 60 * spec.render.fps) / source.bpm;
    return {
      status: "film-music-ready",
      filmId: spec.filmId,
      source: spec.music.track !== undefined ? "track" : "score",
      scoreDurationInFrames: music.scoreDurationInFrames,
      filmMusicFrames: window,
      ...(music.scoreDurationInFrames < window
        ? {
            warning:
              spec.music.track !== undefined
                ? "The track is shorter than the film and will loop; trim less, shorten the film, or pick a longer track."
                : `The score is shorter than the film and will loop; ${Math.ceil(window / framesPerBar)} bars would cover it.`,
          }
        : {}),
      ...(source.notes.length ? { notes: source.notes } : {}),
      sectionFrames: music.sectionFrames,
      accentFrames: music.accentFrames,
      barFrames: music.barFrames,
    } as const;
  });

type PreparedMusic = {
  readonly audio: Buffer;
  readonly durationInFrames: number;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly grid: ReturnType<typeof projectFilmMusicGrid>;
  readonly trackChecksum?: string;
  readonly notes: readonly string[];
};

const masterInScratch = async (
  raw: Buffer,
  masterScore: (raw: Buffer, directory: string) => Buffer,
) => {
  const scratch = await mkdtemp(join(tmpdir(), "axmorf-film-music-"));
  try {
    return masterScore(raw, scratch);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

const prepareScore = async ({
  spec,
  music,
  durationInFrames,
  renderScore,
  mastered,
}: {
  readonly spec: FilmSpec;
  readonly music: FilmMusicSpec;
  readonly durationInFrames: number;
  readonly renderScore: ScoreRenderer;
  readonly mastered: (raw: Buffer) => Promise<Buffer>;
}): Promise<PreparedMusic> => {
  const { timeline, audio: raw } = renderScore({
    ...music.score,
    fps: spec.render.fps,
  });
  const audio = await mastered(raw);
  const scoreTimeline = { ...timeline, audioChecksum: sha256(audio) };
  const parsedTimeline = SynthesizedMusicTimelineSchema.parse(scoreTimeline);
  return {
    audio,
    durationInFrames: parsedTimeline.durationInFrames,
    bpm: parsedTimeline.bpm,
    beatsPerBar: parsedTimeline.beatsPerBar,
    grid: projectFilmMusicGrid({
      timeline: scoreTimeline,
      startFrame: music.startFrame,
      durationInFrames,
    }),
    notes: [],
  };
};

/** Uses a registered audio asset; its licence record is what admits it to the film. */
const prepareTrack = async ({
  rootDir,
  spec,
  music,
  durationInFrames,
  decodeTrack,
  mastered,
}: {
  readonly rootDir: string;
  readonly spec: FilmSpec;
  readonly music: FilmMusicSpec;
  readonly durationInFrames: number;
  readonly decodeTrack: TrackDecoder;
  readonly mastered: (raw: Buffer) => Promise<Buffer>;
}): Promise<PreparedMusic> => {
  const track = music.track!;
  const paths = filmPaths(rootDir, spec.filmId);
  const assets = await readOptionalJsonFile(
    paths.assets,
    FilmAssetsSchema,
    "assets.json",
  );
  const asset = assets?.assets.find(
    (entry) =>
      entry.kind === "audio" &&
      entry.publicPath.endsWith(`/assets/${track.asset}`),
  );
  if (asset === undefined) {
    throw new Error(
      `music.track.asset ${track.asset} is not a registered audio asset; register it with film:asset (origin, creator, license and, for licensed music, --source-url) first.`,
    );
  }
  const decoded = canonicalizeWav(
    await decodeTrack({
      rootDir,
      sourcePath: join(rootDir, asset.publicPath),
      trimStartSeconds: track.trimStartSeconds,
    }),
  );
  const { samples } = readWavMono(decoded);
  const estimate = estimateTrackTempo(
    samples,
    TRACK_SAMPLE_RATE,
    track.beatsPerBar,
  );
  if (track.bpm === undefined || track.firstDownbeatSeconds === undefined) {
    throw new Error(
      `music.track needs a beat grid. Suggested from the audio (confidence ${estimate.confidence}): "bpm": ${estimate.bpm}, "firstDownbeatSeconds": ${estimate.firstDownbeatSeconds}. Check the suggestion against the song's sections, write both into film.json and run film:music again.`,
    );
  }
  const notes: string[] = [];
  const ratio = track.bpm / estimate.bpm;
  const near = (value: number) => Math.abs(ratio - value) / value <= 0.02;
  if (!near(1) && !near(2) && !near(0.5)) {
    notes.push(
      `The audio suggests ${estimate.bpm} BPM (confidence ${estimate.confidence}) but film.json says ${track.bpm}; confirm the tempo before cutting on beats.`,
    );
  }
  const audio = await mastered(decoded);
  const trackDurationInFrames = Math.max(
    1,
    Math.round((samples.length / TRACK_SAMPLE_RATE) * spec.render.fps),
  );
  return {
    audio,
    durationInFrames: trackDurationInFrames,
    bpm: track.bpm,
    beatsPerBar: track.beatsPerBar,
    grid: buildTrackGrid({
      track: {
        ...track,
        bpm: track.bpm,
        firstDownbeatSeconds: track.firstDownbeatSeconds,
      },
      trackDurationInFrames,
      fps: spec.render.fps,
      startFrame: music.startFrame,
      durationInFrames,
    }),
    trackChecksum: asset.checksum,
    notes,
  };
};
