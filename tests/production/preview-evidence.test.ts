import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ProductionPreviewEvidenceSchema,
  buildProductionPreviewEvidence,
} from "../../src/contracts";
import { inspectProductionPreviewMedia } from "../../scripts/production/application/preview-evidence";
import { validPreviewEvidenceInput } from "./preview-fixture";

test("accepts only mechanically-ready current preview evidence", () => {
  const evidence = buildProductionPreviewEvidence(validPreviewEvidenceInput);
  assert.equal(evidence.aggregateStatus, "mechanically-ready");
  assert.equal(
    ProductionPreviewEvidenceSchema.parse(evidence).evidenceFingerprint,
    evidence.evidenceFingerprint,
  );
  assert.throws(() =>
    buildProductionPreviewEvidence({
      ...validPreviewEvidenceInput,
      aggregateStatus: "approved",
    }),
  );
  assert.throws(() =>
    buildProductionPreviewEvidence({
      ...validPreviewEvidenceInput,
      technical: {
        ...validPreviewEvidenceInput.technical,
        actual: {
          ...validPreviewEvidenceInput.technical.actual,
          frameCount: 299,
        },
      },
    }),
  );
});

test("inspects exact streams frames duration and complete decode with a fake runner", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-preview-evidence-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const relativePath = "out/story-example/production/run/preview.mp4";
  await mkdir(join(rootDir, "out/story-example/production/run"), {
    recursive: true,
  });
  await writeFile(join(rootDir, relativePath), "synthetic-preview-bytes");
  const commands: string[] = [];
  const technical = await inspectProductionPreviewMedia({
    rootDir,
    relativePath,
    expected: { width: 1920, height: 1080, fps: 30, frameCount: 300 },
    runProcess: async (command) => {
      commands.push(command);
      return command.endsWith("ffprobe")
        ? {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({
              streams: [
                {
                  codec_type: "video",
                  codec_name: "h264",
                  width: 1920,
                  height: 1080,
                  avg_frame_rate: "30/1",
                  nb_read_frames: "300",
                  duration: "10.000000",
                },
                { codec_type: "audio", codec_name: "aac" },
              ],
              format: { duration: "10.045000" },
            }),
          }
        : { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(technical.actual.decodedToEof, true);
  assert.deepEqual(commands, ["ffprobe", "ffmpeg"]);
});

test("rejects truncated media and decode failures", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-preview-truncated-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const relativePath = "out/story-example/production/run/preview.mp4";
  await mkdir(join(rootDir, "out/story-example/production/run"), {
    recursive: true,
  });
  await writeFile(join(rootDir, relativePath), "truncated-preview-bytes");
  await assert.rejects(() =>
    inspectProductionPreviewMedia({
      rootDir,
      relativePath,
      expected: { width: 1920, height: 1080, fps: 30, frameCount: 300 },
      runProcess: async (command) =>
        command.endsWith("ffprobe")
          ? {
              status: 0,
              stderr: "",
              stdout: JSON.stringify({
                streams: [
                  {
                    codec_type: "video",
                    codec_name: "h264",
                    width: 1920,
                    height: 1080,
                    avg_frame_rate: "30/1",
                    nb_read_frames: "299",
                  },
                  { codec_type: "audio", codec_name: "aac" },
                ],
                format: { duration: "9.9" },
              }),
            }
          : { status: 1, stdout: "", stderr: "decode failed" },
    }),
  );
});
