import { useCurrentFrame } from "remotion";
import {
  ProducerWorldCamera,
  type ProducerWorldCameraProps,
} from "../camera/ProducerWorldCamera";
import { resolveProducerWorldPlane } from "../camera/world-camera";
import { resolveCameraMove, type CameraMoveOptions } from "./CameraMove";
import {
  PRODUCER_RECIPE_CATALOG,
  recipeCues,
  type ProducerRecipeFrameProps,
} from "./core";
export type ParallaxLayersOptions = Omit<CameraMoveOptions, "preset"> &
  Readonly<{ depths?: readonly number[] }>;
export const resolveParallaxLayers = (
  frame: number,
  { depths = [0.15, 0.5, 1, 1.5], ...options }: ParallaxLayersOptions,
) => {
  if (depths.length < 1 || depths.length > 16)
    throw new Error("ParallaxLayers needs 1–16 depths.");
  const camera = resolveCameraMove(frame, {
    ...options,
    preset: "parallax-drift",
  });
  const planes = depths.map((depth) =>
    resolveProducerWorldPlane({
      state: camera.state,
      depth,
      anchor: camera.shots[0].center,
      width: options.width,
      height: options.height,
    }),
  );
  return {
    ...camera,
    planes,
    sfxCues: recipeCues(
      "ParallaxLayers",
      camera,
      PRODUCER_RECIPE_CATALOG.ParallaxLayers.sfxCues,
    ),
  };
};
export type ParallaxLayersProps = ProducerRecipeFrameProps &
  Omit<ParallaxLayersOptions, "depths"> &
  Pick<ProducerWorldCameraProps, "layers" | "overlay" | "style">;
/** LayeredStage/ShotStage have three fixed slots. WorldCamera already projects
 * arbitrary depth planes, so reuse it for back/middle/subject/front without a second transform engine. */
export const ParallaxLayers = ({
  frame: frameOverride,
  layers,
  overlay,
  style,
  ...options
}: ParallaxLayersProps) => {
  const currentFrame = useCurrentFrame();
  const state = resolveParallaxLayers(frameOverride ?? currentFrame, {
    ...options,
    depths: layers.map((l) => l.depth),
  });
  return (
    <ProducerWorldCamera
      {...options}
      shots={state.shots}
      frame={1}
      layers={layers}
      overlay={overlay}
      style={style}
    />
  );
};
