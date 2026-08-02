import { PositionTimingShot } from "./shots/PositionTimingShot";

type PositionIsTimeRendererProps = Readonly<{
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const Renderer = ({
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
}: PositionIsTimeRendererProps) => {
  const shotFrame = sceneFrame;

  return (
    <PositionTimingShot
      shotFrame={shotFrame}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
    />
  );
};

export default Renderer;
