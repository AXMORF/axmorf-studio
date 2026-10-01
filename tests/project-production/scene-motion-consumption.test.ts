import assert from "node:assert/strict";
import test from "node:test";
import {
  TrackedSceneMotionPlanSchema as SceneMotionPlanSchema,
  VisualStyleSpecSchema,
} from "@axmorf/studio/contracts";
import { checkSceneMotionConsumption } from "../../scripts/project-production/application/scene-motion-consumption";
import { createScenePlans } from "../fixtures/scene/scene-input";
import { validProjectCreateInput } from "../fixtures/project-create";

const state = (value = 0) => ({
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  reveal: 1,
  value,
});
const plan = (hold = false) =>
  SceneMotionPlanSchema.parse({
    schemaVersion: 1,
    objects: [
      {
        objectId: "quantity",
        meaning: "Measured quantity",
        keyframes: [
          { frame: 0, state: state(), easing: "linear" },
          { frame: 80, state: state(hold ? 0 : 40), easing: "linear" },
          { frame: 119, state: state(hold ? 0 : 40), easing: "linear" },
        ],
      },
    ],
    actions: [
      {
        actionId: "measure",
        shotId: "trace-shot",
        kind: hold ? "hold" : "compare",
        explanatoryPurpose: hold
          ? "Allow reading the measured result"
          : "Explain the increase",
        initialState: "Zero",
        resultingState: hold ? "Zero held" : "Forty",
        objectIds: ["quantity"],
        frameRange: { startFrame: 0, endFrame: 120 },
        syncAnchorId: hold ? null : "outline-closes",
        readingHoldFrames: hold ? 0 : 30,
      },
    ],
    handoff: {
      kind: "end",
      reason: "Finish explanation",
      incoming: [],
      outgoing: [],
    },
  });
const probe = (source: string, motionPlan = plan()) => {
  const { task, visual, shots, anchors } = createScenePlans();
  return checkSceneMotionConsumption({
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
      visualStyle: VisualStyleSpecSchema.parse({
        schemaVersion: 1,
        storyId: task.storyId,
        resourceCatalogFingerprint: task.resourceCatalogFingerprint,
        ...validProjectCreateInput.visualStyle,
      }),
      visualPlan: visual,
      shots: { ...shots, motionPlan },
      syncAnchors: anchors,
      visualResources: [],
    },
  });
};
const boundSource = `import {resolveMotionTrackState} from "@axmorf/studio/contracts";
export default function Renderer({shots,sceneFrame}) {
 const s = resolveMotionTrackState(shots.motionPlan.objects[0],sceneFrame);
 return <svg><g data-motion-object="quantity"><text>{s.value.toFixed(2)}</text></g></svg>;
}`;

test("Actual rendered object consumes changing plan value and holds the result", () => {
  const result = probe(boundSource);
  assert.equal(result.status, "motion-consumption-observed");
  assert.equal(result.observations.length, 1);
});
test("Valid plan ignored by Renderer fails despite frame-driven decorative motion", () => {
  assert.throws(
    () =>
      probe(
        `export default ({sceneFrame}) => <div data-motion-object="quantity" style={{left:sceneFrame}}>40</div>;`,
      ),
    /unused or partly ignored/u,
  );
});
test("Self-reported data attributes are not plan consumption", () => {
  assert.throws(
    () =>
      probe(
        `import {resolveMotionTrackState} from "@axmorf/studio/contracts";export default ({shots,sceneFrame}) => <div data-motion-object="quantity" title={resolveMotionTrackState(shots.motionPlan.objects[0],sceneFrame).value} data-value={resolveMotionTrackState(shots.motionPlan.objects[0],sceneFrame).value}>40</div>;`,
      ),
    /unused or partly ignored/u,
  );
});
test("Purposeful static reading hold is accepted when actual object consumes static plan", () => {
  assert.equal(
    probe(boundSource, plan(true)).status,
    "motion-consumption-observed",
  );
});
test("An action field ignored by actual output is rejected", () => {
  const raw = plan();
  const partlyIgnored = {
    ...raw,
    objects: raw.objects.map((o) => ({
      ...o,
      keyframes: o.keyframes.map((k) => ({
        ...k,
        state: { ...k.state, rotation: k.frame ? 20 : 0 },
      })),
    })),
  };
  assert.throws(() => probe(boundSource, partlyIgnored), /partly ignored/u);
});
test("Reading-label stability outside the DOM probe requires temporal review rather than creative rejection", () => {
  const source = boundSource.replace("<text>", "<text x={sceneFrame}>");
  const result = probe(source);
  assert.equal(result.status, "temporal-review-required");
  assert.equal(result.verification, "unsupported");
  assert.match(result.reason!, /reading hold changes/u);
});
test("Missing optional object bindings and browser hooks are explicitly unverified", () => {
  const missing = probe(
    boundSource.replace('data-motion-object="quantity"', ""),
  );
  assert.equal(missing.status, "temporal-review-required");
  assert.match(missing.reason!, /rendered object binding/u);
  const hooks = probe(
    'import {useCurrentFrame} from "remotion"; export default ()=> <canvas/>;',
  );
  assert.equal(hooks.verification, "unsupported");
  assert.equal(hooks.reviewStatus, "needs-temporal-review");
});
test("Already allowed direct Remotion interpolation imports work in the probe", () => {
  const source = boundSource
    .replace(
      "import {resolveMotionTrackState}",
      'import {interpolate} from "remotion"; import {resolveMotionTrackState}',
    )
    .replace(
      "s.value.toFixed(2)",
      "interpolate(s.value,[0,40],[0,100]).toFixed(2)",
    );
  assert.equal(probe(source).verification, "verified-dom-dependency");
});
test("A deliberate static reading hold needs no artificial response to perturbed metadata", () => {
  const result = probe(
    'export default ()=> <svg><g data-motion-object="quantity"><text>40</text></g></svg>;',
    plan(true),
  );
  assert.equal(result.status, "motion-consumption-observed");
  assert.equal(result.reviewStatus, "needs-temporal-review");
});
