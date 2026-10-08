import type { ProducerCameraEasing, ProducerPoint2D } from "../camera/types";

export type ProducerWorldCamera2D = {
  readonly position: ProducerPoint2D;
  readonly zoom: number;
  readonly rotation: number;
};

export type ProducerWorldCamera2DKeyframe = ProducerWorldCamera2D & {
  readonly frame: number;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerWorldViewport = {
  readonly width: number;
  readonly height: number;
};

export type ProducerPoint2DKeyframe = {
  readonly frame: number;
  readonly position: ProducerPoint2D;
};

export type ProducerMotionWindow = {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerSemanticTimeAnchor = {
  readonly id: string;
  readonly sourceFrame: number;
  readonly targetFrame: number;
};

export type ProducerSemanticTimeDirection =
  | "source-to-target"
  | "target-to-source";

export type ProducerSemanticEvent = {
  readonly id: string;
  readonly frame: number;
};

const assertFinite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
};

const assertNonNegative = (value: number, label: string) => {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative.`);
};

const assertPositive = (value: number, label: string) => {
  assertFinite(value, label);
  if (value <= 0) throw new Error(`${label} must be positive.`);
};

const assertPoint = (point: ProducerPoint2D, label: string) => {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new Error(`${label} must contain exactly two values.`);
  }
  assertFinite(point[0], `${label}[0]`);
  assertFinite(point[1], `${label}[1]`);
};

const assertEasing = (easing: ProducerCameraEasing | undefined) => {
  if (
    easing !== undefined &&
    !["linear", "ease-in-out", "ease-out"].includes(easing)
  ) {
    throw new Error(`Unsupported Producer motion easing: ${String(easing)}.`);
  }
};

const ease = (progress: number, easing: ProducerCameraEasing | undefined) => {
  if (easing === "ease-in-out") return progress * progress * (3 - 2 * progress);
  if (easing === "ease-out") return 1 - (1 - progress) ** 3;
  return progress;
};

const mix = (from: number, to: number, progress: number) => {
  if (progress === 0) return from;
  if (progress === 1) return to;
  if (from < 0 === to < 0) return from + (to - from) * progress;
  return from * (1 - progress) + to * progress;
};

const mixPoint = (
  from: ProducerPoint2D,
  to: ProducerPoint2D,
  progress: number,
): ProducerPoint2D => [
  mix(from[0], to[0], progress),
  mix(from[1], to[1], progress),
];

const checkedPoint = (x: number, y: number): ProducerPoint2D => {
  const point = [x, y] as const;
  assertPoint(point, "Producer motion result");
  return point;
};

const assertCamera = (camera: ProducerWorldCamera2D) => {
  assertPoint(camera.position, "Producer world camera position");
  assertPositive(camera.zoom, "Producer world camera zoom");
  assertFinite(camera.rotation, "Producer world camera rotation");
};

const assertViewport = (viewport: ProducerWorldViewport) => {
  assertPositive(viewport.width, "Producer world viewport width");
  assertPositive(viewport.height, "Producer world viewport height");
};

const assertTimeline = <T extends { readonly frame: number }>(
  keyframes: readonly T[],
) => {
  if (keyframes.length === 0)
    throw new Error("Producer motion requires at least one keyframe.");
  let previous = -1;
  for (const [index, keyframe] of keyframes.entries()) {
    assertNonNegative(
      keyframe.frame,
      `Producer motion keyframes[${index}].frame`,
    );
    if (keyframe.frame <= previous) {
      throw new Error(
        "Producer motion keyframes must have strictly increasing frames.",
      );
    }
    previous = keyframe.frame;
  }
};

/** Camera position is the world point at viewport center; rotation is clockwise in degrees. */
export const projectProducerWorldPoint2D = (
  point: ProducerPoint2D,
  camera: ProducerWorldCamera2D,
  viewport: ProducerWorldViewport,
): ProducerPoint2D => {
  assertPoint(point, "Producer world point");
  assertCamera(camera);
  assertViewport(viewport);
  const angle = ((camera.rotation % 360) * Math.PI) / 180;
  const x = point[0] - camera.position[0];
  const y = point[1] - camera.position[1];
  return checkedPoint(
    viewport.width / 2 +
      camera.zoom * (Math.cos(angle) * x + Math.sin(angle) * y),
    viewport.height / 2 +
      camera.zoom * (-Math.sin(angle) * x + Math.cos(angle) * y),
  );
};

export const unprojectProducerWorldPoint2D = (
  point: ProducerPoint2D,
  camera: ProducerWorldCamera2D,
  viewport: ProducerWorldViewport,
): ProducerPoint2D => {
  assertPoint(point, "Producer screen point");
  assertCamera(camera);
  assertViewport(viewport);
  const angle = ((camera.rotation % 360) * Math.PI) / 180;
  const x = (point[0] - viewport.width / 2) / camera.zoom;
  const y = (point[1] - viewport.height / 2) / camera.zoom;
  return checkedPoint(
    camera.position[0] + Math.cos(angle) * x - Math.sin(angle) * y,
    camera.position[1] + Math.sin(angle) * x + Math.cos(angle) * y,
  );
};

export const resolveProducerWorldCamera2D = (
  keyframes: readonly ProducerWorldCamera2DKeyframe[],
  frame: number,
): ProducerWorldCamera2D => {
  assertFinite(frame, "frame");
  assertTimeline(keyframes);
  for (const keyframe of keyframes) {
    assertCamera(keyframe);
    assertEasing(keyframe.easing);
  }
  let from = keyframes[0];
  let to = from;
  let progress = 0;
  if (frame > from.frame) {
    const nextIndex = keyframes.findIndex(
      (keyframe) => keyframe.frame >= frame,
    );
    if (nextIndex === -1) {
      from = keyframes[keyframes.length - 1];
      to = from;
    } else {
      from = keyframes[nextIndex - 1];
      to = keyframes[nextIndex];
      progress = ease(
        (frame - from.frame) / (to.frame - from.frame),
        from.easing,
      );
    }
  }
  return {
    position: mixPoint(from.position, to.position, progress),
    zoom: mix(from.zoom, to.zoom, progress),
    rotation: mix(from.rotation, to.rotation, progress),
  };
};

/** Critically damped step response with zero initial velocity; the time constant is in frames. */
export const resolveProducerSettle = ({
  from,
  to,
  frame,
  startFrame,
  timeConstantFrames,
}: {
  readonly from: number;
  readonly to: number;
  readonly frame: number;
  readonly startFrame: number;
  readonly timeConstantFrames: number;
}) => {
  assertFinite(from, "Producer settle from");
  assertFinite(to, "Producer settle to");
  assertFinite(frame, "frame");
  assertNonNegative(startFrame, "Producer settle startFrame");
  assertPositive(timeConstantFrames, "Producer settle timeConstantFrames");
  if (frame <= startFrame) return from;
  const time = (frame - startFrame) / timeConstantFrames;
  const progress =
    time > 50 ? 1 : -(Math.expm1(-time) + time * Math.exp(-time));
  return mix(from, to, Math.min(1, Math.max(0, progress)));
};

const followSegment = (
  current: ProducerPoint2D,
  from: ProducerPoint2D,
  to: ProducerPoint2D,
  elapsed: number,
  duration: number,
  timeConstantFrames: number,
): ProducerPoint2D => {
  const time = elapsed / timeConstantFrames;
  const gain = -Math.expm1(-time);
  if (gain === 0) return current;
  // This closed form solves a first-order follower of a linear target, including fractional frames.
  const rampResponse =
    time < 1e-4
      ? time * (0.5 - time / 6 + time ** 2 / 24 - time ** 3 / 120)
      : 1 - gain / time;
  const rampWeight = (elapsed / duration) * rampResponse;
  return mixPoint(current, mixPoint(from, to, rampWeight / gain), gain);
};

/** The target holds outside its keyframes; each sample recomputes the analytic trajectory. */
export const resolveProducerFollow2D = (
  keyframes: readonly ProducerPoint2DKeyframe[],
  frame: number,
  options: {
    readonly timeConstantFrames: number;
    readonly offset?: ProducerPoint2D;
  },
): ProducerPoint2D => {
  assertFinite(frame, "frame");
  assertTimeline(keyframes);
  for (const keyframe of keyframes)
    assertPoint(keyframe.position, "Producer follow position");
  assertPositive(
    options.timeConstantFrames,
    "Producer follow timeConstantFrames",
  );
  const offset = options.offset ?? [0, 0];
  assertPoint(offset, "Producer follow offset");
  let position = keyframes[0].position;
  for (
    let index = 1;
    index < keyframes.length && frame > keyframes[index - 1].frame;
    index += 1
  ) {
    const from = keyframes[index - 1];
    const to = keyframes[index];
    position = followSegment(
      position,
      from.position,
      to.position,
      Math.min(frame, to.frame) - from.frame,
      to.frame - from.frame,
      options.timeConstantFrames,
    );
  }
  const last = keyframes[keyframes.length - 1];
  if (frame > last.frame) {
    const gain = -Math.expm1(
      -(frame - last.frame) / options.timeConstantFrames,
    );
    position = mixPoint(position, last.position, gain);
  }
  return checkedPoint(position[0] + offset[0], position[1] + offset[1]);
};

const assertWindow = (window: ProducerMotionWindow) => {
  assertNonNegative(window.startFrame, "Producer motion startFrame");
  assertFinite(window.endFrame, "Producer motion endFrame");
  if (window.endFrame <= window.startFrame) {
    throw new Error(
      "Producer motion endFrame must be greater than startFrame.",
    );
  }
  assertEasing(window.easing);
};

const assertPoints = (points: readonly ProducerPoint2D[], label: string) => {
  if (points.length === 0)
    throw new Error(`${label} requires at least one point.`);
  for (const [index, point] of points.entries())
    assertPoint(point, `${label}[${index}]`);
};

const windowProgress = (frame: number, window: ProducerMotionWindow) =>
  ease(
    Math.min(
      1,
      Math.max(
        0,
        (frame - window.startFrame) / (window.endFrame - window.startFrame),
      ),
    ),
    window.easing,
  );

/** Indices define point correspondence; callers own shape topology and the resulting visual. */
export const resolveProducerPointMorph2D = (
  from: readonly ProducerPoint2D[],
  to: readonly ProducerPoint2D[],
  frame: number,
  window: ProducerMotionWindow,
): readonly ProducerPoint2D[] => {
  assertFinite(frame, "frame");
  assertWindow(window);
  assertPoints(from, "Producer point morph from");
  assertPoints(to, "Producer point morph to");
  if (from.length !== to.length)
    throw new Error("Producer point morph requires equal point counts.");
  const progress = windowProgress(frame, window);
  return from.map((point, index) => mixPoint(point, to[index], progress));
};

/** Stagger consumes the shared window; the final point completes exactly at endFrame. */
export const resolveProducerGather2D = (
  points: readonly ProducerPoint2D[],
  target: ProducerPoint2D,
  frame: number,
  window: ProducerMotionWindow & { readonly staggerInFrames?: number },
): readonly ProducerPoint2D[] => {
  assertFinite(frame, "frame");
  assertWindow(window);
  assertPoints(points, "Producer gather points");
  assertPoint(target, "Producer gather target");
  const stagger = window.staggerInFrames ?? 0;
  assertNonNegative(stagger, "Producer gather staggerInFrames");
  const duration =
    window.endFrame - window.startFrame - stagger * (points.length - 1);
  assertPositive(duration, "Producer gather per-point duration");
  if (frame >= window.endFrame) return points.map(() => [target[0], target[1]]);
  return points.map((point, index) => {
    const startFrame = window.startFrame + stagger * index;
    return mixPoint(
      point,
      target,
      windowProgress(frame, {
        ...window,
        startFrame,
        endFrame: startFrame + duration,
      }),
    );
  });
};

const assertUniqueId = (id: string, ids: Set<string>, label: string) => {
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.trim() !== id ||
    ids.has(id)
  ) {
    throw new Error(
      `${label} requires non-empty, unique IDs without surrounding whitespace.`,
    );
  }
  ids.add(id);
};

const assertAnchors = (anchors: readonly ProducerSemanticTimeAnchor[]) => {
  if (anchors.length < 2)
    throw new Error("Producer semantic time requires at least two anchors.");
  const ids = new Set<string>();
  let sourceFrame = -1;
  let targetFrame = -1;
  for (const anchor of anchors) {
    assertUniqueId(anchor.id, ids, "Producer semantic anchors");
    assertNonNegative(anchor.sourceFrame, "Producer semantic sourceFrame");
    assertNonNegative(anchor.targetFrame, "Producer semantic targetFrame");
    if (
      anchor.sourceFrame <= sourceFrame ||
      anchor.targetFrame <= targetFrame
    ) {
      throw new Error(
        "Producer semantic source and target frames must both be strictly increasing.",
      );
    }
    sourceFrame = anchor.sourceFrame;
    targetFrame = anchor.targetFrame;
  }
};

const assertDirection = (direction: ProducerSemanticTimeDirection) => {
  if (direction !== "source-to-target" && direction !== "target-to-source") {
    throw new Error(
      `Unsupported Producer semantic time direction: ${String(direction)}.`,
    );
  }
};

const mapFrame = (
  anchors: readonly ProducerSemanticTimeAnchor[],
  frame: number,
  direction: ProducerSemanticTimeDirection,
) => {
  assertFinite(frame, "Producer semantic frame");
  assertDirection(direction);
  const input =
    direction === "source-to-target" ? "sourceFrame" : "targetFrame";
  const output =
    direction === "source-to-target" ? "targetFrame" : "sourceFrame";
  if (frame < anchors[0][input] || frame > anchors[anchors.length - 1][input]) {
    throw new Error(
      `Producer semantic frame is outside the ${input} anchor range.`,
    );
  }
  for (let index = 0; index < anchors.length; index += 1) {
    const to = anchors[index];
    if (frame === to[input]) return to[output];
    if (frame < to[input]) {
      const from = anchors[index - 1];
      return mix(
        from[output],
        to[output],
        (frame - from[input]) / (to[input] - from[input]),
      );
    }
  }
  throw new Error("Producer semantic frame has no anchor segment.");
};

/** Piecewise-linear retiming is strictly monotonic, invertible and never rounds frame values. */
export const mapProducerSemanticFrame = (
  anchors: readonly ProducerSemanticTimeAnchor[],
  frame: number,
  direction: ProducerSemanticTimeDirection = "source-to-target",
) => {
  assertAnchors(anchors);
  return mapFrame(anchors, frame, direction);
};

export const retimeProducerSemanticEvents = <T extends ProducerSemanticEvent>(
  anchors: readonly ProducerSemanticTimeAnchor[],
  events: readonly T[],
  direction: ProducerSemanticTimeDirection = "source-to-target",
): readonly (Omit<T, "frame"> & { readonly frame: number })[] => {
  assertAnchors(anchors);
  assertDirection(direction);
  const ids = new Set<string>();
  return events.map((event) => {
    assertUniqueId(event.id, ids, "Producer semantic events");
    return { ...event, frame: mapFrame(anchors, event.frame, direction) };
  });
};
