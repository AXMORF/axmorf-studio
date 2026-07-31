import type { CSSProperties, FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";

export type LineChartDatum = {
  label: string;
  value: number;
};

export type LineChartProps = {
  background?: string;
  containerStyle?: CSSProperties;
  data?: LineChartDatum[];
  gridColor?: string;
  height?: number;
  lineColor?: string;
  padding?: number;
  pointColor?: string;
  title?: string;
  width?: number;
  yMax?: number;
};

const defaultData: LineChartDatum[] = [
  { label: "Jan", value: 25 },
  { label: "Feb", value: 40 },
  { label: "Mar", value: 35 },
  { label: "Apr", value: 55 },
  { label: "May", value: 50 },
  { label: "Jun", value: 70 },
  { label: "Jul", value: 65 },
  { label: "Aug", value: 80 },
  { label: "Sep", value: 75 },
  { label: "Oct", value: 90 },
];

const LineChart: FC<LineChartProps> = ({
  background = "linear-gradient(to bottom right, #111827, #1f2937)",
  containerStyle,
  data = defaultData,
  gridColor = "rgba(255,255,255,0.1)",
  height = 500,
  lineColor = "#4361ee",
  padding = 70,
  pointColor = "#f72585",
  title = "Revenue Growth",
  width = 900,
  yMax,
}) => {
  const frame = useCurrentFrame();
  const safeData = data.length > 0 ? data : defaultData;
  const maxValue = Math.max(yMax ?? 0, ...safeData.map((point) => point.value), 1);

  const xScale = (index: number) =>
    (index / Math.max(safeData.length - 1, 1)) * (width - padding * 2) + padding;
  const yScale = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);

  const points = safeData
    .map((point, index) => `${xScale(index)},${yScale(point.value)}`)
    .join(" ");

  let totalLength = 0;
  for (let index = 1; index < safeData.length; index += 1) {
    const dx = xScale(index) - xScale(index - 1);
    const dy = yScale(safeData[index].value) - yScale(safeData[index - 1].value);
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  const dashOffset = interpolate(frame, [0, 60], [totalLength, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio));

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
          borderRadius: 16,
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
          {gridValues.map((value) => (
            <line
              key={`grid-${value}`}
              stroke={gridColor}
              strokeWidth="1"
              x1={padding}
              x2={width - padding}
              y1={yScale(value)}
              y2={yScale(value)}
            />
          ))}

          {gridValues.map((value) => (
            <text
              fill="rgba(255,255,255,0.6)"
              fontSize="12"
              key={`y-${value}`}
              textAnchor="end"
              x={padding - 15}
              y={yScale(value) + 5}
            >
              {value}
            </text>
          ))}

          <line
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
            x1={padding}
            x2={width - padding}
            y1={height - padding}
            y2={height - padding}
          />
          <line
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
            x1={padding}
            x2={padding}
            y1={padding}
            y2={height - padding}
          />

          {safeData.map((point, index) => (
            <text
              fill="rgba(255,255,255,0.8)"
              fontSize="13"
              fontWeight="500"
              key={`x-label-${point.label}-${index}`}
              textAnchor="middle"
              x={xScale(index)}
              y={height - padding + 25}
            >
              {point.label}
            </text>
          ))}

          <polyline
            fill="none"
            points={points}
            stroke={lineColor}
            strokeDasharray={totalLength}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          {safeData.map((point, index) => {
            const pointProgress = interpolate(frame, [5 + index * 6, 10 + index * 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <circle
                cx={xScale(index)}
                cy={yScale(point.value)}
                fill={pointColor}
                key={`point-${point.label}-${index}`}
                opacity={pointProgress}
                r={5 * pointProgress}
                stroke="white"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {title ? (
          <div
            style={{
              color: "white",
              fontSize: 28,
              fontWeight: "bold",
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
      </div>
    </div>
  );
};

export default LineChart;
