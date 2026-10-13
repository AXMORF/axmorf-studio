import type { CSSProperties, FC } from "react";
import { useCurrentFrame } from "remotion";

import {
  interfaceFonts,
  interfaceThemes,
  resolveInterfaceFontSize,
  type InterfaceTheme,
} from "./interface-theme";

export type TerminalLine = {
  readonly kind: "command" | "output" | "success" | "error" | "comment";
  readonly text: string;
};

export type TerminalRevealOptions = {
  readonly startFrame?: number;
  readonly charsPerFrame?: number;
  readonly lineDelayFrames?: number;
};

export type TerminalLineReveal = {
  readonly line: TerminalLine;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly visibleText: string;
  readonly visible: boolean;
  readonly typing: boolean;
};

/** Commands type character by character; output lines appear whole after the previous line settles. */
export const resolveTerminalReveal = (
  lines: readonly TerminalLine[],
  frame: number,
  {
    startFrame = 0,
    charsPerFrame = 1.5,
    lineDelayFrames = 6,
  }: TerminalRevealOptions = {},
): readonly TerminalLineReveal[] => {
  if (!(charsPerFrame > 0) || !Number.isFinite(charsPerFrame)) {
    throw new Error("TerminalPanel charsPerFrame must be positive.");
  }
  if (!Number.isInteger(lineDelayFrames) || lineDelayFrames < 0) {
    throw new Error(
      "TerminalPanel lineDelayFrames must be a non-negative integer.",
    );
  }
  let cursor = startFrame;
  return lines.map((line, index) => {
    const lineStart = index === 0 ? cursor : cursor + lineDelayFrames;
    const characters = Array.from(line.text);
    const duration =
      line.kind === "command"
        ? Math.ceil(characters.length / charsPerFrame)
        : 0;
    cursor = lineStart + duration;
    const typed =
      line.kind === "command"
        ? Math.max(
            0,
            Math.min(
              characters.length,
              Math.floor((frame - lineStart) * charsPerFrame),
            ),
          )
        : characters.length;
    return {
      line,
      startFrame: lineStart,
      endFrame: cursor,
      visibleText: characters.slice(0, typed).join(""),
      visible: frame >= lineStart,
      typing: line.kind === "command" && frame >= lineStart && frame < cursor,
    };
  });
};

export type TerminalPanelProps = TerminalRevealOptions & {
  readonly lines: readonly TerminalLine[];
  readonly minFontSizePx: number;
  readonly fontSizePx?: number;
  readonly prompt?: string;
  readonly theme?: InterfaceTheme;
  readonly cursorBlinkFrames?: number;
  /** Defaults to the current Sequence frame; pass sceneFrame for grouped Scenes. */
  readonly frame?: number;
  readonly style?: CSSProperties;
};

/** Terminal session content; wrap it in InterfaceWindow for window chrome. */
export const TerminalPanel: FC<TerminalPanelProps> = ({
  lines,
  minFontSizePx,
  fontSizePx,
  prompt = "$",
  theme = interfaceThemes.dark,
  cursorBlinkFrames = 16,
  frame: frameOverride,
  style,
  ...reveal
}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  const fontSize = resolveInterfaceFontSize(minFontSizePx, fontSizePx);
  const reveals = resolveTerminalReveal(lines, frame, reveal);
  const visible = reveals.filter((entry) => entry.visible);
  const active = visible.at(-1);
  const cursorOn = Math.floor(frame / Math.max(1, cursorBlinkFrames)) % 2 === 0;
  const colors = {
    command: theme.text,
    output: theme.mutedText,
    success: theme.success,
    error: theme.danger,
    comment: theme.syntax.comment,
  } as const;
  return (
    <div
      style={{
        padding: fontSize * 0.9,
        fontFamily: interfaceFonts.mono,
        fontSize,
        lineHeight: 1.55,
        color: theme.text,
        backgroundColor: theme.canvas,
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      {visible.map((entry, index) => (
        <div
          key={index}
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize }}
        >
          {entry.line.kind === "command" ? (
            <span
              style={{ color: theme.success, fontWeight: 700, fontSize }}
            >{`${prompt} `}</span>
          ) : null}
          <span style={{ color: colors[entry.line.kind], fontSize }}>
            {entry.visibleText}
          </span>
          {entry === active && (entry.typing || cursorOn) ? (
            <span
              style={{
                display: "inline-block",
                width: fontSize * 0.55,
                height: fontSize * 1.1,
                marginLeft: 2,
                verticalAlign: "text-bottom",
                backgroundColor: theme.text,
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
};
