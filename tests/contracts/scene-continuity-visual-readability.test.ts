import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
  validateSceneContinuityVisualReadability,
  type SceneContinuityVisual,
  type SceneContinuityVisualElement,
} from "@axmorf/studio/contracts";

const sceneViewport = resolveSceneViewport(
  resolveSceneReadabilityPolicy({ width: 1080, height: 1920 }),
);
const visual = (
  elements: readonly SceneContinuityVisualElement[],
  viewBox: SceneContinuityVisual["viewBox"] = [
    0,
    0,
    sceneViewport.width,
    sceneViewport.height,
  ],
): SceneContinuityVisual => ({ schemaVersion: 1, viewBox, elements });
const text = (
  attributes: Extract<
    SceneContinuityVisualElement,
    { tag: "text" }
  >["attributes"],
  children: readonly (SceneContinuityVisualElement | string)[] = ["查询 Q"],
): SceneContinuityVisualElement => ({ tag: "text", attributes, children });
const check = (input: SceneContinuityVisual) =>
  validateSceneContinuityVisualReadability({ visual: input, sceneViewport });

test("default root 16 and explicit small text cannot bypass the viewport minimum", () => {
  assert.equal(sceneViewport.minFontSizePx, 36);
  for (const attributes of [{}, { fontSize: 35 }]) {
    assert.throws(
      () => check(visual([text(attributes)])),
      /elements\[0\].*frozen 36px minimum.*readability-font-minimum/u,
    );
  }
  assert.doesNotThrow(() => check(visual([text({ fontSize: 38 })])));
  assert.doesNotThrow(() =>
    check(
      visual([
        {
          tag: "g",
          attributes: { transform: "scale(3)" },
          children: [text({})],
        },
      ]),
    ),
  );
});

test("text and nested tspans inherit the nearest group or text font size", () => {
  const inherited = (fontSize: number) =>
    visual([
      {
        tag: "g",
        attributes: { fontSize },
        children: [
          text({}, [
            "Q ",
            {
              tag: "tspan",
              attributes: {},
              children: [{ tag: "tspan", attributes: {}, children: ["继承"] }],
            },
          ]),
        ],
      },
    ]);
  assert.doesNotThrow(() => check(inherited(38)));
  assert.throws(() => check(inherited(35)), /readability-font-minimum/u);
  assert.throws(
    () =>
      check(
        visual([
          text({ fontSize: 40 }, [
            "Q ",
            { tag: "tspan", attributes: { fontSize: 12 }, children: ["小字"] },
          ]),
        ]),
      ),
    /elements\[0\].children\[1\].*readability-font-minimum/u,
  );
});

test("an empty text parent does not fail when every painted tspan overrides its size", () => {
  assert.doesNotThrow(() =>
    check(
      visual([
        text({}, [
          { tag: "tspan", attributes: { fontSize: 38 }, children: ["足够大"] },
        ]),
      ]),
    ),
  );
});

test("meet takes the smaller viewport ratio and ignores only viewBox translations", () => {
  for (const viewBox of [
    [0, 0, sceneViewport.width * 2, sceneViewport.height],
    [0, 0, sceneViewport.width, sceneViewport.height * 2],
  ] as const) {
    assert.throws(
      () => check(visual([text({ fontSize: 38 })], viewBox)),
      /text size 19px.*readability-font-minimum/u,
    );
    assert.doesNotThrow(() => check(visual([text({ fontSize: 72 })], viewBox)));
  }
  assert.doesNotThrow(() =>
    check(
      visual(
        [text({ fontSize: 38 })],
        [-120, 240, sceneViewport.width, sceneViewport.height],
      ),
    ),
  );
});

test("parent and self scales are composed before computing real pixel size", () => {
  const scaled = (parent: string, self: string, fontSize: number) =>
    visual([
      {
        tag: "g",
        attributes: { transform: parent },
        children: [text({ fontSize, transform: self })],
      },
    ]);
  assert.throws(
    () => check(scaled("scale(0.75)", "scale(0.75)", 60)),
    /text size 33.75px.*readability-font-minimum/u,
  );
  assert.doesNotThrow(() => check(scaled("scale(0.5)", "scale(2)", 36)));
  assert.doesNotThrow(() =>
    check(scaled("scale(0.5)", "translate(10 20)", 72)),
  );
  assert.throws(
    () => check(scaled("translate(10 20)", "scale(1 0.5)", 38)),
    /readability-font-minimum/u,
  );
});

test("matrix and skew compression are measured by minimum singular value", () => {
  for (const transform of [
    "matrix(1 0 1 1 12 20)",
    "matrix(1 1 0 1 0 0)",
    "skewX(45)",
    "skewY(45)",
  ]) {
    assert.throws(
      () => check(visual([text({ fontSize: 38, transform })])),
      /readability-font-minimum/u,
      transform,
    );
    assert.doesNotThrow(() =>
      check(visual([text({ fontSize: 60, transform })])),
    );
  }
  assert.throws(
    () =>
      check(
        visual([text({ fontSize: 100, transform: "matrix(1 1 1 1 0 0)" })]),
      ),
    /text size 0px.*readability-font-minimum/u,
  );
});

test("transform order and nested matrix cancellation follow SVG composition", () => {
  assert.doesNotThrow(() =>
    check(
      visual([
        {
          tag: "g",
          attributes: { transform: "matrix(1 0 1 1 0 0)" },
          children: [text({ fontSize: 36, transform: "matrix(1 0 -1 1 0 0)" })],
        },
      ]),
    ),
  );
  assert.doesNotThrow(() =>
    check(visual([text({ fontSize: 36, transform: "scale(2 1) rotate(45)" })])),
  );
  assert.throws(
    () =>
      check(
        visual([
          {
            tag: "g",
            attributes: { transform: "scale(2 1)" },
            children: [
              text({ fontSize: 38, transform: "rotate(45) scale(1 0.5)" }),
            ],
          },
        ]),
      ),
    /readability-font-minimum/u,
  );
});

test("translation, centered rotation and unit reflection do not shrink the exact minimum", () => {
  for (const transform of [
    "translate(100 200)",
    "rotate(45 100 200)",
    "rotate(120) translate(-20 30)",
    "scale(-1 1)",
    "matrix(0 1 -1 0 100 200)",
  ]) {
    assert.doesNotThrow(() =>
      check(visual([text({ fontSize: 36, transform })])),
    );
  }
});

test("definitions, empty text and arbitrary non-text geometry have no font restriction", () => {
  const result = check(
    visual([
      {
        tag: "defs",
        attributes: {},
        children: [
          {
            tag: "clipPath",
            attributes: { id: "glyph-mask" },
            children: [text({ fontSize: 1 }, ["这是裁切几何"])],
          },
        ],
      },
      {
        tag: "g",
        attributes: { transform: "scale(0.001)", fontSize: 1 },
        children: [
          { tag: "path", attributes: { d: "M0 0 C1 2 3 4 5 6" } },
          { tag: "circle", attributes: { r: 1 } },
          text({}, ["   "]),
        ],
      },
    ]),
  );
  assert.deepEqual(result, {
    viewportFingerprint: sceneViewport.viewportFingerprint,
    minimumEffectiveFontSizePx: sceneViewport.minFontSizePx,
  });
});

test("font-metric-dependent glyph adjustment fails closed only when it applies to text", () => {
  for (const element of [
    text({ fontSize: 40, textLength: 1, lengthAdjust: "spacingAndGlyphs" }),
    text({ fontSize: 40, textLength: 1, lengthAdjust: "spacingAndGlyphs" }, [
      { tag: "tspan", attributes: { fontSize: 40 }, children: ["嵌套文字"] },
    ]),
  ]) {
    assert.throws(
      () => check(visual([element])),
      /readability-text-length.*font metrics/u,
    );
  }
  for (const attributes of [
    { fontSize: 40, textLength: 1 },
    { fontSize: 40, textLength: 1, lengthAdjust: "spacing" as const },
    { fontSize: 40, lengthAdjust: "spacingAndGlyphs" as const },
  ]) {
    assert.doesNotThrow(() => check(visual([text(attributes)])));
  }
  assert.doesNotThrow(() =>
    check(
      visual([
        text(
          { fontSize: 40, textLength: 1, lengthAdjust: "spacingAndGlyphs" },
          [
            {
              tag: "tspan",
              attributes: { textLength: 200, lengthAdjust: "spacing" },
              children: ["自己的字距调整"],
            },
          ],
        ),
      ]),
    ),
  );
});

test("non-finite cumulative text transforms fail closed without restricting shapes", () => {
  const transform = Array.from({ length: 16 }, () => "scale(1000000)").join(
    " ",
  );
  const nested = (child: SceneContinuityVisualElement) =>
    Array.from({ length: 4 }).reduce<SceneContinuityVisualElement>(
      (value) => ({ tag: "g", attributes: { transform }, children: [value] }),
      child,
    );
  assert.throws(
    () => check(visual([nested(text({ fontSize: 40 }))])),
    /readability-transform/u,
  );
  assert.doesNotThrow(() =>
    check(visual([nested({ tag: "circle", attributes: { r: 1 } })])),
  );
});

test("the helper revalidates both frozen declarations before making a readability claim", () => {
  assert.throws(() =>
    validateSceneContinuityVisualReadability({
      visual: visual([text({ fontSize: 40 })]),
      sceneViewport: { ...sceneViewport, width: sceneViewport.width + 1 },
    }),
  );
  assert.throws(() =>
    validateSceneContinuityVisualReadability({
      visual: { ...visual([text({ fontSize: 40 })]), elements: [] },
      sceneViewport,
    }),
  );
});
