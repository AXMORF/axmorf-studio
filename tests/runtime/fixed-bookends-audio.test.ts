import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "../../src/remotion/runtime/fixed-intro/FixedIntro.tsx",
  "../../src/remotion/runtime/fixed-outro/FixedOutro.tsx",
  "../../src/remotion/runtime/fixed-outro/SourceCreditsScene.tsx",
  "../../src/remotion/runtime/fixed-outro/BrandFollowScene.tsx",
] as const;

test("fixed intro and outro source graphs contain no audio mounts", async () => {
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /@remotion\/media|<Audio\b|<Html5Audio\b|<OffthreadVideo\b/iu,
    );
  }
});
