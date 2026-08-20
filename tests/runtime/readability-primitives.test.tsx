import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveSceneReadabilityPolicy } from "../../src/contracts";
import {
  SceneBackground,
  SceneContentFrame,
  SceneSvgText,
  SceneText,
} from "../../src/remotion/runtime/readability";

const policy = resolveSceneReadabilityPolicy({
  width: 1080,
  height: 1920,
});

test("readability primitives enforce the frozen content frame and text minimum", () => {
  const markup = renderToStaticMarkup(
    <>
      <SceneBackground>
        <svg>
          <rect width="1080" height="1920" />
        </svg>
      </SceneBackground>
      <SceneContentFrame policy={policy}>
        <SceneText fontSizePx={36}>Readable HTML</SceneText>
        <svg>
          <SceneSvgText fontSizePx={36}>Readable SVG</SceneSvgText>
        </svg>
      </SceneContentFrame>
    </>,
  );
  assert.match(markup, /data-readability-background="full-bleed"/u);
  assert.match(markup, /top:90px;right:90px;bottom:360px;left:90px/u);
  assert.match(markup, /font-size:36px/gu);
  assert.match(markup, /font-size="36"/gu);
});

test("controlled text cannot shrink below the policy or escape its frame", () => {
  assert.throws(
    () =>
      renderToStaticMarkup(
        <SceneContentFrame policy={policy}>
          <SceneText fontSizePx={35}>Too small</SceneText>
        </SceneContentFrame>,
      ),
    /35px.*36px/iu,
  );
  assert.throws(
    () => renderToStaticMarkup(<SceneText fontSizePx={36}>Outside</SceneText>),
    /inside SceneContentFrame/iu,
  );
});
