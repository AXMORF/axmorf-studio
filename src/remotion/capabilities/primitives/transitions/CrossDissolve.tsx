import type { FC, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type CrossDissolveProps = {
  durationInFrames?: number;
  from?: ReactNode;
  to?: ReactNode;
};

const defaultSceneA = (
  <>
    <div
      style={{
        background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
        borderRadius: "50%",
        height: 80,
        marginBottom: 16,
        width: 80,
      }}
    />
    <h2 style={{ color: "white", fontSize: 40, fontWeight: 700, margin: 0 }}>Scene A</h2>
    <p style={{ color: "#93c5fd", fontSize: 18, marginTop: 8 }}>Dissolving away...</p>
  </>
);

const defaultSceneB = (
  <>
    <div
      style={{
        background: "linear-gradient(135deg, #a855f7, #7c3aed)",
        borderRadius: 8,
        height: 80,
        marginBottom: 16,
        width: 80,
      }}
    />
    <h2 style={{ color: "white", fontSize: 40, fontWeight: 700, margin: 0 }}>Scene B</h2>
    <p style={{ color: "#c084fc", fontSize: 18, marginTop: 8 }}>Appearing...</p>
  </>
);

export const CrossDissolve: FC<CrossDissolveProps> = ({
  durationInFrames,
  from = defaultSceneA,
  to = defaultSceneB,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = durationInFrames ?? fps * 2.5;
  const progress = Math.min(frame / totalFrames, 1);

  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: "#111827",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          inset: 0,
          justifyContent: "center",
          opacity: 1 - progress,
          position: "absolute",
        }}
      >
        {from}
      </div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          inset: 0,
          justifyContent: "center",
          opacity: progress,
          position: "absolute",
        }}
      >
        {to}
      </div>
    </div>
  );
};
