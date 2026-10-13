import type { CSSProperties, FC, ReactNode } from "react";

import {
  interfaceFonts,
  interfaceShadow,
  interfaceThemes,
  resolveInterfaceFontSize,
  type InterfaceTheme,
} from "./interface-theme";

export type InterfaceWindowProps = {
  readonly width: number;
  readonly height: number;
  readonly minFontSizePx: number;
  readonly variant?: "browser" | "app";
  /** Tab or window title. */
  readonly title?: string;
  /** Browser address; use the real address of the subject, never an invented one. */
  readonly url?: string;
  readonly chromeFontSizePx?: number;
  readonly theme?: InterfaceTheme;
  readonly radiusPx?: number;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
};

const trafficLights = ["#ff5f57", "#febc2e", "#28c840"] as const;

const LockGlyph: FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size * 0.7} height={size * 0.8} viewBox="0 0 14 16" aria-hidden>
    <rect x={1} y={7} width={12} height={8} rx={2} fill={color} />
    <path
      d="M4 7V5a3 3 0 0 1 6 0v2"
      fill="none"
      stroke={color}
      strokeWidth={2}
    />
  </svg>
);

/** Realistic desktop browser or app window; place authored UI content as children. */
export const InterfaceWindow: FC<InterfaceWindowProps> = ({
  width,
  height,
  minFontSizePx,
  variant = "browser",
  title,
  url,
  chromeFontSizePx,
  theme = interfaceThemes.dark,
  radiusPx = 18,
  children,
  style,
}) => {
  const fontSize = resolveInterfaceFontSize(minFontSizePx, chromeFontSizePx);
  const barHeight = Math.round(fontSize * 2.4);
  const dot = Math.round(fontSize * 0.55);
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: radiusPx,
        overflow: "hidden",
        backgroundColor: theme.canvas,
        border: `1px solid ${theme.border}`,
        boxShadow: interfaceShadow,
        fontFamily: interfaceFonts.ui,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: fontSize * 0.6,
          height: barHeight,
          padding: `0 ${fontSize * 0.8}px`,
          backgroundColor: theme.chrome,
          borderBottom: `1px solid ${theme.border}`,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: dot * 0.7, flexShrink: 0 }}>
          {trafficLights.map((color) => (
            <div
              key={color}
              style={{
                width: dot,
                height: dot,
                borderRadius: dot,
                backgroundColor: color,
              }}
            />
          ))}
        </div>
        {variant === "browser" && url !== undefined ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: fontSize * 0.4,
              flex: 1,
              minWidth: 0,
              height: barHeight * 0.66,
              padding: `0 ${fontSize * 0.7}px`,
              borderRadius: barHeight,
              backgroundColor: theme.surface,
              border: `1px solid ${theme.border}`,
              boxSizing: "border-box",
            }}
          >
            <LockGlyph size={fontSize} color={theme.mutedText} />
            <span
              style={{
                fontSize,
                color: theme.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {url}
            </span>
          </div>
        ) : (
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize,
              fontWeight: 600,
              color: theme.mutedText,
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title ?? ""}
          </span>
        )}
      </div>
      <div
        style={{
          position: "relative",
          height: height - barHeight,
          overflow: "hidden",
          backgroundColor: theme.canvas,
        }}
      >
        {children}
      </div>
    </div>
  );
};
