import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildSceneContinuityContract,
  computeSceneContinuityId,
  computeSceneContinuityVisualFingerprint,
  SceneContinuityVisualSchema,
  type SceneContinuousHandoff,
} from "@axmorf/studio/contracts";
import { SceneContinuityVisual } from "@axmorf/studio/remotion";

const visual = SceneContinuityVisualSchema.parse({
  schemaVersion: 1,
  viewBox: [0, 0, 1000, 600],
  elements: [
    {
      tag: "defs",
      attributes: {},
      children: [
        {
          tag: "linearGradient",
          attributes: { id: "paint" },
          children: [
            { tag: "stop", attributes: { offset: 0, stopColor: "#123456" } },
            { tag: "stop", attributes: { offset: 1, stopColor: "#ffffff" } },
          ],
        },
        { tag: "linearGradient", attributes: { id: "alias", href: "#paint" } },
        {
          tag: "clipPath",
          attributes: { id: "clip" },
          children: [
            {
              tag: "rect",
              attributes: { x: 450, y: 250, width: 100, height: 100 },
            },
          ],
        },
      ],
    },
    {
      tag: "g",
      attributes: { clipPath: "url(#clip)" },
      children: [
        {
          tag: "circle",
          attributes: { cx: 500, cy: 300, r: 50, fill: "url(#alias)" },
        },
        {
          tag: "text",
          attributes: {
            x: 500,
            y: 305,
            fontSize: 20,
            fontFamily: "Arial, sans-serif",
            fill: "#ffffff",
          },
          children: ["<script>alert('x')</script> & Q"],
        },
        {
          tag: "polyline",
          attributes: {
            points: [
              [450, 250],
              [550, 350],
            ],
            strokeDasharray: [2, 3],
            stroke: "#ffffff",
            fill: "none",
          },
        },
      ],
    },
  ],
});
const handoff = (from = "before", to = "after"): SceneContinuousHandoff => ({
  kind: "continuous",
  continuityId: computeSceneContinuityId("continuity-proof", from, to),
  subject: "The same quantity",
  reason: "Follow the subject",
  visual,
});
const render = (seam: SceneContinuousHandoff) =>
  renderToStaticMarkup(<SceneContinuityVisual handoff={seam} />);

test("both isolated Scene owners render exactly the same frozen SVG at the seam", () => {
  const before = {
    beat: { kind: "visual-scene" as const, meaningId: "before" },
    brief: {
      meaningId: "before",
      continuityBrief: "Follow the subject",
      outgoingHandoff: { subject: "The same quantity", visual },
    },
  };
  const after = {
    beat: { kind: "visual-scene" as const, meaningId: "after" },
    brief: { meaningId: "after", continuityBrief: "Finish the subject" },
  };
  const first = buildSceneContinuityContract({
    storyId: "continuity-proof",
    ...before,
    previous: null,
    next: after,
  });
  const second = buildSceneContinuityContract({
    storyId: "continuity-proof",
    ...after,
    previous: before,
    next: null,
  });
  assert.ok(first.outgoing.kind === "continuous" && second.incoming);
  const outgoing = render(first.outgoing);
  assert.equal(outgoing, render(second.incoming));
  assert.equal(outgoing, render(first.outgoing));
  assert.match(outgoing, /viewBox="0 0 1000 600"/u);
  assert.match(
    outgoing,
    /style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"/u,
  );
  assert.ok(
    outgoing.includes(`data-scene-continuity="${first.outgoing.continuityId}"`),
  );
  assert.ok(
    outgoing.includes(
      `data-scene-continuity-visual="${computeSceneContinuityVisualFingerprint(visual)}"`,
    ),
  );
  assert.doesNotMatch(outgoing, /background|caption|animation|transition/u);
});

test("declared IDs and all local references share a stable seam prefix without mutating the declaration", () => {
  const seam = handoff();
  const markup = render(seam);
  const prefix = `${seam.continuityId}-svg-`;
  assert.ok(markup.includes(`id="${prefix}paint"`));
  assert.ok(markup.includes(`href="#${prefix}paint"`));
  assert.ok(markup.includes(`fill="url(#${prefix}alias)"`));
  assert.ok(markup.includes(`clip-path="url(#${prefix}clip)"`));
  assert.ok(!render(handoff("after", "final")).includes(`id="${prefix}paint"`));
  assert.equal(
    visual.elements[0].children?.[0] &&
      typeof visual.elements[0].children[0] !== "string" &&
      visual.elements[0].children[0].attributes.id,
    "paint",
  );
  assert.ok(markup.includes('points="450,250 550,350"'));
  assert.ok(markup.includes('stroke-dasharray="2 3"'));
});

test("text is escaped React content and cannot become SVG executable markup", () => {
  const markup = render(handoff());
  assert.match(
    markup,
    /&lt;script&gt;alert\(&#x27;x&#x27;\)&lt;\/script&gt; &amp; Q/u,
  );
  assert.doesNotMatch(markup, /<script[ >]|onload=|onclick=/iu);
});

test("the renderer requires a validated continuous visual and exposes no style or frame overrides", () => {
  const seam = handoff();
  const { visual: omitted, ...legacy } = seam;
  assert.ok(omitted);
  assert.throws(() => render(legacy), /visual/u);
  assert.throws(
    () => render({ ...seam, kind: "end" } as unknown as SceneContinuousHandoff),
    /continuous/u,
  );
  assert.throws(() =>
    render({
      ...seam,
      visual: { ...visual, elements: [{ tag: "script", attributes: {} }] },
    } as unknown as SceneContinuousHandoff),
  );
  assert.throws(() => render({ ...seam, continuityId: "invented" }));
});
