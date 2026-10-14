import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";

export const ContactSheetPropsSchema = z.object({
  cells: z
    .array(
      z.object({
        /** Path below public/, as passed to staticFile(). */
        image: z.string().min(1),
        label: z.string(),
      }),
    )
    .min(1),
  columns: z.number().int().min(1).max(8),
  cellWidth: z.number().int().min(80).max(1000),
  cellHeight: z.number().int().min(80).max(1000),
});
export type ContactSheetProps = z.infer<typeof ContactSheetPropsSchema>;

const GAP = 12;
const LABEL_HEIGHT = 34;

export const resolveContactSheetSize = (props: ContactSheetProps) => {
  const rows = Math.ceil(props.cells.length / props.columns);
  const width = GAP + props.columns * (props.cellWidth + GAP);
  const height = GAP + rows * (props.cellHeight + LABEL_HEIGHT + GAP);
  // H.264 is not involved, but even sizes keep every encoder happy.
  return { width: width + (width % 2), height: height + (height % 2) };
};

/** Review frames tiled with their tile number, film frame, and reason. */
export const ContactSheet = (input: Record<string, unknown>) => {
  const { cells, columns, cellWidth, cellHeight } =
    ContactSheetPropsSchema.parse(input);
  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f4f5" }}>
      {cells.map(({ image, label }, index) => (
        <div
          key={image}
          style={{
            position: "absolute",
            left: GAP + (index % columns) * (cellWidth + GAP),
            top:
              GAP +
              Math.floor(index / columns) * (cellHeight + LABEL_HEIGHT + GAP),
            width: cellWidth,
          }}
        >
          <Img
            src={staticFile(image)}
            style={{
              width: cellWidth,
              height: cellHeight,
              objectFit: "contain",
              backgroundColor: "#000",
              display: "block",
            }}
          />
          <div
            style={{
              height: LABEL_HEIGHT,
              lineHeight: `${LABEL_HEIGHT}px`,
              fontFamily: "Inter, Helvetica, Arial, sans-serif",
              fontSize: 18,
              color: "#18181b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
