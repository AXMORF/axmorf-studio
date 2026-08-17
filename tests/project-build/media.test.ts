import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RenderSpecSchema } from "../../src/contracts";
import { inspectProjectVideo } from "../../scripts/project-build/adapters/media";

const render = RenderSpecSchema.parse({
  schemaVersion: 1,
  compositionId: "StoryExample",
  fps: 30,
  width: 1080,
  height: 1920,
  locale: "zh-CN",
  leadInFrames: 0,
  tailFrames: 0,
  output: {
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    audioChannels: 2,
  },
});

test("video inspection requires matching H.264 AAC dimensions fps frames and EOF decode", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-media-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const absolutePath = join(rootDir, "video.mp4");
  await writeFile(absolutePath, "video");
  const commands: string[] = [];
  const result = await inspectProjectVideo({
    absolutePath,
    render,
    frameCount: 120,
    runProcess: async (command) => {
      commands.push(command);
      if (command === "ffprobe" && commands.length === 1) {
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
      if (command === "ffprobe") {
        return {
          status: 0,
          stdout: JSON.stringify({
            streams: [{ codec_name: "aac", channels: 2 }],
          }),
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(result.decodedToEof, true);
  assert.deepEqual(commands, ["ffprobe", "ffprobe", "ffmpeg"]);

  await assert.rejects(
    inspectProjectVideo({
      absolutePath,
      render,
      frameCount: 120,
      runProcess: async () => ({
        status: 0,
        stdout: JSON.stringify({
          streams: [
            {
              codec_name: "h264",
              width: 1080,
              height: 1920,
              r_frame_rate: "30/1",
              nb_read_frames: "119",
            },
          ],
        }),
        stderr: "",
      }),
    }),
    /stream metadata drifted/iu,
  );
});
