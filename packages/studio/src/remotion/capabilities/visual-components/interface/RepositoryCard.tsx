import type { CSSProperties, FC } from "react";

import {
  interfaceFonts,
  interfaceShadow,
  interfaceThemes,
  resolveInterfaceFontSize,
  type InterfaceTheme,
} from "./interface-theme";

export type RepositoryCardProps = {
  readonly owner: string;
  readonly name: string;
  readonly description?: string;
  readonly language?: { readonly name: string; readonly color: string };
  /** Preformatted verified figure such as "12.4k"; omit when not verified. */
  readonly stars?: string;
  readonly topics?: readonly string[];
  readonly width: number;
  readonly minFontSizePx: number;
  readonly fontSizePx?: number;
  readonly theme?: InterfaceTheme;
  readonly style?: CSSProperties;
};

const RepoGlyph: FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <path
      d="M3 1.5h9.5v11H4.25a1.25 1.25 0 0 0 0 2.5h8.25M3 1.5v12.25M3 1.5a1 1 0 0 0-1 1v11"
      fill="none"
      stroke={color}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  </svg>
);

const StarGlyph: FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <path
      d="M8 1.2l2 4.2 4.6.6-3.4 3.2.9 4.6L8 11.6l-4.1 2.2.9-4.6L1.4 6l4.6-.6z"
      fill="none"
      stroke={color}
      strokeWidth={1.3}
      strokeLinejoin="round"
    />
  </svg>
);

/** Generic code-hosting repository card; it carries no third-party logo. */
export const RepositoryCard: FC<RepositoryCardProps> = ({
  owner,
  name,
  description,
  language,
  stars,
  topics = [],
  width,
  minFontSizePx,
  fontSizePx,
  theme = interfaceThemes.dark,
  style,
}) => {
  const fontSize = resolveInterfaceFontSize(minFontSizePx, fontSizePx);
  const titleSize = Math.round(fontSize * 1.35);
  return (
    <div
      style={{
        width,
        boxSizing: "border-box",
        padding: fontSize * 1.1,
        borderRadius: fontSize * 0.6,
        backgroundColor: theme.surface,
        border: `1px solid ${theme.border}`,
        boxShadow: interfaceShadow,
        fontFamily: interfaceFonts.ui,
        color: theme.text,
        display: "flex",
        flexDirection: "column",
        gap: fontSize * 0.7,
        ...style,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: fontSize * 0.5 }}
      >
        <RepoGlyph size={titleSize} color={theme.mutedText} />
        <span style={{ fontSize: titleSize, color: theme.accent }}>
          {`${owner} / `}
          <span style={{ fontSize: titleSize, fontWeight: 700 }}>{name}</span>
        </span>
      </div>
      {description !== undefined ? (
        <div style={{ fontSize, lineHeight: 1.45, color: theme.mutedText }}>
          {description}
        </div>
      ) : null}
      {topics.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: fontSize * 0.4 }}>
          {topics.map((topic) => (
            <span
              key={topic}
              style={{
                fontSize,
                padding: `${fontSize * 0.15}px ${fontSize * 0.6}px`,
                borderRadius: fontSize,
                color: theme.accent,
                backgroundColor: `color-mix(in srgb, ${theme.accent} 14%, transparent)`,
              }}
            >
              {topic}
            </span>
          ))}
        </div>
      ) : null}
      {language !== undefined || stars !== undefined ? (
        <div
          style={{ display: "flex", alignItems: "center", gap: fontSize * 1.2 }}
        >
          {language !== undefined ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: fontSize * 0.4,
                fontSize,
              }}
            >
              <span
                style={{
                  width: fontSize * 0.7,
                  height: fontSize * 0.7,
                  borderRadius: fontSize,
                  backgroundColor: language.color,
                }}
              />
              {language.name}
            </span>
          ) : null}
          {stars !== undefined ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: fontSize * 0.35,
                fontSize,
                color: theme.mutedText,
              }}
            >
              <StarGlyph size={fontSize} color={theme.mutedText} />
              {stars}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
