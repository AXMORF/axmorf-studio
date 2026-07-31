import { Audio } from "@remotion/media";
import type { FC } from "react";
import { staticFile } from "remotion";
import { assertProducerLocalMediaPath } from "../media/local-path";
import { getProducerBedVolume, getProducerDuckedVolume } from "./envelopes";
import type { ProducerBedTrack, ProducerNarrationWindow, ProducerSfxCue } from "./types";

const validateTrack = (track: ProducerBedTrack): void => {
  assertProducerLocalMediaPath(track.src, `${track.id} src`);
  if (!Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1) {
    throw new Error(`${track.id} volume must be between 0 and 1.`);
  }
};

export const ProducerSoundtrack: FC<{
  readonly bgm: ProducerBedTrack;
  readonly ambience?: ProducerBedTrack;
  readonly sfx: readonly ProducerSfxCue[];
  readonly narrationWindows: readonly ProducerNarrationWindow[];
  readonly durationInFrames: number;
  readonly duckedBgmVolume?: number;
}> = ({ bgm, ambience, sfx, narrationWindows, durationInFrames, duckedBgmVolume = 0.08 }) => {
  validateTrack(bgm);
  if (ambience) validateTrack(ambience);
  if (!Number.isInteger(durationInFrames) || durationInFrames <= 0) {
    throw new Error("ProducerSoundtrack durationInFrames must be a positive integer.");
  }

  return (
    <>
      <Audio
        disallowFallbackToHtml5Audio
        durationInFrames={durationInFrames}
        loop
        loopVolumeCurveBehavior="extend"
        onError={() => "fail"}
        src={staticFile(bgm.src)}
        volume={(frame) =>
          getProducerDuckedVolume({
            frame,
            baseVolume: bgm.volume,
            duckedVolume: duckedBgmVolume,
            attackFrames: 6,
            releaseFrames: 10,
            narrationWindows,
          })
        }
      />
      {ambience ? (
        <Audio
          disallowFallbackToHtml5Audio
          durationInFrames={durationInFrames}
          loop
          loopVolumeCurveBehavior="extend"
          onError={() => "fail"}
          src={staticFile(ambience.src)}
          volume={(frame) =>
            getProducerBedVolume({
              frame,
              durationInFrames,
              volume: ambience.volume,
              fadeFrames: 12,
            })
          }
        />
      ) : null}
      {sfx.map((cue) => {
        assertProducerLocalMediaPath(cue.src, `${cue.id} src`);
        if (!Number.isInteger(cue.from) || cue.from < 0) {
          throw new Error(`${cue.id} from must be a non-negative integer.`);
        }
        if (!Number.isInteger(cue.durationInFrames) || cue.durationInFrames <= 0) {
          throw new Error(`${cue.id} durationInFrames must be a positive integer.`);
        }
        if (!Number.isFinite(cue.volume) || cue.volume < 0 || cue.volume > 1) {
          throw new Error(`${cue.id} volume must be between 0 and 1.`);
        }
        return (
          <Audio
            key={cue.id}
            disallowFallbackToHtml5Audio
            durationInFrames={cue.durationInFrames}
            from={cue.from}
            onError={() => "fail"}
            src={staticFile(cue.src)}
            volume={() => cue.volume}
          />
        );
      })}
    </>
  );
};
