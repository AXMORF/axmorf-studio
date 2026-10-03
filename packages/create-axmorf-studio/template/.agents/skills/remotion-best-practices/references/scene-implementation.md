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
import type { SceneRendererProps } from "@axmorf/studio/remotion";
import { interpolate } from "remotion";

const Renderer = ({
  sceneFrame,
  fps,
  viewportWidth,
  viewportHeight,
}: SceneRendererProps) => {
  const progress = interpolate(sceneFrame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ width: viewportWidth, height: viewportHeight }}>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: "#00d4ff",
          opacity: progress,
          transform: `translateX(${progress * 40}px)`,
        }}
      />
    </div>
  );
};
export default Renderer;
```

## Intent and implementation

`shots.motionPlan` v2 describes subjects, explanatory actions, narration alignment and
continuity. It prescribes no trajectories, component, camera motion or transition count.
Author content-appropriate frame-driven SVG/Canvas or use already supported 3D capabilities;
reusable components are optional. Keep the existing import/asset allowlist and safe layout.
Tracked v1 and `ProducerMotionObject` remain optional. Direct allowed `remotion` imports work.
A static reading hold needs no invented motion; legibility can remain stable while other
objects move. `motionReview.verification` distinguishes DOM dependency evidence from
`unsupported`/`intent-only`; all still need actual temporal review. Technical task acceptance
never certifies visible semantic correctness or aesthetic quality.

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

## Preview before commit

Use the exact shared-workspace bound `commands.preview` after the outputs pass validation. It renders the owning Scene with unchanged fps at reduced resolution and returns its source fingerprint. Inspect cause, visible change, result and label hold; for visual-only content check muted comprehension, for narrated content compare spoken timing. Amend only your declared outputs. Preview omits adjacent Scenes, GlobalVisual and project music, and cannot certify aesthetics or human listening.

The optional public `resolveSceneActionTiming({shots, syncAnchors, actionId, sceneFrame})` consumes authored anticipation/change/reading-hold timing without prescribing geometry or easing. The optional Renderer `continuity` prop contains the exact frozen incoming/outgoing seam. Match the actual subject at the boundary; identity alone does not prove pixel continuity.
