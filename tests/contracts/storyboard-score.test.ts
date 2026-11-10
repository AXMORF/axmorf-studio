import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  generateScore,
  makeTimeline,
} from "../../scripts/films/score/synth-score.mjs";
import { scoreOnsets } from "../../scripts/films/score/storyboard-score.mjs";
import {
  projectFilmMusicOnsets,
  projectFilmMusicGrid,
  resolveFilmScoreRecipe,
} from "../../scripts/films/music";
import {
  FilmMusicSpecSchema,
  FilmTimingSchema,
  FilmSpecSchema,
  computeFilmMusicInputFingerprint,
} from "@axmorf/studio/contracts";

const voices = {
  instruments: ["kick", "snare", "clap", "hat", "bass", "pad"],
  density: 0.7,
  energy: 0.7,
};
const base = {
  engine: "studio-v2",
  fps: 30,
  bpm: 120,
  seed: 11,
  style: "electronic",
  beatsPerBar: 4,
  durationInFrames: 300,
  arrangement: {
    tonic: "C",
    mode: "minor",
    progression: [1, 6, 3, 7],
    sections: [
      { ...voices, from: 0 },
      { ...voices, from: 120 },
      { ...voices, from: 240 },
    ],
  },
};
const rawTimeline = (recipe: Record<string, unknown> = base) =>
  makeTimeline(recipe) as Record<string, unknown> & {
    bpm: number;
    durationInFrames: number;
    alignment: {
      boundaries: { actualFrame: number; residualFrames: number }[];
    };
    music: {
      type: string;
      frame: number;
      durationInFrames: number;
      beat?: number;
      note: number;
    }[];
  };

test("bars-only studio-v2 audio and timeline retain their pre-P7 checksums for every style", () => {
  const checksums = {
    organic: [
      "sha256:def106158f140960dc6316b2c6354f145b859ea0c4d678e493cec3e8827529e7",
      "e7070b5bda8421e5970f45cab2a6c5b3eb3b38860b5dc3dd1f5ee7f6a5a81194",
    ],
    electronic: [
      "sha256:7ac8f1e8bbfe18085986f7e6c41961ffea50d6b7cd697410a08d499acaed8ac5",
      "26026eccc8d595d9e545c06ab13bf9b7b0a6684140a9db7245f99aa24c5bc3bf",
    ],
    drive: [
      "sha256:9f9f5c17d1c9b51f1ede85d6ba59a1d96e4cac922bb93e95b8228512dce4094a",
      "cbc78779dd7d380e7e58b7eff9510e2234e0a26bc3ae18304bd4008b863ad5d4",
    ],
  };
  for (const [style, [audio, timeline]] of Object.entries(checksums)) {
    const result = generateScore({
      fps: 30,
      bpm: 120,
      bars: 2,
      style,
      seed: 11,
      engine: "studio-v2",
      arrangement: {
        tonic: "C",
        mode: "minor",
        progression: [1, 6, 3, 7],
        sections: [
          { bars: 1, instruments: ["pad", "pluck"], density: 0.3, energy: 0.3 },
          {
            bars: 1,
            instruments: [
              "kick",
              "snare",
              "clap",
              "hat",
              "bass",
              "pad",
              "lead",
              ...(style === "drive" ? ["guitar"] : []),
            ],
            density: 0.85,
            energy: 0.9,
          },
        ],
      },
    });
    assert.equal(result.timeline.audioChecksum, audio, style);
    assert.equal(
      createHash("sha256")
        .update(JSON.stringify(result.timeline))
        .digest("hex"),
      timeline,
      style,
    );
  }
});

test("feasible BPM search prefers the midpoint instead of the upper-limit exact fit", () => {
  // The old squared-frame-error objective selected the upper limit, 115.21 BPM.
  const timeline = rawTimeline({
    ...base,
    bpm: undefined,
    bpmRange: [112.79, 115.21],
    arrangement: {
      ...base.arrangement,
      sections: [{ ...voices, from: 0 }, { ...voices, from: 62 }],
    },
  });
  assert.equal(timeline.bpm, 114);
  assert.deepEqual(
    timeline.alignment.boundaries.map((item) => item.residualFrames),
    [0, 1],
  );
});

test("BPM search requires every anchor to be within three frames before preferring tempo", () => {
  const timeline = rawTimeline({ ...base, bpm: 104, bpmRange: [96, 124] });
  assert.equal(timeline.bpm, 118.28);
  assert.deepEqual(
    timeline.alignment.boundaries.map((item) => item.residualFrames),
    [0, 2, 3],
  );
});

test("feasible BPM search honors an explicit bpm ahead of midpoint and exact alignment", () => {
  const timeline = rawTimeline({
    ...base,
    bpm: 108,
    bpmRange: [100, 120],
    arrangement: {
      ...base.arrangement,
      sections: [{ ...voices, from: 0 }, { ...voices, from: 64 }],
    },
  });
  assert.equal(timeline.bpm, 108);
  assert.deepEqual(
    timeline.alignment.boundaries.map((item) => item.residualFrames),
    [0, 3],
  );
});

test("infeasible BPM search minimizes bar-normalized residuals rather than frame error", () => {
  // The old objective selected 114.98 BPM: [-17, 5] has less raw squared error,
  // but [-5, -20] at 96 BPM has less error relative to each bar's length.
  const timeline = rawTimeline({
    ...base,
    bpm: 120,
    bpmRange: [96, 128],
    arrangement: {
      ...base.arrangement,
      sections: [0, 80, 245].map((from) => ({ ...voices, from })),
    },
  });
  assert.equal(timeline.bpm, 96);
  assert.deepEqual(
    timeline.alignment.boundaries.map((item) => item.residualFrames),
    [0, -5, -20],
  );
  assert.ok(
    (5 ** 2 + 20 ** 2) / (7200 / 96) ** 2 <
      (17 ** 2 + 5 ** 2) / (7200 / 114.98) ** 2,
  );
});

test("equidistant feasible BPMs prefer squared residuals, then the lower BPM deterministically", () => {
  const residual = rawTimeline({
    ...base,
    bpm: 110.345,
    bpmRange: [100, 120],
    arrangement: {
      ...base.arrangement,
      sections: [{ ...voices, from: 0 }, { ...voices, from: 130 }],
    },
  });
  assert.equal(residual.bpm, 110.35);
  assert.deepEqual(
    residual.alignment.boundaries.map((item) => item.residualFrames),
    [0, 0],
  );
  const recipe = {
    ...base,
    bpm: 109.995,
    bpmRange: [100, 120],
    arrangement: { ...base.arrangement, sections: [{ ...voices, from: 0 }] },
  };
  const lower = rawTimeline(recipe);
  assert.equal(lower.bpm, 109.99);
  assert.deepEqual(rawTimeline(recipe), lower);
});

test("fixed-BPM storyboard audio and timeline retain their pre-selection-fix bytes for every style", () => {
  const checksums = {
    organic: [
      "sha256:04f6ba838cdcc2b2e6afb58a299f542d96351789128a118bbe31eb79c0957f57",
      "072881e8247fc800d1e8e57850e90d350481bdb2404c09f0c7c9290750ec93aa",
    ],
    electronic: [
      "sha256:913a91f6bf52ffe5af2912287472afbe430c9b51b6936fe74dfaa87fc52a4310",
      "2bb02138f4ec31898895e890ab1cfc70f0ed69744e64cb229e03f0fa9b4e6262",
    ],
    drive: [
      "sha256:86c2ed25fa1e1f713fd67e41d3024e16aed4eeed5e76fda0bed53baf8a159f38",
      "9950ce78c0e7355bdee1a9dcd4a5b1287288309c45dade17866814dfc45f175d",
    ],
  };
  for (const [style, [audio, timeline]] of Object.entries(checksums)) {
    const result = generateScore({
      ...base,
      style,
      bpm: 123,
      arrangement: {
        ...base.arrangement,
        sections: [
          { ...voices, from: 0 },
          { ...voices, bars: 1 },
          { ...voices, from: 180 },
        ],
      },
      hits: [{ frame: 151, kind: "stinger", intensity: 0.8 }],
      breaks: [{ from: 120, to: 150, keep: ["pad"] }],
      ending: { landFrame: 270, cadence: "resolve" },
    });
    assert.equal(result.timeline.audioChecksum, audio, style);
    assert.equal(
      createHash("sha256")
        .update(JSON.stringify(result.timeline))
        .digest("hex"),
      timeline,
      style,
    );
  }
});

test("mixed from/bars sections preserve fixed spans between snapped anchors", () => {
  const timeline = rawTimeline({
    ...base,
    arrangement: {
      ...base.arrangement,
      sections: [
        { ...voices, from: 0 },
        { ...voices, bars: 1 },
        { ...voices, from: 180 },
        { ...voices, bars: 1 },
      ],
    },
  });
  assert.deepEqual(
    (timeline.sections as { startFrame: number; bars: number }[]).map(
      ({ startFrame, bars }) => [startFrame, bars],
    ),
    [
      [0, 2],
      [120, 1],
      [180, 1],
      [240, 1],
    ],
  );
  const fixedLead = rawTimeline({
    ...base,
    arrangement: {
      ...base.arrangement,
      sections: [
        { ...voices, bars: 2 },
        { ...voices, from: 120 },
      ],
    },
  });
  assert.deepEqual(
    fixedLead.alignment.boundaries.map((entry) => entry.actualFrame),
    [120],
  );
});

test("hits land off-grid at exact frames and enter the accent and onset grids", () => {
  const hits = ["stinger", "lift", "drop", "swell"].map((kind, index) => ({
    frame: 31 + index * 61,
    kind,
    intensity: 0.7,
  }));
  const timeline = rawTimeline({ ...base, hits });
  for (const { frame } of hits)
    assert.ok(
      timeline.music.some(
        (event) => event.frame === frame && event.beat === undefined,
      ),
    );
  assert.deepEqual(
    (timeline.accentFrames as number[]).filter((frame) =>
      hits.some((hit) => hit.frame === frame),
    ),
    hits.map((hit) => hit.frame),
  );
  assert.deepEqual(scoreOnsets(timeline).hits, [31, 92, 153, 214]);
  assert.deepEqual(
    generateScore({ ...base, hits }),
    generateScore({ ...base, hits }),
  );
});

test("breaks remove scheduled instruments and a full break is PCM silence", () => {
  const timeline = rawTimeline({
    ...base,
    breaks: [{ from: 120, to: 180, keep: ["pad"] }],
  });
  assert.ok(
    timeline.music
      .filter((event) => event.frame >= 120 && event.frame < 180)
      .every((event) => event.type === "pad"),
  );
  const { audio } = generateScore({
    ...base,
    breaks: [{ from: 120, to: 180, keep: [] }],
  });
  assert.ok(
    audio
      .subarray(44 + (120 / 30) * 48000 * 4, 44 + (180 / 30) * 48000 * 4)
      .every((byte) => byte === 0),
  );
  assert.ok(
    audio.subarray(44, 44 + (120 / 30) * 48000 * 4).some((byte) => byte !== 0),
  );
});

test("ending resolve adds a tonic arrival, cut silences its boundary, and ring preserves tails", () => {
  const resolve = rawTimeline({
    ...base,
    ending: { landFrame: 270, cadence: "resolve" },
  });
  assert.deepEqual(
    resolve.music
      .filter((event) => event.type === "pad" && event.frame === 270)
      .map((event) => event.note),
    [48, 51, 55],
  );
  const cut = generateScore({
    ...base,
    ending: { landFrame: 270, cadence: "cut" },
  });
  const ring = generateScore({
    ...base,
    ending: { landFrame: 270, cadence: "ring" },
  });
  assert.ok(
    cut.audio.subarray(44 + (270 / 30) * 48000 * 4).every((byte) => byte === 0),
  );
  assert.ok(
    ring.audio
      .subarray(44 + (270 / 30) * 48000 * 4, 44 + (300 / 30) * 48000 * 4)
      .some((byte) => byte !== 0),
  );
  assert.notDeepEqual(cut.audio, ring.audio);
});

test("storyboard DSP does not wrap future tails to frame zero", () => {
  const recipe = {
    ...base,
    arrangement: { ...base.arrangement, sections: [{ ...voices, from: 0 }] },
    breaks: [{ from: 0, to: 240, keep: [] }],
    hits: [{ frame: 270, kind: "stinger", intensity: 0.9 }],
  };
  const { audio } = generateScore(recipe);
  assert.ok(
    audio.subarray(44, 44 + (240 / 30) * 48000 * 4).every((byte) => byte === 0),
  );
});

test("onsets are derived from the DSP sample starts and project with loops and offsets", () => {
  const timeline = rawTimeline({
    ...base,
    bpm: 123,
    hits: [{ frame: 151, kind: "drop", intensity: 0.7 }],
  });
  const onsets = scoreOnsets(timeline);
  for (const type of ["kick", "snare", "clap", "hat", "bass"] as const) {
    const expected = [
      ...new Set(
        timeline.music
          .filter((event) => event.type === type)
          .map((event) =>
            Math.round(
              (Math.round(
                (event.beat === undefined
                  ? event.frame / 30
                  : (event.beat * 60) / 123) * 48000,
              ) *
                30) /
                48000,
            ),
          ),
      ),
    ].sort((a, b) => a - b);
    assert.deepEqual(onsets[type], expected);
  }
  const absolute = projectFilmMusicOnsets({
    timeline,
    startFrame: 30,
    durationInFrames: 360,
  });
  assert.deepEqual(absolute.hits, [181]);
  assert.deepEqual(
    absolute.sections,
    (timeline.sections as { startFrame: number }[]).map(
      (entry) => entry.startFrame + 30,
    ),
  );
  const looped = projectFilmMusicOnsets({
    timeline: { ...timeline, loop: true },
    startFrame: 30,
    durationInFrames: 700,
  });
  assert.ok(looped.hits.includes(181 + timeline.durationInFrames));
  const { timeline: rendered } = generateScore({
    ...base,
    hits: [{ frame: 151, kind: "stinger", intensity: 0.8 }],
  });
  assert.ok(
    projectFilmMusicGrid({
      timeline: rendered,
      startFrame: 30,
      durationInFrames: 330,
    }).accentFrames.includes(181),
  );
});

test("film score resolves measured sentence anchors and offsets all controls without changing timing", () => {
  const timing = FilmTimingSchema.parse({
    schemaVersion: 1,
    filmId: "score-test",
    inputFingerprint: `sha256:${"0".repeat(64)}`,
    fps: 30,
    narrationStartFrame: 30,
    narrationEndFrame: 250,
    durationInFrames: 330,
    narration: null,
    sentences: [
      { id: "intro", text: "intro", startFrame: 30, endFrame: 100 },
      { id: "reveal", text: "reveal", startFrame: 150, endFrame: 250 },
    ],
  });
  const before = JSON.stringify(timing);
  const filmScore = Object.fromEntries(
    Object.entries(base).filter(([key]) => key !== "fps"),
  );
  const music = FilmMusicSpecSchema.parse({
    startFrame: 30,
    score: {
      ...filmScore,
      arrangement: {
        ...base.arrangement,
        sections: [
          { ...voices, from: "intro" },
          { ...voices, from: "reveal" },
        ],
      },
      hits: [{ frame: 181, kind: "stinger", intensity: 0.8 }],
      breaks: [{ from: 120, to: 150, keep: ["pad"] }],
      ending: { landFrame: 300, cadence: "resolve" },
    },
  });
  const local = resolveFilmScoreRecipe({ music, timing, fps: 30 });
  assert.equal(JSON.stringify(timing), before);
  assert.deepEqual(
    (local.arrangement as { sections: { from: number }[] }).sections.map(
      (section) => section.from,
    ),
    [0, 120],
  );
  assert.deepEqual(local.hits, [
    { frame: 151, kind: "stinger", intensity: 0.8 },
  ]);
  assert.deepEqual(local.breaks, [{ from: 90, to: 120, keep: ["pad"] }]);
  assert.deepEqual(local.ending, { landFrame: 270, cadence: "resolve" });
  const spec = FilmSpecSchema.parse({
    schemaVersion: 1,
    filmId: "score-test",
    render: { width: 640, height: 360, fps: 30 },
    timeline: { durationInFrames: 330 },
    narration: [],
    music,
    publish: { title: "test" },
  });
  assert.notEqual(
    computeFilmMusicInputFingerprint({
      spec,
      durationInFrames: 330,
      sentenceFrames: timing.sentences,
    }),
    computeFilmMusicInputFingerprint({
      spec,
      durationInFrames: 330,
      sentenceFrames: [
        { id: "intro", startFrame: 30 },
        { id: "reveal", startFrame: 160 },
      ],
    }),
  );
  for (const sections of [
    [
      { ...voices, from: 30 },
      { ...voices, from: 150 },
    ],
    [
      { ...voices, bars: 2 },
      { ...voices, bars: 3 },
    ],
  ]) {
    const numericSpec = {
      ...spec,
      music: {
        ...music,
        score: {
          ...music.score,
          arrangement: { ...base.arrangement, sections },
        },
      },
    };
    assert.equal(
      computeFilmMusicInputFingerprint({
        spec: numericSpec,
        durationInFrames: 330,
      }),
      computeFilmMusicInputFingerprint({
        spec: numericSpec,
        durationInFrames: 330,
        sentenceFrames: [{ id: "reveal", startFrame: 160 }],
      }),
    );
  }
});

test("invalid storyboard controls fail before synthesis", () => {
  for (const extra of [
    { bpmRange: [112, 96] },
    { bpmRange: [0, 112] },
    { bpmRange: [100] },
    { hits: [{ frame: 300, kind: "drop", intensity: 0.5 }] },
    { hits: [{ frame: 20, kind: "noise", intensity: 0.5 }] },
    { hits: [{ frame: 20, kind: "drop", intensity: 2 }] },
    { breaks: [{ from: 120, to: 100, keep: [] }] },
    { breaks: [{ from: 10, to: 20, keep: ["alien"] }] },
    {
      breaks: [
        { from: 10, to: 30, keep: [] },
        { from: 20, to: 40, keep: [] },
      ],
    },
    { hits: [{ frame: 20, kind: "drop", intensity: 0.5, extra: true }] },
    { breaks: [{ from: 10, to: 20, keep: ["pad", "pad"] }] },
    { breaks: [{ from: 10, to: 20, keep: ["pad"], extra: true }] },
    { ending: { landFrame: 300, cadence: "cut" } },
    { ending: { landFrame: 270, cadence: "fade" } },
    { bars: 4 },
    {
      arrangement: {
        ...base.arrangement,
        sections: [{ ...voices, from: 0, bars: 2 }],
      },
    },
    {
      arrangement: {
        ...base.arrangement,
        sections: [
          { ...voices, from: 0 },
          { ...voices, from: 1 },
        ],
      },
    },
  ])
    assert.throws(
      () => makeTimeline({ ...base, ...extra }),
      /score|Score|section|Section|anchor|Anchor/u,
    );
});

test("a selective break also excludes the removed voices' delay and reverb tails", async () => {
  const { synthesizeStudioTimeline } = await import(
    pathToFileURL(resolve("scripts/films/score/studio-score.mjs")).href
  );
  const timeline = {
    fps: 30,
    bpm: 120,
    seed: 11,
    style: "electronic",
    durationInFrames: 120,
    musicWindowInFrames: 120,
    loop: false,
    breaks: [{ from: 60, to: 90, keep: ["kick"] }],
    music: [
      { type: "pluck", frame: 0, durationInFrames: 100, note: 60, gain: 0.7 },
      { type: "kick", frame: 60, durationInFrames: 15, note: 36, gain: 0.8 },
    ],
  };
  const actual = synthesizeStudioTimeline(timeline);
  const onlyKept = synthesizeStudioTimeline({
    ...timeline,
    music: timeline.music.filter((event) => event.type === "kick"),
  });
  const from = (60 / 30) * 48000;
  const to = (90 / 30) * 48000;
  assert.deepEqual(
    actual.left.subarray(from, to),
    onlyKept.left.subarray(from, to),
  );
  assert.deepEqual(
    actual.right.subarray(from, to),
    onlyKept.right.subarray(from, to),
  );
});

test("all sentence anchor controls invalidate music when sentence starts change at equal total duration", () => {
  const numeric = {
    engine: "studio-v3",
    bpm: 100,
    arrangement: {
      tonic: "C",
      mode: "minor",
      progression: [1],
      sections: [{ from: 0, instruments: ["pad"], density: 0.5, energy: 0.5 }],
    },
    hits: [{ frame: 100, kind: "stinger", intensity: 0.6 }],
    breaks: [{ from: 80, to: 100, keep: [] }],
    ending: { landFrame: 250, cadence: "resolve" },
  };
  for (const location of [
    "numeric",
    "section",
    "hit",
    "break-from",
    "break-to",
    "ending",
  ]) {
    const score = JSON.parse(JSON.stringify(numeric));
    if (location === "section") score.arrangement.sections[0].from = "reveal";
    if (location === "hit") score.hits[0].frame = "reveal";
    if (location === "break-from") score.breaks[0].from = "reveal";
    if (location === "break-to") score.breaks[0].to = "reveal";
    if (location === "ending") score.ending.landFrame = "reveal";
    const spec = FilmSpecSchema.parse({
      schemaVersion: 1,
      filmId: "anchor-fingerprint",
      render: { width: 640, height: 360, fps: 30 },
      timeline: { durationInFrames: 300 },
      narration: [],
      music: { score },
      publish: { title: "test" },
    });
    const fingerprint = (startFrame: number) =>
      computeFilmMusicInputFingerprint({
        spec,
        durationInFrames: 300,
        sentenceFrames: [{ id: "reveal", startFrame }],
      });
    if (location === "numeric")
      assert.equal(fingerprint(100), fingerprint(110));
    else assert.notEqual(fingerprint(100), fingerprint(110), location);
  }
});
