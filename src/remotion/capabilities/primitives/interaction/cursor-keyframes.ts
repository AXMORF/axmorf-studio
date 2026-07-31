export type CursorKeyframe = {
  frame: number;
  x: number;
  y: number;
};

export type CursorKeyframeTrack = {
  durationInFrames: number;
  fps: number;
  keyframes: CursorKeyframe[];
  version: 1;
};

export type CursorPoint = {
  x: number;
  y: number;
};

export const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export const normalizeCursorKeyframes = (keyframes: CursorKeyframe[]): CursorKeyframe[] => {
  const keyedByFrame = new Map<number, CursorKeyframe>();

  for (const keyframe of keyframes) {
    const frame = Math.max(0, Math.round(keyframe.frame));
    keyedByFrame.set(frame, {
      frame,
      x: clamp01(keyframe.x),
      y: clamp01(keyframe.y),
    });
  }

  return Array.from(keyedByFrame.values()).sort((a, b) => a.frame - b.frame);
};

export const getCursorPointAtFrame = (
  keyframes: CursorKeyframe[],
  frame: number,
): CursorPoint | null => {
  const normalized = normalizeCursorKeyframes(keyframes);

  if (normalized.length === 0) {
    return null;
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];

  if (frame <= first.frame) {
    return { x: first.x, y: first.y };
  }

  if (frame >= last.frame) {
    return { x: last.x, y: last.y };
  }

  for (let index = 1; index < normalized.length; index += 1) {
    const next = normalized[index];
    const previous = normalized[index - 1];

    if (frame <= next.frame) {
      const progress = (frame - previous.frame) / Math.max(1, next.frame - previous.frame);

      return {
        x: previous.x + (next.x - previous.x) * progress,
        y: previous.y + (next.y - previous.y) * progress,
      };
    }
  }

  return null;
};

export const getCursorPixelPointAtFrame = ({
  frame,
  height,
  keyframes,
  width,
}: {
  frame: number;
  height: number;
  keyframes: CursorKeyframe[];
  width: number;
}): CursorPoint | null => {
  const point = getCursorPointAtFrame(keyframes, frame);

  if (!point) {
    return null;
  }

  return {
    x: point.x * width,
    y: (1 - point.y) * height,
  };
};
