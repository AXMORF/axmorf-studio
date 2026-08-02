import type { CSSProperties, FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import type { CaptionSafeArea, SemanticTiming } from "../../../contracts";

export type CaptionCue = SemanticTiming["captionCues"][number];

export type CaptionLayerProps = {
  readonly captionCues: SemanticTiming["captionCues"];
  readonly safeAreaPx: CaptionSafeArea;
};

export const findActiveCaptionCue = (
  captionCues: SemanticTiming["captionCues"],
  frame: number,
): CaptionCue | undefined =>
  captionCues.find((cue) => cue.startFrame <= frame && frame < cue.endFrame);

const fullFrameStyle: CSSProperties = {
  pointerEvents: "none",
};

const CAPTION_FONT_SIZE = 40;
const HORIZONTAL_SAFE_AREA_RATIO = 0.05;
const TOP_SAFE_AREA_RATIO = 0.05;
const BOTTOM_SAFE_AREA_RATIO = 0.08;

const resolveInsets = ({
  size,
  start,
  end,
  minimumStart,
  minimumEnd,
}: {
  readonly size: number;
  readonly start: number;
  readonly end: number;
  readonly minimumStart: number;
  readonly minimumEnd: number;
}) => {
  const responsiveStart = Math.max(start, minimumStart);
  const responsiveEnd = Math.max(end, minimumEnd);
  return responsiveStart + responsiveEnd < size
    ? { start: responsiveStart, end: responsiveEnd }
    : { start, end };
};

export const resolveCaptionLayout = ({
  width,
  height,
  safeAreaPx,
}: {
  readonly width: number;
  readonly height: number;
  readonly safeAreaPx: CaptionSafeArea;
}) => {
  const horizontal = resolveInsets({
    size: width,
    start: safeAreaPx.left,
    end: safeAreaPx.right,
    minimumStart: Math.round(width * HORIZONTAL_SAFE_AREA_RATIO),
    minimumEnd: Math.round(width * HORIZONTAL_SAFE_AREA_RATIO),
  });
  const vertical = resolveInsets({
    size: height,
    start: safeAreaPx.top,
    end: safeAreaPx.bottom,
    minimumStart: Math.round(height * TOP_SAFE_AREA_RATIO),
    minimumEnd: Math.round(height * BOTTOM_SAFE_AREA_RATIO),
  });
  const aspectRatio = width / height;
  const maximumWidthRatio =
    aspectRatio >= 1.6 ? 0.75 : aspectRatio >= 1 ? 0.82 : 0.88;
  const availableWidth = Math.max(1, width - horizontal.start - horizontal.end);

  return {
    safeAreaPx: {
      top: vertical.start,
      right: horizontal.end,
      bottom: vertical.end,
      left: horizontal.start,
    },
    maxCaptionWidth: Math.min(
      Math.round(width * maximumWidthRatio),
      availableWidth,
    ),
    fontSize: CAPTION_FONT_SIZE,
  } as const;
};

const safeAreaStyle = (safeAreaPx: CaptionSafeArea): CSSProperties => ({
  position: "absolute",
  top: safeAreaPx.top,
  right: safeAreaPx.right,
  bottom: safeAreaPx.bottom,
  left: safeAreaPx.left,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
});

const captionStyle = ({
  maxCaptionWidth,
  fontSize,
}: ReturnType<typeof resolveCaptionLayout>): CSSProperties => ({
  boxSizing: "border-box",
  maxWidth: maxCaptionWidth,
  padding: "18px 30px 20px",
  borderRadius: 16,
  backgroundColor: "rgba(15, 23, 42, 0.84)",
  color: "#f8fafc",
  fontFamily:
    'Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize,
  fontWeight: 650,
  lineHeight: 1.35,
  letterSpacing: "0.01em",
  textAlign: "center",
  textShadow: "0 2px 8px rgba(0, 0, 0, 0.55)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

export const CaptionLayer: FC<CaptionLayerProps> = ({
  captionCues,
  safeAreaPx,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const activeCue = findActiveCaptionCue(captionCues, frame);
  if (!activeCue) return null;
  const layout = resolveCaptionLayout({ width, height, safeAreaPx });

  return (
    <AbsoluteFill style={fullFrameStyle}>
      <div style={safeAreaStyle(layout.safeAreaPx)}>
        <div style={captionStyle(layout)}>{activeCue.text}</div>
      </div>
    </AbsoluteFill>
  );
};
