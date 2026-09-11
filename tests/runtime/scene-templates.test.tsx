import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  Children,
  isValidElement,
  type CSSProperties,
  type ReactNode,
} from "react";
import { VISUAL_THEME_PRESETS } from "@axmorf/studio/contracts";

import { AxmorfIntroScene, AxmorfOutroScene } from "@axmorf/studio/remotion";
import { BrandFollowScene } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/BrandFollowScene";
import { SourceCreditsScene } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene";
import { REFERENCE_CASES } from "../../proofs/scene-theme/source/matrix";

type StyledElement = Readonly<{ children?: ReactNode; style?: CSSProperties }>;
const styledElement = (node: unknown) => {
  assert.ok(isValidElement<StyledElement>(node));
  return node;
};
const styledChildren = (node: unknown) =>
  Children.toArray(styledElement(node).props.children).map(styledElement);
import { resolveBrandFollowLockupLayout } from "@axmorf/studio/remotion";
import {
  SCENE_TEMPLATE_DEFINITIONS,
  renderCopiedSceneRenderer,
} from "@axmorf/studio/remotion";

test("reusable Scene template renderers remain visual-only", async () => {
  assert.equal(typeof AxmorfIntroScene, "function");
  assert.equal(typeof AxmorfOutroScene, "function");
  const sources = await Promise.all(
    [
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfIntroScene.tsx",
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfOutroScene.tsx",
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene.tsx",
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/BrandFollowScene.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /@remotion\/media|<Audio\b|<Html5Audio\b|<OffthreadVideo\b/iu,
    );
  }
});

test("copied Scene template renderers adapt the local SceneViewport to template dimensions", () => {
  for (const definition of SCENE_TEMPLATE_DEFINITIONS) {
    const source = renderCopiedSceneRenderer(definition);
    assert.match(source, /viewportWidth: number;/u);
    assert.match(source, /viewportHeight: number;/u);
    assert.match(source, /width=\{viewportWidth\}/u);
    assert.match(source, /height=\{viewportHeight\}/u);
    assert.match(source, /visualStyle: Readonly<\{theme\?: VisualTheme\}>/u);
    assert.match(source, /const theme = visualStyle.theme;/u);
    assert.match(source, /theme=\{theme\}/u);
    assert.match(source, /if \(theme === undefined\) \{\n {4}throw new Error/u);
    assert.doesNotMatch(source, /\n {2}width: number;/u);
    assert.doesNotMatch(source, /\n {2}height: number;/u);
  }
});

test("outro brand lockup stays centered in portrait and landscape viewports", () => {
  for (const viewport of [
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
  ]) {
    const layout = resolveBrandFollowLockupLayout(viewport);
    assert.equal(
      layout.lockupLeft + layout.lockupWidth / 2,
      viewport.width / 2,
    );
    assert.equal(
      layout.markCenteredLeft + layout.markSize / 2,
      layout.lockupWidth / 2,
    );
    assert.ok(layout.lockupLeft >= 0);
    assert.ok(layout.lockupLeft + layout.lockupWidth <= viewport.width);
  }
});

test("the original full-size outro logo is clipped only at the Scene viewport", () => {
  for (const viewport of [
    { width: 900, height: 1470 },
    { width: 1740, height: 630 },
  ]) {
    const layout = resolveBrandFollowLockupLayout(viewport);
    const root = BrandFollowScene({
      ...viewport,
      sceneFrame: 0,
      theme: VISUAL_THEME_PRESETS.light,
    });
    assert.ok(isValidElement<StyledElement>(root));
    const lockup = Children.toArray(root.props.children)[0];
    assert.ok(isValidElement<StyledElement>(lockup));
    assert.equal(lockup.props.style?.overflow, undefined);
    assert.equal(lockup.props.style?.height, layout.markSize);
    assert.equal(lockup.props.style?.width, layout.lockupWidth);
    assert.equal(lockup.props.style?.left, layout.lockupLeft);
    const mark = Children.toArray(lockup.props.children)[0];
    assert.ok(isValidElement<StyledElement>(mark));
    const maximumSize = layout.markSize * (layout.isLandscape ? 6.4 : 7.2);
    assert.equal(mark.props.style?.width, maximumSize);
    assert.equal(mark.props.style?.height, maximumSize);
    assert.equal(
      Number(lockup.props.style?.left) +
        Number(mark.props.style?.left) +
        maximumSize / 2,
      viewport.width / 2,
    );
    assert.equal(
      Number(lockup.props.style?.top) +
        Number(mark.props.style?.top) +
        maximumSize / 2,
      viewport.height * (layout.isLandscape ? 0.42 : 0.39),
    );
  }
});

test("intro preserves the construction reveal and settles on the original lockup", () => {
  for (const viewport of [
    { width: 900, height: 1470 },
    { width: 1740, height: 630 },
  ]) {
    const markSize =
      Math.min(viewport.width, viewport.height) *
      (viewport.width > viewport.height ? 0.34 : 0.4);
    for (const sceneFrame of [0, 59]) {
      const [lockup] = styledChildren(
        AxmorfIntroScene({
          ...viewport,
          sceneFrame,
          theme: VISUAL_THEME_PRESETS.dark,
        }),
      );
      const [mark, wordmark] = styledChildren(lockup);
      const [guides, logo] = styledChildren(mark);
      assert.equal(guides.props.style?.opacity, sceneFrame === 0 ? 0.54 : 0);
      assert.equal(
        logo.props.style?.width,
        markSize * (sceneFrame === 0 ? 1.45 : 1),
      );
      for (const path of styledChildren(logo)) {
        assert.equal(path.props.style?.opacity, sceneFrame === 0 ? 0 : 1);
        assert.equal(
          path.props.style?.filter,
          sceneFrame === 0 ? "blur(7px)" : "blur(0px)",
        );
      }
      assert.equal(
        wordmark.props.style?.fontFamily,
        "Inter, Arial, ui-sans-serif, sans-serif",
      );
      for (const character of styledChildren(wordmark)) {
        assert.equal(character.props.style?.opacity, sceneFrame === 0 ? 0 : 1);
        assert.equal(character.props.style?.top, sceneFrame === 0 ? 18 : 0);
      }
    }
  }
});

test("outro keeps its shrink, horizontal lockup, follow click, and stable final frame", () => {
  for (const viewport of [
    { width: 900, height: 1470 },
    { width: 1740, height: 630 },
  ]) {
    const layout = resolveBrandFollowLockupLayout(viewport);
    for (const [sceneFrame, expectedLeft] of [
      [40 / 1.5, layout.markCenteredLeft],
      [68 / 1.5, 0],
      [119, 0],
    ]) {
      const [lockup] = styledChildren(
        BrandFollowScene({
          ...viewport,
          sceneFrame,
          theme: VISUAL_THEME_PRESETS.dark,
        }),
      );
      const [mark, wordmark] = styledChildren(lockup);
      assert.equal(mark.props.style?.width, layout.markSize);
      assert.equal(mark.props.style?.height, layout.markSize);
      assert.equal(mark.props.style?.left, expectedLeft);
      assert.equal(mark.props.style?.top, 0);
      assert.equal(
        wordmark.props.style?.left,
        layout.markSize + layout.lockupGap,
      );
      if (sceneFrame === 119) {
        for (const character of styledChildren(wordmark)) {
          assert.equal(character.props.style?.opacity, 1);
          assert.equal(character.props.style?.translate, "0px 0");
        }
      }
    }
    for (const [sceneFrame, label] of [
      [94, "+ 关注 AXMORF"],
      [100, "✓ 已关注"],
    ] as const) {
      const [, button] = styledChildren(
        BrandFollowScene({
          ...viewport,
          sceneFrame,
          theme: VISUAL_THEME_PRESETS.dark,
        }),
      );
      assert.equal(button.props.children, label);
      assert.equal(button.props.style?.opacity, 1);
    }
    const [, , cursor] = styledChildren(
      BrandFollowScene({
        ...viewport,
        sceneFrame: 119,
        theme: VISUAL_THEME_PRESETS.dark,
      }),
    );
    assert.equal(cursor.props.style?.opacity, 0);
  }
});

test("source fade hands the same theme to the brand at the fixed frame-120 boundary", () => {
  const viewport = { width: 1740, height: 630 };
  const theme = VISUAL_THEME_PRESETS.dark;
  const references = Array.from({ length: 6 }, (_, index) => ({
    title: `Source ${index + 1}`,
    url: "https://example.com",
  }));
  const credits = styledElement(
    SourceCreditsScene({ ...viewport, sceneFrame: 104, references, theme }),
  );
  assert.equal(credits.props.style?.opacity, 1);
  assert.equal(credits.props.style?.padding, "12px 128px");
  const [message, heading, grid] = styledChildren(credits);
  assert.equal(message.props.style?.lineHeight, 1.1);
  assert.equal(heading.props.style?.marginTop, 8);
  assert.equal(
    grid.props.style?.gridTemplateColumns,
    "repeat(2, minmax(0, 1fr))",
  );
  assert.equal(grid.props.style?.marginTop, 8);
  assert.equal(styledChildren(grid).length, 6);
  assert.equal(
    styledElement(
      SourceCreditsScene({ ...viewport, sceneFrame: 119, references, theme }),
    ).props.style?.opacity,
    0,
  );
  for (const sceneFrame of [119, 120, 239]) {
    const outro = AxmorfOutroScene({
      ...viewport,
      sceneFrame,
      sourceReferences: references,
      theme,
    });
    assert.ok(
      isValidElement<{ sceneFrame: number; theme: typeof theme }>(outro),
    );
    assert.equal(
      outro.type,
      sceneFrame < 120 ? SourceCreditsScene : BrandFollowScene,
    );
    assert.equal(
      outro.props.sceneFrame,
      sceneFrame < 120 ? sceneFrame : sceneFrame - 120,
    );
    assert.equal(outro.props.theme, theme);
  }
});

test("follow labels stay on one line inside the centered button at the original font size", () => {
  for (const viewport of [
    { width: 900, height: 1470 },
    { width: 1740, height: 630 },
  ]) {
    for (const theme of Object.values(VISUAL_THEME_PRESETS)) {
      for (const [sceneFrame, label] of [
        [94, "+ 关注 AXMORF"],
        [100, "✓ 已关注"],
      ] as const) {
        const [, button] = styledChildren(
          BrandFollowScene({ ...viewport, theme, sceneFrame }),
        );
        const style = button.props.style;
        assert.equal(button.props.children, label);
        assert.equal(style?.fontSize, 36);
        assert.equal(style?.whiteSpace, "nowrap");
        // The 310px portrait button already holds this exact label in the real
        // proof font; landscape must provide at least that measured capacity.
        assert.ok(Number(style?.width) >= 310);
        assert.equal(
          Number(style?.left) + Number(style?.width) / 2,
          viewport.width / 2,
        );
        assert.equal(style?.height, viewport.width > viewport.height ? 74 : 84);
      }
    }
  }
});

test("six mixed references reserve enough height for the observed wrapped rows in the landscape safe viewport", () => {
  const viewport = { width: 1740, height: 630 };
  const root = styledElement(
    SourceCreditsScene({
      ...viewport,
      sceneFrame: 88,
      theme: VISUAL_THEME_PRESETS.dark,
      references: REFERENCE_CASES["six-mixed"],
    }),
  );
  const [message, heading, grid] = styledChildren(root);
  const cards = styledChildren(grid);
  assert.equal(cards.length, 6);
  const verticalPadding = (style?: CSSProperties) => {
    const values = String(style?.padding ?? "0")
      .split(" ")
      .map(Number.parseFloat);
    return values[0] + (values[2] ?? values[0]);
  };
  // The failure still renders five text lines in row one and two in each later
  // row. Preserve that real wrapping budget; rendered proof remains the visual gate.
  const observedLineCounts = [5, 2, 2, 2, 2, 2];
  const cardHeights = cards.map((card, index) => {
    const [title, url] = styledChildren(card);
    assert.equal(
      title.props.children,
      REFERENCE_CASES["six-mixed"][index].title,
    );
    assert.equal(url.props.children, REFERENCE_CASES["six-mixed"][index].url);
    assert.equal(title.props.style?.fontSize, 36);
    assert.equal(url.props.style?.fontSize, 36);
    return (
      observedLineCounts[index] *
        36 *
        Number(card.props.style?.lineHeight ?? 1.2) +
      Number(url.props.style?.marginTop) +
      verticalPadding(card.props.style) +
      2
    );
  });
  const requiredHeight =
    verticalPadding(root.props.style) +
    styledChildren(message).length *
      48 *
      Number(message.props.style?.lineHeight) +
    Number(heading.props.style?.marginTop) +
    36 * Number(heading.props.style?.lineHeight ?? 1.2) +
    Number(grid.props.style?.marginTop) +
    Math.max(cardHeights[0], cardHeights[1]) +
    Math.max(cardHeights[2], cardHeights[3]) +
    Math.max(cardHeights[4], cardHeights[5]) +
    Number(grid.props.style?.gap) * 2;
  assert.ok(
    requiredHeight <= viewport.height,
    `Reference layout requires ${requiredHeight}px but viewport has ${viewport.height}px`,
  );
});

test("a single long reference uses the complete available landscape width", () => {
  const root = SourceCreditsScene({
    width: 1740,
    height: 630,
    sceneFrame: 88,
    theme: VISUAL_THEME_PRESETS.dark,
    references: REFERENCE_CASES["one-long"],
  });
  const [, , grid] = styledChildren(root);
  assert.equal(grid.props.style?.gridTemplateColumns, "minmax(0, 1fr)");
  const [[title, url]] = styledChildren(grid).map(styledChildren);
  assert.equal(title.props.children, REFERENCE_CASES["one-long"][0].title);
  assert.equal(url.props.children, REFERENCE_CASES["one-long"][0].url);
});
