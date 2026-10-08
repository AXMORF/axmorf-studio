import assert from "node:assert/strict";
import test from "node:test";
import {
  Children,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  VISUAL_THEME_PRESETS,
  VideoSourceReferencesSchema,
} from "@axmorf/studio/contracts";

import { SourceCreditsScene } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene";
import { AXMORF_SOURCE_FOLLOW_MESSAGE } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/content";
import { REFERENCE_CASES } from "../../proofs/scene-theme/source/matrix";

type ElementProps = Readonly<{
  children?: ReactNode;
  style?: CSSProperties;
  "data-source-credits-stage"?: string;
  "data-source-credits-message"?: boolean;
  "data-source-credits-heading"?: boolean;
  "data-source-credits-grid"?: boolean;
  "data-source-credits-page"?: number;
  "data-source-credits-pages"?: number;
  "data-source-credits-layout"?: string;
  "data-source-title"?: string;
  "data-source-url"?: string;
  "data-source-index"?: number;
}>;
const element = (node: unknown): ReactElement<ElementProps> => {
  assert.ok(isValidElement<ElementProps>(node));
  return node;
};
const children = (node: unknown) =>
  Children.toArray(element(node).props.children)
    .filter(isValidElement)
    .map(element);
const text = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<ElementProps>(node)) return "";
  return Children.toArray(node.props.children).map(text).join("");
};
const lineHeight = (node: ReactElement<ElementProps>) =>
  Number(node.props.style?.fontSize) * Number(node.props.style?.lineHeight);
const verticalPadding = (node: ReactElement<ElementProps>) => {
  const values = String(node.props.style?.padding ?? "0")
    .split(" ")
    .map(Number.parseFloat);
  return values[0] + (values[2] ?? values[0]);
};

// Calculate the visible tree's intrinsic height, including real title/URL lines
// and the tallest card in each row; this catches stacking beyond the viewport.
const requiredHeight = (root: ReactElement<ElementProps>) =>
  verticalPadding(root) +
  children(root).reduce((height, child) => {
    const style = child.props.style;
    let ownHeight: number;
    if (child.props["data-source-credits-message"]) {
      ownHeight = children(child).length * lineHeight(child);
    } else if (child.props["data-source-credits-grid"]) {
      const cards = children(child);
      if (cards.length === 0) {
        ownHeight = lineHeight(child);
      } else {
        const columns = String(style?.gridTemplateColumns).startsWith(
          "repeat(2",
        )
          ? 2
          : 1;
        const rowHeights: number[] = [];
        for (let index = 0; index < cards.length; index += columns) {
          rowHeights.push(
            Math.max(
              ...cards.slice(index, index + columns).map((card) => {
                const fields = children(card).map(
                  (field) =>
                    children(field).length * lineHeight(field) +
                    Number(field.props.style?.marginTop ?? 0),
                );
                return (
                  verticalPadding(card) +
                  (card.props.style?.border ? 2 : 1) +
                  (card.props.style?.display === "grid"
                    ? Math.max(...fields)
                    : fields.reduce((sum, value) => sum + value, 0))
                );
              }),
            ),
          );
        }
        ownHeight =
          rowHeights.reduce((sum, value) => sum + value, 0) +
          Number(style?.gap) * (rowHeights.length - 1);
      }
    } else {
      ownHeight = lineHeight(child);
    }
    return height + ownHeight + Number(style?.marginTop ?? 0);
  }, 0);

const maxReferences = VideoSourceReferencesSchema.parse(
  Array.from({ length: 8 }, (_, index) => ({
    title: `资料${String(index + 1).padStart(2, "0")}${"最长标题".repeat(39)}`,
    url: `https://example.com/${String(index + 1)}${"x".repeat(219)}`,
  })),
);

test("720p credits fit their 1100x540 viewport without a fake empty-reference card", () => {
  const root = element(
    SourceCreditsScene({
      width: 1100,
      height: 540,
      sceneFrame: 80,
      theme: VISUAL_THEME_PRESETS.dark,
      references: [],
    }),
  );
  assert.equal(root.props["data-source-credits-stage"], "combined");
  const message = children(root).find(
    (child) => child.props["data-source-credits-message"],
  );
  assert.ok(message);
  assert.equal(text(message), AXMORF_SOURCE_FOLLOW_MESSAGE);
  assert.match(text(root), /本期无外部资料引用/u);
  const grid = children(root).find(
    (child) => child.props["data-source-credits-grid"],
  );
  assert.ok(grid);
  assert.equal(children(grid).length, 0);
  assert.ok(requiredHeight(root) <= 540);
});

test("legacy 1100x270 credits use readable message and reference phases", () => {
  const props = {
    width: 1100,
    height: 270,
    theme: VISUAL_THEME_PRESETS.light,
    references: REFERENCE_CASES["one-long"],
  };
  const message = element(SourceCreditsScene({ ...props, sceneFrame: 40 }));
  const references = element(SourceCreditsScene({ ...props, sceneFrame: 80 }));
  assert.equal(message.props["data-source-credits-stage"], "message");
  assert.equal(references.props["data-source-credits-stage"], "references");
  assert.equal(text(message), AXMORF_SOURCE_FOLLOW_MESSAGE);
  assert.ok(requiredHeight(message) <= props.height);
  assert.ok(requiredHeight(references) <= props.height);
  assert.equal(children(message)[0].props.style?.fontSize, 48);
  const grid = children(references).find(
    (child) => child.props["data-source-credits-grid"],
  );
  assert.ok(grid);
  const [card] = children(grid);
  assert.equal(card.props["data-source-title"], props.references[0].title);
  assert.equal(card.props["data-source-url"], props.references[0].url);
  assert.match(text(card), /…/u);
});

test("dense reference labels fill one 720p phase or two legacy pages without tiny font", () => {
  assert.ok(
    maxReferences.every(
      (reference) =>
        reference.title.length === 160 && reference.url.length === 240,
    ),
  );
  for (const [height, expectedPages, expectedCards] of [
    [540, 1, 8],
    [270, 2, 4],
  ] as const) {
    const root = element(
      SourceCreditsScene({
        width: 1100,
        height,
        sceneFrame: 64,
        references: maxReferences,
        theme: VISUAL_THEME_PRESETS.dark,
      }),
    );
    assert.equal(root.props["data-source-credits-layout"], "list");
    assert.equal(root.props["data-source-credits-pages"], expectedPages);
    const grid = children(root).find(
      (child) => child.props["data-source-credits-grid"],
    );
    assert.ok(grid);
    assert.equal(children(grid).length, expectedCards);
    if (height === 270) {
      for (let sceneFrame = 54; sceneFrame < 104; sceneFrame++) {
        const page = element(
          SourceCreditsScene({
            width: 1100,
            height,
            sceneFrame,
            references: maxReferences,
            theme: VISUAL_THEME_PRESETS.dark,
          }),
        );
        assert.equal(
          page.props["data-source-credits-page"],
          sceneFrame < 79 ? 1 : 2,
        );
      }
    }
  }
});

test("widest ASCII titles and long source domains abbreviate within a legacy row", () => {
  const reference = VideoSourceReferencesSchema.parse([
    {
      title: "W".repeat(160),
      url: `https://${[63, 63, 63, 40].map((length) => "W".repeat(length)).join(".")}`,
    },
  ])[0];
  const root = element(
    SourceCreditsScene({
      width: 1100,
      height: 270,
      sceneFrame: 80,
      theme: VISUAL_THEME_PRESETS.dark,
      references: Array(8).fill(reference),
    }),
  );
  assert.ok(requiredHeight(root) <= 270);
  const grid = children(root).find(
    (child) => child.props["data-source-credits-grid"],
  );
  assert.ok(grid);
  for (const card of children(grid)) {
    assert.equal(card.props["data-source-title"], reference.title);
    assert.equal(card.props["data-source-url"], reference.url);
    for (const field of children(card)) assert.ok(text(field).endsWith("…"));
  }
});

for (const viewport of [
  { width: 1100, height: 540 },
  { width: 1100, height: 270 },
  { width: 900, height: 1740 },
  { width: 1740, height: 630 },
]) {
  for (const [name, references] of Object.entries({
    empty: [],
    long: REFERENCE_CASES["one-long"],
    mixed: REFERENCE_CASES["six-mixed"],
    maximum: maxReferences,
  })) {
    test(`${viewport.width}x${viewport.height} ${name} credits remain bounded and visit every source`, () => {
      const visited = new Set<number>();
      for (let sceneFrame = 0; sceneFrame < 120; sceneFrame++) {
        const root = element(
          SourceCreditsScene({
            ...viewport,
            sceneFrame,
            references,
            theme: VISUAL_THEME_PRESETS.dark,
          }),
        );
        assert.ok(
          requiredHeight(root) <= viewport.height,
          `Frame ${sceneFrame} needs ${requiredHeight(root)}px in ${viewport.height}px`,
        );
        assert.equal(
          root.props.style?.overflow,
          undefined,
          "Clipping must not be the layout fix",
        );
        const grid = children(root).find(
          (child) => child.props["data-source-credits-grid"],
        );
        if (!grid) continue;
        for (const card of children(grid)) {
          const index = card.props["data-source-index"];
          assert.equal(typeof index, "number");
          visited.add(index!);
          assert.equal(
            card.props["data-source-title"],
            references[index!].title,
          );
          assert.equal(card.props["data-source-url"], references[index!].url);
          for (const field of children(card)) {
            assert.equal(field.props.style?.fontSize, 36);
            for (const line of children(field))
              assert.equal(line.props.style?.whiteSpace, "nowrap");
          }
        }
      }
      assert.deepEqual(
        [...visited].sort((a, b) => a - b),
        references.map((_, index) => index),
      );
    });
  }
}
