import type {FC} from "react";
import {Html5Audio, staticFile} from "remotion";

import {evaluateDuckEnvelope} from "./ducking";
import type {ResolvedGlobalSound} from "./resolve-global-sound";

export const GlobalSoundTrack: FC<{
  readonly resolved: ResolvedGlobalSound;
}> = ({resolved}) => (
  <>
    {resolved.plan.assets.map((asset) => {
      const busGain =
        asset.role === "global-bgm"
          ? resolved.plan.masteringPolicy.bgmGain
          : resolved.plan.masteringPolicy.ambienceGain;
      return (
        <Html5Audio
          key={asset.role}
          src={staticFile(asset.publicPath.slice("public/".length))}
          volume={(frame) =>
            busGain *
            evaluateDuckEnvelope({
              frame,
              ranges: resolved.spokenRanges,
              durationInFrames: resolved.plan.durationInFrames,
              attackFrames: resolved.plan.duckingPolicy.attackFrames,
              releaseFrames: resolved.plan.duckingPolicy.releaseFrames,
              spokenGain: resolved.plan.duckingPolicy.spokenGain,
              unspokenGain: resolved.plan.duckingPolicy.unspokenGain,
            })
          }
        />
      );
    })}
  </>
);
