import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildAuthoringRequirements,
  buildProjectSoundPlan,
  buildSilentScenePreset,
  computeSceneReadabilityPolicyFingerprint,
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
  SCENE_COMPOSITION_BOUNDARY_VERSION,
  SceneReadabilityPolicySchema,
  SceneViewportSchema,
  computeSceneViewportFingerprint,
  StoryBeatSchema,
  validateStoryCaptionReadability,
} from "@axmorf/studio/contracts";
import {
  renderSceneRendererMount,
  SceneTextSafeArea,
  SceneText,
  SceneViewport,
  type SceneRendererMountProps,
  type SceneRendererProps,
} from "@axmorf/studio/remotion";
import { validProjectCreateInput } from "../fixtures/project-create";
import { createAuthoredGroupedRuntimeFixture } from "../fixtures/scene/authored-grouped";

const boundary = StoryBeatSchema.parse({
  kind: "silent-scene",
  meaningId: "outro",
  narrativePurpose: "Keep the existing boundary geometry.",
  preset: buildSilentScenePreset({
    presetId: "brand-ending",
    durationInFrames: 240,
    visualIntent: "Existing brand ending.",
    soundIntent: "Keep its sound.",
    resourceIds: [],
    implementation: {
      kind: "template-copy",
      templateId: "brand-ending",
      templateFingerprint: `sha256:${"a".repeat(64)}`,
      instanceFingerprint: `sha256:${"b".repeat(64)}`,
      rendererSourceFingerprint: `sha256:${"c".repeat(64)}`,
      soundCues: [],
    },
  }),
});

test("full-frame art retains independent text/caption margins and boundary geometry", () => {
  for (const timingSource of ["sealed-narration", "authored-frames"] as const) {
    const input = { width: 1080, height: 1920, timingSource };
    const legacy = resolveSceneReadabilityPolicy(input);
    const policy = resolveSceneReadabilityPolicy({
      ...input,
      canvasMode: "full-frame",
    });
    assert.equal(policy.policyVersion, 3);
    assert.deepEqual(
      policy.sceneContentSafeAreaPx,
      legacy.sceneContentSafeAreaPx,
    );
    assert.deepEqual(policy.captionPolicy, legacy.captionPolicy);
    const viewport = resolveSceneViewport(policy);
    assert.equal(viewport.schemaVersion, 2);
    assert.equal(viewport.width, 1080);
    assert.equal(viewport.height, 1920);
    assert.equal(viewport.coordinateSpace, "scene-full-frame");
    assert.ok(viewport.schemaVersion === 2);
    assert.deepEqual(viewport.textSafeArea, legacy.sceneContentSafeAreaPx);
    assert.deepEqual(
      resolveSceneViewport(policy, boundary),
      resolveSceneViewport(legacy),
    );
    assert.deepEqual(SceneReadabilityPolicySchema.parse(policy), policy);
  }
});

test("Scene art reaches the canvas edges while text occupies only its protected rectangle", () => {
  const policy = resolveSceneReadabilityPolicy({
    width: 1080,
    height: 1920,
    canvasMode: "full-frame",
  });
  const markup = renderToStaticMarkup(
    <SceneViewport policy={policy}>
      <svg width={1080} height={1920}>
        <rect width={1080} height={1920} fill="#185442" />
      </svg>
      <SceneTextSafeArea>
        <SceneText fontSizePx={36}>Readable foreground</SceneText>
      </SceneTextSafeArea>
    </SceneViewport>,
  );
  assert.match(
    markup,
    /top:0;left:0;width:1080px;height:1920px;overflow:hidden/u,
  );
  assert.match(markup, /data-scene-text-safe-area="true"/u);
  assert.match(
    markup,
    /top:90px;left:90px;width:900px;height:1470px;overflow:hidden/u,
  );
  assert.ok(
    markup.indexOf("<svg") < markup.indexOf("data-scene-text-safe-area"),
  );
  assert.throws(
    () => renderToStaticMarkup(<SceneTextSafeArea>Outside</SceneTextSafeArea>),
    /SceneViewport/u,
  );
});

test("legacy text wrapper has no second inset and full-frame viewport rejects invalid text bounds", () => {
  const legacy = resolveSceneReadabilityPolicy({ width: 1080, height: 1920 });
  const markup = renderToStaticMarkup(
    <SceneViewport policy={legacy}>
      <SceneTextSafeArea>Legacy</SceneTextSafeArea>
    </SceneViewport>,
  );
  assert.match(
    markup,
    /data-scene-text-safe-area="true" style="position:absolute;top:0;left:0;width:900px;height:1470px;overflow:hidden/u,
  );
  const viewport = resolveSceneViewport(
    resolveSceneReadabilityPolicy({
      width: 1080,
      height: 1920,
      canvasMode: "full-frame",
    }),
  );
  const invalid = {
    ...viewport,
    textSafeArea: { top: 90, right: 900, bottom: 360, left: 900 },
  };
  assert.equal(
    SceneViewportSchema.safeParse({
      ...invalid,
      viewportFingerprint: computeSceneViewportFingerprint(invalid),
    }).success,
    false,
  );
});

test("v3 renderer mounts keep body art full-frame and template playback in its original viewport", () => {
  assert.ok(boundary.kind === "silent-scene");
  assert.ok(boundary.preset.implementation.kind === "template-copy");
  const excerpt = StoryBeatSchema.parse({
    ...boundary,
    preset: buildSilentScenePreset({
      presetId: boundary.preset.presetId,
      durationInFrames: 75,
      visualIntent: boundary.preset.visualIntent,
      soundIntent: boundary.preset.soundIntent,
      resourceIds: boundary.preset.resourceIds,
      implementation: {
        ...boundary.preset.implementation,
        playbackWindow: {
          sourceDurationInFrames: 240,
          startFrame: 165,
          endFrame: 240,
        },
      },
    }),
  });
  const fixture = createAuthoredGroupedRuntimeFixture();
  const Renderer = ({
    sceneFrame,
    viewportWidth,
    viewportHeight,
  }: SceneRendererProps) => (
    <div
      data-source-frame={sceneFrame}
      data-renderer-size={`${viewportWidth}x${viewportHeight}`}
    >
      <SceneTextSafeArea>
        <SceneText fontSizePx={36}>Frozen text margins</SceneText>
      </SceneTextSafeArea>
    </div>
  );
  for (const timingSource of ["sealed-narration", "authored-frames"] as const) {
    const policy = resolveSceneReadabilityPolicy({
      width: 1080,
      height: 1920,
      timingSource,
      canvasMode: "full-frame",
    });
    const safeHeight = timingSource === "sealed-narration" ? 1470 : 1740;
    const body =
      timingSource === "sealed-narration"
        ? StoryBeatSchema.parse(validProjectCreateInput.story.beats[0])
        : fixture.task.storyBeat;
    for (const storyBeat of [body, excerpt]) {
      const template = storyBeat === excerpt;
      const rendererProps: SceneRendererMountProps = {
        storyId: fixture.projectSource.story.storyId,
        meaningId: storyBeat.meaningId,
        durationInFrames: 75,
        fps: 30,
        storyBeat,
        sourceReferences: [],
        timingBeat: { startFrame: 0, endFrame: 75 },
        visualStyle: fixture.visualStyle,
        visualPlan: fixture.visual,
        shots: fixture.shots,
        syncAnchors: fixture.anchors,
        readabilityPolicy: policy,
        sceneBoundaryVersion: SCENE_COMPOSITION_BOUNDARY_VERSION,
        visualResources: [],
      };
      for (const frame of [0, 37, 74]) {
        const mounted = renderSceneRendererMount(
          Renderer,
          rendererProps,
          frame,
        );
        assert.equal(mounted.type, SceneViewport);
        assert.equal(mounted.props.storyBeat, storyBeat);
        assert.ok(isValidElement<SceneRendererProps>(mounted.props.children));
        const props = mounted.props.children.props;
        assert.equal(props.sceneFrame, frame + (template ? 165 : 0));
        assert.equal(props.durationInFrames, 75);
        assert.equal(props.viewportWidth, template ? 900 : 1080);
        assert.equal(props.viewportHeight, template ? safeHeight : 1920);
        const markup = renderToStaticMarkup(mounted);
        assert.ok(
          markup.includes(
            template
              ? `top:90px;left:90px;width:900px;height:${safeHeight}px;overflow:hidden`
              : "top:0;left:0;width:1080px;height:1920px;overflow:hidden",
          ),
        );
        assert.ok(
          markup.includes(
            template
              ? `data-scene-text-safe-area="true" style="position:absolute;top:0;left:0;width:900px;height:${safeHeight}px;overflow:hidden`
              : `data-scene-text-safe-area="true" style="position:absolute;top:90px;left:90px;width:900px;height:${safeHeight}px;overflow:hidden`,
          ),
        );
      }
    }
  }
});

test("v3 derived fields reject recomputed-fingerprint tampering and no-caption policies reject narrated Stories", () => {
  const fixture = createAuthoredGroupedRuntimeFixture();
  for (const options of [
    {},
    { timingSource: "authored-frames" as const },
    { captionMode: "none" as const },
  ]) {
    const policy = resolveSceneReadabilityPolicy({
      width: 1080,
      height: 1920,
      canvasMode: "full-frame",
      ...options,
    });
    assert.ok(policy.policyVersion === 3);
    for (const patch of [
      { sceneBottomInsetPx: 89 },
      {
        sceneContentSafeAreaPx: {
          ...policy.sceneContentSafeAreaPx,
          bottom: 89,
        },
      },
      { typographyPolicy: { minFontSizePx: 35 } },
      { captionPolicy: { ...policy.captionPolicy, captionFontSizePx: 39 } },
    ]) {
      const tampered = { ...policy, ...patch };
      const parsed = SceneReadabilityPolicySchema.safeParse({
        ...tampered,
        policyFingerprint: computeSceneReadabilityPolicyFingerprint(tampered),
      });
      assert.equal(parsed.success, false);
    }
    if (policy.captionBand === "reserved") {
      assert.equal(
        validateStoryCaptionReadability({
          story: validProjectCreateInput.story,
          policy,
        }).length,
        1,
      );
      assert.throws(
        () =>
          validateStoryCaptionReadability({
            story: fixture.projectSource.story,
            policy,
          }),
        /caption reservation.*Story narration/u,
      );
    } else {
      assert.throws(
        () =>
          validateStoryCaptionReadability({
            story: validProjectCreateInput.story,
            policy,
          }),
        /caption reservation.*Story narration/u,
      );
      assert.deepEqual(
        validateStoryCaptionReadability({
          story: fixture.projectSource.story,
          policy,
        }),
        [],
      );
    }
  }
  assert.notEqual(fixture.projectSource.narration, null);
  const requirements = buildAuthoringRequirements({
    source: {
      ...fixture.projectSource,
      projectSound: buildProjectSoundPlan({
        storyId: fixture.projectSource.story.storyId,
        contributions: [],
      }),
    },
    sourceChecksums: {
      videoBrief: `sha256:${"1".repeat(64)}`,
      storySpec: `sha256:${"2".repeat(64)}`,
      narrationSpec: `sha256:${"3".repeat(64)}`,
      renderSpec: `sha256:${"4".repeat(64)}`,
      projectSound: `sha256:${"5".repeat(64)}`,
    },
    ...validProjectCreateInput.production,
    readability: { edgeInsetPx: 24, canvasMode: "full-frame" },
  });
  assert.ok(requirements.readabilityPolicy.policyVersion === 3);
  assert.equal(requirements.readabilityPolicy.captionBand, "none");
  assert.notEqual(requirements.normalizedSummary.voiceProfileId, null);
});
