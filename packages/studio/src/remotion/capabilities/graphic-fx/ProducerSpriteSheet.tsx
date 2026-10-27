import type { CSSProperties, FC } from "react";
import { Img } from "remotion";

export type ProducerSpriteSheetProps = {
  /** staticFile() URL of a registered sheet (keyed PNG with transparency). */
  readonly src: string;
  readonly columns: number;
  readonly rows: number;
  /** Cell to show, counted left-to-right, top-to-bottom from 0. */
  readonly cell: number;
  /** Pixel size of the whole sheet; sets the cell's aspect ratio. */
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  /** Position and size of the visible cell (e.g. left, top, width). */
  readonly style?: CSSProperties;
};

/**
 * Shows one drawing of a grid sheet: key poses of a motion, or particle
 * sprites. Pair with resolveProducerDrawing to play it as limited animation.
 */
export const ProducerSpriteSheet: FC<ProducerSpriteSheetProps> = ({
  src,
  columns,
  rows,
  cell,
  sheetWidth,
  sheetHeight,
  style,
}) => {
  for (const [label, value] of [
    ["columns", columns],
    ["rows", rows],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 12) {
      throw new Error(
        `ProducerSpriteSheet ${label} must be an integer between 1 and 12.`,
      );
    }
  }
  if (!Number.isInteger(cell) || cell < 0 || cell >= columns * rows) {
    throw new Error(
      `ProducerSpriteSheet cell must be an integer between 0 and ${columns * rows - 1}.`,
    );
  }
  if (!(sheetWidth > 0) || !(sheetHeight > 0)) {
    throw new Error(
      "ProducerSpriteSheet sheetWidth and sheetHeight must be positive.",
    );
  }
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  return (
    <div
      style={{
        position: "absolute",
        overflow: "hidden",
        aspectRatio: `${sheetWidth / columns} / ${sheetHeight / rows}`,
        ...style,
      }}
    >
      <Img
        src={src}
        style={{
          position: "absolute",
          // Workspace CSS caps images at their container; the sheet must overflow it.
          maxWidth: "none",
          maxHeight: "none",
          width: `${columns * 100}%`,
          height: `${rows * 100}%`,
          left: `${-column * 100}%`,
          top: `${-row * 100}%`,
        }}
      />
    </div>
  );
};
