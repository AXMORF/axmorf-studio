import type { FilmReviewMeasurement } from "@axmorf/studio/contracts";
import type { ReviewFramePixels } from "./frame-compare";

// A conservative review hint (WCAG large-text floor), not a delivery gate.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
export const LOW_TEXT_CONTRAST_RATIO = 3;
export const TEXT_CONTRAST_COLUMNS = 4;
export const TEXT_CONTRAST_ROWS = 2;
// Remove glyph cores, allowing for JPEG noise, without discarding nearby shades.
const TEXT_COLOR_TOLERANCE = 24;
// A few bright edge/gutter pixels must not make a near-fill background pass.
// Keep at least 20% of a cell for a usable background estimate; otherwise use
// the near-fill paint. Wide outlines can still supply enough contrasting paint.
const MIN_BACKGROUND_SHARE = 0.2;

const linear = (value: number) => {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};
export const relativeLuminance = (r: number, g: number, b: number) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
export const contrastRatio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export type ContrastCell = {
  row: number;
  column: number;
  contrastRatio: number;
  backgroundLuminance: number;
  pixels: number;
};
export type ContrastResult = { worst?: ContrastCell; unknown?: string };
export type ContrastFrame = { image: ReviewFramePixels } | { error: string };

export const contrastCellPosition = ({ row, column }: ContrastCell) =>
  `${row === 0 ? "上" : "下"}${column < 2 ? "左" : "右"}（第 ${row + 1} 行、第 ${column + 1} 列）`;

/** Local background estimates from actual paint, not a CSS background exemption.
 * Outlines, shadows and plates participate as rendered pixels. This is a hint:
 * anti-aliasing, textures and moving/clipped shards still need visual review.
 */
export const measureTextContrast = ({
  text,
  image,
  width,
  height,
}: {
  text: FilmReviewMeasurement["texts"][number];
  image: ReviewFramePixels;
  width: number;
  height: number;
}): ContrastResult => {
  if (!text.color) return { unknown: "Computed text fill is unavailable." };
  if (
    image.pixels.length !== image.width * image.height * 3 ||
    image.width <= 0 ||
    image.height <= 0
  )
    return { unknown: "Rendered RGB pixels are incomplete." };
  const [r, g, b, alpha] = text.color;
  if (alpha === 0)
    return { unknown: "Text fill is transparent or unmeasurable." };
  const { rect } = text;
  let worst: ContrastCell | undefined;
  let empty = 0;
  for (let row = 0; row < TEXT_CONTRAST_ROWS; row++) {
    for (let column = 0; column < TEXT_CONTRAST_COLUMNS; column++) {
      const x1 = Math.max(
        0,
        Math.ceil(
          ((rect.x + (rect.width * column) / TEXT_CONTRAST_COLUMNS) *
            image.width) /
            width,
        ),
      );
      const x2 = Math.min(
        image.width,
        Math.ceil(
          ((rect.x + (rect.width * (column + 1)) / TEXT_CONTRAST_COLUMNS) *
            image.width) /
            width,
        ),
      );
      const y1 = Math.max(
        0,
        Math.ceil(
          ((rect.y + (rect.height * row) / TEXT_CONTRAST_ROWS) * image.height) /
            height,
        ),
      );
      const y2 = Math.min(
        image.height,
        Math.ceil(
          ((rect.y + (rect.height * (row + 1)) / TEXT_CONTRAST_ROWS) *
            image.height) /
            height,
        ),
      );
      let sum = 0,
        fillSum = 0,
        count = 0,
        allSum = 0,
        allCount = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const offset = (y * image.width + x) * 3;
          const br = image.pixels[offset],
            bg = image.pixels[offset + 1],
            bb = image.pixels[offset + 2];
          const luminance = relativeLuminance(br, bg, bb);
          allSum += luminance;
          allCount++;
          if (
            Math.max(Math.abs(br - r), Math.abs(bg - g), Math.abs(bb - b)) <=
            TEXT_COLOR_TOLERANCE
          )
            continue;
          sum += luminance;
          fillSum += relativeLuminance(
            r * alpha + br * (1 - alpha),
            g * alpha + bg * (1 - alpha),
            b * alpha + bb * (1 - alpha),
          );
          count++;
        }
      }
      if (!allCount) {
        empty++;
        continue;
      }
      const enoughBackground = count / allCount >= MIN_BACKGROUND_SHARE;
      const backgroundLuminance = enoughBackground
        ? sum / count
        : (allSum - sum) / (allCount - count);
      const ratio = contrastRatio(
        enoughBackground ? fillSum / count : relativeLuminance(r, g, b),
        backgroundLuminance,
      );
      const cell = {
        row,
        column,
        contrastRatio: ratio,
        backgroundLuminance,
        pixels: enoughBackground ? count : allCount,
      };
      if (!worst || ratio < worst.contrastRatio) worst = cell;
    }
  }
  return {
    ...(worst ? { worst } : {}),
    ...(empty
      ? {
          unknown: `${empty} contrast grid cells have no rendered pixels (clipped or too small).`,
        }
      : {}),
  };
};
