import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RenderSpecSchema } from "@axmorf/studio/contracts";
import { createPreviewProfile } from "../../scripts/project-preview/domain";
import { renderProjectPreview } from "../../scripts/project-preview/media";

test("mono preview encodes its PCM once and copies rendered video without changing frames", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-preview-mono-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const outputDir = join(rootDir, "out");
  await mkdir(outputDir);
  const outputPath = join(outputDir, "preview.mp4");
  const profile = createPreviewProfile(
    RenderSpecSchema.parse({
      schemaVersion: 1,
      compositionId: "MonoPreview",
      width: 640,
      height: 360,
      fps: 30,
      locale: "zh-CN",
      leadInFrames: 0,
      tailFrames: 0,
      output: {
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        audioChannels: 1,
      },
    }),
    12,
  );
  const mediaCalls: string[][] = [];
  const render = (status = 0) =>
    renderProjectPreview({
      rootDir,
      outputPath,
      profile,
      entryPoint: join(rootDir, "src/index.tsx"),
      publicDir: join(rootDir, "public"),
      compositionId: "MonoPreview",
      resolveInvocation: async () => ({
        command: "remotion-fixture",
        argsPrefix: [],
      }),
      resolveMediaTool: async (request) => {
        assert.equal(request.tool, "ffmpeg");
        assert.equal(request.rootDir, rootDir);
        return { command: "ffmpeg-fixture", args: request.args };
      },
      runProcess: async (command, args) => {
        if (command === "remotion-fixture") {
          await writeFile(
            args[args.indexOf("render") + 3]!,
            "rendered h264 fixture",
          );
          const pcmPath = args.find((arg) =>
            arg.startsWith("--separate-audio-to="),
          );
          assert.ok(pcmPath);
          await writeFile(
            pcmPath.slice("--separate-audio-to=".length),
            "mixed PCM fixture",
          );
        } else {
          mediaCalls.push([...args]);
          if (status === 0) await writeFile(args.at(-1)!, "muxed mono fixture");
          return { status, stdout: "", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });
  await render();
  const args = mediaCalls[0]!;
  assert.equal(args[args.indexOf("-c:v") + 1], "copy");
  assert.equal(args[args.indexOf("-c:a") + 1], "libfdk_aac");
  assert.equal(args[args.indexOf("-ac") + 1], "1");
  assert.notEqual(args[args.indexOf("-i") + 1], outputPath);
  assert.equal(
    args[args.indexOf("-map", args.indexOf("-map") + 1) + 1],
    "1:a:0",
  );
  assert.equal(args.includes("-r"), false);
  assert.equal(args.includes("-vf"), false);
  assert.equal(await readFile(outputPath, "utf8"), "muxed mono fixture");
  assert.deepEqual(await readdir(outputDir), ["preview.mp4"]);
  await assert.rejects(render(1), /H\.264\/AAC mux failed/u);
  assert.equal(await readFile(outputPath, "utf8"), "muxed mono fixture");
  assert.deepEqual(await readdir(outputDir), ["preview.mp4"]);
});
