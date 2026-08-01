import assert from "node:assert/strict";
import test from "node:test";

import {
  M3NarrativeBaselineEvidenceReceiptInputSchema,
  Sha256DigestSchema,
} from "../../src/contracts";
import { projectRegistry } from "../../src/projects/project-registry.generated";
import {
  createM3EvidenceReceipt,
  inspectAlphaStill,
  inspectBaselineRender,
  runBaselineEvidenceCli,
  type ProcessRunner,
} from "../../scripts/baseline/evidence";

const ok = (stdout: string): Awaited<ReturnType<ProcessRunner>> => ({
  status: 0,
  stdout,
  stderr: "",
});

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
        rootDir: "/repo",
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
