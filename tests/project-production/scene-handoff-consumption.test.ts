import assert from "node:assert/strict";
import test from "node:test";
import { VisualStyleSpecSchema } from "@axmorf/studio/contracts";
import { checkSceneHandoffConsumption } from "../../scripts/project-production/application/scene-handoff-consumption";
import { createScenePlans } from "../fixtures/scene/scene-input";
import { validProjectCreateInput } from "../fixtures/project-create";

const seam = {
  kind: "continuous" as const,
  continuityId: `handoff-${"a".repeat(64)}`,
  subject: "The same query object",
  reason: "Carry the query into the weighted result",
  visual: {
    schemaVersion: 1 as const,
    viewBox: [0, 0, 1000, 600] as const,
    elements: [
      {
        tag: "circle" as const,
        attributes: { cx: 500, cy: 300, r: 50, fill: "#28c8ff" },
      },
    ],
  },
};
const consumedSource = `import {SceneContinuityVisual} from "@axmorf/studio/remotion";
export default ({continuity}) => <SceneContinuityVisual handoff={continuity.incoming}/>;`;
const probe = (source: string, visual = true) => {
  const { task, visual: visualPlan, shots, anchors } = createScenePlans();
  const incoming = visual ? seam : { ...seam, visual: undefined };
  return checkSceneHandoffConsumption({
    rootDir: process.cwd(),
    sources: [{ logicalPath: "src/Renderer.tsx", source }],
    props: {
      storyId: task.storyId,
      meaningId: task.meaningId,
      sceneFrame: 0,
      durationInFrames: 120,
      fps: 30,
      viewportWidth: task.sceneViewport.width,
      viewportHeight: task.sceneViewport.height,
      storyBeat: task.storyBeat,
      sourceReferences: [],
      timingBeat: task.timingBeat,
      continuity: {
        contractVersion: "scene-continuity-v1",
        incoming,
        outgoing: { kind: "end", reason: "Finish" },
      },
      visualStyle: VisualStyleSpecSchema.parse({
        schemaVersion: 1,
        storyId: task.storyId,
        resourceCatalogFingerprint: task.resourceCatalogFingerprint,
        ...validProjectCreateInput.visualStyle,
      }),
      visualPlan,
      shots,
      syncAnchors: anchors,
      visualResources: [],
    },
  });
};

test("A semantic-only seam makes no claim about matching rendered geometry", () => {
  assert.equal(probe("export default ()=>null;", false), undefined);
});
test("A Renderer ignoring a promised visual fails even with an intent plan", () => {
  assert.throws(
    () =>
      probe("export default ()=> <svg><rect width={100} height={40}/></svg>;"),
    /handoff visual contradiction.*binding/u,
  );
});
test("The actual boundary SVG consumes the frozen visual, not just its marker", () => {
  const result = probe(consumedSource)!;
  assert.equal(result.verification, "verified-dom-boundary");
  assert.equal(result.observations.length, 1);
  assert.equal(result.reviewStatus, "needs-temporal-review");
});
test("A copied visual that ignores changed props is rejected", () => {
  const source = `import {SceneContinuityVisual} from "@axmorf/studio/remotion";
  const fixedVisual=${JSON.stringify(seam.visual)};
  export default ({continuity}) => <SceneContinuityVisual handoff={{...continuity.incoming,visual:fixedVisual}}/>;`;
  assert.throws(() => probe(source), /handoff visual contradiction.*unused/u);
});
test("Changing the query's circle to a rectangle contradicts the common drawing", () => {
  const source = consumedSource.replace(
    "handoff={continuity.incoming}",
    'handoff={{...continuity.incoming,visual:{...continuity.incoming.visual,elements:[{tag:"rect",attributes:{x:450,y:250,width:100,height:100,fill:"#28c8ff"}}]}}}',
  );
  assert.throws(() => probe(source), /handoff visual contradiction.*drawing/u);
});
test("A shifted or hidden ancestor cannot masquerade as the same boundary pose", () => {
  for (const style of ['transform:"translateX(40px)"', "opacity:0"]) {
    const source = consumedSource.replace(
      "<SceneContinuityVisual handoff={continuity.incoming}/>",
      `<div style={{${style}}}><SceneContinuityVisual handoff={continuity.incoming}/></div>`,
    );
    assert.throws(
      () => probe(source),
      /handoff visual contradiction.*ancestor/u,
    );
  }
});
test("Browser-only painting remains explicitly unverified", () => {
  const result = probe(
    "export default ()=>{if(!window) return null;return <canvas/>;};",
  )!;
  assert.equal(result.verification, "unsupported");
  assert.equal(result.reviewStatus, "needs-temporal-review");
  assert.match(result.reason!, /window/u);
});
