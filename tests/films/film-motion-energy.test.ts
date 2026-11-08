import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  analyzeMotionEnergy,
  decodeMotionEnergy,
  measureMotionEnergy,
  motionEnergyQuantile,
  MOTION_ENERGY_WIDTH,
  MOTION_ENERGY_HEIGHT,
  MOTION_ENERGY_TIMEOUT_MS,
  MOTION_ENERGY_ANTICIPATION_MIN_FRAMES,
  MOTION_ENERGY_ANTICIPATION_MEDIAN_MULTIPLIER,
  MOTION_ENERGY_ANTICIPATION_WINDOW,
  MOTION_ENERGY_ACCENT_PERCENTILE,
} from "../../scripts/films/motion-energy";

const size = MOTION_ENERGY_WIDTH * MOTION_ENERGY_HEIGHT;
const samples = (values: readonly number[]) =>
  values.map((difference, i) => ({ frame: i + 1, difference }));
const analyze = (
  values: number[],
  options: Partial<Parameters<typeof analyzeMotionEnergy>[0]> = {},
) =>
  analyzeMotionEnergy({
    samples: samples(values),
    durationInFrames: values.length + 1,
    sentences: [{ startFrame: 10, endFrame: 50 }],
    accents: [{ frame: 80, strength: 1 }],
    ...options,
  });

test("motion energy is consecutive 160x90 luma MAD with no fictitious first sample", async () => {
  const raw = Buffer.concat([
    Buffer.alloc(size, 0),
    Buffer.alloc(size, 20),
    Buffer.alloc(size, 5),
  ]);
  const result = await measureMotionEnergy(
    Readable.from([
      raw.subarray(0, 173),
      raw.subarray(173, size + 21),
      raw.subarray(size + 21),
    ]),
  );
  assert.deepEqual(result, { decodedFrames: 3, samples: samples([20, 15]) });
  await assert.rejects(
    measureMotionEnergy(Readable.from([raw.subarray(0, raw.length - 1)])),
    /mid-frame/u,
  );
});

test("percentiles match NumPy linear interpolation, including even medians", () => {
  assert.equal(motionEnergyQuantile([0, 10], 0.95), 9.5);
  assert.equal(motionEnergyQuantile([0, 10], 0.99), 9.9);
  assert.equal(motionEnergyQuantile([1, 5, 3, 9], 0.5), 4);
  assert.equal(motionEnergyQuantile([2], 0.95), 2);
  assert.equal(motionEnergyQuantile([], 0.95), null);
});

test("strong accents must reach p99 rather than the weaker p95, including transition spikes", () => {
  assert.equal(MOTION_ENERGY_ACCENT_PERCENTILE, 0.99);
  const values: number[] = Array(200).fill(1);
  for (let i = 0; i < 8; i++) values[i] = 20;
  values[199] = 100;
  for (let frame = 72; frame <= 77; frame++) values[frame - 1] = 3;
  values[79] = 10;
  const result = analyze(values);
  assert.ok(Math.abs(result.summary!.p95 - 3.35) < 1e-9);
  assert.equal(result.summary?.p99, 20);
  const warning = result.motionWarnings.find(
    (w) => w.rule === "accent-underplayed",
  )!;
  assert.match(warning.message, /冲击不够.*p99/u);
  assert.doesNotMatch(warning.message, /缺预备/u);
  assert.match(warning.message, /无法判断配方过程是否被隐藏/u);
  assert.match(warning.message, /strong-accent-strip.*review-notes/u);
  values[79] = 20; // Equality with p99 passes.
  assert.equal(
    analyze(values).motionWarnings.some((w) => w.rule === "accent-underplayed"),
    false,
  );
});

test("strong-accent threshold is inclusive .9; peaks use exactly [f-1,f+3]", () => {
  const values: number[] = Array.from({ length: 100 }, (_, i) =>
    i < 10 ? 10 : 1,
  );
  // Supply six real preparation frames so this test isolates the impact window.
  for (let frame = 72; frame <= 77; frame++) values[frame - 1] = 3;
  for (const frame of [79, 80, 81, 82, 83]) {
    const good = [...values];
    good[frame - 1] = 10;
    assert.equal(
      analyze(good).motionWarnings.some((w) => w.rule === "accent-underplayed"),
      false,
      `f${frame}`,
    );
  }
  for (const frame of [78, 84]) {
    const bad = [...values];
    bad[frame - 1] = 100;
    const result = analyze(bad, {
      accents: [
        { frame: 80, strength: 0.9 },
        { frame: 50, strength: 0.8999 },
      ],
    });
    assert.deepEqual(
      result.motionWarnings
        .filter((w) => w.rule === "accent-underplayed")
        .map((w) => w.frames),
      [[79, 83]],
    );
    assert.equal(result.summary?.strongAccents?.length, 1);
  }
});

test("accent windows clip to body ends without inventing preparation before frame zero", () => {
  const result = analyze([2, 2, 2, 2], {
    accents: [
      { frame: 0, strength: 1 },
      { frame: 4, strength: 1 },
    ],
  });
  assert.deepEqual(
    result.summary?.strongAccents?.map((a) => a.peak),
    [2, 2],
  );
  assert.equal(
    result.motionWarnings.some((w) => w.message.includes("冲击不够")),
    false,
  );
  assert.equal(
    result.motionWarnings.filter((w) => w.message.includes("缺预备")).length,
    2,
  );
  assert.deepEqual(
    result.summary?.strongAccents?.map((a) => a.anticipationFrames),
    [0, 0],
  );
});

test("preparation requires six frames strictly above 2x median inside [f-8,f-1]", () => {
  assert.equal(MOTION_ENERGY_ANTICIPATION_WINDOW, 8);
  assert.equal(MOTION_ENERGY_ANTICIPATION_MIN_FRAMES, 6);
  assert.equal(MOTION_ENERGY_ANTICIPATION_MEDIAN_MULTIPLIER, 2);
  const base: number[] = Array(100).fill(1);
  base[79] = 20; // The hit itself is strong, but does not count as preparation.
  const prepared = [...base];
  for (const frame of [72, 73, 74, 75, 76, 79]) prepared[frame - 1] = 3;
  const good = analyze(prepared);
  assert.equal(good.summary?.median, 1);
  assert.equal(good.summary?.anticipationThreshold, 2);
  assert.equal(good.summary?.strongAccents?.[0].anticipationFrames, 6);
  assert.equal(
    good.motionWarnings.some((w) => w.rule === "accent-underplayed"),
    false,
  );
  for (const frame of [72, 79]) {
    const bad = [...prepared];
    bad[frame - 1] = 2; // Equality is insufficient.
    bad[70] = 3; // f71 lies outside the preparation window.
    const result = analyze(bad);
    const warning = result.motionWarnings.find(
      (w) => w.rule === "accent-underplayed",
    )!;
    assert.match(warning.message, /缺预备/u);
    assert.doesNotMatch(warning.message, /冲击不够/u);
    assert.deepEqual(warning.frames, [72, 79]);
    assert.equal(result.summary?.strongAccents?.[0].anticipationFrames, 5);
  }
});

test("one accent warning distinguishes missing preparation, weak impact, or both", () => {
  const base: number[] = Array.from({ length: 100 }, (_, i) =>
    i < 10 ? 10 : 1,
  );
  const both = analyze(base).motionWarnings.filter(
    (w) => w.rule === "accent-underplayed",
  );
  assert.equal(both.length, 1);
  assert.match(both[0].message, /缺预备.*冲击不够/u);
  assert.deepEqual(both[0].frames, [72, 83]);
  const prepared = [...base];
  for (let frame = 72; frame <= 77; frame++) prepared[frame - 1] = 3;
  const weak = analyze(prepared).motionWarnings.find(
    (w) => w.rule === "accent-underplayed",
  )!;
  assert.match(weak.message, /冲击不够/u);
  assert.doesNotMatch(weak.message, /缺预备/u);
  assert.deepEqual(weak.frames, [79, 83]);
});

test("beat vs speech uses half-open sentence windows and warns on equal medians", () => {
  const result = analyze([0.1, 0.8, 0.8, 0.1], {
    sentences: [{ startFrame: 2, endFrame: 4 }],
    accents: [],
  });
  assert.equal(result.summary?.speechMedian, 0.8);
  assert.equal(result.summary?.beatMedian, 0.1);
  assert.deepEqual(
    result.motionWarnings.map((w) => w.rule),
    ["beat-sections-static"],
  );
  assert.equal(
    analyze([1, 1, 1, 1], {
      sentences: [{ startFrame: 2, endFrame: 4 }],
      accents: [],
    }).motionWarnings[0].rule,
    "beat-sections-static",
  );
  assert.deepEqual(
    analyze([2, 0.1, 0.1, 2], {
      sentences: [{ startFrame: 2, endFrame: 4 }],
      accents: [],
    }).motionWarnings,
    [],
  );
});

test("missing, incomplete, or sparse animatic frames keep both rules unknown", () => {
  for (const input of [
    null,
    [],
    samples([1, 2]),
    [
      { frame: 1, difference: 1 },
      { frame: 15, difference: 1 },
      { frame: 30, difference: 1 },
    ],
  ]) {
    const result = analyzeMotionEnergy({
      samples: input,
      durationInFrames: 4,
      sentences: [],
      accents: [],
    });
    assert.deepEqual(result.motionWarnings, []);
    assert.equal(result.summary, null);
    assert.deepEqual(
      result.unknown.map((u) => u.rule),
      ["accent-underplayed", "beat-sections-static"],
    );
  }
  assert.match(
    analyzeMotionEnergy({
      samples: null,
      durationInFrames: 4,
      sentences: [],
      accents: [],
      unavailableReason: "Animatic is stale.",
    }).unknown[0].reason,
    /stale/u,
  );
});

test("legacy strength metadata and absent speech/beat groups remain independently unknown", () => {
  assert.deepEqual(
    analyze([1, 2, 3], { accents: null, sentences: [] }).unknown.map(
      (u) => u.rule,
    ),
    ["accent-underplayed", "beat-sections-static"],
  );
  for (const sentences of [[], [{ startFrame: 0, endFrame: 4 }]]) {
    const result = analyze([1, 2, 3], { accents: [], sentences });
    assert.deepEqual(result.motionWarnings, []);
    assert.deepEqual(
      result.unknown.map((u) => u.rule),
      ["beat-sections-static"],
    );
  }
});

// Same simple grayscale PNG fixture as the frame signature tests; no new image dependency.
const png = (value: number) => {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(MOTION_ENERGY_WIDTH, 0);
  header.writeUInt32BE(MOTION_ENERGY_HEIGHT, 4);
  header[8] = 8;
  const rows = Buffer.concat(
    Array.from({ length: MOTION_ENERGY_HEIGHT }, () =>
      Buffer.concat([
        Buffer.from([0]),
        Buffer.alloc(MOTION_ENERGY_WIDTH, value),
      ]),
    ),
  );
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

test("decoder uses Workspace FFmpeg, frame-exact body trim, lossless PNG, and 120s deadline", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "axmorf-energy-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  let calls = 0;
  const result = await decodeMotionEnergy({
    rootDir: process.cwd(),
    videoPath: "video.mp4",
    scratch,
    startFrame: 60,
    durationInFrames: 3,
    runProcess: async (command, args, options) => {
      calls++;
      assert.equal(command, process.execPath);
      assert.equal(args[1], "ffmpeg");
      assert.equal(
        args[args.indexOf("-vf") + 1],
        "trim=start_frame=60:end_frame=63,scale=160:90,format=gray",
      );
      assert.equal(args[args.indexOf("-vsync") + 1], "0");
      assert.equal(args[args.indexOf("-c:v") + 1], "png");
      assert.equal(options?.timeoutMs, MOTION_ENERGY_TIMEOUT_MS);
      for (const [i, value] of [0, 20, 5].entries())
        await writeFile(
          join(dirname(args.at(-1)!), `${String(i).padStart(6, "0")}.png`),
          png(value),
        );
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.samples, samples([20, 15]));
  assert.equal(result.decodedFrames, 3);
  assert.deepEqual(await readdir(scratch), []);
});

test("decode failures propagate without retries and clean up owned scratch files", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "axmorf-energy-failure-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  let calls = 0;
  for (const rejects of [false, true]) {
    await assert.rejects(
      decodeMotionEnergy({
        rootDir: process.cwd(),
        videoPath: "video.mp4",
        scratch,
        durationInFrames: 3,
        runProcess: async () => {
          calls++;
          if (rejects) throw new Error("deadline exceeded");
          return { status: 1, stdout: "", stderr: "decode diagnostic" };
        },
      }),
      rejects ? /deadline exceeded/u : /decode diagnostic/u,
    );
    assert.deepEqual(await readdir(scratch), []);
  }
  assert.equal(calls, 2);
});
