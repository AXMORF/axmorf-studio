export const ramp = (frame: number, start: number, end: number) => {
  const t = Math.max(0, Math.min(1, (frame - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

// Persistent document identity, continuous transforms, and narration-bound actions.
// No discrete layout phase switch is used by the animation.
export const motionState = (frame: number) => ({
  question: ramp(frame, 0, 27),
  paper: ramp(frame, 18, 62),
  answer: ramp(frame, 111, 176),
  check: ramp(frame, 218, 283),
  scan: ramp(frame, 267, 311),
  missing: ramp(frame, 310, 328),
  connection: ramp(frame, 170, 213),
  broken: ramp(frame, 334, 401),
  learning: ramp(frame, 461, 524),
  context: ramp(frame, 610, 648),
  tokens: [ramp(frame, 645, 672), ramp(frame, 674, 699), ramp(frame, 700, 727)],
});
