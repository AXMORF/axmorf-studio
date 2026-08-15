import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "../../src/remotion/capabilities/scene-templates/axmorf";

test("reusable Scene template renderers remain visual-only", async () => {
  assert.equal(typeof AxmorfIntroScene, "function");
  assert.equal(typeof AxmorfOutroScene, "function");
  const sources = await Promise.all(
    [
      "../../src/remotion/capabilities/scene-templates/axmorf/AxmorfIntroScene.tsx",
      "../../src/remotion/capabilities/scene-templates/axmorf/AxmorfOutroScene.tsx",
      "../../src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene.tsx",
      "../../src/remotion/capabilities/scene-templates/axmorf/BrandFollowScene.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /@remotion\/media|<Audio\b|<Html5Audio\b|<OffthreadVideo\b/iu,
    );
  }
});
