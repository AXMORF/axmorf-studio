import { DrawSvgTraceShot } from "./shots/DrawSvgTraceShot";

type ProofRendererProps = Readonly<{
  sceneFrame: number;
  visualResources: readonly Readonly<{ src: string }>[];
}>;

const Renderer = ({ sceneFrame, visualResources }: ProofRendererProps) => {
  const shotFrame = sceneFrame;
  const shape = visualResources[0];
  if (shape === undefined) {
    throw new Error("Scene runtime proof shape resource is missing.");
  }
  return <DrawSvgTraceShot shapeSrc={shape.src} shotFrame={shotFrame} />;
};

export default Renderer;
