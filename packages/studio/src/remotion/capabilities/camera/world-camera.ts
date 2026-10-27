import {
  assertFinite,
  assertPoint2D,
  assertRange,
  assertTimeline,
  getSegment,
  mix,
  mixPoint2D,
} from "./interpolate";
import type { ProducerCameraEasing, ProducerPoint2D } from "./types";

export type ProducerWorldShot = {
  readonly frame: number;
  /** World pixel the camera looks at (centre of the frame). */
  readonly center: ProducerPoint2D;
  /** 1 shows world pixels 1:1; above 1 pushes in. */
  readonly zoom?: number;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerWorldCameraState = {
  readonly center: ProducerPoint2D;
  readonly zoom: number;
};

export type ProducerWorldPlaneTransform = {
  /** CSS translate applied before scale, in screen pixels. */
  readonly translate: ProducerPoint2D;
  readonly scale: number;
};

const MAX_ZOOM = 6;

/**
 * Camera state for a world larger than the frame. The subject plane never
 * shows past the world's edges: the centre is clamped to what the zoom allows.
 */
export const resolveProducerWorldCamera = ({
  shots,
  frame,
  width,
  height,
  worldWidth,
  worldHeight,
}: {
  readonly shots: readonly ProducerWorldShot[];
  readonly frame: number;
  readonly width: number;
  readonly height: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
}): ProducerWorldCameraState => {
  assertTimeline(shots, "ProducerWorldCamera");
  for (const [label, value] of [
    ["width", width],
    ["height", height],
    ["worldWidth", worldWidth],
    ["worldHeight", worldHeight],
  ] as const) {
    assertFinite(value, `ProducerWorldCamera ${label}`);
    if (value <= 0)
      throw new Error(`ProducerWorldCamera ${label} must be positive.`);
  }
  if (worldWidth < width || worldHeight < height) {
    throw new Error(
      "ProducerWorldCamera world must be at least as large as the frame; use ProducerShotStage for a single-screen stage.",
    );
  }
  for (const [index, shot] of shots.entries()) {
    assertPoint2D(shot.center, `ProducerWorldCamera[${index}].center`);
    assertRange(
      shot.zoom ?? 1,
      1,
      MAX_ZOOM,
      `ProducerWorldCamera[${index}].zoom`,
    );
  }
  const { from, to, progress } = getSegment(shots, frame);
  const zoom = mix(from.zoom ?? 1, to.zoom ?? 1, progress);
  const center = mixPoint2D(from.center, to.center, progress);
  const halfWidth = width / (2 * zoom);
  const halfHeight = height / (2 * zoom);
  return {
    center: [
      Math.min(worldWidth - halfWidth, Math.max(halfWidth, center[0])),
      Math.min(worldHeight - halfHeight, Math.max(halfHeight, center[1])),
    ],
    zoom,
  };
};

/**
 * Projects a world-space layer at `depth` onto the screen. Depth 1 is the
 * subject; below 1 moves less (far background), above 1 moves more (near
 * foreground). Layers travel relative to `anchor`, usually the first shot's
 * centre, so every layer lines up at the start.
 */
export const resolveProducerWorldPlane = ({
  state,
  depth,
  anchor,
  width,
  height,
}: {
  readonly state: ProducerWorldCameraState;
  readonly depth: number;
  readonly anchor: ProducerPoint2D;
  readonly width: number;
  readonly height: number;
}): ProducerWorldPlaneTransform => {
  assertRange(depth, 0, 2, "ProducerWorldCamera depth");
  const look: ProducerPoint2D = [
    anchor[0] + (state.center[0] - anchor[0]) * depth,
    anchor[1] + (state.center[1] - anchor[1]) * depth,
  ];
  // Far planes also zoom less, which reads as depth during push-ins.
  const scale = 1 + (state.zoom - 1) * depth;
  return {
    translate: [width / 2 - look[0] * scale, height / 2 - look[1] * scale],
    scale,
  };
};

/**
 * Point at `progress` (0–1, by length) along a polyline in world pixels, for
 * a camera that follows a process: a light ray, a packet, a path.
 */
export const resolveProducerPathPoint = (
  points: readonly ProducerPoint2D[],
  progress: number,
): ProducerPoint2D => {
  if (points.length < 2) throw new Error("A path needs at least two points.");
  points.forEach((point, index) => assertPoint2D(point, `path[${index}]`));
  assertFinite(progress, "path progress");
  const t = Math.min(1, Math.max(0, progress));
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]),
    );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return points[0]!;
  let remaining = t * total;
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length || index === lengths.length - 1) {
      const local = length === 0 ? 0 : Math.min(1, remaining / length);
      return mixPoint2D(points[index]!, points[index + 1]!, local);
    }
    remaining -= length;
  }
  return points.at(-1)!;
};
