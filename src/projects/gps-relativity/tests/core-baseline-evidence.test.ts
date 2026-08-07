import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  M3NarrativeBaselineEvidenceReceiptInputSchema,
  Sha256DigestSchema,
} from "../../../contracts";
import { projectRegistry } from "../../project-registry.generated";
import {
  createM3EvidenceReceipt,
  checkM3NarrativeBaselineEvidence,
  collectCurrentM3NarrativeBaselineEvidence,
  inspectAlphaStill,
  inspectBaselineRender,
  resolveCurrentM3Entry,
  runBaselineEvidenceCli,
  writeM3NarrativeBaselineEvidence,
  type ProcessRunner,
} from "../../../../scripts/baseline/evidence";
import { generateProjectRegistry } from "../../../../scripts/registry/generate";

const ok = (stdout: string): Awaited<ReturnType<ProcessRunner>> => ({
  status: 0,
  stdout,
  stderr: "",
});

const validEvidenceProcess: ProcessRunner = async (command, args) => {
  if (command === "ffprobe") {
    return ok(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            avg_frame_rate: "30/1",
            nb_read_frames: "1731",
          },
          {
            codec_type: "audio",
            codec_name: "aac",
            sample_rate: "48000",
            channels: 1,
          },
        ],
        format: { duration: "57.700000" },
      }),
    );
  }
  if (command !== "ffmpeg") throw new Error("unexpected process");
  if (args.join(" ").includes("crop=64:64:0:0")) {
    return ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n");
  }
  return args.some((argument) => argument.includes("frame-0"))
    ? ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n")
    : ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\n");
};

const createEvidenceRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-m3-evidence-test-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sourceRoot = process.cwd();
  const projectFiles = [
    "brief.json",
    "story.json",
    "narration.json",
    "render.json",
    "Composition.tsx",
    "generated/sealed-narration.generated.json",
    "generated/semantic-timing.generated.json",
  ] as const;
  for (const relativePath of projectFiles) {
    const destination = join(
      rootDir,
      "src/projects/gps-relativity",
      relativePath,
    );
    await mkdir(dirname(destination), { recursive: true });
    await cp(
      join(sourceRoot, "src/projects/gps-relativity", relativePath),
      destination,
    );
  }
  await generateProjectRegistry({ rootDir, mode: "write" });
  const mediaPaths = {
    transparentStill: "out/gps-relativity/m3-transparent-frame-0.png",
    captionStill: "out/gps-relativity/m3-caption-frame-15.png",
    render: "out/gps-relativity/m3-narrative-baseline.mp4",
    receipt:
      "src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json",
    registry: "src/projects/project-registry.generated.ts",
  } as const;
  for (const [key, relativePath] of Object.entries(mediaPaths)) {
    if (key === "receipt" || key === "registry") continue;
    const destination = join(rootDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `synthetic-${key}`);
  }
  return { rootDir, mediaPaths };
};

test("frame zero must be fully transparent", async () => {
  const fakeFfmpeg: ProcessRunner = async () =>
    ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n");
  assert.deepEqual(await inspectAlphaStill("frame-0.png", fakeFfmpeg), {
    alphaMin: 0,
    alphaMax: 0,
  });
});

test("caption frame keeps transparent exterior and visible caption pixels", async () => {
  const fakeFfmpeg: ProcessRunner = async (_command, args) =>
    args.join(" ").includes("crop=64:64:0:0")
      ? ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n")
      : ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\n");
  const alpha = await inspectAlphaStill("frame-15.png", fakeFfmpeg, true);
  assert.equal(alpha.alphaMin, 0);
  assert.ok(alpha.alphaMax > 0);
  assert.equal(alpha.topLeftAlphaMax, 0);
});

test("render metadata must match the registered Composition", async () => {
  const fakeFfprobe: ProcessRunner = async () =>
    ok(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            avg_frame_rate: "30/1",
            nb_read_frames: "1731",
          },
          {
            codec_type: "audio",
            codec_name: "aac",
            sample_rate: "48000",
            channels: 1,
          },
        ],
        format: { duration: "57.700000" },
      }),
    );
  assert.deepEqual(await inspectBaselineRender("baseline.mp4", fakeFfprobe), {
    fps: 30,
    durationInFrames: 1731,
    videoStreamCount: 1,
    audioStreamCount: 1,
  });
});

test("render inspection accepts vertical registry metadata instead of GPS fixture constants", async () => {
  const fakeFfprobe: ProcessRunner = async () =>
    ok(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            avg_frame_rate: "30/1",
            nb_read_frames: "4500",
          },
          {
            codec_type: "audio",
            codec_name: "aac",
            sample_rate: "48000",
            channels: 1,
          },
        ],
        format: { duration: "150.000000" },
      }),
    );
  assert.deepEqual(
    await inspectBaselineRender("vertical.mp4", fakeFfprobe, {
      fps: 30,
      durationInFrames: 4500,
    }),
    {
      fps: 30,
      durationInFrames: 4500,
      videoStreamCount: 1,
      audioStreamCount: 1,
    },
  );
});

test("collector source derives Composition and caption evidence identities", async () => {
  const source = await readFile(
    join(process.cwd(), "scripts/baseline/evidence.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /entry\.descriptor\.id !== "GpsRelativity"/);
  assert.doesNotMatch(source, /m3-caption-frame-15\.png/);
  assert.doesNotMatch(source, /durationInFrames !== 1731/);
});

const digest = (character: string) =>
  Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);

const evidenceInput = M3NarrativeBaselineEvidenceReceiptInputSchema.parse({
  schemaVersion: 1,
  storyId: "gps-relativity",
  compositionId: "GpsRelativity",
  sealedNarrationFingerprint:
    "sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5",
  semanticTimingFingerprint:
    "sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c",
  generatedRegistryChecksum: digest("a"),
  projectRegistryEntryFingerprint:
    projectRegistry[0].projectRegistryEntryFingerprint,
  narrativeBaselineFingerprint: projectRegistry[0].narrativeBaselineFingerprint,
  artifacts: {
    transparentStill: {
      localPath: "out/gps-relativity/m3-transparent-frame-0.png",
      checksum: digest("b"),
      frame: 0,
      alphaMin: 0,
      alphaMax: 0,
    },
    captionStill: {
      localPath: "out/gps-relativity/m3-caption-frame-15.png",
      checksum: digest("c"),
      frame: 15,
      alphaMin: 0,
      alphaMax: 255,
      topLeftAlphaMax: 0,
    },
    render: {
      localPath: "out/gps-relativity/m3-narrative-baseline.mp4",
      checksum: digest("d"),
      fps: 30,
      durationInFrames: 1731,
      videoStreamCount: 1,
      audioStreamCount: 1,
    },
  },
});

test("receipt changes when an evidence artifact checksum changes", () => {
  const original = createM3EvidenceReceipt(evidenceInput);
  const changed = createM3EvidenceReceipt({
    ...evidenceInput,
    artifacts: {
      ...evidenceInput.artifacts,
      render: { ...evidenceInput.artifacts.render, checksum: digest("e") },
    },
  });
  assert.notEqual(original.evidenceFingerprint, changed.evidenceFingerprint);
  assert.equal(
    original.narrativeBaselineFingerprint,
    changed.narrativeBaselineFingerprint,
  );
});

test("inspection fails closed on process alpha and media mismatches", async () => {
  const failed: ProcessRunner = async () => ({
    status: 1,
    stdout: "",
    stderr: "missing or unsupported alpha",
  });
  await assert.rejects(() => inspectAlphaStill("missing.png", failed));
  await assert.rejects(() => inspectBaselineRender("missing.mp4", failed));

  const opaque: ProcessRunner = async () =>
    ok("lavfi.signalstats.YMIN=255\nlavfi.signalstats.YMAX=255\n");
  assert.deepEqual(await inspectAlphaStill("opaque.png", opaque), {
    alphaMin: 255,
    alphaMax: 255,
  });

  const wrongMedia: ProcessRunner = async () =>
    ok(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "vp9",
            avg_frame_rate: "24/1",
            nb_read_frames: "1700",
          },
        ],
        format: { duration: "1" },
      }),
    );
  await assert.rejects(
    () => inspectBaselineRender("wrong.mp4", wrongMedia),
    /H\.264|30 fps|1731|audio/i,
  );
});

test("baseline evidence CLI rejects unknown projects flags and destinations", async () => {
  const unreachable = async () => {
    throw new Error("must not execute");
  };
  await assert.rejects(
    () =>
      runBaselineEvidenceCli(["--project", "unknown"], {
        rootDir: process.cwd(),
        runProcess: unreachable,
        stdout: () => undefined,
      }),
    /unknown project/i,
  );
  await assert.rejects(
    () =>
      runBaselineEvidenceCli(
        ["--project", "gps-relativity", "--output", "m2.json"],
        {
          rootDir: "/repo",
          runProcess: unreachable,
          stdout: () => undefined,
        },
      ),
    /--project/i,
  );
});

test("collector resolves the current root and read-only check preserves receipt bytes and mtime", async (context) => {
  const { rootDir, mediaPaths } = await createEvidenceRoot(context);
  const entry = await resolveCurrentM3Entry(rootDir, "gps-relativity");
  assert.equal(entry.descriptor.id, "GpsRelativity");

  const collected = await collectCurrentM3NarrativeBaselineEvidence({
    rootDir,
    storyId: "gps-relativity",
    runProcess: validEvidenceProcess,
  });
  const written = await writeM3NarrativeBaselineEvidence({
    rootDir,
    storyId: "gps-relativity",
    runProcess: validEvidenceProcess,
  });
  assert.deepEqual(written, collected);

  const receiptPath = join(rootDir, mediaPaths.receipt);
  const beforeBytes = await readFile(receiptPath);
  const beforeMtime = (await stat(receiptPath)).mtimeMs;
  await checkM3NarrativeBaselineEvidence({
    rootDir,
    storyId: "gps-relativity",
    runProcess: validEvidenceProcess,
  });
  assert.deepEqual(await readFile(receiptPath), beforeBytes);
  assert.equal((await stat(receiptPath)).mtimeMs, beforeMtime);
});

test("read-only M3 check rejects missing malformed and valid-shape receipt drift without repair", async (context) => {
  const { rootDir, mediaPaths } = await createEvidenceRoot(context);
  await writeM3NarrativeBaselineEvidence({
    rootDir,
    storyId: "gps-relativity",
    runProcess: validEvidenceProcess,
  });
  const receiptPath = join(rootDir, mediaPaths.receipt);
  const validBytes = await readFile(receiptPath);

  await rm(receiptPath);
  await assert.rejects(() =>
    checkM3NarrativeBaselineEvidence({
      rootDir,
      storyId: "gps-relativity",
      runProcess: validEvidenceProcess,
    }),
  );
  await assert.rejects(() => readFile(receiptPath));

  await writeFile(receiptPath, "{malformed");
  await assert.rejects(() =>
    checkM3NarrativeBaselineEvidence({
      rootDir,
      storyId: "gps-relativity",
      runProcess: validEvidenceProcess,
    }),
  );
  assert.equal(await readFile(receiptPath, "utf8"), "{malformed");

  const valid = JSON.parse(validBytes.toString("utf8")) as Record<
    string,
    unknown
  >;
  const { evidenceFingerprint: _fingerprint, ...validInput } = valid;
  assert.equal(typeof _fingerprint, "string");
  const drifted = createM3EvidenceReceipt({
    ...(validInput as unknown as typeof evidenceInput),
    sealedNarrationFingerprint: digest("9"),
  });
  await writeFile(receiptPath, `${JSON.stringify(drifted, null, 2)}\n`);
  const driftBytes = await readFile(receiptPath);
  await assert.rejects(() =>
    checkM3NarrativeBaselineEvidence({
      rootDir,
      storyId: "gps-relativity",
      runProcess: validEvidenceProcess,
    }),
  );
  assert.deepEqual(await readFile(receiptPath), driftBytes);
});

test("read-only M3 check rejects registry artifact alpha and media drift", async (context) => {
  const { rootDir, mediaPaths } = await createEvidenceRoot(context);
  await writeM3NarrativeBaselineEvidence({
    rootDir,
    storyId: "gps-relativity",
    runProcess: validEvidenceProcess,
  });
  const receiptPath = join(rootDir, mediaPaths.receipt);
  const validReceipt = await readFile(receiptPath);

  await writeFile(join(rootDir, mediaPaths.render), "changed-render");
  await assert.rejects(() =>
    checkM3NarrativeBaselineEvidence({
      rootDir,
      storyId: "gps-relativity",
      runProcess: validEvidenceProcess,
    }),
  );
  assert.deepEqual(await readFile(receiptPath), validReceipt);

  await writeFile(join(rootDir, mediaPaths.render), "synthetic-render");
  const opaque: ProcessRunner = async (command) =>
    command === "ffprobe"
      ? validEvidenceProcess(command, [])
      : ok("lavfi.signalstats.YMIN=255\nlavfi.signalstats.YMAX=255\n");
  await assert.rejects(() =>
    checkM3NarrativeBaselineEvidence({
      rootDir,
      storyId: "gps-relativity",
      runProcess: opaque,
    }),
  );

  const wrongMedia: ProcessRunner = async (command, args) =>
    command === "ffprobe"
      ? ok(JSON.stringify({ streams: [] }))
      : validEvidenceProcess(command, args);
  await assert.rejects(() =>
    checkM3NarrativeBaselineEvidence({
      rootDir,
      storyId: "gps-relativity",
      runProcess: wrongMedia,
    }),
  );

  await writeFile(
    join(rootDir, mediaPaths.registry),
    `${await readFile(join(rootDir, mediaPaths.registry), "utf8")} `,
  );
  await assert.rejects(
    () =>
      checkM3NarrativeBaselineEvidence({
        rootDir,
        storyId: "gps-relativity",
        runProcess: validEvidenceProcess,
      }),
    /registry drift/i,
  );
});
