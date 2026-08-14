import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import test from "node:test";
import { Series } from "remotion";

import {
  BRAND_FOLLOW_PLAYBACK_RATE,
  FixedOutro,
  FIXED_OUTRO_BRAND_DURATION_IN_FRAMES,
  FIXED_OUTRO_CREDITS_DURATION_IN_FRAMES,
  FIXED_OUTRO_DURATION_IN_FRAMES,
  FIXED_OUTRO_MESSAGE,
  FixedOutroPropsSchema,
} from "../../src/remotion/runtime/fixed-outro";

test("FixedOutro preserves the approved ending statement and reading time", () => {
  assert.equal(
    FIXED_OUTRO_MESSAGE,
    "余于 AI 工程，实乃初探，皆在摸索之中。愿与同道者共研同进，或有所得，亦未可知。",
  );
  assert.equal(FIXED_OUTRO_CREDITS_DURATION_IN_FRAMES, 120);
  assert.equal(BRAND_FOLLOW_PLAYBACK_RATE, 1.5);
  assert.equal(FIXED_OUTRO_BRAND_DURATION_IN_FRAMES, 120);
  assert.equal(FIXED_OUTRO_DURATION_IN_FRAMES, 240);
});

test("FixedOutro validates references and orders credits before the brand scene", () => {
  const props = FixedOutroPropsSchema.parse({
    references: [
      {
        title: "Remotion documentation",
        url: "https://www.remotion.dev/docs/",
      },
    ],
  });
  const outro = FixedOutro(props);
  assert.ok(isValidElement<{ readonly children?: ReactNode }>(outro));
  assert.equal(outro.type, Series);
  const scenes = Children.toArray(outro.props.children);
  assert.equal(scenes.length, 2);
  assert.ok(isValidElement<{ readonly durationInFrames?: number }>(scenes[0]));
  assert.ok(isValidElement<{ readonly durationInFrames?: number }>(scenes[1]));
  assert.equal(
    scenes[0].props.durationInFrames,
    FIXED_OUTRO_CREDITS_DURATION_IN_FRAMES,
  );
  assert.equal(
    scenes[1].props.durationInFrames,
    FIXED_OUTRO_BRAND_DURATION_IN_FRAMES,
  );
  assert.throws(() =>
    FixedOutroPropsSchema.parse({
      references: [{ title: "Invalid", url: "file:///tmp/reference.md" }],
    }),
  );
});

test("FixedOutro accepts the render-safe eight-reference boundary", () => {
  const references = Array.from({ length: 8 }, (_, index) => ({
    title: `${index + 1} · ${"资料标题".repeat(39)}`,
    url: `https://example.com/${"a".repeat(220)}`,
  }));
  assert.equal(
    FixedOutroPropsSchema.parse({ references }).references.length,
    8,
  );
  assert.throws(() =>
    FixedOutroPropsSchema.parse({
      references: [...references, references[0]],
    }),
  );
  assert.throws(() =>
    FixedOutroPropsSchema.parse({
      references: [
        {
          title: "URL too long",
          url: `https://example.com/${"a".repeat(221)}`,
        },
      ],
    }),
  );
});

test("FixedOutro accepts an empty source-reference boundary", () => {
  assert.deepEqual(
    FixedOutroPropsSchema.parse({ references: [] }).references,
    [],
  );
  assert.doesNotThrow(() => FixedOutro({ references: [] }));
});
