import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import type { ProcessRunner } from "../../scripts/baseline/evidence";
import {
  parseProjectCheckArgs,
  runProjectCheckCli,
} from "../../scripts/project-check/cli";
import { generateProjectRegistry } from "../../scripts/registry/generate";

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

const createCliRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-check-cli-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await cp(
    join(process.cwd(), "src/projects/gps-relativity"),
    join(rootDir, "src/projects/gps-relativity"),
    { recursive: true },
  );
  await cp(
    join(process.cwd(), "public/projects/gps-relativity"),
    join(rootDir, "public/projects/gps-relativity"),
    { recursive: true },
  );
  await cp(
    join(process.cwd(), "out/gps-relativity"),
    join(rootDir, "out/gps-relativity"),
    { recursive: true },
  );
  await rm(
    join(
      rootDir,
      "src/projects/gps-relativity/generated/narrative-auto-check.generated.json",
    ),
    { force: true },
  );
  await generateProjectRegistry({ rootDir, mode: "write" });
  return rootDir;
};

test("CLI supports only explicit write then default read-only validation", async (context) => {
  const rootDir = await createCliRoot(context);
  const output: string[] = [];
  const cliContext = {
    rootDir,
    runM3EvidenceProcess: validEvidenceProcess,
    stdout: output.push.bind(output),
  };
  await assert.rejects(() =>
    runProjectCheckCli(
      ["--project", "gps-relativity", "--level", "narrative"],
      cliContext,
    ),
  );
  await runProjectCheckCli(
    [
      "--project",
      "gps-relativity",
      "--level",
      "narrative",
      "--write-auto-check",
    ],
    cliContext,
  );
  await runProjectCheckCli(
    ["--project", "gps-relativity", "--level", "narrative"],
    cliContext,
  );
  assert.equal(output.length, 2);
  for (const line of output) {
    const summary = JSON.parse(line) as Record<string, unknown>;
    assert.deepEqual(Object.keys(summary).sort(), [
      "aggregateStatus",
      "level",
      "reportFingerprint",
      "storyId",
    ]);
    assert.equal(summary.aggregateStatus, "pass");
  }
  const report = await readFile(
    join(
      rootDir,
      "src/projects/gps-relativity/generated/narrative-auto-check.generated.json",
    ),
    "utf8",
  );
  assert.doesNotMatch(report, /\/home\/|\/data\/|token|endpoint|out\//i);
});

test("CLI accepts only the two exact final forms and GPS fails without writing", async (context) => {
  const rootDir = await createCliRoot(context);
  assert.deepEqual(
    parseProjectCheckArgs(["--project", "gps-relativity", "--level", "final"]),
    { storyId: "gps-relativity", level: "final", write: false },
  );
  assert.deepEqual(
    parseProjectCheckArgs([
      "--project",
      "gps-relativity",
      "--level",
      "final",
      "--write-final-check",
    ]),
    { storyId: "gps-relativity", level: "final", write: true },
  );
  const cliContext = {
    rootDir,
    runM3EvidenceProcess: validEvidenceProcess,
    stdout: () => undefined,
  };
  await assert.rejects(() =>
    runProjectCheckCli(
      ["--project", "gps-relativity", "--level", "final"],
      cliContext,
    ),
  );
  await assert.rejects(() =>
    runProjectCheckCli(
      [
        "--project",
        "gps-relativity",
        "--level",
        "final",
        "--write-final-check",
      ],
      cliContext,
    ),
  );
  await assert.rejects(() =>
    readFile(
      join(
        rootDir,
        "src/projects/gps-relativity/generated/final-mechanical-check.generated.json",
      ),
    ),
  );
});

test("CLI rejects unknown levels reordered duplicate path and mixed writer flags", async (context) => {
  const rootDir = await createCliRoot(context);
  const cliContext = {
    rootDir,
    runM3EvidenceProcess: validEvidenceProcess,
    stdout: () => undefined,
  };
  const invalidArgs = [
    ["--project", "unknown", "--level", "narrative"],
    ["--project", "gps-relativity", "--level", "release"],
    ["--level", "narrative", "--project", "gps-relativity"],
    ["--project", "gps-relativity", "--project", "gps-relativity"],
    ["--project", "gps-relativity", "--level", "narrative", "--output"],
    ["--project", "gps-relativity", "--level", "narrative", "--root"],
    ["--project", "gps-relativity", "--level", "narrative", "--repair"],
    [
      "--project",
      "gps-relativity",
      "--level",
      "narrative",
      "--write-final-check",
    ],
    ["--project", "gps-relativity", "--level", "final", "--write-auto-check"],
  ];
  for (const args of invalidArgs) {
    await assert.rejects(() => runProjectCheckCli(args, cliContext));
  }
});
