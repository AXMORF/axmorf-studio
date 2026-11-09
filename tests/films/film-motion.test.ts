import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  FILM_REVIEW_MOTION_MARKER,
  FilmMotionReviewSchema,
  type FilmReviewMotion,
  type FilmMotionCurve,
} from "@axmorf/studio/contracts";
import {
  analyzeMotion,
  buildMotionCurve,
  compositionSegments,
  MOTION_COMPOSITION_DIFFERENCE,
  extractMotionMeasurements,
  scanLegacyMotionAudio,
  selectDenseMotionFrames,
  MOTION_DENSE_MAX_FRAMES,
} from "../../scripts/films/motion";
import { animaticReminder } from "../../scripts/films/motion-files";
import { parseFilmOptions } from "../../scripts/films/cli";

const curve: FilmMotionCurve = {
  fps: 30,
  sampleSeconds: 0.5,
  samples: [],
  seconds: [],
  cuts: [],
};
const record = (
  events: FilmReviewMotion["events"] = [],
  frame = 0,
  index = 0,
): FilmReviewMotion => ({ index, frame, events, truncated: false });
const scene = (
  id: string,
  boundaryFrame: number,
  endFrame: number,
  chapter: string | null = id,
  enter: null | {
    kind: string;
    mode: "overlay";
    startFrame: number;
    endFrame: number;
  } = null,
) => ({ id, boundaryFrame, endFrame, chapter, enter });
const track = (withTransition = false): FilmReviewMotion["events"][number] => ({
  type: "scene-track",
  scenes: [
    scene("a", 0, 150),
    scene(
      "b",
      150,
      1200,
      "b",
      withTransition
        ? { kind: "flash", mode: "overlay", startFrame: 145, endFrame: 155 }
        : null,
    ),
  ],
});
const analyze = (options: Partial<Parameters<typeof analyzeMotion>[0]> = {}) =>
  analyzeMotion({
    records: [record()],
    frames: [0],
    curve,
    durationInFrames: 1200,
    fps: 30,
    hasNarration: true,
    legacyAudio: false,
    music: null,
    stillWarnings: [],
    ...options,
  });
const has = (result: ReturnType<typeof analyze>, rule: string) =>
  result.motionWarnings.some((w) => w.rule === rule);

test("films without AxiomMorph emit neither warning nor unknown, regardless of speech or telemetry", () => {
  for (const hasNarration of [false, true]) {
    for (const records of [
      [record()],
      [],
      [{ ...record(), truncated: true }],
    ]) {
      const result = analyze({ records, hasNarration });
      assert.equal(has(result, "axiom-morph-missing"), false);
      assert.equal(
        result.unknown.some((u) => u.rule === "axiom-morph-missing"),
        false,
      );
    }
  }
});

test("AxiomMorph telemetry anywhere in the film suppresses the missing motif reminder", () => {
  const axiom = {
    type: "recipe",
    id: "AxiomMorph",
    anticipate: 60,
    move: 70,
    land: 106,
    settle: 123,
  } as const;
  const result = analyze({
    records: [record(), record([axiom], 120, 1)],
    frames: [0, 120],
  });
  assert.equal(has(result, "axiom-morph-missing"), false);
  assert.equal(
    result.unknown.some((u) => u.rule === "axiom-morph-missing"),
    false,
  );
  assert.ok(result.summary.recipeIds.includes("AxiomMorph"));
});

test("motion transport tolerates ANSI, tags, malformed JSON, schema errors and truncated lines", () => {
  const output = `\x1b[33m[Tab 0, review.tsx:1] ${FILM_REVIEW_MOTION_MARKER} ${JSON.stringify(record())}\x1b[0m\n${FILM_REVIEW_MOTION_MARKER} {\n${FILM_REVIEW_MOTION_MARKER} {}\nnoise`;
  const parsed = extractMotionMeasurements(output);
  assert.deepEqual(parsed.records, [record()]);
  assert.equal(parsed.badLines, 2);
  assert.equal(
    extractMotionMeasurements(
      `${FILM_REVIEW_MOTION_MARKER} ${JSON.stringify({ ...record(), truncated: true })}`,
    ).records[0].truncated,
    true,
  );
});

test("curve sums differences per second and keeps candidate-cut uncertainty intervals", () => {
  const result = buildMotionCurve(
    [
      { frame: 0, signature: new Uint8Array([0]) },
      { frame: 15, signature: new Uint8Array([2]) },
      { frame: 30, signature: new Uint8Array([100]) },
    ],
    30,
  );
  assert.deepEqual(result.seconds, [
    { second: 0, difference: 2 },
    { second: 1, difference: 98 },
  ]);
  assert.deepEqual(result.cuts, [
    { from: 15, to: 30, frame: 30, difference: 98 },
  ]);
});

test("enter-then-hold has positive, continuous-motion, short-scene and stillWarnings counterexamples", () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({
    frame: i * 15,
    difference: i > 0 && i < 5 ? 8 : 0.1,
  }));
  const options = { durationInFrames: 300, curve: { ...curve, samples } };
  assert.equal(has(analyze(options), "enter-then-hold"), true);
  assert.equal(
    has(
      analyze({
        ...options,
        curve: {
          ...curve,
          samples: samples.map((s) => ({ ...s, difference: 4 })),
        },
      }),
      "enter-then-hold",
    ),
    false,
  );
  assert.equal(
    has(analyze({ ...options, durationInFrames: 60 }), "enter-then-hold"),
    false,
  );
  assert.equal(
    has(
      analyze({ ...options, stillWarnings: [{ frames: [100, 200] }] }),
      "enter-then-hold",
    ),
    false,
  );
});

test("hard-cut-heavy distinguishes chapter hard cuts from transitions and continuous scenes", () => {
  assert.equal(
    has(analyze({ records: [record([track()])] }), "hard-cut-heavy"),
    true,
  );
  assert.equal(
    has(analyze({ records: [record([track(true)])] }), "hard-cut-heavy"),
    false,
  );
  assert.equal(
    has(
      analyze({
        records: [
          record([{ type: "scene-track", scenes: [scene("a", 0, 1200)] }]),
        ],
      }),
      "hard-cut-heavy",
    ),
    false,
  );
  assert.equal(
    has(
      analyze({
        curve: {
          ...curve,
          cuts: [
            { from: 15, to: 30, frame: 30, difference: 20 },
            { from: 60, to: 75, frame: 75, difference: 20 },
          ],
        },
      }),
      "hard-cut-heavy",
    ),
    true,
  );
});

test("no-sound-effects requires narration, >30s and zero cues; legacy audio is unknown", () => {
  assert.equal(has(analyze(), "no-sound-effects"), true);
  for (const options of [
    { durationInFrames: 900 },
    { hasNarration: false },
    {
      records: [
        record([
          {
            type: "sound-effects",
            cues: [{ frame: 10, endFrame: 15, sfx: "impact", for: "land" }],
          },
        ]),
      ],
    },
  ])
    assert.equal(has(analyze(options), "no-sound-effects"), false);
  const old = analyze({ legacyAudio: true });
  assert.equal(has(old, "no-sound-effects"), false);
  assert.ok(old.unknown.some((u) => u.rule === "no-sound-effects"));
});

test("legacy scan handles Audio, Html5Audio, aliases and shared staticFile, ignoring comments", () => {
  for (const source of [
    '<Audio src="x"/>',
    '<Html5Audio src="x"/>',
    'import {Audio as Clip} from "remotion"; <Clip/>',
    "<R.Audio/>",
    'staticFile("assets/axmorf-shared/audio/sound-effects/x.wav")',
    'import {staticFile as asset} from "remotion"; asset(`sound-effects/x.wav`)',
  ])
    assert.equal(scanLegacyMotionAudio([source]), true, source);
  assert.equal(
    scanLegacyMotionAudio([
      '// <Audio/>\nconst x="<Html5Audio/>"; <FilmSoundtrack/>',
    ]),
    false,
  );
});

test("off-beat-cuts uses exact boundaries and landings, accepts ±2 and skips approximate old cuts", () => {
  const music = {
    beatFrames: [0, 30, 60, 90, 120, 180, 210],
    accentFrames: [180],
  };
  assert.equal(
    has(analyze({ records: [record([track(true)])], music }), "off-beat-cuts"),
    true,
  );
  const onTrack = {
    type: "scene-track" as const,
    scenes: [scene("a", 0, 148), scene("b", 148, 1200)],
  };
  assert.equal(
    has(
      analyze({
        records: [record([onTrack])],
        music: { beatFrames: [0, 150, 300], accentFrames: [] },
      }),
      "off-beat-cuts",
    ),
    false,
  );
  const recipe = {
    type: "recipe" as const,
    id: "NumberRoll",
    anticipate: 0,
    move: 10,
    land: 67,
    settle: 90,
  };
  assert.equal(
    has(
      analyze({
        records: [
          record([
            { type: "scene-track", scenes: [scene("a", 0, 1200)] },
            recipe,
          ]),
        ],
        music,
      }),
      "off-beat-cuts",
    ),
    true,
  );
  assert.equal(
    has(analyze({ records: [record([track()])] }), "off-beat-cuts"),
    false,
  );
  const old = analyze({ music });
  assert.equal(has(old, "off-beat-cuts"), false);
  assert.ok(old.unknown.some((u) => u.rule === "off-beat-cuts"));
});

test("static-camera applies only to sampled chapters and accepts WorldCamera/presets", () => {
  assert.equal(
    has(analyze({ records: [record([track()])] }), "static-camera"),
    true,
  );
  for (const camera of [
    { type: "world-camera" as const, moving: true },
    {
      type: "recipe" as const,
      id: "CameraMove",
      preset: "push-in",
      anticipate: 0,
      move: 10,
      land: 30,
      settle: 45,
    },
  ])
    assert.equal(
      has(analyze({ records: [record([track(), camera])] }), "static-camera"),
      false,
    );
  for (const options of [
    {},
    {
      records: [
        record([
          { type: "scene-track" as const, scenes: [scene("a", 0, 1200, null)] },
        ]),
      ],
    },
  ]) {
    const old = analyze(options);
    assert.equal(has(old, "static-camera"), false);
    assert.ok(old.unknown.some((u) => u.rule === "static-camera"));
  }
});

test("missing and truncated motion telemetry produce unknown, not absence warnings", () => {
  for (const records of [[], [{ ...record([track()]), truncated: true }]]) {
    const result = analyze({
      records,
      music: { beatFrames: [0, 1200], accentFrames: [] },
    });
    assert.equal(has(result, "no-sound-effects"), false);
    assert.equal(has(result, "static-camera"), false);
    assert.equal(has(result, "off-beat-cuts"), false);
  }
  assert.deepEqual(
    analyze({ records: [record([], 10, 0)] }).missingFrames,
    [0],
  );
});

test("dense frames obey 6fps, 3s per range and total budget", () => {
  const warnings = Array.from({ length: 20 }, () => ({
    rule: "enter-then-hold" as const,
    frames: [0, 600] as [number, number],
    message: "test",
  }));
  const ranges = selectDenseMotionFrames(warnings, 30);
  assert.equal(ranges.length, 6);
  assert.deepEqual(
    ranges[0].frames,
    [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85],
  );
  assert.equal(
    ranges.reduce((n, r) => n + r.frames.length, 0),
    MOTION_DENSE_MAX_FRAMES,
  );
  assert.equal(
    selectDenseMotionFrames([{ ...warnings[0], frames: [0, 10] }], 30)[0].frames
      .length,
    2,
  );
});

test("review motion output schema includes paths, unknown and warning frame ranges", () => {
  const result = analyze();
  const report = {
    motion: {
      summary: result.summary,
      boundaryChecks: result.boundaryChecks,
      telemetry: result.telemetry,
      badLines: 0,
      missingFrames: [],
      unknown: result.unknown,
      curve: {
        json: "review/motion-curve.json",
        image: "review/motion-curve.png",
      },
      dense: [],
      denseSkipped: 0,
      animatic: null,
    },
    motionWarnings: result.motionWarnings,
  };
  assert.equal(FilmMotionReviewSchema.safeParse(report).success, true);
  assert.equal(
    FilmMotionReviewSchema.safeParse({
      ...report,
      motionWarnings: [{ rule: "bogus", frames: [0, 30], message: "x" }],
    }).success,
    false,
  );
});

test("animatic flag is optional and has no value", () => {
  assert.equal(
    parseFilmOptions(["--film", "x", "--animatic"], ["film", "animatic"]).has(
      "animatic",
    ),
    true,
  );
});

test("deliver animatic reminder covers missing, stale and fresh incl generated and media", async (context) => {
  const root = await mkdtemp(join(process.cwd(), ".film-test-motion-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const src = join(root, "src/films/probe"),
    review = join(root, "out/films/probe/review"),
    pub = join(root, "public/films/probe");
  await mkdir(join(src, "generated"), { recursive: true });
  await mkdir(review, { recursive: true });
  await mkdir(pub, { recursive: true });
  const film = join(src, "Film.tsx"),
    preview = join(review, "animatic.mp4");
  await writeFile(film, "source");
  assert.match((await animaticReminder(root, "probe"))!, /missing/u);
  await writeFile(preview, "video");
  await utimes(preview, 1, 1);
  assert.match((await animaticReminder(root, "probe"))!, /older/u);
  await utimes(preview, 4102444800, 4102444800);
  assert.equal(await animaticReminder(root, "probe"), null);
  for (const path of [
    join(src, "film.json"),
    join(src, "generated/timing.json"),
    join(pub, "music.wav"),
  ]) {
    await writeFile(path, "input");
    await utimes(path, 4102444801, 4102444801);
    assert.match((await animaticReminder(root, "probe"))!, /older/u);
    await utimes(path, 1, 1);
  }
});

test("scene boundaries are cross-checked against cut intervals without inventing exact cut frames", () => {
  const result = analyze({
    records: [record([track(true)])],
    curve: {
      ...curve,
      cuts: [{ from: 135, to: 150, frame: 150, difference: 100 }],
    },
  });
  assert.deepEqual(result.boundaryChecks, [
    { boundaryFrame: 150, kind: "flash", candidateCutFrames: [135, 150] },
  ]);
  assert.deepEqual(analyze({ records: [record([track()])] }).boundaryChecks, [
    { boundaryFrame: 150, kind: null, candidateCutFrames: null },
  ]);
});

test("calibrated cuts exclude continuous motion; entrance tails and occasional caption changes may settle", () => {
  assert.equal(
    buildMotionCurve(
      [
        { frame: 0, signature: new Uint8Array([0]) },
        { frame: 15, signature: new Uint8Array([35]) },
      ],
      30,
    ).cuts.length,
    0,
  );
  const differences = [0, 14.743, 15.983, 7.394, 0.381, 0.382, 0.377, 0.333];
  assert.equal(
    has(
      analyze({
        durationInFrames: 120,
        curve: {
          ...curve,
          samples: differences.map((difference, i) => ({
            frame: i * 15,
            difference,
          })),
        },
      }),
      "enter-then-hold",
    ),
    true,
  );
});

test("animatic keeps complete composition/audio and timeout while scaling short edge to 360", async (context) => {
  const { renderFilmAnimatic } = await import("../../scripts/films/media");
  const root = await mkdtemp(join(process.cwd(), ".film-test-animatic-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    renderFilmAnimatic({
      rootDir: process.cwd(),
      compositionId: "probe",
      outputPath: join(root, "animatic.mp4"),
      width: 1920,
      height: 1080,
      timeoutMs: 900_000,
      runProcess: async (_command, args, options) => {
        assert.ok(args.includes("probe"));
        assert.ok(args.includes("--scale=0.3333333333333333"));
        assert.ok(args.includes("--enforce-audio-track"));
        assert.ok(args.includes("--audio-codec=pcm-16"));
        assert.ok(args.some((a) => a.startsWith("--separate-audio-to=")));
        assert.equal(
          args.some((a) => a.startsWith("--fps=") || a.startsWith("--frames=")),
          false,
        );
        assert.equal(options?.timeoutMs, 900_000);
        throw new Error("Test stops before rendering");
      },
    }),
    /Test stops before rendering/u,
  );
});

const repeatedScenes = [
  scene("a", 0, 100),
  scene("b", 100, 200),
  scene("c", 200, 300),
];
const midpointSamples = (values: number[]) =>
  values.map((v, i) => ({
    frame: i * 100 + 49,
    signature: new Uint8Array([v]),
  }));
const repeated = (values: number[]) =>
  analyze({
    records: [record([{ type: "scene-track", scenes: repeatedScenes }])],
    durationInFrames: 300,
    compositionSamples: midpointSamples(values),
  });
test("repeated-composition compares non-adjacent midpoints even during narration", () => {
  const result = repeated([10, 200, 10]);
  const warnings = result.motionWarnings.filter(
    (w) => w.rule === "repeated-composition",
  );
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0].frames, [49, 249]);
  assert.match(warnings[0].message, /f49 \/ f249.*MAD 0.000/);
  assert.equal(has(repeated([10, 10, 200]), "repeated-composition"), false);
  assert.equal(
    has(
      repeated([0, 200, MOTION_COMPOSITION_DIFFERENCE]),
      "repeated-composition",
    ),
    false,
  );
  assert.equal(
    has(
      repeated([0, 200, MOTION_COMPOSITION_DIFFERENCE - 1]),
      "repeated-composition",
    ),
    true,
  );
});
test("repeated-composition keeps legacy, incomplete, ambiguous and missing midpoint evidence unknown", () => {
  for (const options of [
    {},
    {
      records: [
        {
          ...record([{ type: "scene-track" as const, scenes: repeatedScenes }]),
          truncated: true,
        },
      ],
    },
    {
      records: [
        record([
          track(),
          { type: "scene-track" as const, scenes: repeatedScenes },
        ]),
      ],
    },
    {
      records: [
        record([{ type: "scene-track" as const, scenes: repeatedScenes }]),
      ],
      compositionSamples: midpointSamples([10, 200]),
    },
  ]) {
    const result = analyze(options);
    assert.equal(has(result, "repeated-composition"), false);
    assert.ok(result.unknown.some((u) => u.rule === "repeated-composition"));
  }
});
test("composition segments use scene boundaries and internal cuts, ignoring transition spikes and nearby cuts", () => {
  const scenes = [
    scene("a", 0, 300),
    scene("b", 300, 600, "b", {
      kind: "flash",
      mode: "overlay",
      startFrame: 260,
      endFrame: 340,
    }),
  ];
  const result = compositionSegments(scenes, {
    ...curve,
    cuts: [110, 115, 270, 330].map((frame) => ({
      from: frame - 15,
      to: frame,
      frame,
      difference: 80,
    })),
  });
  assert.deepEqual(result, [
    { from: 0, to: 110, frame: 54 },
    { from: 110, to: 300, frame: 204 },
    { from: 300, to: 600, frame: 449 },
  ]);
});
