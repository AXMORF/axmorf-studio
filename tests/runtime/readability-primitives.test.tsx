import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveSceneReadabilityPolicy } from "../../src/contracts";
import {
  SceneSafeArea,
  SceneSvgText,
  SceneText,
} from "../../src/remotion/runtime/readability";

const policy = resolveSceneReadabilityPolicy({
  width: 1080,
  height: 1920,
});

test("readability text primitives consume the shared SceneSafeArea policy", () => {
  const markup = renderToStaticMarkup(
    <SceneSafeArea policy={policy}>
      <SceneText fontSizePx={36}>Readable HTML</SceneText>
      <svg>
        <SceneSvgText fontSizePx={36}>Readable SVG</SceneSvgText>
      </svg>
    </SceneSafeArea>,
  );
  assert.match(
    markup,
    new RegExp(`data-scene-safe-area="${policy.policyFingerprint}"`, "u"),
  );
  assert.match(markup, /font-size:36px/gu);
  assert.match(markup, /font-size="36"/gu);
});

test("controlled text cannot shrink below or escape the shared safe area", () => {
  assert.throws(
    () =>
      renderToStaticMarkup(
        <SceneSafeArea policy={policy}>
          <SceneText fontSizePx={35}>Too small</SceneText>
        </SceneSafeArea>,
      ),
    /35px.*36px/iu,
  );
  assert.throws(
    () => renderToStaticMarkup(<SceneText fontSizePx={36}>Outside</SceneText>),
    /inside SceneSafeArea/iu,
  );
});
