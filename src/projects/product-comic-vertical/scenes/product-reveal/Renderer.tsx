import {ProductRevealPanels} from "./shots/ProductRevealPanels";
import {AdaptedShot} from "./shots/video-shotcraft/draw-svg-trace/AdaptedShot";

type ProductRevealRendererProps = Readonly<{
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
}: ProductRevealRendererProps) => {
  const shotFrame = sceneFrame;

  return (
    <ProductRevealPanels
      shotFrame={shotFrame}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
    >
      <AdaptedShot shotFrame={shotFrame} durationInFrames={durationInFrames} />
    </ProductRevealPanels>
  );
};

export default Renderer;
