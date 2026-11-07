import { lstat, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  computeFilmSfxInputFingerprint,
  computeFilmSoundEffectFingerprint,
  computeFilmTimingInputFingerprint,
  FILM_SFX_SYNTHESIZER_VERSION,
  FilmAssetsSchema,
  filmFrameFromSamples,
  FilmSfxSchema,
  FilmTimingSchema,
  resolveFilmSoundEffectFrames,
  validateFilmSoundEffects,
  type FilmAsset,
  type FilmGeneratedSoundEffect,
  type FilmSfx,
  type FilmSoundEffectSpec,
  type FilmSpec,
} from "@axmorf/studio/contracts";

import { writeBinaryFileAtomic } from "../shared/atomic-file";
import {
  measureFilmSoundEffectWav,
  renderFilmSoundEffectWav,
} from "../sound-effects/synth";
import {
  exists,
  filmPaths,
  loadFilmSpec,
  readOptionalJsonFile,
  sha256,
  withWorkspaceLock,
  workspacePath,
  writeJsonFile,
} from "./files";
import { generateFilmRegistry } from "./registry";

type EffectRenderer = (effect: FilmSoundEffectSpec, fps: number) => Buffer;
const creator = `AXMORF Studio ${FILM_SFX_SYNTHESIZER_VERSION}`;
const effectPath = (rootDir: string, filmId: string, id: string) =>
  join(filmPaths(rootDir, filmId).sfxDir, `${id}.wav`);

const readAudio = async (path: string) => {
  const state = await lstat(path);
  if (!state.isFile() || state.isSymbolicLink())
    throw new Error(`Sound effect must be a regular file: ${path}.`);
  return readFile(path);
};

const checkEntry = ({
  rootDir,
  spec,
  effect,
  entry,
  bytes,
  durationInFrames,
}: {
  readonly rootDir: string;
  readonly spec: FilmSpec;
  readonly effect: FilmSoundEffectSpec;
  readonly entry: FilmGeneratedSoundEffect;
  readonly bytes: Buffer;
  readonly durationInFrames: number;
}) => {
  const alignment = resolveFilmSoundEffectFrames(effect, durationInFrames);
  const measured = measureFilmSoundEffectWav(bytes);
  if (
    entry.id !== effect.id ||
    entry.kind !== effect.kind ||
    entry.for !== effect.for ||
    entry.anchor !== effect.anchor ||
    entry.inputFingerprint !==
      computeFilmSoundEffectFingerprint({ effect, fps: spec.render.fps }) ||
    entry.publicPath !==
      workspacePath(rootDir, effectPath(rootDir, spec.filmId, effect.id)) ||
    entry.checksum !== sha256(bytes) ||
    entry.sampleRate !== measured.sampleRate ||
    entry.sampleFrameCount !== measured.sampleFrameCount ||
    entry.durationInSeconds !== measured.durationInSeconds ||
    measured.sampleFrameCount !==
      Math.floor(
        (effect.durationFrames * measured.sampleRate) / spec.render.fps,
      ) ||
    entry.durationInFrames !==
      filmFrameFromSamples(
        measured.sampleFrameCount,
        spec.render.fps,
        measured.sampleRate,
      ) ||
    entry.durationInFrames !== effect.durationFrames ||
    entry.startFrame !== alignment.startFrame ||
    entry.endFrame !== alignment.endFrame ||
    entry.alignmentFrame !== alignment.alignmentFrame ||
    measured.peak > 10 ** (-1 / 20)
  )
    throw new Error(
      `Sound effect ${effect.id} audio, fingerprint or measured alignment differs from its plan.`,
    );
  return measured;
};

/** Hard check shared with film:check; old films without sound need no projection. */
export const assertFilmSfxConsistency = async ({
  rootDir,
  spec,
  durationInFrames,
}: {
  readonly rootDir: string;
  readonly spec: FilmSpec;
  readonly durationInFrames: number;
}): Promise<FilmSfx | null> => {
  try {
    validateFilmSoundEffects(spec, durationInFrames);
    const paths = filmPaths(rootDir, spec.filmId);
    const effects = spec.sound?.effects ?? [];
    const generated = await readOptionalJsonFile(
      paths.sfx,
      FilmSfxSchema,
      "generated/sfx.json",
    );
    if (generated === null && effects.length === 0) return null;
    if (
      generated === null ||
      generated.filmId !== spec.filmId ||
      generated.synthesizerVersion !== FILM_SFX_SYNTHESIZER_VERSION ||
      generated.inputFingerprint !==
        computeFilmSfxInputFingerprint({ spec, durationInFrames }) ||
      generated.effects.length !== effects.length
    )
      throw new Error(
        "Sound effect generation is missing or older than film.json.",
      );
    const assets = await readOptionalJsonFile(
      paths.assets,
      FilmAssetsSchema,
      "assets.json",
    );
    for (const effect of effects) {
      const entry = generated.effects.find(({ id }) => id === effect.id);
      if (!entry)
        throw new Error(
          `Sound effect ${effect.id} is missing from generated/sfx.json.`,
        );
      const bytes = await readAudio(
        effectPath(rootDir, spec.filmId, effect.id),
      );
      checkEntry({ rootDir, spec, effect, entry, bytes, durationInFrames });
      const asset =
        assets?.filmId === spec.filmId
          ? assets.assets.find(
              ({ publicPath }) => publicPath === entry.publicPath,
            )
          : undefined;
      if (
        asset?.checksum !== entry.checksum ||
        asset.origin !== "original" ||
        asset.kind !== "audio" ||
        asset.creator !== creator ||
        asset.license !== "Apache-2.0"
      ) {
        throw new Error(
          `Sound effect ${effect.id} needs its original audio license record.`,
        );
      }
    }
    return generated;
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : "Sound effect consistency check failed."} Run film:sfx -- --film ${spec.filmId}.`,
      { cause: error },
    );
  }
};

/** Uses only locally synthesized PCM and the current, measured body timing. */
export const runFilmSfx = async ({
  rootDir,
  filmId,
  renderEffect = renderFilmSoundEffectWav,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly renderEffect?: EffectRenderer;
}) =>
  withWorkspaceLock(rootDir, "film-sfx", async () => {
    const spec = await loadFilmSpec(rootDir, filmId);
    const paths = filmPaths(rootDir, filmId);
    const timing = await readOptionalJsonFile(
      paths.timing,
      FilmTimingSchema,
      "generated/timing.json",
    );
    if (
      !timing ||
      timing.filmId !== spec.filmId ||
      timing.inputFingerprint !== computeFilmTimingInputFingerprint(spec)
    ) {
      throw new Error(
        `Timing for ${filmId} is missing or older than film.json; run film:voice first.`,
      );
    }
    const durationInFrames = timing.durationInFrames;
    validateFilmSoundEffects(spec, durationInFrames);
    const previous = await readOptionalJsonFile(
      paths.sfx,
      FilmSfxSchema,
      "generated/sfx.json",
    );
    const assets = (await readOptionalJsonFile(
      paths.assets,
      FilmAssetsSchema,
      "assets.json",
    )) ?? { schemaVersion: 1 as const, filmId: spec.filmId, assets: [] };
    if (assets.filmId !== spec.filmId)
      throw new Error("assets.json belongs to another film.");
    const generatedEffects: FilmGeneratedSoundEffect[] = [];
    const originalAssets: FilmAsset[] = [];
    let cached = 0;
    await mkdir(paths.sfxDir, { recursive: true });
    for (const effect of spec.sound?.effects ?? []) {
      const destination = effectPath(rootDir, filmId, effect.id);
      const inputFingerprint = computeFilmSoundEffectFingerprint({
        effect,
        fps: spec.render.fps,
      });
      const prior = previous?.effects.find(
        (entry) =>
          entry.id === effect.id && entry.inputFingerprint === inputFingerprint,
      );
      let bytes: Buffer | null = null;
      if (prior && (await exists(destination))) {
        const candidate = await readAudio(destination);
        try {
          checkEntry({
            rootDir,
            spec,
            effect,
            entry: prior,
            bytes: candidate,
            durationInFrames,
          });
          bytes = candidate;
          cached += 1;
        } catch {
          // Explicit generation repairs a corrupted/stale local cache by synthesis.
          bytes = null;
        }
      }
      const audio = bytes ?? renderEffect(effect, spec.render.fps);
      const measured = measureFilmSoundEffectWav(audio);
      const entry = {
        id: effect.id,
        kind: effect.kind,
        for: effect.for,
        anchor: effect.anchor,
        inputFingerprint,
        publicPath: workspacePath(rootDir, destination),
        checksum: sha256(audio),
        sampleRate: measured.sampleRate,
        sampleFrameCount: measured.sampleFrameCount,
        durationInSeconds: measured.durationInSeconds,
        durationInFrames: filmFrameFromSamples(
          measured.sampleFrameCount,
          spec.render.fps,
          measured.sampleRate,
        ),
        ...resolveFilmSoundEffectFrames(effect, durationInFrames),
      };
      checkEntry({
        rootDir,
        spec,
        effect,
        entry,
        bytes: audio,
        durationInFrames,
      });
      if (bytes === null)
        await writeBinaryFileAtomic({
          destination,
          bytes: Uint8Array.from(audio),
          mode: "replace",
        });
      generatedEffects.push(entry);
      originalAssets.push({
        publicPath: entry.publicPath,
        checksum: entry.checksum,
        kind: "audio" as const,
        origin: "original" as const,
        creator,
        license: "Apache-2.0",
        attribution: `${effect.id}: original sound effect synthesized by ${creator} (Apache-2.0)`,
      });
    }
    const generated = FilmSfxSchema.parse({
      schemaVersion: 1,
      filmId: spec.filmId,
      inputFingerprint: computeFilmSfxInputFingerprint({
        spec,
        durationInFrames,
      }),
      synthesizerVersion: FILM_SFX_SYNTHESIZER_VERSION,
      effects: generatedEffects,
    });
    await writeJsonFile(
      paths.assets,
      FilmAssetsSchema.parse({
        ...assets,
        assets: [
          ...assets.assets.filter(
            (asset) =>
              !originalAssets.some(
                ({ publicPath }) => publicPath === asset.publicPath,
              ),
          ),
          ...originalAssets,
        ].sort((a, b) => a.publicPath.localeCompare(b.publicPath)),
      }),
    );
    await writeJsonFile(paths.sfx, generated);
    await generateFilmRegistry(rootDir);
    return {
      status: "film-sfx-ready",
      filmId: spec.filmId,
      generated: generatedEffects.length - cached,
      cached,
      effects: generatedEffects,
    } as const;
  });
