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
    <div style={{width: 120, height: 120, borderRadius: 60, backgroundColor: "#00d4ff", opacity: progress, transform: `translateX(${progress * 40}px)`}} />
  </div>;
};
export default Renderer;
```

## Readability

Keep visible text at least `sceneViewport.minFontSizePx` and clearly separated from its actual background.
Set the size on the text-bearing element: numeric `style.fontSize` for HTML, and `fontSize` or
`style.fontSize` for SVG `<text>` (style wins). Pure layout and graphic containers do not need a font size.

Frame-driven 2D translation and rotation are supported with literal transform functions and numeric
arguments, including `interpolate()`/`spring()` results and supplied frame/viewport numbers. Keep text
and its ancestors at full scale or larger; isolate decorative SVG motion from text.
Unknown transform strings and unproven text sizes still fail the source check. Use the reported element
and rule to correct the cause; do not add dummy typography to purely graphical content.

Source checks do not measure rendered contrast, clipping, or pacing. Choose readable foreground/background
pairs and adequate spacing; when reviewing a render, inspect the text in its actual frame and background.
