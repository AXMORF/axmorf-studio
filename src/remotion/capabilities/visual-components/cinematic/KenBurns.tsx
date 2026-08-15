import type { FC } from "react";
import {
  Easing,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type KenBurnsProps = {
  imageUrl?: string;
  scale?: number;
  translateX?: number;
  translateY?: number;
};

const KenBurns: FC<KenBurnsProps> = ({
  imageUrl,
  scale = 1.5,
  translateX = -50,
  translateY = -30,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(
    frame,
    [0, Math.max(durationInFrames - 1, 1)],
    [0, 1],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: "black",
        display: "flex",
        flex: 1,
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {imageUrl ? (
        <Img
          alt=""
          src={imageUrl}
          style={{
            height: "100%",
            objectFit: "cover",
            transform: `scale(${1 + (scale - 1) * progress}) translate(${translateX * progress}px, ${translateY * progress}px)`,
            width: "100%",
          }}
        />
      ) : (
        <div
          style={{
            background:
              "radial-gradient(circle at 68% 28%, rgba(250,204,21,0.72), transparent 24%), linear-gradient(135deg, #172554 0%, #0f766e 48%, #020617 100%)",
            height: "100%",
            transform: `scale(${1 + (scale - 1) * progress}) translate(${translateX * progress}px, ${translateY * progress}px)`,
            width: "100%",
          }}
        />
      )}
    </div>
  );
};

export default KenBurns;
