import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";
import {
  SceneText,
  SceneViewport,
  SceneSlot,
  StoryVisualTrack,
  renderSceneRendererMount,
  resolveCaptionLayout,
  type SceneRendererMountProps,
  type SceneRendererProps,
} from "@axmorf/studio/remotion";
import { createAuthoredGroupedRuntimeFixture } from "../fixtures/scene/authored-grouped";

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

test("authored landscape and portrait Composition placement uses the full frame-safe viewport", () => {
  for (const dimensions of [
    { width: 1280, height: 720, viewportWidth: 1100, viewportHeight: 540 },
    { width: 1080, height: 1920, viewportWidth: 900, viewportHeight: 1740 },
  ]) {
    const authoredPolicy = resolveSceneReadabilityPolicy({
      ...dimensions,
      timingSource: "authored-frames",
    });
    const markup = renderToStaticMarkup(
      <SceneViewport policy={authoredPolicy}>
        <SceneText fontSizePx={36}>A visual film</SceneText>
      </SceneViewport>,
    );
    assert.match(
      markup,
      new RegExp(
        `position:absolute;top:90px;left:90px;width:${dimensions.viewportWidth}px;height:${dimensions.viewportHeight}px;overflow:hidden`,
        "u",
      ),
    );
    assert.throws(() =>
      renderToStaticMarkup(
        <SceneViewport policy={authoredPolicy}>
          <SceneText fontSizePx={35}>Still too small</SceneText>
        </SceneViewport>,
      ),
    );
  }
});

test("grouped authored Scene task and runtime share one local viewport across the Beat seam", () => {
  const fixture = createAuthoredGroupedRuntimeFixture();
  const viewport = resolveSceneViewport(fixture.readabilityPolicy);
  assert.deepEqual(fixture.task.sceneViewport, viewport);
  assert.equal(viewport.width, 592);
  assert.equal(viewport.height, 312);
  const Renderer = () => <div />;
  const rendererProps = {
    durationInFrames: 120,
    sceneBoundaryVersion: "scene-composition-boundary-v2",
    readabilityPolicy: fixture.readabilityPolicy,
  } as SceneRendererMountProps;
  const track = StoryVisualTrack({
    projection: fixture.storyVisual,
    registry: { [fixture.scenePackage.rendererBinding.rendererId]: Renderer },
    rendererPropsByMeaning: { "meaning-one": rendererProps },
  });
  assert.ok(isValidElement<{ children: ReactNode }>(track));
  assert.equal(
    Children.toArray(track.props.children).filter(
      (element) => isValidElement(element) && element.type === SceneSlot,
    ).length,
    1,
  );
  for (const sceneFrame of [59, 60]) {
    const mount = renderSceneRendererMount(Renderer, rendererProps, sceneFrame);
    assert.equal(mount.type, SceneViewport);
    assert.ok(isValidElement<SceneRendererProps>(mount.props.children));
    const props = mount.props.children.props;
    assert.equal(props.viewportWidth, fixture.task.sceneViewport.width);
    assert.equal(props.viewportHeight, fixture.task.sceneViewport.height);
    assert.equal(props.sceneFrame, sceneFrame);
    for (const fullFrameKey of [
      "width",
      "height",
      "readabilityPolicy",
      "sceneBoundaryVersion",
    ]) {
      assert.equal(fullFrameKey in props, false);
    }
  }
});

test("CaptionLayer rejects captions with an authored policy that reserves no caption band", () => {
  const authoredPolicy = resolveSceneReadabilityPolicy({
    width: 1280,
    height: 720,
    timingSource: "authored-frames",
  });
  assert.throws(
    () =>
      resolveCaptionLayout({
        width: authoredPolicy.width,
        height: authoredPolicy.height,
        safeAreaPx: authoredPolicy.captionSafeAreaPx,
        readabilityPolicy: authoredPolicy,
      }),
    /cannot render an authored-frame policy/u,
  );
});
