import {CapabilityCascade} from "./shots/CapabilityCascade";

type CoreCapabilitiesRendererProps = Readonly<{
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
}: CoreCapabilitiesRendererProps) => (
  <CapabilityCascade
    shotFrame={sceneFrame}
    durationInFrames={durationInFrames}
    fps={fps}
    width={width}
    height={height}
  />
);

export default Renderer;
