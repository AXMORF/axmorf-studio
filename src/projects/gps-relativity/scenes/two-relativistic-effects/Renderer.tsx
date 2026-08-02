import type { FC } from "react";

import { RelativisticEffectsShot } from "./shots/RelativisticEffectsShot";

type RelativisticEffectsRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  storyBeat: unknown;
  timingBeat: unknown;
  visualStyle: unknown;
  visualPlan: unknown;
  shots: Readonly<{
    shots: readonly Readonly<{
      shotId: string;
      primaryRange: Readonly<{ startFrame: number; endFrame: number }>;
    }>[];
  }>;
  syncAnchors: unknown;
  visualResources: readonly unknown[];
}>;

const RelativisticEffectsRenderer: FC<RelativisticEffectsRendererProps> = ({
  meaningId,
  sceneFrame,
  durationInFrames,
  width,
  height,
  shots,
}) => {
  if (meaningId !== "two-relativistic-effects" || durationInFrames !== 335) {
    throw new Error(
      "Relativistic effects renderer received stale Scene identity.",
    );
  }
  const shot = shots.shots[0];
  if (
    shot === undefined ||
    shot.shotId !== "relativistic-effects" ||
    shot.primaryRange.startFrame !== 0 ||
    shot.primaryRange.endFrame !== durationInFrames
  ) {
    throw new Error("Relativistic effects renderer received stale ShotPlan.");
  }
  const shotFrame = sceneFrame - shot.primaryRange.startFrame;
  if (shotFrame < 0 || shotFrame >= durationInFrames) {
    throw new Error("Relativistic effects shot frame escaped its fixed range.");
  }

  return (
    <RelativisticEffectsShot
      sceneFrame={sceneFrame}
      shotFrame={shotFrame}
      durationInFrames={durationInFrames}
      width={width}
      height={height}
    />
  );
};

export default RelativisticEffectsRenderer;
