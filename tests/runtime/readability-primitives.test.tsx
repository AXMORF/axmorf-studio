import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";
import {
  SceneViewport,
  SceneSvgText,
  SceneText,
} from "@axmorf/studio/remotion";

const policy = resolveSceneReadabilityPolicy({
  width: 1080,
  height: 1920,
});

test("readability text primitives consume the shared SceneViewport policy", () => {
  const markup = renderToStaticMarkup(
    <SceneViewport policy={policy}>
      <SceneText fontSizePx={36}>Readable HTML</SceneText>
      <svg>
        <SceneSvgText fontSizePx={36}>Readable SVG</SceneSvgText>
      </svg>
    </SceneViewport>,
  );
  assert.match(
    markup,
    new RegExp(
      `data-scene-viewport="${resolveSceneViewport(policy).viewportFingerprint}"`,
      "u",
    ),
  );
  assert.match(markup, /font-size:36px/gu);
  assert.match(markup, /font-size="36"/gu);
});

test("controlled text cannot shrink below or escape the shared safe area", () => {
  assert.throws(
    () =>
      renderToStaticMarkup(
        <SceneViewport policy={policy}>
          <SceneText fontSizePx={35}>Too small</SceneText>
        </SceneViewport>,
      ),
    /35px.*36px/iu,
  );
  assert.throws(
    () => renderToStaticMarkup(<SceneText fontSizePx={36}>Outside</SceneText>),
    /inside SceneViewport/iu,
  );
});
