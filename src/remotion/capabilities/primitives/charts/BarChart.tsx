import type { CSSProperties, FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";

export type BarChartDatum = {
  label: string;
  value: number;
};

export type BarChartProps = {
  background?: string;
  colors?: string[];
  containerStyle?: CSSProperties;
  data?: BarChartDatum[];
  height?: number;
  padding?: number;
  subtitle?: string;
  title?: string;
  width?: number;
  yMax?: number;
};

const defaultData: BarChartDatum[] = [
  { label: "Jan", value: 50 },
  { label: "Feb", value: 80 },
  { label: "Mar", value: 30 },
  { label: "Apr", value: 70 },
  { label: "May", value: 45 },
  { label: "Jun", value: 90 },
  { label: "Jul", value: 60 },
  { label: "Aug", value: 75 },
  { label: "Sep", value: 40 },
  { label: "Oct", value: 85 },
];

const defaultColors = [
  "#4361ee",
  "#0f766e",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#2563eb",
  "#9333ea",
  "#be185d",
  "#0d9488",
  "#0284c7",
];

export const BarChart: FC<BarChartProps> = ({
  background = "linear-gradient(to bottom right, #111827, #1f2937)",
  colors = defaultColors,
  containerStyle,
  data = defaultData,
  height = 500,
  padding = 60,
  subtitle = "Data visualization for 2023",
  title = "Monthly Performance",
  width = 900,
  yMax,
}) => {
  const frame = useCurrentFrame();
  const safeData = data.length > 0 ? data : defaultData;
  const maxValue = Math.max(yMax ?? 0, ...safeData.map((point) => point.value), 1);
  const barWidth = ((width - padding * 2) / safeData.length) * 0.7;
  const xScale = (index: number) =>
    (index / Math.max(safeData.length - 1, 1)) * (width - padding * 2) + padding;
  const yScale = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);

  return (
    <div
      style={{
        alignItems: "center",
        background,
        display: "flex",
        fontFamily: "Inter, system-ui, sans-serif",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.2)",
          borderRadius: 8,
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
          height,
          overflow: "hidden",
          padding: 20,
          position: "relative",
          width,
          ...containerStyle,
        }}
      >
        <svg height={height} width={width}>
          <line
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="2"
            x1={padding}
            x2={width - padding}
            y1={height - padding}
            y2={height - padding}
          />
          {safeData.map((point, index) => (
            <text
              fill="rgba(255, 255, 255, 0.8)"
              fontSize="14"
              fontWeight="500"
              key={`x-label-${point.label}-${index}`}
              textAnchor="middle"
              x={xScale(index)}
              y={height - padding + 25}
            >
              {point.label}
            </text>
          ))}
          {safeData.map((point, index) => {
            const fullHeight = (point.value / maxValue) * (height - padding * 2);
            const progress = interpolate(frame, [index * 3, 15 + index * 3], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const currentHeight = fullHeight * progress;
            const currentY = yScale(point.value) + fullHeight - currentHeight;

            return (
              <g key={`bar-${point.label}-${index}`}>
                <rect
                  fill={colors[index % colors.length] ?? defaultColors[0]}
                  height={currentHeight}
                  rx="6"
                  ry="6"
                  width={barWidth}
                  x={xScale(index) - barWidth / 2}
                  y={currentY}
                />
                <text
                  fill="white"
                  fontSize="14"
                  fontWeight="bold"
                  opacity={progress > 0.9 ? 1 : 0}
                  textAnchor="middle"
                  x={xScale(index)}
                  y={currentY - 10}
                >
                  {point.value}
                </text>
              </g>
            );
          })}
        </svg>
        {title ? (
          <div
            style={{
              color: "white",
              fontSize: 28,
              fontWeight: 700,
              left: "50%",
              letterSpacing: 0,
              position: "absolute",
              textShadow: "0 2px 4px rgba(0,0,0,0.3)",
              top: 25,
              transform: "translateX(-50%)",
            }}
          >
            {title}
          </div>
        ) : null}
        {subtitle ? (
          <div
            style={{
              color: "rgba(255, 255, 255, 0.7)",
              fontSize: 16,
              left: "50%",
              position: "absolute",
              textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              top: 60,
              transform: "translateX(-50%)",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
};
