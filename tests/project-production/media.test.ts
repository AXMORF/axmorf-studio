import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { RenderSpec } from "@axmorf/studio/contracts";
import {
  inspectProjectCover,
  inspectProjectVideo,
  renderProjectCover,
  renderProjectVideo,
} from "../../scripts/project-production/adapters/media";
import { withProcessDeadline } from "../../scripts/shared/process-deadline";
import {
  getProcessOwnership,
  inspectOwnedProcesses,
  withProcessDiagnosticScope,
} from "../../packages/studio/src/process/process-ownership";
import { createTemporaryDirectory } from "../package-boundary/support";
import type { ProcessRunner } from "../../scripts/shared/process";

test("video EOF inspection selects encoders bundled by Remotion FFmpeg", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-media-video-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const absolutePath = join(rootDir, "video.mp4");
  await writeFile(absolutePath, Buffer.from("fixture-mp4"));
  const calls: string[][] = [];
  const runProcess: ProcessRunner = async (_command, args) => {
    calls.push([...args]);
    if (args.includes("-count_frames")) {
      return {
        status: 0,
        stdout: JSON.stringify({
          streams: [
            {
              codec_name: "h264",
              width: 1080,
              height: 1920,
              r_frame_rate: "30/1",
              nb_read_frames: "120",
            },
          ],
        }),
        stderr: "",
      };
    }
    if (args.includes("a:0")) {
      return {
        status: 0,
        stdout: JSON.stringify({
          streams: [{ codec_name: "aac", channels: 2 }],
        }),
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };

  await inspectProjectVideo({
    rootDir: process.cwd(),
    absolutePath,
    render: {
      width: 1080,
      height: 1920,
      fps: 30,
      output: { audioChannels: 2 },
    } as RenderSpec,
    frameCount: 120,
    runProcess,
  });

  assert.deepEqual(calls[2]?.slice(-7), [
    "-c:v",
    "rawvideo",
    "-c:a",
    "pcm_s16le",
    "-f",
    "null",
    "-",
  ]);
});

test("candidate rendering uses explicit entrypoint, public directory, and shared runtime cwd", async () => {
  const rootDir = process.cwd();
  const videoEntry = "/fixture/candidate/src/index.ts";
  const coverEntry =
    "/fixture/candidate/src/projects/story-example/delivery/cover/index.ts";
  const publicDir = "/fixture/candidate/out/render-public";
  const calls: Array<{
    args: readonly string[];
    cwd?: string;
  }> = [];
  const runProcess: ProcessRunner = async (_command, args, options) => {
    calls.push({ args, cwd: options?.cwd });
    return { status: 0, stdout: "", stderr: "" };
  };

  await renderProjectVideo({
    rootDir,
    compositionId: "StoryExample",
    outputPath: "/fixture/candidate/video.mp4",
    entryPoint: videoEntry,
    publicDir,
    runProcess,
  });
  await renderProjectCover({
    rootDir,
    projectId: "story-example",
    compositionId: "StoryExampleCover",
    outputPath: "/fixture/candidate/cover.png",
    entryPoint: coverEntry,
    publicDir,
    runProcess,
  });

  assert.equal(calls[0]?.args.includes(videoEntry), true);
  assert.equal(calls[1]?.args.includes(coverEntry), true);
  assert.equal(
    calls.every(({ args }) => args.includes(`--public-dir=${publicDir}`)),
    true,
  );
  assert.equal(
    calls.every(({ cwd }) => cwd === rootDir),
    true,
  );
});

test("cover EOF inspection selects the bundled rawvideo encoder", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-media-cover-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const absolutePath = join(rootDir, "cover.png");
  const png = Buffer.alloc(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1600, 16);
  png.writeUInt32BE(1200, 20);
  await writeFile(absolutePath, png);
  const calls: string[][] = [];

  await inspectProjectCover({
    rootDir: process.cwd(),
    absolutePath,
    expected: { width: 1600, height: 1200 },
    runProcess: async (_command, args) => {
      calls.push([...args]);
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.deepEqual(calls[0]?.slice(-5), [
    "-c:v",
    "rawvideo",
    "-f",
    "null",
    "-",
  ]);
});

test("delivery verification honors an explicit Workspace when launched from an unrelated directory", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "axmorf-explicit-media-root-",
  );
  const launchDir = await createTemporaryDirectory(
    context,
    "axmorf-unrelated-launch-",
  );
  const packageRoot = join(rootDir, "node_modules", "@remotion", "cli");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(rootDir, "package.json"), "{}");
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@remotion/cli",
      version: "1.0.0",
      bin: { remotion: "remotion-cli.js" },
    }),
  );
  await writeFile(
    join(packageRoot, "remotion-cli.js"),
    `
if (process.cwd() !== ${JSON.stringify(rootDir)}) throw new Error('Media command escaped its Workspace cwd');
if (process.argv.includes('-count_frames')) console.log(JSON.stringify({streams:[{codec_name:'h264',width:1080,height:1920,r_frame_rate:'30/1',nb_read_frames:'120'}]}));
else if (process.argv.includes('a:0')) console.log(JSON.stringify({streams:[{codec_name:'aac',channels:2}]}));
`,
  );
  const absolutePath = join(rootDir, "video.mp4");
  await writeFile(absolutePath, "fixture-mp4");
  const coverPath = join(rootDir, "cover.png");
  const png = Buffer.alloc(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1600, 16);
  png.writeUInt32BE(1200, 20);
  await writeFile(coverPath, png);
  const attemptId = "d2bb886c-41d4-4db7-9cdc-7fe9989f2eb3";
  const originalCwd = process.cwd();
  try {
    process.chdir(launchDir);
    await withProcessDiagnosticScope(
      { rootDir, storyId: "explicit-root", attemptId },
      () =>
        withProcessDeadline(Date.now() + 30_000, async () => {
          await inspectProjectVideo({
            rootDir,
            absolutePath,
            render: {
              width: 1080,
              height: 1920,
              fps: 30,
              output: { audioChannels: 2 },
            } as RenderSpec,
            frameCount: 120,
          });
          await inspectProjectCover({
            rootDir,
            absolutePath: coverPath,
            expected: { width: 1600, height: 1200 },
          });
        }),
    );
    assert.equal(
      await inspectOwnedProcesses({
        rootDir,
        owner: getProcessOwnership(),
        diagnosticRoot: join(
          rootDir,
          ".producer-attempts",
          "explicit-root",
          attemptId,
        ),
      }),
      "exited",
    );
  } finally {
    process.chdir(originalCwd);
  }
});
