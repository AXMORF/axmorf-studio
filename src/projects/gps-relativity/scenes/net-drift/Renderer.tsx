import NetDriftShot from "./shots/NetDriftShot";

type NetDriftRendererProps = Readonly<{
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const NetDriftRenderer = ({
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
}: NetDriftRendererProps) => {
  if (sceneFrame < 0 || sceneFrame >= durationInFrames) {
    throw new Error("net-drift sceneFrame escaped its fixed StoryBeat window.");
  }

  return (
    <NetDriftShot
      sceneFrame={sceneFrame}
      shotFrame={sceneFrame}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
    />
  );
};

export default NetDriftRenderer;
