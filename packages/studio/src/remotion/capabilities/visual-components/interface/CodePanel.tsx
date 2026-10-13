import type { CSSProperties, FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import {
  interfaceFonts,
  interfaceThemes,
  resolveInterfaceFontSize,
  type InterfaceTheme,
} from "./interface-theme";

export type CodeTokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number";

export type CodeToken = { readonly kind: CodeTokenKind; readonly text: string };

const keywords = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "class",
  "const",
  "continue",
  "def",
  "default",
  "elif",
  "else",
  "export",
  "extends",
  "false",
  "fn",
  "for",
  "from",
  "func",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "match",
  "new",
  "None",
  "null",
  "pub",
  "return",
  "self",
  "struct",
  "switch",
  "this",
  "true",
  "True",
  "False",
  "try",
  "type",
  "undefined",
  "use",
  "var",
  "while",
  "with",
  "yield",
]);

const tokenPattern =
  /(\/\/.*$|#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/gu;

/** Small language-agnostic highlighter for short, readable on-screen snippets. */
export const tokenizeCodeLine = (line: string): readonly CodeToken[] => {
  const tokens: CodeToken[] = [];
  let last = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > last)
      tokens.push({ kind: "plain", text: line.slice(last, index) });
    const [text, comment, string, number, word] = match;
    const kind: CodeTokenKind =
      comment !== undefined
        ? "comment"
        : string !== undefined
          ? "string"
          : number !== undefined
            ? "number"
            : word !== undefined && keywords.has(word)
              ? "keyword"
              : "plain";
    tokens.push({ kind, text });
    last = index + text.length;
  }
  if (last < line.length)
    tokens.push({ kind: "plain", text: line.slice(last) });
  return tokens;
};

export type CodeHighlight = {
  /** Inclusive 1-based line range. */
  readonly fromLine: number;
  readonly toLine: number;
  readonly startFrame: number;
  readonly endFrame?: number;
};

export type CodePanelProps = {
  readonly code: string;
  readonly minFontSizePx: number;
  readonly fontSizePx?: number;
  readonly fileName?: string;
  readonly showLineNumbers?: boolean;
  /** Frames between consecutive line reveals; 0 shows every line at startFrame. */
  readonly framesPerLine?: number;
  readonly startFrame?: number;
  readonly highlights?: readonly CodeHighlight[];
  readonly theme?: InterfaceTheme;
  /** Defaults to the current Sequence frame; pass sceneFrame for grouped Scenes. */
  readonly frame?: number;
  readonly style?: CSSProperties;
};

const fadeFrames = 8;

/** Syntax-highlighted code with line-by-line reveal and animated focus bands. */
export const CodePanel: FC<CodePanelProps> = ({
  code,
  minFontSizePx,
  fontSizePx,
  fileName,
  showLineNumbers = true,
  framesPerLine = 3,
  startFrame = 0,
  highlights = [],
  theme = interfaceThemes.dark,
  frame: frameOverride,
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  if (!Number.isInteger(framesPerLine) || framesPerLine < 0) {
    throw new Error("CodePanel framesPerLine must be a non-negative integer.");
  }
  const fontSize = resolveInterfaceFontSize(minFontSizePx, fontSizePx);
  const lines = code.replace(/\n$/u, "").split("\n");
  const gutter = String(lines.length).length;
  const colors: Record<CodeTokenKind, string> = {
    plain: theme.text,
    keyword: theme.syntax.keyword,
    string: theme.syntax.string,
    comment: theme.syntax.comment,
    number: theme.syntax.number,
  };
  const highlightStrength = (lineNumber: number) =>
    highlights.reduce((strength, highlight) => {
      if (lineNumber < highlight.fromLine || lineNumber > highlight.toLine)
        return strength;
      const rise = interpolate(
        frame,
        [highlight.startFrame, highlight.startFrame + fadeFrames],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      const fall =
        highlight.endFrame === undefined
          ? 1
          : interpolate(
              frame,
              [highlight.endFrame, highlight.endFrame + fadeFrames],
              [1, 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            );
      return Math.max(strength, rise * fall);
    }, 0);
  const anyHighlight = lines.some(
    (_, index) => highlightStrength(index + 1) > 0,
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
        backgroundColor: theme.canvas,
        fontFamily: interfaceFonts.mono,
        fontSize,
        ...style,
      }}
    >
      {fileName !== undefined ? (
        <div
          style={{
            padding: `${fontSize * 0.45}px ${fontSize * 0.9}px`,
            borderBottom: `1px solid ${theme.border}`,
            backgroundColor: theme.surface,
            color: theme.mutedText,
            fontFamily: interfaceFonts.ui,
            fontSize,
          }}
        >
          {fileName}
        </div>
      ) : null}
      <div style={{ padding: `${fontSize * 0.7}px 0` }}>
        {lines.map((line, index) => {
          const reveal = interpolate(
            frame,
            [
              startFrame + index * framesPerLine,
              startFrame + index * framesPerLine + fadeFrames,
            ],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const strength = highlightStrength(index + 1);
          // Unhighlighted lines recede while a focus band is active.
          const dim = anyHighlight ? 0.45 + 0.55 * strength : 1;
          return (
            <div
              key={index}
              style={{
                display: "flex",
                whiteSpace: "pre",
                lineHeight: 1.6,
                opacity: reveal * dim,
                translate: `${(1 - reveal) * fontSize}px 0`,
                backgroundColor: `color-mix(in srgb, ${theme.accent} ${Math.round(strength * 18)}%, transparent)`,
                boxShadow: `inset ${Math.round(strength * 4)}px 0 0 ${theme.accent}`,
                padding: `0 ${fontSize * 0.9}px`,
              }}
            >
              {showLineNumbers ? (
                <span
                  style={{
                    width: `${gutter + 1.5}ch`,
                    flexShrink: 0,
                    color: theme.mutedText,
                    fontSize,
                  }}
                >
                  {index + 1}
                </span>
              ) : null}
              <span style={{ fontSize }}>
                {tokenizeCodeLine(line).map((token, tokenIndex) => (
                  <span
                    key={tokenIndex}
                    style={{
                      color: colors[token.kind],
                      fontStyle:
                        token.kind === "comment" ? "italic" : undefined,
                      fontSize,
                    }}
                  >
                    {token.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
