import { FILM_SPEECH_DUCKING_RAMP_FRAMES } from "../../contracts/film";
import { mergeSpeechRanges } from "../runtime/sound-design/audio-playback";
import {
  SoundContribution,
  type SoundContributionValue,
} from "../runtime/sound-design/SoundContribution";
import {
  resolveFilmSoundEffects,
  type FilmSoundEffectSource,
} from "./FilmSoundEffects";
import { useFilm, type FilmRuntime } from "./context";

export type FilmSoundtrackProps = Readonly<{
  /** Set false to leave out the narration track. */
  narration?: boolean;
  /** Set false to leave out the score. */
  music?: boolean;
  /** Body-local [from, to) absolute music volumes, combined with speech by minimum. */
  musicDips?: readonly Readonly<{ from: number; to: number; volume: number }>[];
  /** Fade to silence at landFrame, or the last body accent (body end if none).
   * Optional SFX is end-anchored here too, so its tail never enters the outro. */
  ending?: Readonly<{ landFrame?: number; sfx?: FilmSoundEffectSource }>;
}>;

/**
 * Resolves the narration and score tracks of a film. The score starts at its
 * recorded frame, loops when shorter than the film, fades out at the end, and
 * dips to `underSpeechVolume` while any sentence is spoken.
 */
export const resolveFilmSoundtrack = (
  { spec, timing, music, durationInFrames }: FilmRuntime,
  options: Pick<FilmSoundtrackProps, "musicDips" | "ending"> = {},
): SoundContributionValue[] => {
  const tracks: SoundContributionValue[] = [];
  const { fps } = spec.render;
  if (timing?.narration) {
    const narrationFrames = Math.ceil(
      (timing.narration.sampleFrameCount * timing.fps) /
        timing.narration.sampleRate,
    );
    tracks.push({
      contributionId: "narration",
      publicPath: timing.narration.publicPath,
      startFrame: timing.narrationStartFrame,
      endFrame: Math.min(
        durationInFrames,
        timing.narrationStartFrame + narrationFrames,
      ),
      volume: 1,
      loop: false,
    });
  }
  for (const dip of options.musicDips ?? []) {
    if (
      !Number.isSafeInteger(dip.from) ||
      !Number.isSafeInteger(dip.to) ||
      dip.from < 0 ||
      dip.to <= dip.from ||
      dip.to > durationInFrames ||
      !Number.isFinite(dip.volume) ||
      dip.volume < 0 ||
      dip.volume > 1
    )
      throw new Error("Invalid music dip.");
  }
  const accents = (music?.accentFrames ?? []).filter(
    (frame) => frame > (music?.startFrame ?? 0) && frame <= durationInFrames,
  );
  const landFrame =
    options.ending === undefined
      ? durationInFrames
      : (options.ending.landFrame ??
        (accents.length ? Math.max(...accents) : durationInFrames));
  if (
    options.ending !== undefined &&
    (!Number.isSafeInteger(landFrame) ||
      landFrame <= (music?.startFrame ?? 0) ||
      landFrame > durationInFrames)
  )
    throw new Error(
      "Ending landFrame must follow music start and stay in the body.",
    );
  if (music !== null && music.startFrame < durationInFrames) {
    const length = landFrame - music.startFrame;
    const ranges = (timing?.sentences ?? []).map(
      ({ startFrame, endFrame }) => [startFrame, endFrame] as const,
    );
    tracks.push({
      contributionId: "music",
      publicPath: music.publicPath,
      startFrame: music.startFrame,
      endFrame: landFrame,
      volume: music.volume,
      loop: music.scoreDurationInFrames < length,
      sourceDurationInSeconds: music.scoreDurationInFrames / fps,
      fadeOutFrames: Math.min(music.fadeOutFrames, length),
      ...((options.musicDips?.length ?? 0) === 0
        ? {}
        : {
            volumeDips: (options.musicDips ?? []).map((dip) => ({
              volume: Math.min(dip.volume, music.volume),
              rampFrames: FILM_SPEECH_DUCKING_RAMP_FRAMES,
              ranges: [
                [
                  dip.from - music.startFrame,
                  dip.to - music.startFrame,
                ] as const,
              ],
            })),
          }),
      ...(ranges.length === 0 || music.underSpeechVolume >= music.volume
        ? {}
        : {
            speechDucking: {
              volume: music.underSpeechVolume,
              rampFrames: FILM_SPEECH_DUCKING_RAMP_FRAMES,
              ranges: mergeSpeechRanges(
                ranges,
                FILM_SPEECH_DUCKING_RAMP_FRAMES,
                music.startFrame,
              ),
            },
          }),
    });
  }
  if (options.ending?.sfx !== undefined) {
    tracks.push(
      ...resolveFilmSoundEffects({ spec, timing, music, durationInFrames }, [
        { endFrame: landFrame, sfx: options.ending.sfx, for: "Film ending" },
      ]),
    );
  }
  return tracks;
};

export const FilmSoundtrack = ({
  narration = true,
  music = true,
  musicDips,
  ending,
}: FilmSoundtrackProps) => {
  const film = useFilm();
  return (
    <>
      {resolveFilmSoundtrack(film, { musicDips, ending })
        .filter(({ contributionId }) =>
          contributionId === "narration" ? narration : music,
        )
        .map((contribution) => (
          <SoundContribution
            key={contribution.contributionId}
            contribution={contribution}
          />
        ))}
    </>
  );
};
