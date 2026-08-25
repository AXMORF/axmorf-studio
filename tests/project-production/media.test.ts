import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { RenderSpec } from "../../src/contracts";
import { createRuntimeDeliveryInspectionDependencies } from "../../scripts/project-production/adapters/current-delivery-inspection";
import {
  inspectProjectCover,
  inspectProjectVideo,
} from "../../scripts/project-production/adapters/media";
import { createRuntimeExecutionResources } from "../../scripts/project-production/application/production-locations";

const render = {
  width: 1080,
  height: 1920,
  fps: 30,
  output: { audioChannels: 2 },
} as RenderSpec;

test("video EOF inspection decodes and counts both streams with strict errors", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "producer-media-count-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const absolutePath = join(root, "video.mp4");
  await writeFile(absolutePath, "fixture");
  const invocations: (readonly string[])[] = [];
  const inspected = await inspectProjectVideo({
    absolutePath,
    render,
    frameCount: 120,
    runProcess: async (_command, args) => {
      invocations.push(args);
      return invocations.length === 1
        ? {
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
          }
        : {
            status: 0,
            stdout: JSON.stringify({
              streams: [
                { codec_name: "aac", channels: 2, nb_read_frames: "188" },
              ],
            }),
            stderr: "",
          };
    },
  });

  assert.equal(inspected.decodedToEof, true);
  assert.equal(invocations.length, 2);
  for (const args of invocations) {
    assert.deepEqual(args.slice(0, 5), [
      "-v",
      "error",
      "-err_detect",
      "explode",
      "-count_frames",
    ]);
  }
});

test("EOF decode failures retain bounded diagnostics without the media path", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "producer-media-diagnostic-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const absolutePath = join(root, "video.mp4");
  await writeFile(absolutePath, "fixture");
  let invocation = 0;
  await assert.rejects(
    inspectProjectVideo({
      absolutePath,
      render,
      frameCount: 120,
      runProcess: async () => {
        invocation += 1;
        if (invocation === 1) {
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
        return {
          status: 69,
          stdout: "",
          stderr: `decode failed for ${absolutePath}\n${"x".repeat(1_000)}`,
        };
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /exit 69; decode failed for <media>/u);
      assert.doesNotMatch(error.message, new RegExp(root, "u"));
      assert.ok(error.message.length < 600);
      return true;
    },
  );
});

test("cover EOF inspection requires one fully decoded PNG frame", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "producer-cover-count-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const absolutePath = join(root, "cover.png");
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(1600, 16);
  bytes.writeUInt32BE(1200, 20);
  await writeFile(absolutePath, bytes);
  let args: readonly string[] = [];

  const inspected = await inspectProjectCover({
    absolutePath,
    expected: { width: 1600, height: 1200 },
    runProcess: async (_command, processArgs) => {
      args = processArgs;
      return {
        status: 0,
        stdout: JSON.stringify({
          streams: [
            {
              codec_name: "png",
              width: 1600,
              height: 1200,
              nb_read_frames: "1",
            },
          ],
        }),
        stderr: "",
      };
    },
  });

  assert.equal(inspected.decodedToEof, true);
  assert.deepEqual(args.slice(0, 5), [
    "-v",
    "error",
    "-err_detect",
    "explode",
    "-count_frames",
  ]);
});

test("Workspace delivery inspection uses the exact Runtime Pack probe and library path", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "producer-runtime-probe-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const binariesDirectory = join(root, "runtime/bin");
  const ffprobeExecutable = join(binariesDirectory, "ffprobe");
  await mkdir(binariesDirectory, { recursive: true });
  await writeFile(
    ffprobeExecutable,
    `#!/bin/sh
test "$${process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH"}" = "${binariesDirectory}" || exit 9
case "$*" in
  *"a:0"*) printf '%s\\n' '{"streams":[{"codec_name":"aac","channels":2,"nb_read_frames":"188"}]}' ;;
  *) printf '%s\\n' '{"streams":[{"codec_name":"h264","width":1080,"height":1920,"r_frame_rate":"30/1","nb_read_frames":"120"}]}' ;;
esac
`,
  );
  await chmod(ffprobeExecutable, 0o755);
  const absolutePath = join(root, "video.mp4");
  await writeFile(absolutePath, "fixture");
  const dependencies = createRuntimeDeliveryInspectionDependencies(
    createRuntimeExecutionResources({
      rendererRuntimeFingerprint: `sha256:${"a".repeat(64)}`,
      browserExecutable: join(root, "runtime/browser"),
      binariesDirectory,
      ffmpegExecutable: join(binariesDirectory, "ffmpeg"),
      ffprobeExecutable,
    }),
  );

  const inspected = await dependencies.inspectVideo?.({
    absolutePath,
    expected: {
      width: 1080,
      height: 1920,
      fps: 30,
      frameCount: 120,
      audioChannels: 2,
    },
  });

  assert.equal(inspected?.decodedToEof, true);
});
