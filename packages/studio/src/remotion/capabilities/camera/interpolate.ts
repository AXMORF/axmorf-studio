import type {
  ProducerCamera2DKeyframe,
  ProducerCamera2DState,
  ProducerCamera3DKeyframe,
  ProducerCamera3DState,
  ProducerCameraEasing,
  ProducerFocusKeyframe,
  ProducerFocusState,
  ProducerLayerDepths,
  ProducerLayeredStageKeyframe,
  ProducerLayeredStageState,
  ProducerPoint2D,
  ProducerPoint3D,
  ProducerStagePlane,
} from "./types";

const supportedEasings = new Set<ProducerCameraEasing>(["linear", "ease-in-out", "ease-out"]);
const planePositions = {
  background: 0,
  subject: 0.5,
  foreground: 1,
} as const satisfies Record<ProducerStagePlane, number>;
const supportedPlanes = new Set<string>(["background", "subject", "foreground"]);

const assertFinite = (value: number, label: string) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
};

const assertRange = (value: number, minimum: number, maximum: number, label: string) => {
  assertFinite(value, label);
  if (value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
};

const assertPoint2D = (point: ProducerPoint2D, label: string) => {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new Error(`${label} must contain exactly two values.`);
  }
  assertFinite(point[0], `${label}[0]`);
  assertFinite(point[1], `${label}[1]`);
};

const assertPoint3D = (point: ProducerPoint3D, label: string) => {
  if (!Array.isArray(point) || point.length !== 3) {
    throw new Error(`${label} must contain exactly three values.`);
  }
  assertFinite(point[0], `${label}[0]`);
  assertFinite(point[1], `${label}[1]`);
  assertFinite(point[2], `${label}[2]`);
};

const assertTimeline = <T extends { readonly frame: number; readonly easing?: string }>(
  keyframes: readonly T[],
  label: string,
) => {
  if (keyframes.length === 0) {
    throw new Error(`${label} requires at least one keyframe.`);
  }

  let previousFrame = -1;
  for (const [index, keyframe] of keyframes.entries()) {
    if (
      !Number.isInteger(keyframe.frame) ||
      !Number.isFinite(keyframe.frame) ||
      keyframe.frame < 0
    ) {
      throw new Error(`${label}[${index}].frame must be a non-negative integer.`);
    }
    if (keyframe.frame <= previousFrame) {
      throw new Error(`${label} frames must be strictly increasing.`);
    }
    if (
      keyframe.easing !== undefined &&
      !supportedEasings.has(keyframe.easing as ProducerCameraEasing)
    ) {
      throw new Error(`${label}[${index}].easing is unsupported.`);
    }
    previousFrame = keyframe.frame;
  }
};

const applyEasing = (progress: number, easing: ProducerCameraEasing | undefined) => {
  if (easing === "ease-in-out") {
    return progress * progress * (3 - 2 * progress);
  }
  if (easing === "ease-out") {
    return 1 - (1 - progress) ** 3;
  }
  return progress;
};

const getSegment = <T extends { readonly frame: number; readonly easing?: ProducerCameraEasing }>(
  keyframes: readonly T[],
  frame: number,
) => {
  assertFinite(frame, "frame");
  if (frame <= keyframes[0].frame || keyframes.length === 1) {
    return { from: keyframes[0], to: keyframes[0], progress: 0 };
  }

  const last = keyframes[keyframes.length - 1];
  if (frame >= last.frame) {
    return { from: last, to: last, progress: 0 };
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index];
    const to = keyframes[index + 1];
    if (frame >= from.frame && frame < to.frame) {
      const linearProgress = (frame - from.frame) / (to.frame - from.frame);
      return {
        from,
        to,
        progress: applyEasing(linearProgress, from.easing),
      };
    }
  }

  return { from: last, to: last, progress: 0 };
};

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

const mixPoint2D = (
  from: ProducerPoint2D,
  to: ProducerPoint2D,
  progress: number,
): ProducerPoint2D => [mix(from[0], to[0], progress), mix(from[1], to[1], progress)];

const mixPoint3D = (
  from: ProducerPoint3D,
  to: ProducerPoint3D,
  progress: number,
): ProducerPoint3D => [
  mix(from[0], to[0], progress),
  mix(from[1], to[1], progress),
  mix(from[2], to[2], progress),
];

export const resolveProducerCamera2D = (
  keyframes: readonly ProducerCamera2DKeyframe[],
  frame: number,
): ProducerCamera2DState => {
  assertTimeline(keyframes, "ProducerCamera2D");
  for (const [index, keyframe] of keyframes.entries()) {
    assertRange(keyframe.x, -1, 1, `ProducerCamera2D[${index}].x`);
    assertRange(keyframe.y, -1, 1, `ProducerCamera2D[${index}].y`);
    assertFinite(keyframe.zoom, `ProducerCamera2D[${index}].zoom`);
    if (keyframe.zoom <= 0) {
      throw new Error(`ProducerCamera2D[${index}].zoom must be positive.`);
    }
    assertFinite(keyframe.rotation, `ProducerCamera2D[${index}].rotation`);
    assertPoint2D(keyframe.anchor, `ProducerCamera2D[${index}].anchor`);
    assertRange(keyframe.anchor[0], 0, 100, `ProducerCamera2D[${index}].anchor[0]`);
    assertRange(keyframe.anchor[1], 0, 100, `ProducerCamera2D[${index}].anchor[1]`);
  }

  const { from, to, progress } = getSegment(keyframes, frame);
  return {
    x: mix(from.x, to.x, progress),
    y: mix(from.y, to.y, progress),
    zoom: mix(from.zoom, to.zoom, progress),
    rotation: mix(from.rotation, to.rotation, progress),
    anchor: mixPoint2D(from.anchor, to.anchor, progress),
  };
};

export const resolveProducerLayeredStage = (
  keyframes: readonly ProducerLayeredStageKeyframe[],
  frame: number,
): ProducerLayeredStageState => {
  assertTimeline(keyframes, "ProducerLayeredStage");
  for (const [index, keyframe] of keyframes.entries()) {
    assertRange(keyframe.x, -1, 1, `ProducerLayeredStage[${index}].x`);
    assertRange(keyframe.y, -1, 1, `ProducerLayeredStage[${index}].y`);
  }

  const { from, to, progress } = getSegment(keyframes, frame);
  return {
    x: mix(from.x, to.x, progress),
    y: mix(from.y, to.y, progress),
  };
};

export const assertProducerLayerDepths = (depths: ProducerLayerDepths) => {
  for (const plane of ["background", "subject", "foreground"] as const) {
    assertRange(depths[plane], 0, 1, `ProducerLayeredStage depths.${plane}`);
  }
  if (!(depths.background <= depths.subject && depths.subject <= depths.foreground)) {
    throw new Error(
      "ProducerLayeredStage depths must be ordered background <= subject <= foreground.",
    );
  }
};

const assertPlane = (plane: ProducerStagePlane, label: string) => {
  if (!supportedPlanes.has(plane)) {
    throw new Error(`${label} plane is unsupported.`);
  }
};

export const getProducerStagePlanePosition = (plane: ProducerStagePlane) => {
  assertPlane(plane, "ProducerFocus");
  return planePositions[plane];
};

export const resolveProducerFocus = (
  keyframes: readonly ProducerFocusKeyframe[],
  frame: number,
): ProducerFocusState => {
  assertTimeline(keyframes, "ProducerFocusPull");
  for (const [index, keyframe] of keyframes.entries()) {
    assertPlane(keyframe.plane, `ProducerFocusPull[${index}]`);
  }

  const { from, to, progress } = getSegment(keyframes, frame);
  return {
    position: mix(planePositions[from.plane], planePositions[to.plane], progress),
  };
};

export const resolveProducerCamera3D = (
  keyframes: readonly ProducerCamera3DKeyframe[],
  frame: number,
): ProducerCamera3DState => {
  assertTimeline(keyframes, "ProducerCamera3D");
  for (const [index, keyframe] of keyframes.entries()) {
    assertPoint3D(keyframe.position, `ProducerCamera3D[${index}].position`);
    assertPoint3D(keyframe.target, `ProducerCamera3D[${index}].target`);
    assertFinite(keyframe.fov, `ProducerCamera3D[${index}].fov`);
    if (keyframe.fov <= 1 || keyframe.fov >= 179) {
      throw new Error(`ProducerCamera3D[${index}].fov must be greater than 1 and less than 179.`);
    }
    assertFinite(keyframe.roll, `ProducerCamera3D[${index}].roll`);
  }

  const { from, to, progress } = getSegment(keyframes, frame);
  return {
    position: mixPoint3D(from.position, to.position, progress),
    target: mixPoint3D(from.target, to.target, progress),
    fov: mix(from.fov, to.fov, progress),
    roll: mix(from.roll, to.roll, progress),
  };
};
