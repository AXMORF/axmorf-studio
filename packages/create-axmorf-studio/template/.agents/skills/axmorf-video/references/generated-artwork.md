# Generated artwork

Root uses this when the film needs original images or reusable SVG. Choose the medium for the subject: image generation
for illustration, photographic material and light; SVG for precise authored shapes, diagrams and state changes. Inline SVG
geometry may also be authored directly by a bound Scene. A new asset is useful only when a specific Scene will use it.

Design the complete key image first in the existing artDirection/Scene brief: subject scale, framing, light direction,
material, overlap and text quiet region. Generate separate environment/transparent subject planes when the action needs
depth or occlusion. Do not flatten required motion or explanatory text into a single bitmap. Avoid a mandatory visual style.

Use the host's actually callable image-generation tool; inspect the returned image and preserve transparency. Do not claim
a tool ran or invent an acquisition receipt. Without image generation, choose an appropriate authored SVG/geometry approach and write the SVG craft recipe from the
[visual quality bar](visual-quality-bar.md) into artDirection;
report a blocker only when the requested result specifically requires the missing tool. Third-party licensed media keeps
the existing compatible `--receipt` path; original-artwork declarations never substitute for third-party licensing.

After `project:create`, before the first `project:produce:inspect`, save the actual output and an input JSON together:

```json
{
  "schemaVersion": 1,
  "assetId": "subject-cutout",
  "title": "Authored subject",
  "description": "The foreground subject for this Scene's action.",
  "file": "subject.png",
  "sceneMeaningIds": ["explain-subject"],
  "provenance": {
    "kind": "image-generated",
    "creator": "actual generation tool",
    "creationDescription": "The actual prompt or original design description.",
    "rights": "original-work"
  }
}
```

For an original SVG use `kind: "authored-svg"` and its `.svg` file. Use simple static SVG with self-contained geometry,
gradients and local references; no script, event handlers, external references or animation. `file` is relative to the JSON.
Set target Scene meaning IDs from the current Story, never template-copy bookends.

```bash
npm run project:asset:import -- --project <storyId> --input <absolute-input-json>
```

The importer measures and checks actual bytes/format/size/checksum, freezes Project-owned media and provenance, and atomically
adds the resource to the Story pool and target Scene candidates. Silent scene-owner preset resources remain mandatory.
No media or frozen authoring changes after inspect/production starts; revision candidates retain their base media bounds.

The worker uses only its bound availableResources, declares the actual selection, and renders its resolved
`visualResources[].src` with Remotion `Img` for raster/SVG files. Layer artwork, action and text deliberately; use
`ProducerLayeredStage` only when useful, and `SceneTextSafeArea` for stable labels on a full-frame canvas. Local image plates,
light and scenic colors may differ from theme text roles; keep real text contrast against the actual image. Validate actual
rendered loading/alpha/crop as technical checks. Asset presence, a plan or a successful import is not a quality judgment.
