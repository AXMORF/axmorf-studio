import { fitTextOnNLines } from "@remotion/layout-utils";

export type FitProducerTextOptions = {
  readonly text: string;
  readonly maxBoxWidth: number;
  readonly maxBoxHeight: number;
  readonly maxLines: number;
  readonly maxFontSize: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number | string;
  readonly lineHeight?: number;
};

export type FitProducerTextResult = {
  readonly fontSize: number;
  readonly lines: readonly string[];
  readonly lineHeightPx: number;
  readonly fits: boolean;
};

const requirePositiveFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
};

export const fitProducerText = ({
  text,
  maxBoxWidth,
  maxBoxHeight,
  maxLines,
  maxFontSize,
  fontFamily = "Noto Sans CJK SC",
  fontWeight = 700,
  lineHeight = 1.16,
}: FitProducerTextOptions): FitProducerTextResult => {
  if (!text.trim()) throw new Error("text must be non-empty");
  requirePositiveFinite(maxBoxWidth, "maxBoxWidth");
  requirePositiveFinite(maxBoxHeight, "maxBoxHeight");
  requirePositiveFinite(maxFontSize, "maxFontSize");
  requirePositiveFinite(lineHeight, "lineHeight");
  if (!Number.isInteger(maxLines) || maxLines <= 0) {
    throw new Error("maxLines must be a positive integer");
  }

  const heightSafeMaxFontSize = Math.min(maxFontSize, maxBoxHeight / (maxLines * lineHeight));
  const isUnspacedCjk = /[\u3400-\u9fff]/u.test(text) && !/\s/u.test(text);
  const measurementText = isUnspacedCjk ? Array.from(text).join(" ") : text;
  const fitted = fitTextOnNLines({
    text: measurementText,
    maxBoxWidth,
    maxLines,
    fontFamily,
    fontWeight,
    maxFontSize: heightSafeMaxFontSize,
  });
  const lines = fitted.lines.map((line) => (isUnspacedCjk ? line.replaceAll(" ", "") : line));
  const lineHeightPx = fitted.fontSize * lineHeight;
  const renderedHeight = lineHeightPx * lines.length;

  return {
    fontSize: fitted.fontSize,
    lines,
    lineHeightPx,
    fits: lines.length <= maxLines && renderedHeight <= maxBoxHeight + 0.01,
  };
};
