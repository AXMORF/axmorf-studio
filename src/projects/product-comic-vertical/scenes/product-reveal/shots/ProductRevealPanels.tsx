import type {ReactNode} from "react";
import {AbsoluteFill, interpolate} from "remotion";

type ProductRevealPanelsProps = Readonly<{
  shotFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  children: ReactNode;
}>;

const Character = ({
  kind,
  left,
  label,
}: Readonly<{
  kind: "producer" | "checker";
  left: number;
  label: string;
}>) => (
  <div
    data-character={kind}
    style={{
      position: "absolute",
      left,
      top: 1252,
      width: 232,
      height: 138,
      border: "6px solid #171717",
      borderRadius: kind === "producer" ? "72px 72px 24px 24px" : 24,
      backgroundColor: "#f7f1df",
      boxSizing: "border-box",
      color: "#171717",
      fontFamily: "system-ui",
      fontSize: 36,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow:
        kind === "producer" ? "-14px 14px 0 #f05b3d" : "14px 14px 0 #3b78cc",
    }}
  >
    {label}
  </div>
);

export const ProductRevealPanels = ({
  shotFrame,
  durationInFrames,
  width,
  height,
  children,
}: ProductRevealPanelsProps) => (
  <AbsoluteFill
    style={{
      width,
      height,
      overflow: "hidden",
      backgroundColor: "#f7f1df",
      color: "#171717",
      fontFamily: "system-ui",
    }}
  >
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      style={{position: "absolute", inset: 0}}
    >
      <defs>
        <pattern id="product-reveal-tone" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="2.2" fill="#c9c0aa" opacity="0.38" />
        </pattern>
      </defs>
      <path d="M0 0H1080V194H0Z" fill="#171717" />
      <path d="M0 194H1080V430H0Z" fill="url(#product-reveal-tone)" opacity="0.42" />
      <path d="M84 1188H996" stroke="#171717" strokeWidth="6" />
      <path
        d="M300 1320H780"
        stroke="#3b78cc"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray="18 12"
        strokeDashoffset={interpolate(shotFrame, [0, durationInFrames - 1], [80, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <path d="M0 1470H1080M0 1830H1080" stroke="#c9c0aa" strokeWidth="3" />
    </svg>

    <div
      style={{
        position: "absolute",
        left: 76,
        top: 52,
        color: "#f7f1df",
        fontSize: 38,
        fontWeight: 800,
        letterSpacing: 2,
      }}
    >
      FRAGMENTS → EVIDENCE-BOUND CHAIN
    </div>
    <div
      style={{
        position: "absolute",
        right: 76,
        top: 116,
        color: "#3b78cc",
        fontSize: 36,
        fontWeight: 900,
      }}
    >
      IDENTITY CONNECTED
    </div>

    {children}

    <Character kind="producer" left={94} label="PRODUCER" />
    <Character kind="checker" left={754} label="CHECKER" />
    <div
      style={{
        position: "absolute",
        left: 386,
        top: 1280,
        width: 308,
        color: "#171717",
        textAlign: "center",
        fontSize: 36,
        fontWeight: 900,
        lineHeight: 1.15,
      }}
    >
      创作权威
      <br />
      ↓
      <br />
      RUNTIME PROJECTION
    </div>
    <div
      style={{
        position: "absolute",
        left: 72,
        top: 1852,
        width: 936,
        color: "#171717",
        fontSize: 36,
        fontWeight: 700,
        textAlign: "center",
      }}
    >
      ONE STORY · ONE SEALED IDENTITY · STATIC RUNTIME
    </div>
  </AbsoluteFill>
);
