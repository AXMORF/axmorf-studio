import type { FC } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export type GalleryGridItem = {
  background: string;
};

export type GalleryGridProps = {
  background?: string;
  items?: GalleryGridItem[];
};

const defaultItems: GalleryGridItem[] = [
  { background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" },
  { background: "linear-gradient(135deg, #a855f7, #7c3aed)" },
  { background: "linear-gradient(135deg, #0f766e, #3b82f6)" },
  { background: "linear-gradient(135deg, #be185d, #a855f7)" },
  { background: "linear-gradient(135deg, #1d4ed8, #0f766e)" },
  { background: "linear-gradient(135deg, #7c3aed, #be185d)" },
];

export const GalleryGrid: FC<GalleryGridProps> = ({
  background = "#111827",
  items = defaultItems,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cells = items.length > 0 ? items : defaultItems;

  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: background,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        padding: 32,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          height: "80%",
          width: "90%",
        }}
      >
        {cells.slice(0, 6).map((cell, index) => {
          const progress = spring({
            frame: Math.max(frame - index * 4, 0),
            fps,
            config: { damping: 12, stiffness: 100 },
          });

          return (
            <div
              key={`${cell.background}-${index}`}
              style={{
                background: cell.background,
                borderRadius: 8,
                opacity: progress,
                transform: `scale(${0.8 + progress * 0.2})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
