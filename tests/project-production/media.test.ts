import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const coverEntry = "/fixture/candidate/src/projects/story-example/delivery/cover/index.ts";
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
  assert.equal(calls.every(({ cwd }) => cwd === rootDir), true);
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
