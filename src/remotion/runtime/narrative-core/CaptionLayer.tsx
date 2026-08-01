import type { CSSProperties, FC } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

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
  captionCues.find(
    (cue) => cue.startFrame <= frame && frame < cue.endFrame,
  );

const fullFrameStyle: CSSProperties = {
  pointerEvents: "none",
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

const captionStyle: CSSProperties = {
  maxWidth: 1440,
  padding: "18px 30px 20px",
  borderRadius: 16,
  backgroundColor: "rgba(15, 23, 42, 0.84)",
  color: "#f8fafc",
  fontFamily:
    'Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 48,
  fontWeight: 650,
  lineHeight: 1.35,
  letterSpacing: "0.01em",
  textAlign: "center",
  textShadow: "0 2px 8px rgba(0, 0, 0, 0.55)",
  whiteSpace: "pre-wrap",
};

export const CaptionLayer: FC<CaptionLayerProps> = ({
  captionCues,
  safeAreaPx,
}) => {
  const frame = useCurrentFrame();
  const activeCue = findActiveCaptionCue(captionCues, frame);
  if (!activeCue) return null;

  return (
    <AbsoluteFill style={fullFrameStyle}>
      <div style={safeAreaStyle(safeAreaPx)}>
        <div style={captionStyle}>{activeCue.text}</div>
      </div>
    </AbsoluteFill>
  );
};
