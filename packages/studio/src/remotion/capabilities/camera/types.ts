export type ProducerCameraEasing = "linear" | "ease-in-out" | "ease-out";

export type ProducerStagePlane = "background" | "subject" | "foreground";

export type ProducerPoint2D = readonly [number, number];

export type ProducerPoint3D = readonly [number, number, number];

export type ProducerCamera2DKeyframe = {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly rotation: number;
  readonly anchor: ProducerPoint2D;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerCamera2DState = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly rotation: number;
  readonly anchor: ProducerPoint2D;
};

export type ProducerLayeredStageKeyframe = {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerLayeredStageState = {
  readonly x: number;
  readonly y: number;
};

export type ProducerLayerDepths = {
  readonly background: number;
  readonly subject: number;
  readonly foreground: number;
};

export type ProducerFocusKeyframe = {
  readonly frame: number;
  readonly plane: ProducerStagePlane;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerFocusState = {
  readonly position: number;
};

export type ProducerCamera3DKeyframe = {
  readonly frame: number;
  readonly position: ProducerPoint3D;
  readonly target: ProducerPoint3D;
  readonly fov: number;
  readonly roll: number;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerCamera3DState = {
  readonly position: ProducerPoint3D;
  readonly target: ProducerPoint3D;
  readonly fov: number;
  readonly roll: number;
};

/** Arrival state of one full-bleed shot; focus is the normalized world point centered in the viewport. */
export type ProducerShotKeyframe = {
  readonly frame: number;
  readonly focus: ProducerPoint2D;
  readonly zoom: number;
  readonly rotation?: number;
  readonly easing?: ProducerCameraEasing;
};

export type ProducerShotState = {
  readonly focus: ProducerPoint2D;
  readonly zoom: number;
  readonly rotation: number;
};

export type ProducerShotDrift = {
  readonly amplitudePx: number;
  readonly periodFrames: number;
};

export type ProducerShotPlaneTransform = {
  readonly scale: number;
  readonly focus: ProducerPoint2D;
  readonly offset: ProducerPoint2D;
  readonly rotation: number;
};
