import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { M3NarrativeBaselineEvidenceReceiptSchema } from "../../../contracts";
import {
  collectCurrentM3NarrativeBaselineEvidence,
  type ProcessRunner,
} from "../../../../scripts/baseline/evidence";

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
  return args.join(" ").includes("crop=64:64:0:0") ||
    args.some((argument) => argument.includes("frame-0"))
    ? ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n")
    : ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\n");
};

test("current real M3 evidence recollects to the persisted strict receipt", async () => {
  const current = await collectCurrentM3NarrativeBaselineEvidence({
    rootDir: process.cwd(),
    storyId: "gps-relativity",
    runProcess: validEvidenceProcess,
  });
  const persisted = M3NarrativeBaselineEvidenceReceiptSchema.parse(
    JSON.parse(
      await readFile(
        join(
          process.cwd(),
          "src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json",
        ),
        "utf8",
      ),
    ),
  );
  assert.deepEqual(current, persisted);
});
