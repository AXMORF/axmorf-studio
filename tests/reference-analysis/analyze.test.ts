import assert from "node:assert/strict";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { analyzeReferenceVideo } from "../../scripts/reference-analysis/analyze";
import { runReferenceAnalysisCli } from "../../scripts/reference-analysis/cli";
import { referenceChecksum } from "../../scripts/reference-analysis/filesystem";
import { resolveMediaToolCommand } from "../../scripts/shared/media-tool-command";
import type { ProcessRunner } from "../../scripts/shared/process";
import { createKnownCutReferenceFixture, fixtureRgbPng } from "./fixtures";

const fixture = async (context: TestContext) => {
  const rootDir = await realpath(
    await mkdtemp(join(tmpdir(), "axmorf-reference-analysis-")),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "public"));
  await writeFile(join(rootDir, "public/ref.mp4"), "local video fixture");
  const calls: string[][] = [];
  let filters = " ... format V->V\n ..C scale V->V\n";
  let fps = "30/1";
  let expectedInput = "local video fixture";
  const runProcess: ProcessRunner = async (command, args, options) => {
    assert.equal(command, "remotion");
    assert.ok(options!.timeoutMs! > 0 && options!.timeoutMs! <= 30000);
    calls.push([...args]);
    if (args[0] === "ffprobe")
      return {
        status: 0,
        stdout: JSON.stringify({
          streams: [
            { width: 1280, height: 720, avg_frame_rate: fps, duration: "2" },
          ],
          format: { duration: "2" },
        }),
        stderr: "",
      };
    if (args.includes("-filters"))
      return { status: 0, stdout: filters, stderr: "" };
    if (args.includes("-encoders"))
      return {
        status: 0,
        stdout: " VF...D rawvideo\n VF...D png\n",
        stderr: "",
      };
    if (args.includes("-pix_fmts"))
      return {
        status: 0,
        stdout: "IO... gray 1 8 8\nIO... rgb24 3 24 8-8-8\n",
        stderr: "",
      };
    if (args.includes("-muxers"))
      return { status: 0, stdout: "  E image2\n", stderr: "" };
    const format = /^scale=(\d+):(\d+),format=(gray|rgb24)$/u.exec(
      args[args.indexOf("-vf") + 1],
    );
    assert.ok(format);
    assert.notEqual(args[args.indexOf("-i") + 1], "public/ref.mp4");
    assert.equal(
      await readFile(args[args.indexOf("-i") + 1], "utf8"),
      expectedInput,
    );
    const time = Number(args[args.indexOf("-ss") + 1]);
    const value = time < 1 ? 0 : 255;
    await writeFile(
      args.at(-1)!,
      format[3] === "gray"
        ? Buffer.alloc(64 * 36, value)
        : fixtureRgbPng(Number(format[1]), Number(format[2]), () => value),
    );
    return { status: 0, stdout: "", stderr: "" };
  };
  const resolveTool: typeof resolveMediaToolCommand = async ({
    tool,
    args,
  }) => ({ command: "remotion", args: [tool, ...args] });
  const run = (
    options: Partial<Parameters<typeof analyzeReferenceVideo>[0]> = {},
  ) =>
    analyzeReferenceVideo({
      rootDir,
      inputPath: "public/ref.mp4",
      runProcess,
      resolveTool,
      ...options,
    });
  return {
    rootDir,
    calls,
    runProcess,
    run,
    setFilters: (value: string) => {
      filters = value;
    },
    setFps: (value: string) => {
      fps = value;
    },
    setExpectedInput: (value: string) => {
      expectedInput = value;
    },
  };
};
const readReport = async (
  rootDir: string,
  result: Awaited<ReturnType<typeof analyzeReferenceVideo>>,
) => JSON.parse(await readFile(join(rootDir, result.reportPath), "utf8"));

test("v2 local diagnostics freeze input, refine a nominal cut bracket and publish color previews/readable evidence", async (context) => {
  const f = await fixture(context);
  const result = await f.run();
  assert.equal(result.status, "reference-analysis-ready");
  assert.equal(result.algorithmId, "reference-diagnostics-v2");
  assert.equal(result.coarseSampleCount, 4);
  assert.equal(result.sampleCount, 8);
  assert.equal(result.refinementCount, 1);
  assert.equal(result.candidateCutCount, 1);
  assert.match(
    result.reportPath,
    /^out\/reference-analysis\/[a-f\d]{64}\/analysis\.json$/u,
  );
  const report = await readReport(f.rootDir, result);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.input.checksum, result.inputChecksum);
  assert.equal(report.provenance.frozenInputChecksum, result.inputChecksum);
  assert.deepEqual(report.cutCandidates[0].nominalBoundaryFrameRange, {
    lowerExclusive: 29,
    upperInclusive: 30,
    resolutionFrames: 1,
  });
  assert.equal(
    report.cutCandidates[0].confidence.sourceFrameBoundaryVerified,
    false,
  );
  assert.equal(report.cutCandidates[0].confidence.calibratedProbability, null);
  assert.equal(report.method.sampling.decodedFrameTimestampsMeasured, false);
  assert.equal(report.method.refinement.maximumGrayDecodes, 216);
  assert.equal(
    report.rhythmHypothesis.cutTimeEstimation,
    "tested-nominal-bracket-midpoint",
  );
  assert.equal(report.provenance.invocation, "workspace-local-remotion-cli");
  assert.equal(report.provenance.toolOutputs.length, 18);
  assert.equal(report.previews.length, 5);
  assert.ok(
    report.samples.every((sample: { checksum: string }) =>
      /^sha256:[a-f\d]{64}$/u.test(sample.checksum),
    ),
  );
  assert.equal(JSON.stringify(report).includes(f.rootDir), false);
  assert.equal(
    await readFile(join(f.rootDir, "public/ref.mp4"), "utf8"),
    "local video fixture",
  );
  for (const preview of result.previews) {
    const bytes = await readFile(join(f.rootDir, preview.path));
    assert.equal(referenceChecksum(bytes), preview.checksum);
    assert.equal(preview.width, 512);
    assert.equal(preview.height, 288);
  }
  const manifest = JSON.parse(
    await readFile(join(f.rootDir, result.manifestPath), "utf8"),
  );
  assert.equal(manifest.files.length, 8);
  assert.equal(manifest.analysisFingerprint, result.analysisFingerprint);
  const html = await readFile(join(f.rootDir, result.previewIndexPath), "utf8");
  assert.match(html, /Content-Security-Policy/u);
  assert.match(html, /requested seek \/ nominal fps-grid/u);
  assert.equal(/<script/iu.test(html), false);
  const markdown = await readFile(
    join(f.rootDir, result.readableReportPath),
    "utf8",
  );
  assert.match(markdown, /not-assessed/u);
  assert.match(markdown, /Requested 00:01\.000/u);
  assert.ok(
    report.limits.some((line: string) => line.includes("multiple cuts")),
  );
  assert.deepEqual(await readdir(join(f.rootDir, "out/reference-analysis")), [
    result.analysisFingerprint.slice(7),
  ]);
  assert.deepEqual((await readdir(f.rootDir)).sort(), ["out", "public"]);
  for (const call of f.calls.filter((args) => args.includes("-i"))) {
    assert.equal(call[call.indexOf("-protocol_whitelist") + 1], "file");
    assert.equal(
      call[call.indexOf("-format_whitelist") + 1],
      "mov,matroska,webm,avi",
    );
    assert.equal(call[call.indexOf("-frames:v") + 1], "1");
  }
});

test("identical full evidence is byte stable and threshold changes create another report", async (context) => {
  const f = await fixture(context);
  const first = await f.run();
  const path = join(f.rootDir, first.reportPath);
  const bytes = await readFile(path, "utf8"),
    mtime = (await lstat(path)).mtimeMs;
  const again = await f.run();
  assert.equal(again.analysisFingerprint, first.analysisFingerprint);
  assert.equal(again.noOp, true);
  assert.equal((await lstat(path)).mtimeMs, mtime);
  assert.equal(await readFile(path, "utf8"), bytes);
  const threshold = await f.run({ threshold: 1 });
  assert.notEqual(threshold.analysisFingerprint, first.analysisFingerprint);
  assert.equal(threshold.candidateCutCount, 0);
  assert.equal(threshold.sampleCount, 4);
});

test("changed source checksum or probe evidence cannot reuse a diagnostic identity", async (context) => {
  const f = await fixture(context);
  const first = await f.run();
  await writeFile(
    join(f.rootDir, "public/ref.mp4"),
    "changed local video fixture",
  );
  f.setExpectedInput("changed local video fixture");
  const changed = await f.run();
  assert.notEqual(changed.inputChecksum, first.inputChecksum);
  assert.notEqual(changed.analysisFingerprint, first.analysisFingerprint);
  f.setFps("24/1");
  const probeDrift = await f.run();
  assert.equal(probeDrift.inputChecksum, changed.inputChecksum);
  assert.notEqual(probeDrift.analysisFingerprint, changed.analysisFingerprint);
});

test("source drift during sampling accepts no report and removes its private frozen input", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.run({
      runProcess: async (command, args, options) => {
        const result = await f.runProcess(command, args, options);
        if (args.includes("-ss"))
          await writeFile(
            join(f.rootDir, "public/ref.mp4"),
            "drifted input bytes",
          );
        return result;
      },
    }),
    /input changed during analysis/u,
  );
  assert.deepEqual(
    await readdir(join(f.rootDir, "out/reference-analysis")),
    [],
  );
});

test("frozen input drift is rejected separately while the original source remains untouched", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.run({
      runProcess: async (command, args, options) => {
        const result = await f.runProcess(command, args, options);
        if (args.at(-1)!.endsWith("frame-0000000045.png")) {
          await writeFile(args[args.indexOf("-i") + 1], "changed frozen input");
        }
        return result;
      },
    }),
    /frozen input changed during analysis/u,
  );
  assert.equal(
    await readFile(join(f.rootDir, "public/ref.mp4"), "utf8"),
    "local video fixture",
  );
  assert.deepEqual(
    await readdir(join(f.rootDir, "out/reference-analysis")),
    [],
  );
});

test("unsafe input leaf/parents and output parent symlinks fail before any tool invocation", async (context) => {
  const f = await fixture(context);
  await writeFile(join(f.rootDir, "outside.mp4"), "outside sentinel");
  await rm(join(f.rootDir, "public/ref.mp4"));
  await symlink(
    join(f.rootDir, "outside.mp4"),
    join(f.rootDir, "public/ref.mp4"),
  );
  await assert.rejects(f.run(), /symbolic link/u);
  await mkdir(join(f.rootDir, "outside"));
  await writeFile(join(f.rootDir, "outside/ref.mp4"), "outside sentinel");
  await symlink(join(f.rootDir, "outside"), join(f.rootDir, "public/linked"));
  await assert.rejects(
    f.run({ inputPath: "public/linked/ref.mp4" }),
    /symbolic link/u,
  );
  await writeFile(join(f.rootDir, "public/empty.mp4"), "");
  await assert.rejects(f.run({ inputPath: "public/empty.mp4" }), /regular/u);
  await assert.rejects(
    f.run({ inputPath: "public/../outside.mp4" }),
    /public-relative/u,
  );
  assert.equal(f.calls.length, 0);
  await rm(join(f.rootDir, "public/ref.mp4"));
  await writeFile(join(f.rootDir, "public/ref.mp4"), "local video fixture");
  await symlink(join(f.rootDir, "outside"), join(f.rootDir, "out"));
  await assert.rejects(f.run(), /output directory is unsafe/u);
  assert.deepEqual((await readdir(join(f.rootDir, "outside"))).sort(), [
    "ref.mp4",
  ]);
  assert.equal(f.calls.length, 0);
});

test("missing pinned capabilities produce explicit unavailable evidence with no fabricated previews or motion", async (context) => {
  const f = await fixture(context);
  f.setFilters("Unknown filter 'scale'.\n ... format V->V\n");
  const result = await f.run();
  assert.equal(result.status, "reference-analysis-unavailable");
  assert.deepEqual(result.missingCapabilities, ["ffmpeg-filter:scale"]);
  assert.equal(result.sampleCount, 0);
  assert.equal(result.imageMotionEstimateCount, 0);
  assert.equal(result.previews.length, 0);
  assert.equal(f.calls.length, 5);
  const report = await readReport(f.rootDir, result);
  assert.equal(report.rhythmHypothesis, null);
  assert.deepEqual(report.samples, []);
  assert.deepEqual(report.cutCandidates, []);
});

test("tool failure, incomplete gray data and corrupt PNG never publish accepted evidence", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.run({
      runProcess: async () => ({ status: 1, stdout: "", stderr: "failure" }),
    }),
    /exit status 1/u,
  );
  assert.deepEqual(
    await readdir(join(f.rootDir, "out/reference-analysis")),
    [],
  );
  await assert.rejects(
    f.run({
      runProcess: async (command, args, options) => {
        const result = await f.runProcess(command, args, options);
        if (args.includes("-ss"))
          await writeFile(args.at(-1)!, Uint8Array.of(0));
        return result;
      },
    }),
    /one complete regular frame/u,
  );
  await assert.rejects(
    f.run({
      runProcess: async (command, args, options) => {
        const result = await f.runProcess(command, args, options);
        if (args.includes("png"))
          await writeFile(args.at(-1)!, Uint8Array.of(0));
        return result;
      },
    }),
    /PNG/u,
  );
  assert.deepEqual(
    await readdir(join(f.rootDir, "out/reference-analysis")),
    [],
  );
});

test("an earlier preview cannot change after decoding and still match accepted report metadata", async (context) => {
  const f = await fixture(context);
  let firstPreview: string | undefined;
  await assert.rejects(
    f.run({
      runProcess: async (command, args, options) => {
        const result = await f.runProcess(command, args, options);
        if (args.includes("png")) {
          if (firstPreview === undefined) firstPreview = args.at(-1)!;
          else
            await writeFile(
              firstPreview,
              fixtureRgbPng(512, 288, () => 77),
            );
        }
        return result;
      },
    }),
    /conflicts or drifted/u,
  );
  assert.deepEqual(
    await readdir(join(f.rootDir, "out/reference-analysis")),
    [],
  );
});

test("report, HTML, PNG, manifest drift and unknown directories all fail closed without overwriting", async (context) => {
  const f = await fixture(context);
  const result = await f.run();
  for (const path of [
    result.reportPath,
    result.readableReportPath,
    result.previewIndexPath,
    result.manifestPath,
    result.previews[0]!.path,
  ]) {
    const fullPath = join(f.rootDir, path),
      before = await readFile(fullPath);
    await writeFile(fullPath, "drifted evidence sentinel");
    await assert.rejects(f.run(), /conflicts or drifted/u);
    assert.equal(await readFile(fullPath, "utf8"), "drifted evidence sentinel");
    await writeFile(fullPath, before);
  }
  const unknown = join(f.rootDir, dirname(result.reportPath), "unknown");
  await mkdir(unknown);
  await assert.rejects(f.run(), /unknown directories/u);
  await rm(unknown, { recursive: true });
  const firstPreview = join(f.rootDir, result.previews[0]!.path);
  await rm(firstPreview);
  const sentinel = join(f.rootDir, "sentinel.png");
  await writeFile(sentinel, "outside sentinel");
  await symlink(sentinel, firstPreview);
  await assert.rejects(f.run(), /symbolic link/u);
  assert.equal(await readFile(sentinel, "utf8"), "outside sentinel");
});

test("processing uses one total deadline and refuses results after it even when a port returns success", async (context) => {
  const f = await fixture(context);
  let time = 0;
  await assert.rejects(
    f.run({
      now: () => time,
      runProcess: async (command, args, options) => {
        const result = await f.runProcess(command, args, options);
        time = 180000;
        return result;
      },
    }),
    /bounded processing deadline/u,
  );
  assert.deepEqual(
    await readdir(join(f.rootDir, "out/reference-analysis")),
    [],
  );
});

test("reference CLI preserves exact local parameters and returns readable/index paths with unassessed semantics", async (context) => {
  const f = await fixture(context);
  const lines: string[] = [];
  const result = await runReferenceAnalysisCli(
    ["--input", "public/ref.mp4", "--threshold", "0.3"],
    {
      rootDir: f.rootDir,
      stdout: (line) => lines.push(line),
      analyzeVideo: (request) => f.run(request),
    },
  );
  assert.equal(result.status, "reference-analysis-ready");
  assert.equal(result.assessment.semanticCamera, "not-assessed");
  assert.deepEqual(lines, [JSON.stringify(result)]);
  assert.ok(result.previewIndexPath.endsWith("index.html"));
});

test("pinned local FFmpeg analyzes an existing licensed media fixture with real readable color PNGs", async (context) => {
  const f = await fixture(context);
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  await copyFile(
    join(
      repositoryRoot,
      "tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/gallery/media/draw-svg-trace.mp4",
    ),
    join(f.rootDir, "public/ref.mp4"),
  );
  const result = await analyzeReferenceVideo({
    rootDir: f.rootDir,
    inputPath: "public/ref.mp4",
    resolveTool: (request) =>
      resolveMediaToolCommand({ ...request, rootDir: repositoryRoot }),
  });
  assert.equal(result.status, "reference-analysis-ready");
  assert.equal(result.coarseSampleCount, 10);
  const report = await readReport(f.rootDir, result);
  assert.equal(report.media.width, 1920);
  assert.equal(report.media.height, 1080);
  assert.equal(report.media.fps, 30);
  assert.ok(report.previews.length > 0);
  assert.ok(result.sampleCount <= 216);
  assert.equal(report.coarseIntervals.length, result.coarseSampleCount - 1);
  assert.ok(
    report.samples.every(({ checksum }: { checksum: string }) =>
      /^sha256:[a-f\d]{64}$/u.test(checksum),
    ),
  );
});

test("pinned known-cut and translated textured plane fixture yields a bounded bracket and observable image shift", async (context) => {
  const f = await fixture(context);
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  await createKnownCutReferenceFixture({
    rootDir: f.rootDir,
    toolRootDir: repositoryRoot,
  });
  const resolveTool: typeof resolveMediaToolCommand = (request) =>
    resolveMediaToolCommand({ ...request, rootDir: repositoryRoot });
  const result = await analyzeReferenceVideo({
    rootDir: f.rootDir,
    inputPath: "public/ref.mp4",
    resolveTool,
  });
  const report = await readReport(f.rootDir, result);
  assert.equal(report.media.fps, 12);
  assert.equal(result.candidateCutCount, 1);
  assert.deepEqual(report.cutCandidates[0].nominalBoundaryFrameRange, {
    lowerExclusive: 23,
    upperInclusive: 24,
    resolutionFrames: 1,
  });
  assert.equal(
    report.cutCandidates[0].confidence.sourceFrameBoundaryVerified,
    false,
  );
  const motion = report.coarseIntervals[0].imageMotion;
  assert.equal(motion.status, "estimated");
  assert.ok(Math.abs(motion.transform.translationXPixels - 2) <= 0.5);
  assert.ok(Math.abs(motion.transform.translationYPixels) <= 0.5);
  assert.ok(Math.abs(motion.transform.centeredScale - 1) <= 0.02);
  assert.equal(motion.semanticCamera, "not-assessed");
  const cached = await analyzeReferenceVideo({
    rootDir: f.rootDir,
    inputPath: "public/ref.mp4",
    resolveTool,
  });
  assert.equal(cached.analysisFingerprint, result.analysisFingerprint);
  assert.equal(cached.noOp, true);
});
