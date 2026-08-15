import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "../../src/remotion/capabilities/story-bookends";

test("reusable bookend renderers remain visual-only", async () => {
  assert.equal(typeof AxmorfIntroScene, "function");
  assert.equal(typeof AxmorfOutroScene, "function");
  const sources = await Promise.all(
    [
      "../../src/remotion/capabilities/story-bookends/AxmorfIntroScene.tsx",
      "../../src/remotion/capabilities/story-bookends/AxmorfOutroScene.tsx",
      "../../src/remotion/capabilities/story-bookends/SourceCreditsScene.tsx",
      "../../src/remotion/capabilities/story-bookends/BrandFollowScene.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /@remotion\/media|<Audio\b|<Html5Audio\b|<OffthreadVideo\b/iu,
    );
  }
});
