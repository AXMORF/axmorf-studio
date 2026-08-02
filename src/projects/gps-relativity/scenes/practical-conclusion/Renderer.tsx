import { PracticalConclusionShot } from "./shots/PracticalConclusionShot";

type PracticalConclusionRendererProps = Readonly<{
  [key: string]: unknown;
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}>;

const Renderer = ({
  sceneFrame,
  durationInFrames,
  width,
  height,
}: PracticalConclusionRendererProps) => {
  const shotFrame = sceneFrame;

  return (
    <PracticalConclusionShot
      shotFrame={shotFrame}
      durationInFrames={durationInFrames}
      width={width}
      height={height}
    />
  );
};

export default Renderer;
