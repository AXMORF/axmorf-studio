import { createElement, type ReactElement } from "react";

import {
  SceneContinuousHandoffSchema,
  type SceneContinuousHandoff,
} from "../../../contracts/scene-continuity";
import {
  computeSceneContinuityVisualFingerprint,
  type SceneContinuityVisualElement,
} from "../../../contracts/scene-continuity-visual";

export type SceneContinuityVisualProps = Readonly<{
  handoff: SceneContinuousHandoff;
}>;

const renderElement = (
  element: SceneContinuityVisualElement,
  prefix: string,
  key: number,
): ReactElement => {
  const attributes: Record<string, unknown> = { key };
  const entries = Object.entries(element.attributes).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const [name, value] of entries) {
    if (name === "id") attributes[name] = `${prefix}${value}`;
    else if (name === "href")
      attributes[name] = `#${prefix}${String(value).slice(1)}`;
    else if (typeof value === "string" && value.startsWith("url(#"))
      attributes[name] = `url(#${prefix}${value.slice(5, -1)})`;
    else if (name === "points")
      attributes[name] = (value as readonly (readonly [number, number])[])
        .map((point) => point.join(","))
        .join(" ");
    else if (name === "strokeDasharray")
      attributes[name] = (value as readonly number[]).join(" ");
    else attributes[name] = value;
  }
  return createElement(
    element.tag,
    attributes,
    (element.children ?? []).map((child, index) =>
      typeof child === "string" ? child : renderElement(child, prefix, index),
    ),
  );
};

/** Both owners draw this immutable subject; Scene motion stays outside it. */
export const SceneContinuityVisual = ({
  handoff: rawHandoff,
}: SceneContinuityVisualProps) => {
  if (rawHandoff.kind !== "continuous")
    throw new Error("SceneContinuityVisual requires a continuous handoff.");
  const handoff = SceneContinuousHandoffSchema.parse(rawHandoff);
  if (handoff.visual === undefined)
    throw new Error(
      "SceneContinuityVisual requires a frozen visual declaration.",
    );
  const { visual } = handoff;
  const prefix = `${handoff.continuityId}-svg-`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      viewBox={visual.viewBox.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      fill="#000000"
      stroke="none"
      fontFamily="sans-serif"
      fontSize={16}
      data-scene-continuity={handoff.continuityId}
      data-scene-continuity-visual={computeSceneContinuityVisualFingerprint(
        visual,
      )}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {visual.elements.map((element, index) =>
        renderElement(element, prefix, index),
      )}
    </svg>
  );
};
