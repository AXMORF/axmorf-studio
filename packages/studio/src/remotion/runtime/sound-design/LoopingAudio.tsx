import { useEffect, useState } from "react";
import { Audio } from "@remotion/media";
import {
  cancelRender,
  continueRender,
  delayRender,
  useVideoConfig,
} from "remotion";

export const loopPlaybackRate = (
  durationInSeconds: number,
  fps: number,
  trimBefore = 0,
) => {
  const sourceFrames = durationInSeconds * fps - trimBefore;
  if (!Number.isFinite(sourceFrames) || sourceFrames <= 0) {
    throw new Error("Loop music has no playable source duration.");
  }
  // Non-integral loop boundaries lose a partial audio frame in Remotion 4.0.489.
  // Fit the complete source to the nearest frame instead of dropping samples.
  return sourceFrames / Math.max(1, Math.round(sourceFrames));
};

export const LoopingAudio = (props: {
  readonly src: string;
  readonly volume: (frame: number) => number;
  readonly sourceDurationInSeconds?: number;
  readonly trimBefore?: number;
  readonly loopVolumeCurveBehavior?: "repeat" | "extend";
}) => {
  const { sourceDurationInSeconds, ...audioProps } = props;
  const { fps } = useVideoConfig();
  const [duration, setDuration] = useState(sourceDurationInSeconds ?? null);
  const [handle] = useState(() =>
    sourceDurationInSeconds === undefined
      ? delayRender("Loading loop music duration")
      : null,
  );
  useEffect(() => {
    if (handle === null) return;
    const audio = document.createElement("audio");
    const loaded = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        cancelRender(new Error("Loop music duration is unavailable."));
        return;
      }
      setDuration(audio.duration);
      continueRender(handle);
    };
    const failed = () => cancelRender(new Error("Loop music could not load."));
    audio.addEventListener("loadedmetadata", loaded, { once: true });
    audio.addEventListener("error", failed, { once: true });
    audio.src = audioProps.src;
    return () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
      audio.removeAttribute("src");
      audio.load();
      continueRender(handle);
    };
  }, [handle, audioProps.src]);
  if (duration === null) return null;
  return (
    <Audio
      {...audioProps}
      loop
      playbackRate={loopPlaybackRate(duration, fps, audioProps.trimBefore)}
      onError={() => "fail"}
    />
  );
};
