import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveSceneReadabilityPolicy } from "../../src/contracts";
import {
  SceneSafeArea,
  SceneText,
} from "../../src/remotion/runtime/readability";

const policy = resolveSceneReadabilityPolicy({ width: 1080, height: 1920 });

test("SceneSafeArea directly consumes the frozen geometry and text context", () => {
  const markup = renderToStaticMarkup(
    <SceneSafeArea policy={policy}>
      <SceneText fontSizePx={36}>Semantic content</SceneText>
    </SceneSafeArea>,
  );
  assert.match(markup, new RegExp(`data-scene-safe-area="${policy.policyFingerprint}"`, "u"));
  assert.match(markup, /position:absolute;inset:0;overflow:hidden/u);
  assert.match(markup, /clip-path:inset\(90px 90px 360px 90px\)/u);
  assert.doesNotMatch(markup, /top:90px;right:90px;bottom:360px;left:90px/u);
  assert.match(markup, /font-size:36px/u);
});

test("SceneSafeArea rejects stale dimensions and keeps the frozen minimum", () => {
  assert.throws(() =>
    renderToStaticMarkup(
      <SceneSafeArea policy={{ ...policy, width: 1920 }}>
        <span>bad</span>
      </SceneSafeArea>,
    ),
  );
  assert.throws(() =>
    renderToStaticMarkup(
      <SceneSafeArea policy={policy}>
        <SceneText fontSizePx={35}>Too small</SceneText>
      </SceneSafeArea>,
    ),
  );
});
