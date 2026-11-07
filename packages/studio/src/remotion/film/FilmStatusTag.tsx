import type { CSSProperties } from "react";
import { useVideoConfig } from "remotion";

import { minimumReadableFontSize } from "../../contracts/film";
import { resolveFilmCaptionFontSize } from "./FilmCaptions";

const STATUS_LABELS = {
  observed: "已发生",
  signal: "迹象",
  speculation: "推测",
  candidate: "候选·待验证",
  opinion: "社区观点",
  "self-reported": "作者自报",
} as const;

export type FilmStatusTagProps = Readonly<{
  status: keyof typeof STATUS_LABELS | (string & {});
  detail?: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  style?: CSSProperties;
}>;

/** Content provenance stays readable on its own backing, outside scene motion. */
export const FilmStatusTag = ({
  status,
  detail,
  position = "top-left",
  style,
}: FilmStatusTagProps) => {
  const { width, height } = useVideoConfig();
  // Match default captions, leaving headroom for films with larger captions.
  // Review compares the final, transformed text against actual caption sizes.
  const fontSize = Math.max(
    minimumReadableFontSize(width, height),
    resolveFilmCaptionFontSize(width, height),
  );
  const inset = Math.round(Math.min(width, height) * 0.06);
  const label = Object.hasOwn(STATUS_LABELS, status)
    ? STATUS_LABELS[status as keyof typeof STATUS_LABELS]
    : status;
  return (
    <div
      data-axmorf-status-tag=""
      style={{
        position: "absolute",
        ...(position.startsWith("top")
          ? { top: inset }
          : { bottom: Math.round(height * 0.2) }),
        ...(position.endsWith("left") ? { left: inset } : { right: inset }),
        maxWidth: width - inset * 2,
        boxSizing: "border-box",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: "0.6em",
        rowGap: "0.1em",
        padding: "0.3em 0.55em",
        borderRadius: "0.22em",
        borderLeft: "0.12em solid #f2d3a2",
        backgroundColor: "#101c28",
        color: "#fff4e3",
        fontFamily:
          'Inter, "Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize,
        fontWeight: 700,
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      <span>{label}</span>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
};
