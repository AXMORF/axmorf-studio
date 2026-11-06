import { FilmAssetSchema, type FilmAsset } from "../../contracts/film";
import type { ResourceAssetDescriptor } from "../../contracts/resource-catalog";
import sharedManifest from "../catalog/assets.manifest.json";
import { snapProducerFrameToBeat } from "../capabilities/motion/beat";
import { getProducerSoundLibrary } from "../capabilities/sound/library";
import { assertProducerLocalMediaPath } from "../capabilities/media/local-path";
import {
  SoundContribution,
  type SoundContributionValue,
} from "../runtime/sound-design/SoundContribution";
import { mergeSpeechRanges } from "../runtime/sound-design/audio-playback";
import { FILM_SPEECH_DUCKING_RAMP_FRAMES } from "../../contracts/film";
import { useFilm, type FilmRuntime } from "./context";

export const FILM_SFX_DEFAULT_VOLUME = 0.55;
export const FILM_SFX_UNDER_SPEECH_GAIN = 0.55;
export const FILM_SFX_DEFAULT_MAX_SHIFT_FRAMES = 4;

/** Pass a descriptor from a registered manifest, or a film's assets.json entry
 * plus measured duration (FilmAsset has no duration field). No network or IO. */
export type FilmSoundEffectSource =
  | string
  | ResourceAssetDescriptor
  | Readonly<{ asset: FilmAsset; durationInSeconds: number }>;
export type FilmSoundEffectCue = Readonly<{
  sfx: FilmSoundEffectSource;
  snap?: "none" | "beat" | "bar" | "accent" | "section";
  maxShiftFrames?: number;
  /** Inclusive window for the authored anchor (start, or end when endFrame is used). */
  minFrame?: number;
  maxFrame?: number;
  volume?: number;
  for: string;
}> &
  (
    | Readonly<{ frame: number; endFrame?: never }>
    | Readonly<{ endFrame: number; frame?: never }>
  );
export type FilmSoundEffectsProps = Readonly<{
  cues: readonly FilmSoundEffectCue[];
}>;
export type ResolvedFilmSoundEffect = SoundContributionValue &
  Readonly<{ sfxId: string; for: string }>;

const sharedLibrary = getProducerSoundLibrary(sharedManifest)["sound-effect"];
const roleIds: Readonly<Record<string, string>> = {
  "soft-whoosh": "whoosh-short",
  "directional-whoosh": "whoosh-sweep",
  "signal-sweep": "whoosh-sweep",
  "impact-bloom": "soft-impact",
};
const resolveSource = (source: FilmSoundEffectSource) => {
  if (typeof source === "string") {
    const name = roleIds[source] ?? source;
    const entry = sharedLibrary.find(
      ({ id }) => id === name || id === `asset.axmorf.sfx.${name}-v1`,
    );
    if (!entry) throw new Error(`Sound effect not found: ${source}.`);
    return {
      id: entry.id,
      publicPath: entry.publicPath,
      seconds: entry.durationInSeconds,
    };
  }
  if ("asset" in source) {
    const asset = FilmAssetSchema.parse(source.asset);
    if (asset.kind !== "audio")
      throw new Error("Film sound effect must be a registered audio asset.");
    assertProducerLocalMediaPath(
      asset.publicPath.slice("public/".length),
      "Film sound effect",
    );
    return {
      id: asset.publicPath,
      publicPath: asset.publicPath,
      seconds: source.durationInSeconds,
    };
  }
  const [entry] = getProducerSoundLibrary({
    schemaVersion: 1,
    assets: [source],
  })["sound-effect"];
  if (!entry) throw new Error("Sound effect descriptor has the wrong role.");
  return {
    id: entry.id,
    publicPath: entry.publicPath,
    seconds: entry.durationInSeconds,
  };
};

export const resolveFilmSoundEffects = (
  film: Pick<FilmRuntime, "spec" | "timing" | "music" | "durationInFrames">,
  cues: readonly FilmSoundEffectCue[],
): ResolvedFilmSoundEffect[] => {
  const seen = new Set<string>();
  return cues.flatMap((cue) => {
    if ((cue.frame !== undefined) === (cue.endFrame !== undefined))
      throw new Error(
        "Use exactly one sound effect anchor: frame or endFrame.",
      );
    const source = resolveSource(cue.sfx);
    if (!Number.isFinite(source.seconds) || source.seconds <= 0)
      throw new Error("Sound effect needs measured duration.");
    const length = Math.ceil(source.seconds * film.spec.render.fps);
    if (!Number.isSafeInteger(length) || length <= 0)
      throw new Error("Sound effect duration is not frame-safe.");
    const endAnchored = cue.endFrame !== undefined;
    const anchor = endAnchored ? cue.endFrame : cue.frame;
    const min = Math.max(endAnchored ? length : 0, cue.minFrame ?? 0);
    const max = Math.min(
      endAnchored ? film.durationInFrames : film.durationInFrames - 1,
      cue.maxFrame ?? film.durationInFrames,
    );
    const volume = cue.volume ?? FILM_SFX_DEFAULT_VOLUME;
    if (
      !Number.isSafeInteger(anchor) ||
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      anchor < min ||
      anchor > max ||
      !cue.for.trim() ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      volume > 1
    )
      throw new Error(
        "Sound effect cue has invalid anchor, window, purpose or volume.",
      );
    const snap = cue.snap ?? "none";
    if (!["none", "beat", "bar", "accent", "section"].includes(snap))
      throw new Error("Unknown sound effect snap grid.");
    const grid = snap === "none" ? [] : (film.music?.[`${snap}Frames`] ?? []);
    const snapped = snapProducerFrameToBeat(anchor, grid, {
      minFrame: min,
      maxFrame: max,
      maxShiftFrames: cue.maxShiftFrames ?? FILM_SFX_DEFAULT_MAX_SHIFT_FRAMES,
    });
    const startFrame = endAnchored ? snapped - length : snapped;
    const key = `${source.publicPath}:${startFrame}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        contributionId: `sfx:${source.id}:${startFrame}`,
        sfxId: source.id,
        for: cue.for,
        publicPath: source.publicPath,
        startFrame,
        endFrame: Math.min(film.durationInFrames, startFrame + length),
        volume,
        loop: false,
        speechDucking: {
          volume: volume * FILM_SFX_UNDER_SPEECH_GAIN,
          rampFrames: FILM_SPEECH_DUCKING_RAMP_FRAMES,
          ranges: mergeSpeechRanges(
            (film.timing?.sentences ?? []).map(
              ({ startFrame: from, endFrame: to }) => [from, to] as const,
            ),
            FILM_SPEECH_DUCKING_RAMP_FRAMES,
            startFrame,
          ),
        },
      },
    ];
  });
};

export const FilmSoundEffects = ({ cues }: FilmSoundEffectsProps) => {
  const film = useFilm();
  return (
    <>
      {resolveFilmSoundEffects(film, cues).map((contribution) => (
        <SoundContribution
          key={contribution.contributionId}
          contribution={contribution}
        />
      ))}
    </>
  );
};
