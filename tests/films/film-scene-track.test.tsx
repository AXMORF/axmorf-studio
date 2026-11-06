import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";
import { FilmProvider } from "../../packages/studio/src/remotion/film/context";
import { FilmSceneTrack } from "../../packages/studio/src/remotion/film/FilmSceneTrack";
import {
  FILM_OVERLAY_TRANSITIONS,
  FILM_OVERLAP_TRANSITIONS,
  resolveFilmSceneTrack,
  type FilmScene,
} from "../../packages/studio/src/remotion/film/scene-track";
import { getProducerTransitionSfxRole } from "../../packages/studio/src/remotion/capabilities/sound/transition-sfx";
import { filmTrackFixture } from "./film-track-fixture";

const film = filmTrackFixture();
const scene = (
  id: string,
  from: string | number,
  enter?: FilmScene["enter"],
): FilmScene => ({
  id,
  from,
  enter,
  render: (f) => (
    <div>
      {id}:{f}
    </div>
  ),
});

test("sentence and numeric anchors agree; first scene fills lead-in and last fills tail", () => {
  const resolved = resolveFilmSceneTrack(film, [
    scene("a", "a"),
    scene("b", "b"),
    scene("c", 200),
  ]);
  assert.deepEqual(
    resolved.scenes.map(({ boundaryFrame, startFrame, endFrame }) => [
      boundaryFrame,
      startFrame,
      endFrame,
    ]),
    [
      [0, 0, 100],
      [100, 100, 200],
      [200, 200, 300],
    ],
  );
  assert.deepEqual(
    resolveFilmSceneTrack(film, [scene("only", "a")]).scenes.map(
      ({ startFrame, endFrame }) => [startFrame, endFrame],
    ),
    [[0, 300]],
  );
});

test("all overlap kinds center odd windows and compensate the total duration", () => {
  for (const kind of FILM_OVERLAP_TRANSITIONS) {
    const resolved = resolveFilmSceneTrack(film, [
      scene("a", 0),
      scene("b", 100, { kind, frames: 9 }),
      scene("c", 200, { kind, frames: 12 }),
    ]);
    assert.deepEqual(
      resolved.scenes.map(({ startFrame, endFrame, durationInFrames }) => [
        startFrame,
        endFrame,
        durationInFrames,
      ]),
      [
        [0, 105, 105],
        [96, 206, 110],
        [194, 300, 106],
      ],
    );
    assert.equal(
      resolved.scenes.reduce((sum, s) => sum + s.durationInFrames, 0) - 21,
      300,
    );
    assert.equal(resolved.durationInFrames, 300);
    assert.deepEqual(resolved.sfxCues[0], {
      frame: 100,
      sfx: getProducerTransitionSfxRole(kind),
      for: `Scene b: ${kind}`,
    });
  }
});

test("all overlays leave sequence lengths intact and produce centered windows", () => {
  for (const kind of FILM_OVERLAY_TRANSITIONS) {
    const resolved = resolveFilmSceneTrack(film, [
      scene("a", 0),
      scene("b", 100, { kind, frames: 9 }),
    ]);
    assert.deepEqual(
      resolved.scenes.map((s) => s.durationInFrames),
      [100, 200],
    );
    assert.deepEqual(resolved.scenes[1].enter, {
      kind,
      mode: "overlay",
      boundaryFrame: 100,
      startFrame: 96,
      endFrame: 105,
      frames: 9,
    });
  }
});

test("mixed overlays and overlap preserve every later boundary; optional sound override", () => {
  const result = resolveFilmSceneTrack(film, [
    scene("a", 0),
    scene("b", 100, { kind: "fade", frames: 20, sfx: false }),
    scene("c", 200, { kind: "flash", frames: 10, sfx: "whip" }),
  ]);
  assert.deepEqual(
    result.scenes.map((s) => [s.startFrame, s.endFrame]),
    [
      [0, 110],
      [90, 200],
      [200, 300],
    ],
  );
  assert.equal(result.sfxCues.length, 1);
  assert.equal(result.sfxCues[0].sfx, "whip");
});

test("invalid boundaries, IDs, durations, enter on first and oversized/colliding windows throw", () => {
  const bad = [
    [],
    [scene("a", 300)],
    [scene("a", -1)],
    [scene("a", 0.5)],
    [scene("a", "missing")],
    [scene("a", 0), scene("a", 100)],
    [scene("a", 100), scene("b", 99)],
    [scene("a", 0), scene("b", 0)],
    [scene("a", 0, { kind: "fade", frames: 10 })],
  ];
  for (const scenes of bad)
    assert.throws(() => resolveFilmSceneTrack(film, scenes));
  for (const frames of [0, -1, 0.5, 51, 1000])
    assert.throws(() =>
      resolveFilmSceneTrack(film, [
        scene("a", 0),
        scene("b", 100, { kind: "fade", frames }),
      ]),
    );
  assert.throws(() =>
    resolveFilmSceneTrack(film, [
      scene("a", 0),
      scene("b", 100, { kind: "fade", frames: 30 }),
      scene("c", 110, { kind: "flash", frames: 30 }),
    ]),
  );
});

test("existing preset SFX mappings are unchanged", () => {
  assert.deepEqual(
    [
      "editorial-fade",
      "directional-slide",
      "signal-wipe",
      "cinematic-film-burn",
    ].map((id) => getProducerTransitionSfxRole(id as "editorial-fade")),
    ["soft-whoosh", "directional-whoosh", "signal-sweep", "impact-bloom"],
  );
});

test("render receives zero through early overlap, then body-relative scene time", () => {
  const render = (frame: number) =>
    renderToStaticMarkup(
      <Internals.CanUseRemotionHooksProvider>
        <Internals.TimelineContext.Provider
          value={{
            frame: { test: frame },
            playing: false,
            rootId: "test",
            imperativePlaying: { current: false },
            audioAndVideoTags: { current: [] },
          }}
        >
          <Internals.CompositionManagerProvider
            onlyRenderComposition={null}
            currentCompositionMetadata={null}
            initialCanvasContent={{
              type: "composition",
              compositionId: "test",
            }}
            initialCompositions={[
              {
                id: "test",
                width: 1920,
                height: 1080,
                fps: 30,
                durationInFrames: 300,
                component: () => null,
                defaultProps: {},
                folderName: null,
                parentFolderName: null,
                nonce: [],
                schema: null,
                calculateMetadata: null,
                stack: null,
              },
            ]}
          >
            <FilmProvider runtime={film}>
              <FilmSceneTrack
                scenes={[
                  scene("a", 0),
                  scene("b", 100, { kind: "fade", frames: 10 }),
                  scene("c", 200),
                ]}
              />
            </FilmProvider>
          </Internals.CompositionManagerProvider>
        </Internals.TimelineContext.Provider>
      </Internals.CanUseRemotionHooksProvider>,
    );
  for (const frame of [95, 99, 100]) assert.match(render(frame), /b:0/u);
  assert.match(render(101), /b:1/u);
  assert.match(render(199), /b:99/u);
  assert.match(render(200), /c:0/u);
  assert.match(render(299), /c:99/u);
});
