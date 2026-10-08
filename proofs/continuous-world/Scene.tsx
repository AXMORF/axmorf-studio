import { resolveContinuousProofState } from "./motion-state";
import type { SceneRendererProps } from "@axmorf/studio/remotion";

const Scene = ({
  sceneFrame,
  viewportWidth,
  viewportHeight,
}: SceneRendererProps) => {
  const state = resolveContinuousProofState(
    sceneFrame,
    viewportWidth,
    viewportHeight,
  );
  return (
    <svg
      width={viewportWidth}
      height={viewportHeight}
      viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
    >
      <text x={24} y={46} fontFamily="sans-serif" fontSize={36} fill="#f5f3ec">
        A route becomes a first step
      </text>
      <polyline
        points={state.path.map((point) => point.join(",")).join(" ")}
        fill="none"
        stroke="#889581"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {state.path.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r={7} fill="#b5c0aa" />
      ))}
      <circle
        cx={state.subject[0]}
        cy={state.subject[1]}
        r={14}
        fill="#ffd77c"
      />
      <text
        x={24}
        y={viewportHeight - 20}
        fontFamily="monospace"
        fontSize={28}
        fill="#c4c9bd"
      >{`scene frame ${sceneFrame} · ${sceneFrame < 80 ? "choose" : "step"}`}</text>
    </svg>
  );
};
export default Scene;
