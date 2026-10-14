import { FILM_SPEECH_DUCKING_RAMP_FRAMES } from "../../contracts/film";
import { mergeSpeechRanges } from "../runtime/sound-design/audio-playback";
import {
  SoundContribution,
  type SoundContributionValue,
} from "../runtime/sound-design/SoundContribution";
import { useFilm, type FilmRuntime } from "./context";

export type FilmSoundtrackProps = Readonly<{
  /** Set false to leave out the narration track. */
  narration?: boolean;
  /** Set false to leave out the score. */
  music?: boolean;
}>;

/**
 * Resolves the narration and score tracks of a film. The score starts at its
 * recorded frame, loops when shorter than the film, fades out at the end, and
 * dips to `underSpeechVolume` while any sentence is spoken.
 */
export const resolveFilmSoundtrack = ({
  spec,
  timing,
  music,
  durationInFrames,
}: FilmRuntime): SoundContributionValue[] => {
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
  if (music !== null && music.startFrame < durationInFrames) {
    const length = durationInFrames - music.startFrame;
    const ranges = (timing?.sentences ?? []).map(
      ({ startFrame, endFrame }) => [startFrame, endFrame] as const,
    );
    tracks.push({
      contributionId: "music",
      publicPath: music.publicPath,
      startFrame: music.startFrame,
      endFrame: durationInFrames,
      volume: music.volume,
      loop: music.scoreDurationInFrames < length,
      sourceDurationInSeconds: music.scoreDurationInFrames / fps,
      fadeOutFrames: Math.min(music.fadeOutFrames, length),
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
  return tracks;
};

export const FilmSoundtrack = ({
  narration = true,
  music = true,
}: FilmSoundtrackProps) => {
  const film = useFilm();
  return (
    <>
      {resolveFilmSoundtrack(film)
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
