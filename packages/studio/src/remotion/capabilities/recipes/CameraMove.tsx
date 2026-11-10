import { useReviewMotion } from "../../film/review-motion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { useCurrentFrame } from "remotion";
import {
  ProducerWorldCamera,
  type ProducerWorldCameraProps,
} from "../camera/ProducerWorldCamera";
import {
  resolveProducerPathPoint,
  resolveProducerWorldCamera,
  type ProducerWorldShot,
} from "../camera/world-camera";
import type { ProducerPoint2D } from "../camera/types";
import {
  integer,
  mix,
  PRODUCER_RECIPE_CATALOG,
  recipeCues,
  resolveProducerRecipeTiming,
  type ProducerRecipeTiming,
  type ProducerRecipeFrameProps,
} from "./core";
export type CameraMoveOptions = ProducerRecipeTiming &
  Pick<
    ProducerWorldCameraProps,
    "width" | "height" | "worldWidth" | "worldHeight"
  > &
  Readonly<{
    preset:
      | "push-in"
      | "pull-out"
      | "pan-along-path"
      | "reveal-pan"
      | "parallax-drift";
    from?: ProducerPoint2D;
    to?: ProducerPoint2D;
    path?: readonly ProducerPoint2D[];
    zoom?: number;
  }>;
export const CAMERA_MOVE_DEFAULT_BLUR_SAMPLES = 4;
export const CAMERA_MOVE_MAX_BLUR_SAMPLES = 8;
export const resolveCameraMove = (
  frame: number,
  options: CameraMoveOptions,
) => {
  const timing = resolveProducerRecipeTiming(frame, options);
  if (
    ![
      "push-in",
      "pull-out",
      "pan-along-path",
      "reveal-pan",
      "parallax-drift",
    ].includes(options.preset)
  )
    throw new Error("Unknown camera preset.");
  const from = options.from ?? [
    options.worldWidth / 2,
    options.worldHeight / 2,
  ];
  const to = options.to ?? [
    from[0] + (options.preset === "parallax-drift" ? 120 : 600),
    from[1],
  ];
  const zoom = options.zoom ?? 1.5;
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 6)
    throw new Error("Camera zoom must be in [1,6].");
  // Validate authored endpoints even before they are reached; reuse world-camera's bounds.
  const checkShots: ProducerWorldShot[] = [
    { frame: 0, center: from, zoom: 1 },
    { frame: 1, center: to, zoom },
  ];
  resolveProducerWorldCamera({ ...options, frame: 0, shots: checkShots });
  // Cameras use the shared monotonic travel curve; object rebound does not shake the viewport.
  const p = timing.travel;
  let center: ProducerPoint2D = from;
  if (options.preset === "pan-along-path") {
    if (!options.path) throw new Error("pan-along-path needs a path.");
    center = resolveProducerPathPoint(options.path, p);
  } else if (
    options.preset === "reveal-pan" ||
    options.preset === "parallax-drift"
  )
    center = [mix(from[0], to[0], p), mix(from[1], to[1], p)];
  const currentZoom =
    options.preset === "push-in"
      ? mix(1, zoom, p)
      : options.preset === "pull-out"
        ? mix(zoom, 1, p)
        : 1;
  const shots: ProducerWorldShot[] = [{ frame: 0, center, zoom: currentZoom }];
  const state = resolveProducerWorldCamera({ ...options, frame: 0, shots });
  // The anchor remains the initial centre: parallax must not reset each frame.
  const initialCenter =
    options.preset === "pan-along-path"
      ? resolveProducerPathPoint(options.path!, 0)
      : from;
  const initialZoom = options.preset === "pull-out" ? zoom : 1;
  const initial = resolveProducerWorldCamera({
    ...options,
    frame: 0,
    shots: [{ frame: 0, center: initialCenter, zoom: initialZoom }],
  });
  const cameraShots: ProducerWorldShot[] = [
    { frame: 0, center: initial.center, zoom: initialZoom },
    { frame: 1, center: state.center, zoom: state.zoom },
  ];
  return {
    ...timing,
    state,
    shots: cameraShots,
    fast:
      timing.phase === "move" && timing.travel > 0.15 && timing.travel < 0.85,
    sfxCues: recipeCues(
      "CameraMove",
      timing,
      PRODUCER_RECIPE_CATALOG.CameraMove.sfxCues,
    ),
  };
};
export type CameraMoveProps = ProducerRecipeFrameProps &
  CameraMoveOptions &
  Pick<ProducerWorldCameraProps, "layers" | "overlay" | "style"> &
  Readonly<{ motionBlur?: boolean; blurSamples?: number }>;
const CameraSample = ({
  frameOffset,
  layers,
  overlay,
  style,
  ...options
}: Omit<CameraMoveProps, "motionBlur" | "blurSamples" | "frame"> & {
  frameOffset: number;
}) => {
  const state = resolveCameraMove(useCurrentFrame() + frameOffset, options);
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
export const CameraMove = ({
  frame: frameOverride,
  motionBlur = false,
  blurSamples = CAMERA_MOVE_DEFAULT_BLUR_SAMPLES,
  ...options
}: CameraMoveProps) => {
  const currentFrame = useCurrentFrame();
  const frameOffset = (frameOverride ?? currentFrame) - currentFrame;
  const state = resolveCameraMove(currentFrame + frameOffset, options);
  useReviewMotion({
    type: "recipe",
    id: "CameraMove",
    anticipate: state.anticipate,
    move: state.move,
    land: state.land,
    settle: state.settle,
    preset: options.preset,
  });
  integer(blurSamples, 2, CAMERA_MOVE_MAX_BLUR_SAMPLES, "blurSamples");
  // Each sample renders the entire subtree: ~samples× CPU/DOM cost. Only fast travel is sampled.
  // CameraSample reads the shifted frame inside the blur provider, never a frozen outer state.
  return motionBlur && state.fast ? (
    <CameraMotionBlur samples={blurSamples} shutterAngle={180}>
      <CameraSample {...options} frameOffset={frameOffset} />
    </CameraMotionBlur>
  ) : (
    <CameraSample {...options} frameOffset={frameOffset} />
  );
};
