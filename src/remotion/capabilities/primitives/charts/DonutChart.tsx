import type { CSSProperties, FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";

export type DonutChartSegment = {
  color?: string;
  label: string;
  value: number;
};

export type DonutChartProps = {
  background?: string;
  centerLabel?: string;
  centerValue?: string;
  containerStyle?: CSSProperties;
  height?: number;
  radius?: number;
  segments?: DonutChartSegment[];
  showLegend?: boolean;
  strokeWidth?: number;
  title?: string;
  width?: number;
};

const defaultSegments: DonutChartSegment[] = [
  { label: "Completed", value: 40, color: "#4361ee" },
  { label: "In Progress", value: 25, color: "#7209b7" },
  { label: "Pending", value: 20, color: "#f72585" },
  { label: "Remaining", value: 15, color: "#4cc9f0" },
];

const fallbackColors = ["#4361ee", "#7209b7", "#f72585", "#4cc9f0", "#22c55e", "#f59e0b"];

const DonutChart: FC<DonutChartProps> = ({
  background = "linear-gradient(to bottom right, #111827, #1f2937)",
  centerLabel = "Completion Rate",
  centerValue,
  containerStyle,
  height = 520,
  radius = 120,
  segments = defaultSegments,
  showLegend = true,
  strokeWidth = 20,
  title = "Completion Rate",
  width = 600,
}) => {
  const frame = useCurrentFrame();
  const safeSegments = segments.length > 0 ? segments : defaultSegments;
  const total = Math.max(
    safeSegments.reduce((sum, segment) => sum + segment.value, 0),
    1,
  );
  const cx = width / 2;
  const hasTitle = Boolean(title);
  const svgHeight = hasTitle ? height - 60 : height;
  const cy = hasTitle ? height * 0.44 : height * 0.5;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const computedCenterValue = `${Math.round(
    interpolate(frame, [10, 50], [0, (safeSegments[0]?.value ?? total) / total], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * 100,
  )}%`;

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
              top: 20,
              transform: "translateX(-50%)",
            }}
          >
            {title}
          </div>
        ) : null}

        <svg height={svgHeight} style={{ marginTop: hasTitle ? 10 : 0 }} width={width}>
          <circle
            cx={cx}
            cy={cy}
            fill="none"
            r={radius}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={strokeWidth}
          />

          {safeSegments.map((segment, index) => {
            const segmentLength = (segment.value / total) * circumference;
            const currentOffset = cumulativeOffset;
            cumulativeOffset += segmentLength;

            const segmentProgress = interpolate(frame, [index * 12, 20 + index * 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const animatedLength = segmentLength * segmentProgress;

            return (
              <circle
                cx={cx}
                cy={cy}
                fill="none"
                key={`seg-${segment.label}-${index}`}
                r={radius}
                stroke={segment.color ?? fallbackColors[index % fallbackColors.length]}
                strokeDasharray={`${animatedLength} ${circumference - animatedLength}`}
                strokeDashoffset={-currentOffset}
                strokeLinecap="round"
                strokeWidth={strokeWidth}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          })}

          <text
            dominantBaseline="middle"
            fill="white"
            fontSize={Math.max(20, radius * 0.4)}
            fontWeight="bold"
            textAnchor="middle"
            x={cx}
            y={cy - 5}
          >
            {centerValue ?? computedCenterValue}
          </text>

          <text
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.6)"
            fontSize={Math.max(10, radius * 0.13)}
            textAnchor="middle"
            x={cx}
            y={cy + 30}
          >
            {centerLabel}
          </text>
        </svg>

        {showLegend ? (
          <div
            style={{
              bottom: 25,
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              justifyContent: "center",
              left: "50%",
              position: "absolute",
              transform: "translateX(-50%)",
              width: width - 80,
            }}
          >
            {safeSegments.map((segment, index) => {
              const legendOpacity = interpolate(frame, [5 + index * 12, 15 + index * 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              return (
                <div
                  key={`legend-${segment.label}-${index}`}
                  style={{
                    alignItems: "center",
                    display: "flex",
                    gap: 6,
                    opacity: legendOpacity,
                  }}
                >
                  <div
                    style={{
                      backgroundColor:
                        segment.color ?? fallbackColors[index % fallbackColors.length],
                      borderRadius: "50%",
                      height: 10,
                      width: 10,
                    }}
                  />
                  <span
                    style={{
                      color: "rgba(255,255,255,0.8)",
                      fontSize: 13,
                    }}
                  >
                    {segment.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DonutChart;
