import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { RenderSpec } from "../../src/contracts";
import { inspectProjectVideo } from "../../scripts/project-production/adapters/media";

test("EOF decode failures retain bounded diagnostics without the media path", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "producer-media-diagnostic-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const absolutePath = join(root, "video.mp4");
  await writeFile(absolutePath, "fixture");
  let invocation = 0;
  await assert.rejects(
    inspectProjectVideo({
      absolutePath,
      render: {
        width: 1080,
        height: 1920,
        fps: 30,
        output: { audioChannels: 2 },
      } as RenderSpec,
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
        if (invocation === 2) {
          return {
            status: 0,
            stdout: JSON.stringify({
              streams: [{ codec_name: "aac", channels: 2 }],
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
