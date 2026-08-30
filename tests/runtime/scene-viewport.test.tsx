import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";
import {
  SceneText,
  SceneViewport,
} from "@axmorf/studio/remotion";

const policy = resolveSceneReadabilityPolicy({ width: 1080, height: 1920 });
const viewport = resolveSceneViewport(policy);

test("SceneViewport gives Scene content a safe-area-local coordinate system", () => {
  assert.equal(viewport.width, 900);
  assert.equal(viewport.height, 1470);
  const markup = renderToStaticMarkup(
    <SceneViewport policy={policy}>
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <SceneText fontSizePx={36}>Semantic content</SceneText>
      </div>
    </SceneViewport>,
  );
  assert.match(
    markup,
    new RegExp(`data-scene-viewport="${viewport.viewportFingerprint}"`, "u"),
  );
  assert.match(
    markup,
    /data-scene-viewport-coordinate-space="scene-safe-area-local"/u,
  );
  assert.match(
    markup,
    /position:absolute;top:90px;left:90px;width:900px;height:1470px;overflow:hidden/u,
  );
  assert.doesNotMatch(markup, /clip-path|transform|inset:0/u);
  assert.match(markup, /position:absolute;left:0;top:0/u);
});

test("SceneViewport rejects stale policy geometry and keeps the frozen minimum", () => {
  assert.throws(() =>
    renderToStaticMarkup(
      <SceneViewport policy={{ ...policy, width: 1920 }}>
        <span>bad</span>
      </SceneViewport>,
    ),
  );
  assert.throws(() =>
    renderToStaticMarkup(
      <SceneViewport policy={policy}>
        <SceneText fontSizePx={35}>Too small</SceneText>
      </SceneViewport>,
    ),
  );
});
