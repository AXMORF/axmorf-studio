import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Sha256DigestSchema } from "../../src/contracts";
import {
  checkPersistedNarrativeAutoCheck,
  serializeNarrativeAutoCheckReport,
  writeNarrativeAutoCheckIfPassed,
} from "../../scripts/project-check/report-files";
import { runNarrativeAutoCheck } from "../../scripts/project-check/run";
import type { ProcessRunner } from "../../scripts/baseline/evidence";

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
  return args.join(" ").includes("crop=64:64:0:0") ||
    args.some((argument) => argument.includes("frame-0"))
    ? ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n")
    : ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\n");
};

const currentPass = () =>
  runNarrativeAutoCheck({
    rootDir: process.cwd(),
    projectId: "gps-relativity",
    runM3EvidenceProcess: validEvidenceProcess,
  });

test("pass-only writer is canonical atomic and byte-mtime stable", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-auto-check-write-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const report = await currentPass();
  const result = await writeNarrativeAutoCheckIfPassed({ rootDir, report });
  const firstBytes = await readFile(result.destination);
  const firstMtime = (await stat(result.destination)).mtimeMs;
  assert.equal(firstBytes.toString("utf8"), serializeNarrativeAutoCheckReport(report));
  assert.ok(firstBytes.toString("utf8").endsWith("\n"));

  const repeated = await writeNarrativeAutoCheckIfPassed({ rootDir, report });
  assert.equal(repeated.written, false);
  assert.deepEqual(await readFile(result.destination), firstBytes);
  assert.equal((await stat(result.destination)).mtimeMs, firstMtime);
  await checkPersistedNarrativeAutoCheck({ rootDir, expectedReport: report });
});

test("fail schema and fingerprint errors never create or overwrite a report", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-auto-check-reject-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const pass = await currentPass();
  const destination = join(
    rootDir,
    "src/projects/gps-relativity/generated/narrative-auto-check.generated.json",
  );
  const failRoot = await mkdtemp(join(tmpdir(), "rsp-auto-check-fail-input-"));
  context.after(() => rm(failRoot, { recursive: true, force: true }));
  const fail = await runNarrativeAutoCheck({
    rootDir: failRoot,
    projectId: "gps-relativity",
    runM3EvidenceProcess: validEvidenceProcess,
  });
  await assert.rejects(() =>
    writeNarrativeAutoCheckIfPassed({ rootDir, report: fail }),
  );
  await assert.rejects(() => access(destination));

  await writeNarrativeAutoCheckIfPassed({ rootDir, report: pass });
  const validBytes = await readFile(destination);
  await assert.rejects(() =>
    writeNarrativeAutoCheckIfPassed({
      rootDir,
      report: {
        ...pass,
        reportFingerprint: Sha256DigestSchema.parse(
          `sha256:${"0".repeat(64)}`,
        ),
      },
    }),
  );
  assert.deepEqual(await readFile(destination), validBytes);
});

test("read-only persisted check rejects missing malformed stale and byte drift without repair", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-auto-check-read-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const report = await currentPass();
  const destination = join(
    rootDir,
    "src/projects/gps-relativity/generated/narrative-auto-check.generated.json",
  );
  await assert.rejects(() =>
    checkPersistedNarrativeAutoCheck({ rootDir, expectedReport: report }),
  );
  await assert.rejects(() => access(destination));

  const written = await writeNarrativeAutoCheckIfPassed({ rootDir, report });
  await writeFile(written.destination, "{malformed");
  await assert.rejects(() =>
    checkPersistedNarrativeAutoCheck({ rootDir, expectedReport: report }),
  );
  assert.equal(await readFile(written.destination, "utf8"), "{malformed");

  await writeFile(
    written.destination,
    `${serializeNarrativeAutoCheckReport(report)} `,
  );
  const drift = await readFile(written.destination);
  await assert.rejects(() =>
    checkPersistedNarrativeAutoCheck({ rootDir, expectedReport: report }),
  );
  assert.deepEqual(await readFile(written.destination), drift);
});
