# Scene implementation

- Derive animation from the supplied `sceneFrame`, `durationInFrames`, and `fps`.
- Size the Scene using `viewportWidth` and `viewportHeight`. Never call `useVideoConfig()` or infer full-frame dimensions.
- Use `interpolate()`, `spring()`, and `Sequence` with explicit frame ranges.
- Keep the root transparent; never add the Composition background or captions.
- Load only Workspace-owned public assets through `staticFile()`.
- Avoid CSS animation/transition properties and nondeterministic values.
- Preserve the task's meaning, timing anchors, safe area, and declared outputs.
- Run the exact task check command until the owning workspace validates, then
  use the exact attempt-bound terminal command.

The following boundary example is checked by the same Scene validator used in production. Replace its visual with the Beat's meaning:

```tsx
import type {SceneRendererProps} from "@axmorf/studio/remotion";
import {interpolate} from "remotion";

const Renderer = ({sceneFrame, fps, viewportWidth, viewportHeight}: SceneRendererProps) => {
  const progress = interpolate(sceneFrame, [0, fps], [0, 1], {extrapolateRight: "clamp"});
  return <div style={{width: viewportWidth, height: viewportHeight}}>
    <div style={{width: 120, height: 120, borderRadius: 60, backgroundColor: "#00d4ff", opacity: progress}} />
  </div>;
};
export default Renderer;
```

## Readability checks

Give every direct text-bearing HTML element an explicit numeric `style.fontSize`. For SVG `<text>`, use numeric
`style.fontSize` or `fontSize`; CSS style takes precedence over the attribute. Avoid inherited/relative text sizes and hidden
small labels. Literal array maps with direct JSX bodies are structural children; unknown expressions are conservatively checked.

For frame-driven movement, prefer numeric `left`/`top` or SVG `x`/`y`. Dynamic `transform` strings cannot generally prove that
readable content will not shrink; a deterministic Remotion expression alone does not satisfy static readability proof. Keep
scaling of text statically at least one. Errors include exact file:line:column, a rule name and a concrete correction. Fix the
reported element instead of changing unrelated text nodes or asking the user to approve routine DOM changes.
