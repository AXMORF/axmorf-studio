import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  FilmPublishSchema,
  FilmTimingSchema,
  minimumReadableFontSize,
} from "@axmorf/studio/contracts";

import { encodeCanonicalPcmWav } from "../../scripts/narration/domain/pcm-wav";
import { checkFilm } from "../../scripts/films/check";
import {
  deliverFilm,
  type FilmDeliveryMedia,
} from "../../scripts/films/deliver";
import { filmPaths } from "../../scripts/films/files";
import { deleteFilm, listFilms } from "../../scripts/films/manage";
import { COVER_SOURCE, FILM_SOURCE } from "../../scripts/films/new";
import { runFilmVoice } from "../../scripts/films/voice";

const repoRoot = process.cwd();

/**
 * A throwaway Workspace inside the repository, so TypeScript resolves react,
 * remotion and the runtime package from the repository's node_modules.
 */
const createWorkspace = async (context: TestContext) => {
  const root = await mkdtemp(join(repoRoot, ".film-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        resolveJsonModule: true,
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: repoRoot,
        paths: {
          "@axmorf/studio/contracts": [
            "packages/studio/src/contracts/index.ts",
          ],
          "@axmorf/studio/remotion": ["packages/studio/src/remotion.ts"],
        },
      },
    }),
  );
  return root;
};

const writeFilm = async (
  root: string,
  filmId: string,
  {
    film = FILM_SOURCE,
    spec = {},
  }: { film?: string; spec?: Record<string, unknown> } = {},
) => {
  const paths = filmPaths(root, filmId);
  await mkdir(join(paths.dir, "generated"), { recursive: true });
  await writeFile(
    paths.spec,
    JSON.stringify({
      schemaVersion: 1,
      filmId,
      render: { width: 1080, height: 1920, fps: 30 },
      timeline: { durationInFrames: 90 },
      narration: [],
      publish: { title: "测试片" },
      ...spec,
    }),
  );
  await writeFile(
    paths.assets,
    JSON.stringify({ schemaVersion: 1, filmId, assets: [] }),
  );
  await writeFile(paths.film, film);
  await writeFile(paths.cover, COVER_SOURCE);
  return paths;
};

const silentSpeech = (seconds: number) =>
  encodeCanonicalPcmWav(Buffer.alloc(Math.round(seconds * 48_000) * 2));

const fakeVoice = async () => ({
  speak: async ({ text }: { text: string }) => silentSpeech(text.length / 4),
  master: async (wav: Buffer) => wav,
});

test("voice measures each sentence, writes narration and timing, and registers the film", async (context) => {
  const root = await createWorkspace(context);
  const paths = await writeFilm(root, "voice-film", {
    spec: {
      timeline: { narrationStartFrame: 30, tailFrames: 30 },
      narration: [
        { id: "a", text: "一二三四五六七八" },
        { id: "b", text: "一二三四", pauseAfterMs: 1000 },
        { id: "c", text: "一二三四" },
      ],
    },
  });
  const result = await runFilmVoice({
    rootDir: root,
    filmId: "voice-film",
    createService: fakeVoice,
  });
  assert.equal(result.status, "film-voice-ready");
  const timing = FilmTimingSchema.parse(
    JSON.parse(await readFile(paths.timing, "utf8")),
  );
  assert.deepEqual(
    timing.sentences.map(({ startFrame, endFrame }) => [startFrame, endFrame]),
    [
      [30, 90],
      [90, 120],
      [150, 180],
    ],
  );
  assert.equal(timing.durationInFrames, 210);
  assert.equal(
    timing.narration?.publicPath,
    "public/films/voice-film/narration.wav",
  );
  assert.equal((await stat(paths.narrationWav)).size, 44 + 150 * 1600 * 2);
  const registry = await readFile(join(root, "src/films/index.ts"), "utf8");
  assert.match(registry, /\.\/voice-film\/generated\/timing\.json/u);

  const report = await checkFilm({ rootDir: root, filmId: "voice-film" });
  assert.deepEqual(report.errors, []);

  // Editing the script makes the timing stale until voice runs again.
  const spec = JSON.parse(await readFile(paths.spec, "utf8"));
  spec.narration[2].text = "改过的第三句";
  await writeFile(paths.spec, JSON.stringify(spec));
  const stale = await checkFilm({ rootDir: root, filmId: "voice-film" });
  assert.deepEqual(
    stale.errors.map(({ rule }) => rule),
    ["timing-stale"],
  );
});

test("check rejects real render failures and allows URLs as on-screen text", async (context) => {
  const root = await createWorkspace(context);
  await writeFilm(root, "bad-film", {
    film: `import { AbsoluteFill, Img, staticFile } from "remotion";
import { FilmCaptions, FilmSoundtrack } from "@axmorf/studio/remotion";
import shared from "../other-film/shared";

const Film = () => {
  void fetch("https://example.com/data.json");
  const wobble = Math.random();
  return (
    <AbsoluteFill style={{ transition: "opacity 1s", opacity: wobble }}>
      <Img src="https://example.com/photo.png" />
      <Img src={staticFile("films/bad-film/assets/missing.png")} />
      <Img src={staticFile("films/other-film/assets/photo.png")} />
      <div style={{ fontSize: 12 }}>打开 https://example.com 查看 {String(shared)}</div>
      <FilmSoundtrack />
      <FilmCaptions />
    </AbsoluteFill>
  );
};

export default Film;
`,
  });
  const report = await checkFilm({ rootDir: root, filmId: "bad-film" });
  assert.equal(report.status, "film-check-failed");
  const rules = report.errors.map(({ rule }) => rule).sort();
  assert.deepEqual(rules, [
    "css-motion",
    "deterministic",
    "film-boundary",
    "media",
    "media",
    "network",
    "network",
    "timing-stale",
    "typescript",
  ]);
  assert.ok(
    report.errors.every(({ message }) => !message.includes("打开")),
    "on-screen URL text is not a network access",
  );
  assert.deepEqual(
    report.warnings.map(({ rule }) => rule),
    ["small-text"],
  );
  assert.ok(report.errors.find(({ rule }) => rule === "network")?.line);
});

test("the scaffolded film passes check", async (context) => {
  const root = await createWorkspace(context);
  await writeFilm(root, "fresh-film");
  await runFilmVoice({
    rootDir: root,
    filmId: "fresh-film",
    createService: fakeVoice,
  });
  const report = await checkFilm({ rootDir: root, filmId: "fresh-film" });
  assert.deepEqual(report, {
    status: "film-check-passed",
    filmId: "fresh-film",
    errors: [],
    warnings: [],
  });
});

test("static small-text uses the shared review threshold and preserves its message", async (context) => {
  const root = await createWorkspace(context);
  const minimum = minimumReadableFontSize(1080, 1920);
  await writeFilm(root, "threshold-film", {
    film: FILM_SOURCE.replace("fontSize: 72", `fontSize: ${minimum - 1}`),
  });
  await runFilmVoice({
    rootDir: root,
    filmId: "threshold-film",
    createService: fakeVoice,
  });
  const report = await checkFilm({ rootDir: root, filmId: "threshold-film" });
  assert.deepEqual(report.errors, []);
  assert.equal(report.warnings.length, 1);
  assert.equal(
    report.warnings[0]!.message,
    `fontSize ${minimum - 1} is under ${minimum}px for a 1080×1920 frame; make sure it is decorative or readable on a phone.`,
  );
  await writeFile(
    filmPaths(root, "threshold-film").film,
    FILM_SOURCE.replace("fontSize: 72", `fontSize: ${minimum}`),
  );
  assert.deepEqual(
    (await checkFilm({ rootDir: root, filmId: "threshold-film" })).warnings,
    [],
  );
});

test("the Skill's example segments pass film:check inside a film", async (context) => {
  const guides = [
    { path: "references/examples.md", segments: 3 },
    { path: "references/styles/anime-op.md", segments: 1 },
  ];
  const examples: string[] = [];
  for (const guide of guides) {
    const source = await readFile(
      join(repoRoot, ".agents/skills/axmorf-film", guide.path),
      "utf8",
    );
    const found = [...source.matchAll(/```tsx\n([\s\S]*?)```/gu)].map(
      (match) => match[1]!,
    );
    assert.equal(found.length, guide.segments, guide.path);
    examples.push(...found);
  }
  const root = await createWorkspace(context);
  for (const [index, example] of examples.entries()) {
    const segment = example.match(/export const (\w+Segment)/u)?.[1];
    assert.ok(segment, `example ${index} exports a segment`);
    const filmId = `example-film-${index}`;
    await writeFilm(root, filmId, {
      film: `${example}
// Aliased so examples may import the same names themselves.
import { AbsoluteFill as ExampleFill, Sequence as ExampleSequence } from "remotion";
import {
  FilmCaptions as ExampleCaptions,
  FilmSoundtrack as ExampleSoundtrack,
  useFilmTiming as useExampleTiming,
} from "@axmorf/studio/remotion";

const Film = () => {
  const { durationInFrames } = useExampleTiming();
  return (
    <ExampleFill>
      <ExampleSequence durationInFrames={durationInFrames}>
        <${segment} durationInFrames={durationInFrames} />
      </ExampleSequence>
      <ExampleSoundtrack />
      <ExampleCaptions />
    </ExampleFill>
  );
};

export default Film;
`,
    });
    await runFilmVoice({ rootDir: root, filmId, createService: fakeVoice });
    const report = await checkFilm({ rootDir: root, filmId });
    assert.deepEqual(report.errors, [], `example ${index}`);
    assert.deepEqual(report.warnings, [], `example ${index}`);
  }
});

const fakeMedia = (
  calls: string[],
  failStill = false,
  expectedFrames = 90,
): FilmDeliveryMedia => ({
  renderVideo: async ({ outputPath }) => {
    calls.push("video");
    await writeFile(outputPath, "video-bytes");
  },
  renderStill: async ({ compositionId, outputPath }) => {
    calls.push(compositionId);
    if (failStill) throw new Error("still failed");
    await writeFile(outputPath, compositionId);
  },
  inspectVideo: async ({ frameCount }) => {
    assert.equal(frameCount, expectedFrames);
    return {} as never;
  },
  inspectCover: async () => ({}) as never,
});

test("deliver replaces the delivery only after every file renders and keeps the previous one", async (context) => {
  const root = await createWorkspace(context);
  const paths = await writeFilm(root, "ship-film");
  await runFilmVoice({
    rootDir: root,
    filmId: "ship-film",
    createService: fakeVoice,
  });

  const calls: string[] = [];
  const first = await deliverFilm({
    rootDir: root,
    filmId: "ship-film",
    media: fakeMedia(calls),
    now: () => new Date("2026-10-14T01:00:00Z"),
  });
  assert.equal(first.status, "film-delivered");
  assert.equal(first.previousDelivery, null);
  assert.deepEqual(calls, [
    "video",
    "ship-film--cover-4x3",
    "ship-film--cover-3x4",
  ]);
  assert.deepEqual((await readdir(paths.delivery)).sort(), [
    "cover-3x4.png",
    "cover-4x3.png",
    "publish.json",
    "video.mp4",
  ]);
  const publish = FilmPublishSchema.parse(
    JSON.parse(await readFile(join(paths.delivery, "publish.json"), "utf8")),
  );
  assert.equal(publish.files.video.path, "deliveries/ship-film/video.mp4");
  assert.equal(publish.durationInFrames, 90);

  await assert.rejects(
    deliverFilm({
      rootDir: root,
      filmId: "ship-film",
      media: fakeMedia([], true),
    }),
    /still failed/u,
  );
  assert.equal(
    await readFile(join(paths.delivery, "cover-4x3.png"), "utf8"),
    "ship-film--cover-4x3",
    "a failed delivery leaves the current one untouched",
  );
  assert.deepEqual(await readdir(join(root, ".axmorf/staging")), []);

  const second = await deliverFilm({
    rootDir: root,
    filmId: "ship-film",
    media: fakeMedia([]),
    now: () => new Date("2026-10-14T02:00:00Z"),
  });
  assert.equal(
    second.previousDelivery,
    ".axmorf/history/ship-film/2026-10-14T01-00-00-000Z",
  );
  assert.deepEqual((await readdir(paths.history)).length, 1);

  const listed = await listFilms(root);
  assert.equal(listed.films[0]?.delivered?.seconds, 3);
});

test("delivery refuses a film that fails check", async (context) => {
  const root = await createWorkspace(context);
  await writeFilm(root, "stale-film");
  await assert.rejects(
    deliverFilm({ rootDir: root, filmId: "stale-film", media: fakeMedia([]) }),
    /film:check failed[\s\S]*timing-stale/u,
  );
});

test("delete needs confirmation and removes only the film's own paths", async (context) => {
  const root = await createWorkspace(context);
  const keep = await writeFilm(root, "keep-film");
  const drop = await writeFilm(root, "drop-film");
  await runFilmVoice({
    rootDir: root,
    filmId: "drop-film",
    createService: fakeVoice,
  });
  await mkdir(join(drop.delivery), { recursive: true });
  await writeFile(join(drop.delivery, "video.mp4"), "x");
  await mkdir(join(root, "public/assets/axmorf-shared"), { recursive: true });

  await assert.rejects(
    deleteFilm({ rootDir: root, filmId: "drop-film", confirm: false }),
    /--confirm-delete/u,
  );
  const result = await deleteFilm({
    rootDir: root,
    filmId: "drop-film",
    confirm: true,
  });
  assert.deepEqual(result.removed, [
    "src/films/drop-film",
    "deliveries/drop-film",
  ]);
  await assert.rejects(stat(drop.dir));
  await stat(keep.spec);
  await stat(join(root, "public/assets/axmorf-shared"));
  const registry = await readFile(join(root, "src/films/index.ts"), "utf8");
  assert.doesNotMatch(registry, /drop-film/u);
  assert.match(registry, /keep-film/u);
});

test("delivery verifies the system bookends around the authored body", async (context) => {
  const root = await createWorkspace(context);
  const paths = await writeFilm(root, "bookend-film", {
    spec: {
      bookends: {
        intro: "axmorf-brand-reveal-v1",
        outro: "axmorf-source-follow-v1",
      },
    },
  });
  await runFilmVoice({
    rootDir: root,
    filmId: "bookend-film",
    createService: fakeVoice,
  });
  // 60 intro + 90 body + 240 outro at 30 fps.
  const result = await deliverFilm({
    rootDir: root,
    filmId: "bookend-film",
    media: fakeMedia([], false, 390),
  });
  assert.equal(result.durationInFrames, 390);
  assert.deepEqual(result.bookends, { introFrames: 60, outroFrames: 240 });
  const publish = FilmPublishSchema.parse(
    JSON.parse(await readFile(join(paths.delivery, "publish.json"), "utf8")),
  );
  assert.equal(publish.durationInFrames, 390);
});

/** Clicks with an accent on every fourth beat, starting at 0.25 s (120 BPM by default). */
const clickTrackWav = (seconds: number, bpm = 120) => {
  const rate = 48_000;
  const frames = Math.round(seconds * rate);
  const pcm = Buffer.alloc(frames * 4);
  for (let beat = 0; ; beat++) {
    const start = Math.round((0.25 + (beat * 60) / bpm) * rate);
    if (start >= frames) break;
    const gain = beat % 4 === 0 ? 0.9 : 0.45;
    for (let i = 0; i < 1200 && start + i < frames; i++) {
      const value = Math.round(
        Math.sin((2 * Math.PI * 900 * i) / rate) *
          Math.exp(-i / 240) *
          gain *
          32767,
      );
      pcm.writeInt16LE(value, 4 * (start + i));
      pcm.writeInt16LE(value, 4 * (start + i) + 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const withListChunk = (wav: Buffer) => {
  const list = Buffer.alloc(8 + 14);
  list.write("LIST", 0, "ascii");
  list.writeUInt32LE(14, 4);
  list.write("INFOISFT", 8, "ascii");
  const out = Buffer.concat([wav.subarray(0, 36), list, wav.subarray(36)]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
};

test("a registered track becomes the film's music on an authored beat grid", async (context) => {
  const root = await createWorkspace(context);
  const track = clickTrackWav(8);
  const paths = await writeFilm(root, "track-film", {
    spec: {
      timeline: { durationInFrames: 180 },
      music: {
        track: { asset: "song.wav", sectionBars: [0, 2] },
        volume: 0.9,
        underSpeechVolume: 0.9,
      },
    },
  });
  await mkdir(paths.assetDir, { recursive: true });
  await writeFile(join(paths.assetDir, "song.wav"), track);
  const { createHash } = await import("node:crypto");
  const checksum = `sha256:${createHash("sha256").update(track).digest("hex")}`;
  const register = (sum: string) =>
    writeFile(
      paths.assets,
      JSON.stringify({
        schemaVersion: 1,
        filmId: "track-film",
        assets: [
          {
            publicPath: "public/films/track-film/assets/song.wav",
            checksum: sum,
            kind: "audio",
            origin: "licensed",
            creator: "Test Band",
            license: "CC BY 4.0",
            sourceUrl: "https://example.com/song",
          },
        ],
      }),
    );
  await register(checksum);
  await runFilmVoice({
    rootDir: root,
    filmId: "track-film",
    createService: fakeVoice,
  });
  const { runFilmMusic } = await import("../../scripts/films/music");
  const options = {
    rootDir: root,
    filmId: "track-film",
    // FFmpeg output carries a LIST chunk; mastering must still see canonical PCM.
    decodeTrack: async () => withListChunk(track),
    masterScore: (raw: Buffer) => {
      assert.equal(raw.toString("ascii", 36, 40), "data");
      return raw;
    },
  };
  // Without a grid, film:music suggests one from the audio and writes nothing.
  await assert.rejects(
    () => runFilmMusic(options),
    /"bpm": 120, "firstDownbeatSeconds": 0\.25/u,
  );
  const spec = JSON.parse(await readFile(paths.spec, "utf8"));
  spec.music.track = {
    ...spec.music.track,
    bpm: 120,
    firstDownbeatSeconds: 0.25,
  };
  await writeFile(paths.spec, JSON.stringify(spec));
  const result = await runFilmMusic(options);
  assert.equal(result.source, "track");
  assert.equal(result.scoreDurationInFrames, 240);
  assert.deepEqual(result.barFrames, [8, 68, 128]);
  assert.deepEqual(result.sectionFrames, [8, 128]);
  assert.deepEqual(result.accentFrames, [8, 128]);
  assert.equal("notes" in result, false);
  assert.deepEqual(
    (await checkFilm({ rootDir: root, filmId: "track-film" })).errors,
    [],
  );
  // Re-registering different audio under the same name makes the music stale.
  await register(`sha256:${"0".repeat(64)}`);
  assert.deepEqual(
    (await checkFilm({ rootDir: root, filmId: "track-film" })).errors.map(
      ({ rule }) => rule,
    ),
    ["music-stale"],
  );
});

test("music needs exactly one source and a registered track", async (context) => {
  const root = await createWorkspace(context);
  await writeFilm(root, "no-source", {
    spec: { music: { volume: 0.2 } },
  });
  assert.match(
    (await checkFilm({ rootDir: root, filmId: "no-source" })).errors
      .map(({ message }) => message)
      .join(),
    /exactly one of music\.score/u,
  );
  await writeFilm(root, "missing-track", {
    spec: {
      music: {
        track: { asset: "gone.mp3", bpm: 128, firstDownbeatSeconds: 0 },
      },
    },
  });
  await runFilmVoice({
    rootDir: root,
    filmId: "missing-track",
    createService: fakeVoice,
  });
  const { runFilmMusic } = await import("../../scripts/films/music");
  await assert.rejects(
    () =>
      runFilmMusic({
        rootDir: root,
        filmId: "missing-track",
        decodeTrack: async () => Buffer.alloc(0),
      }),
    /not a registered audio asset/u,
  );
});

test("film:new can decide bookends per film without touching the Workspace default", async (context) => {
  const root = await createWorkspace(context);
  const { validProducerConfig } = await import("../fixtures/producer-config");
  const { buildProducerConfig } = await import("@axmorf/studio/contracts");
  const configPath = join(root, "producer.config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      buildProducerConfig({
        ...validProducerConfig,
        sceneDefaults: {
          introSceneTemplateId: "axmorf-brand-reveal-v1",
          outroSceneTemplateId: "axmorf-source-follow-v1",
        },
      }),
    ),
  );
  const { createFilm } = await import("../../scripts/films/new");
  const env = { RSP_PRODUCER_CONFIG: configPath };
  const bookendsOf = async (
    filmId: string,
    bookends?: "workspace" | "both" | "none",
  ) => {
    await createFilm({
      rootDir: root,
      filmId,
      title: "测试",
      env,
      ...(bookends ? { bookends } : {}),
    });
    const spec = JSON.parse(
      await readFile(filmPaths(root, filmId).spec, "utf8"),
    );
    return [spec.bookends.intro, spec.bookends.outro];
  };
  assert.deepEqual(await bookendsOf("explainer-film"), [
    "axmorf-brand-reveal-v1",
    "axmorf-source-follow-v1",
  ]);
  assert.deepEqual(await bookendsOf("music-video", "none"), [null, null]);
  assert.deepEqual(await bookendsOf("branded-mv", "both"), [
    "axmorf-brand-reveal-v1",
    "axmorf-source-follow-v1",
  ]);
  // The Workspace config is read, never rewritten.
  assert.equal(
    JSON.parse(await readFile(configPath, "utf8")).sceneDefaults
      .introSceneTemplateId,
    "axmorf-brand-reveal-v1",
  );
});

test("the tempo suggestion keeps fast songs at full speed", async () => {
  const { estimateTrackTempo, readWavMono } =
    await import("../../scripts/films/music-track");
  const { samples, sampleRate } = readWavMono(clickTrackWav(12, 172));
  const { bpm } = estimateTrackTempo(samples, sampleRate);
  // A suggestion within one BPM; the author writes the exact value.
  assert.ok(Math.abs(bpm - 172) <= 1, `expected about 172 BPM, got ${bpm}`);
});
