import assert from "node:assert/strict";
import test from "node:test";

import { NARRATIVE_AUTO_CHECK_IDS } from "../../../contracts";
import type { ProcessRunner } from "../../../../scripts/baseline/evidence";
import { runNarrativeAutoCheck } from "../../../../scripts/project-check/run";

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
          { codec_type: "audio", codec_name: "aac" },
        ],
      }),
    );
  }
  if (args.join(" ").includes("crop=64:64:0:0")) {
    return ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n");
  }
  return args.some((argument) => argument.includes("frame-0"))
    ? ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n")
    : ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\n");
};

test("real GPS inputs aggregate every M1-M3 check into one strict in-memory pass", async () => {
  const report = await runNarrativeAutoCheck({
    rootDir: process.cwd(),
    projectId: "gps-relativity",
    runM3EvidenceProcess: validEvidenceProcess,
  });
  assert.equal(report.aggregateStatus, "pass");
  assert.equal(
    report.reportFingerprint,
    "sha256:dd1dc79547123cc2a3c69a3f95ce81cdf951f3e569afbbdb94b51345bc52424c",
  );
  assert.deepEqual(
    report.checks.map((check) => check.checkId),
    NARRATIVE_AUTO_CHECK_IDS,
  );
  assert.ok(report.checks.every((check) => check.status === "pass"));
  assert.equal(
    report.inputIdentity.sealedNarrationFingerprint,
    "sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5",
  );
  assert.equal(
    report.inputIdentity.semanticTimingFingerprint,
    "sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c",
  );
  assert.equal(
    report.inputIdentity.narrativeBaselineFingerprint,
    "sha256:ee5a1af1f9dc9017cdb3fa43cb781defad184654fcd93873812122d748650244",
  );
  assert.equal(
    report.inputIdentity.m3EvidenceFingerprint,
    "sha256:92f66128c1223995d8436db2fcbbbe4bef2fbe5bf81473ea4fa28109220bd605",
  );
  assert.ok(
    report.evidenceRefs.every(
      (reference) =>
        !reference.repositoryPath.startsWith("/") &&
        !reference.repositoryPath.startsWith("out/") &&
        !reference.repositoryPath.includes(".narration-work"),
    ),
  );
});
