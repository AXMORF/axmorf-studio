import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import {
  buildSceneContinuityContract,
  computeSceneContinuityVisualFingerprint,
  ProjectCreateInputSchema,
  ProjectRevisionEditableAuthoringSchema,
  SceneContinuityVisualSchema,
  SceneOutgoingHandoffSchema,
  type SceneContinuityVisual,
} from "@axmorf/studio/contracts";
import { validProjectCreateInput } from "../fixtures/project-create";

const visual = (): SceneContinuityVisual => ({
  schemaVersion: 1,
  viewBox: [0, 0, 1000, 600],
  elements: [
    {
      tag: "defs",
      attributes: {},
      children: [
        {
          tag: "linearGradient",
          attributes: { id: "ink", x1: 0, x2: 1 },
          children: [
            { tag: "stop", attributes: { offset: 0, stopColor: "#28c8ff" } },
            { tag: "stop", attributes: { offset: 1, stopColor: "#e8f8ff" } },
          ],
        },
        {
          tag: "clipPath",
          attributes: { id: "edge" },
          children: [
            { tag: "circle", attributes: { cx: 500, cy: 300, r: 80 } },
          ],
        },
      ],
    },
    {
      tag: "g",
      attributes: { clipPath: "url(#edge)", transform: "translate(0 0)" },
      children: [
        {
          tag: "path",
          attributes: { d: "M420 300 Q500 200 580 300 Z", fill: "url(#ink)" },
        },
        {
          tag: "text",
          attributes: {
            x: 500,
            y: 310,
            fill: "#ffffff",
            fontFamily: "Arial, sans-serif",
            fontSize: 40,
            textAnchor: "middle",
          },
          children: [
            "Q",
            { tag: "tspan", attributes: { dy: 2 }, children: ["₁"] },
          ],
        },
      ],
    },
  ],
});

test("continuity visual is an immutable declaration shared by the two frozen handoffs", () => {
  const outgoingHandoff = SceneOutgoingHandoffSchema.parse({
    subject: "The same measured quantity",
    visual: visual(),
  });
  const before = {
    beat: { kind: "visual-scene" as const, meaningId: "before" },
    brief: {
      meaningId: "before",
      continuityBrief: "Follow the quantity",
      outgoingHandoff,
    },
  };
  const after = {
    beat: { kind: "visual-scene" as const, meaningId: "after" },
    brief: { meaningId: "after", continuityBrief: "Finish the measurement" },
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
  assert.deepEqual(first.outgoing, second.incoming);
  assert.equal(first.outgoing.kind, "continuous");
  assert.ok(first.outgoing.kind === "continuous" && first.outgoing.visual);
  const frozen = first.outgoing.visual;
  const semanticOnly = buildSceneContinuityContract({
    storyId: "continuity-proof",
    ...before,
    brief: {
      ...before.brief,
      outgoingHandoff: { subject: outgoingHandoff.subject },
    },
    previous: null,
    next: after,
  });
  assert.ok(semanticOnly.outgoing.kind === "continuous");
  assert.equal(first.outgoing.continuityId, semanticOnly.outgoing.continuityId);
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.viewBox));
  assert.ok(Object.isFrozen(frozen.elements));
  assert.ok(Object.isFrozen(frozen.elements[0]));
  assert.ok(Object.isFrozen(frozen.elements[0].attributes));
  assert.ok(Object.isFrozen(frozen.elements[0].children));
  assert.deepEqual(
    SceneOutgoingHandoffSchema.parse({ subject: "Legacy semantic seam" }),
    { subject: "Legacy semantic seam" },
  );
});

test("create and revision authoring retain the same optional visual declaration", () => {
  const input = {
    ...validProjectCreateInput,
    story: {
      ...validProjectCreateInput.story,
      beats: [
        validProjectCreateInput.story.beats[0],
        {
          ...validProjectCreateInput.story.beats[0],
          meaningId: "next",
          ttsChunks: [
            { chunkId: "next-01", ttsText: "Follow the same quantity." },
          ],
        },
      ],
    },
    scenes: [
      {
        ...validProjectCreateInput.scenes[0],
        outgoingHandoff: {
          subject: "The same measured quantity",
          visual: visual(),
        },
      },
      { ...validProjectCreateInput.scenes[0], meaningId: "next" },
    ],
    publishing: {
      ...validProjectCreateInput.publishing,
      chapters: [
        ...validProjectCreateInput.publishing.chapters,
        { meaningId: "next", name: "继续测量" },
      ],
    },
  };
  const created = ProjectCreateInputSchema.parse(input);
  const revised = ProjectRevisionEditableAuthoringSchema.parse({
    brief: input.brief,
    story: input.story,
    visualStyle: input.visualStyle,
    scenes: input.scenes,
    globalVisual: input.globalVisual,
    publishing: input.publishing,
  });
  assert.deepEqual(
    created.scenes[0].outgoingHandoff?.visual,
    revised.scenes[0].outgoingHandoff?.visual,
  );
  assert.deepEqual(created.scenes[0].outgoingHandoff?.visual, visual());
  assert.doesNotThrow(() =>
    z.toJSONSchema(ProjectCreateInputSchema, { io: "input" }),
  );
});

test("visual fingerprints cover drawing values with canonical attribute ordering", () => {
  const first = visual();
  const reordered = {
    ...first,
    viewBox: first.viewBox,
    elements: [
      ...first.elements.slice(0, 1),
      {
        ...first.elements[1],
        attributes: { transform: "translate(0 0)", clipPath: "url(#edge)" },
      },
    ],
  };
  assert.equal(
    computeSceneContinuityVisualFingerprint(first),
    computeSceneContinuityVisualFingerprint(reordered),
  );
  assert.notEqual(
    computeSceneContinuityVisualFingerprint(first),
    computeSceneContinuityVisualFingerprint({
      ...first,
      viewBox: [0, 0, 1000, 601],
    }),
  );
});

test("the declaration supports original geometry without prescribing a subject template", () => {
  assert.doesNotThrow(() =>
    SceneContinuityVisualSchema.parse({
      schemaVersion: 1,
      viewBox: [-10, -10, 100, 100],
      elements: [
        {
          tag: "rect",
          attributes: { x: 2, y: 3, width: 20, height: 10, rx: 2 },
        },
        { tag: "ellipse", attributes: { cx: 10, cy: 20, rx: 3, ry: 2 } },
        {
          tag: "line",
          attributes: { x1: 0, y1: 0, x2: 20, y2: 30, stroke: "#ffffff" },
        },
        {
          tag: "polyline",
          attributes: {
            points: [
              [0, 0],
              [10, 20],
            ],
            strokeDasharray: [2, 3],
          },
        },
        {
          tag: "polygon",
          attributes: {
            points: [
              [0, 0],
              [10, 20],
              [30, 0],
            ],
            fillRule: "evenodd",
          },
        },
        {
          tag: "defs",
          attributes: {},
          children: [
            {
              tag: "radialGradient",
              attributes: { id: "radial", cx: "50%", r: "60%" },
              children: [
                {
                  tag: "stop",
                  attributes: {
                    offset: "100%",
                    stopColor: "#ffffff",
                    stopOpacity: 0,
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  );
});

test("SVG executable, media, HTML, network and CSS surfaces fail closed", () => {
  const base = { schemaVersion: 1, viewBox: [0, 0, 100, 100] };
  for (const tag of [
    "script",
    "style",
    "foreignObject",
    "image",
    "use",
    "a",
    "animate",
    "animateTransform",
    "svg",
  ]) {
    assert.equal(
      SceneContinuityVisualSchema.safeParse({
        ...base,
        elements: [{ tag, attributes: {} }],
      }).success,
      false,
      tag,
    );
  }
  for (const attributes of [
    { onClick: "alert(1)" },
    { onclick: "alert(1)" },
    { style: { animation: "spin 1s linear infinite" } },
    { className: "animate-spin" },
    { dangerouslySetInnerHTML: { __html: "<script/>" } },
    { fill: "url(https://example.test/paint.svg#ink)" },
    { fill: "url(data:image/svg+xml;base64,PHN2Zz4=)" },
    { fill: "var(--paint)" },
    { fill: "currentColor" },
    { clipPath: "url(javascript:alert(1))" },
    { transform: "translate(0 0); animation: spin 1s" },
    { fontFamily: "Arial; background:url(https://example.test)" },
    { href: "#ink" },
    { filter: "url(#ink)" },
  ]) {
    assert.equal(
      SceneContinuityVisualSchema.safeParse({
        ...base,
        elements: [
          {
            tag: "circle",
            attributes: { cx: 50, cy: 50, r: 10, ...attributes },
          },
        ],
      }).success,
      false,
      JSON.stringify(attributes),
    );
  }
  assert.equal(
    SceneContinuityVisualSchema.safeParse({
      ...visual(),
      background: "#000000",
    }).success,
    false,
  );
  assert.equal(
    SceneContinuityVisualSchema.safeParse({
      schemaVersion: 1,
      viewBox: [0, 0, 100, 100],
      elements: [
        {
          tag: "defs",
          attributes: {},
          children: [
            {
              tag: "clipPath",
              attributes: { id: "recursive" },
              children: [
                {
                  tag: "circle",
                  attributes: { r: 5, clipPath: "url(#recursive)" },
                },
              ],
            },
          ],
        },
      ],
    }).success,
    false,
  );
});

test("local references must have a unique correctly typed target and cannot cycle", () => {
  const first = visual();
  for (const attributes of [
    { fill: "url(#missing)" },
    { fill: "url(#edge)" },
    { clipPath: "url(#ink)" },
  ]) {
    assert.equal(
      SceneContinuityVisualSchema.safeParse({
        ...first,
        elements: [
          ...first.elements,
          { tag: "circle", attributes: { r: 5, ...attributes } },
        ],
      }).success,
      false,
    );
  }
  assert.equal(
    SceneContinuityVisualSchema.safeParse({
      ...first,
      elements: [
        ...first.elements,
        { tag: "circle", attributes: { id: "ink", r: 5 } },
      ],
    }).success,
    false,
  );
  assert.equal(
    SceneContinuityVisualSchema.safeParse({
      schemaVersion: 1,
      viewBox: [0, 0, 100, 100],
      elements: [
        {
          tag: "defs",
          attributes: {},
          children: [
            { tag: "linearGradient", attributes: { id: "one", href: "#two" } },
            { tag: "linearGradient", attributes: { id: "two", href: "#one" } },
          ],
        },
      ],
    }).success,
    false,
  );
});

test("drawing and text nesting, coordinates and input size are bounded", () => {
  const base = { schemaVersion: 1, viewBox: [0, 0, 100, 100] };
  const circle = { tag: "circle", attributes: { r: 5 } };
  for (const elements of [
    [{ ...circle, children: ["Hidden text"] }],
    [{ tag: "g", attributes: {}, children: ["Not SVG text"] }],
    [{ tag: "text", attributes: {}, children: [circle] }],
    [{ tag: "linearGradient", attributes: {}, children: [circle] }],
    [{ ...circle, attributes: { r: Infinity } }],
    [{ ...circle, attributes: { r: 5, opacity: 1.1 } }],
    Array.from({ length: 257 }, () => circle),
  ]) {
    assert.equal(
      SceneContinuityVisualSchema.safeParse({ ...base, elements }).success,
      false,
    );
  }
  assert.equal(
    SceneContinuityVisualSchema.safeParse({
      ...base,
      viewBox: [0, 0, 0, 100],
      elements: [circle],
    }).success,
    false,
  );
  let nested: unknown = circle;
  for (let depth = 0; depth < 32; depth += 1)
    nested = { tag: "g", attributes: {}, children: [nested] };
  assert.equal(
    SceneContinuityVisualSchema.safeParse({ ...base, elements: [nested] })
      .success,
    false,
  );
  const cyclic: { tag: string; attributes: object; children: unknown[] } = {
    tag: "g",
    attributes: {},
    children: [],
  };
  cyclic.children.push(cyclic);
  assert.equal(
    SceneContinuityVisualSchema.safeParse({ ...base, elements: [cyclic] })
      .success,
    false,
  );
  assert.equal(
    SceneContinuityVisualSchema.safeParse({
      ...base,
      elements: Array.from({ length: 2 }, () => ({
        tag: "g",
        attributes: {},
        children: Array.from({ length: 130 }, () => circle),
      })),
    }).success,
    false,
  );
  assert.equal(
    SceneContinuityVisualSchema.safeParse({
      ...base,
      elements: [
        {
          tag: "text",
          attributes: {},
          children: Array.from({ length: 40 }, () => "Q".repeat(4096)),
        },
      ],
    }).success,
    false,
  );
});

test("input JSON schema exposes the explicit SVG grammar without expanding indefinitely", () => {
  const schema = z.toJSONSchema(SceneContinuityVisualSchema, { io: "input" });
  const serialized = JSON.stringify(schema);
  assert.ok(serialized.length < 250_000);
  assert.match(serialized, /linearGradient/u);
  assert.match(serialized, /fontFamily/u);
  assert.match(serialized, /additionalProperties":false/u);
});
