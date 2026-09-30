import assert from "node:assert/strict";
import test from "node:test";
import {
  Children,
  isValidElement,
  type CSSProperties,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VISUAL_THEME_PRESETS,
  VisualThemeSchema,
  type VisualTheme,
} from "@axmorf/studio/contracts";

import { AxmorfIntroScene } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfIntroScene";
import { BrandFollowScene } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/BrandFollowScene";
import { SourceCreditsScene } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene";
import { AXMORF_MARK_PATHS } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfBrand";

type Rgb = readonly [number, number, number];
const rgb = (value: string, under: Rgb): Rgb => {
  if (value.startsWith("#")) {
    const hex =
      value.length === 4
        ? value
            .slice(1)
            .split("")
            .map((part) => part + part)
            .join("")
        : value.slice(1);
    return [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    ) as unknown as Rgb;
  }
  const match = /^rgba?\(([^)]+)\)$/u.exec(value);
  assert.ok(match, `Unsupported test palette color ${value}`);
  const [red, green, blue, alpha = 1] = match[1].split(",").map(Number);
  return [red, green, blue].map(
    (part, index) => part * alpha + under[index] * (1 - alpha),
  ) as unknown as Rgb;
};
const luminance = (color: Rgb) =>
  color
    .map((part) => {
      const channel = part / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
const contrast = (foreground: Rgb, background: Rgb) => {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
};

type ElementProps = Readonly<{
  children?: ReactNode;
  color?: string;
  fill?: string;
  d?: string;
  stroke?: string;
  "aria-label"?: string;
  style?: CSSProperties;
}>;

// Evaluate the deterministic template tree, including its copied brand component,
// and verify the actual inherited foreground/backing colors rather than source spelling.
const checkVisibleContent = (
  node: ReactNode,
  background: Rgb,
  theme: VisualTheme,
  color = theme.primaryText,
): number => {
  if (!isValidElement<ElementProps>(node)) return 0;
  if (typeof node.type === "function") {
    return checkVisibleContent(
      (node.type as (props: ElementProps) => ReactNode)(node.props),
      background,
      theme,
      color,
    );
  }
  const { style, children, fill, d, stroke } = node.props;
  if (style?.background !== undefined || style?.backgroundColor !== undefined) {
    assert.match(
      node.props["aria-label"] ?? "",
      /^AXMORF 品牌关注状态：/u,
      "Only the follow button may draw a local filled surface",
    );
    assert.ok(
      [theme.primaryText, theme.accent].includes(String(style.background)),
      "The follow button must use the validated theme's inverse pair",
    );
    assert.equal(style.color, theme.background);
  }
  const nextBackground = style?.backgroundColor
    ? rgb(String(style.backgroundColor), background)
    : style?.background
      ? rgb(String(style.background), background)
      : background;
  const nextColor = String(style?.color ?? color);
  let checked = 0;
  const leaves = Children.toArray(children);
  if (
    leaves.some((child) => typeof child === "string" && child.trim().length > 0)
  ) {
    assert.ok(
      contrast(rgb(nextColor, nextBackground), nextBackground) >= 4.5,
      `Template text is unreadable on its composed backing: ${leaves.filter((child) => typeof child === "string").join("")}`,
    );
    checked += 1;
    if (
      leaves.some(
        (child) => typeof child === "string" && child.startsWith("https://"),
      )
    ) {
      assert.equal(nextColor, theme.secondaryText);
    }
    if (leaves.includes("本期参考资料")) {
      assert.equal(nextColor, theme.accent);
    }
  }
  if (
    node.type === "path" &&
    AXMORF_MARK_PATHS.includes(d as (typeof AXMORF_MARK_PATHS)[number])
  ) {
    const actualFill = fill === "currentColor" ? nextColor : fill;
    assert.ok(actualFill);
    assert.equal(actualFill, theme.primaryText);
    assert.ok(
      contrast(rgb(actualFill, nextBackground), nextBackground) >= 4.5,
      "Template brand mark is unreadable on its composed backing",
    );
    checked += 1;
  }
  if (node.type === "line") assert.equal(stroke, theme.accent);
  if (node.type === "path" && d?.startsWith("M2 1 L2 23")) {
    assert.equal(fill, theme.background);
    assert.equal(stroke, theme.primaryText);
  }
  return (
    checked +
    leaves.reduce<number>(
      (sum, child) =>
        sum + checkVisibleContent(child, nextBackground, theme, nextColor),
      0,
    )
  );
};

for (const viewport of [
  { width: 900, height: 1470 },
  { width: 1740, height: 630 },
]) {
  for (const [themeName, theme] of Object.entries({
    ...VISUAL_THEME_PRESETS,
    custom: VisualThemeSchema.parse({
      background: "#171b14",
      primaryText: "#fffff3",
      secondaryText: "#c0ccb1",
      accent: "#daeaa6",
    }),
  })) {
    test(`boundary semantic colors share the ${themeName} background in ${viewport.width}x${viewport.height}`, () => {
      for (const node of [
        AxmorfIntroScene({ ...viewport, sceneFrame: 59, theme }),
        SourceCreditsScene({
          ...viewport,
          sceneFrame: 90,
          theme,
          references: [{ title: "Source", url: "https://example.com" }],
        }),
        SourceCreditsScene({
          ...viewport,
          sceneFrame: 90,
          theme,
          references: Array.from({ length: 6 }, (_, index) => ({
            title: `Source ${index + 1}`,
            url: "https://example.com/reference",
          })),
        }),
        BrandFollowScene({ ...viewport, sceneFrame: 82, theme }),
        BrandFollowScene({ ...viewport, sceneFrame: 115, theme }),
      ]) {
        assert.ok(isValidElement<ElementProps>(node));
        assert.equal(
          node.props.style?.background,
          undefined,
          "Scene root must stay transparent",
        );
        assert.equal(
          node.props.style?.backgroundColor,
          undefined,
          "Scene root must stay transparent",
        );
        assert.ok(
          checkVisibleContent(node, rgb(theme.background, [0, 0, 0]), theme) >=
            3,
        );
        assert.ok(renderToStaticMarkup(node).length > 0);
      }
    });
  }
}
