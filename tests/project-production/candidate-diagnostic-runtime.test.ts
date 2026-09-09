import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  buildDeliveryPublish,
  buildDeliveryPublishing,
  createDeliveryBuildId,
  DELIVERY_BUILD_POLICY_VERSION,
} from "@axmorf/studio/contracts";
import { readProductionDiagnosticBaseline } from "../../scripts/project-production/adapters/production-inspection";
import {
  inspectProjectCover,
  inspectProjectVideo,
} from "../../scripts/project-production/adapters/media";
import { resolveMediaToolCommand } from "../../scripts/shared/media-tool-command";
import { runBoundedProcess } from "../../packages/studio/src/process/bounded-process";
import { createTemporaryDirectory } from "../package-boundary/support";

// Encode actual RGB PNG bytes without a second host media dependency.
const png = (width: number, height: number) => {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(height * (1 + width * 3)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

test("candidate diagnostic baseline verifies real delivery through the Workspace toolchain", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "candidate-diagnostic-runtime-",
  );
  const runtimeRootDir = resolve(import.meta.dirname, "../..");
  const projectId = "candidate-diagnostic";
  const directory = join(rootDir, "deliveries", projectId);
  await mkdir(directory, { recursive: true });
  await mkdir(join(rootDir, ".producer-attempts", projectId), {
    recursive: true,
  });
  const ffmpeg = async (args: string[]) => {
    const command = await resolveMediaToolCommand({
      rootDir: runtimeRootDir,
      tool: "ffmpeg",
      args: ["-hide_banner", "-loglevel", "error", ...args],
    });
    const result = await runBoundedProcess(command.command, command.args, {
      cwd: runtimeRootDir,
    });
    assert.equal(result.status, 0, result.stderr);
  };
  const frame = join(rootDir, "frame.png");
  await writeFile(frame, png(16, 16));
  const audio = join(rootDir, "silence.pcm");
  await writeFile(audio, Buffer.alloc(48_000 * 2 * 2));
  await ffmpeg([
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    frame,
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-i",
    audio,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-t",
    "1",
    join(directory, "video.mp4"),
  ]);
  for (const [name, width, height] of [
    ["cover-4x3.png", 1600, 1200],
    ["cover-3x4.png", 1200, 1600],
  ] as const) {
    await writeFile(join(directory, name), png(width, height));
  }
  const file = async (name: string) => {
    const bytes = await readFile(join(directory, name));
    return {
      repositoryPath: `deliveries/${projectId}/${name}`,
      sizeBytes: bytes.length,
      checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
  };
  const identity = {
    storyId: projectId,
    revisionId: `revision-${"a".repeat(64)}`,
    artifactSetFingerprint: `sha256:${"b".repeat(64)}`,
    compositionId: "CandidateDiagnostic",
    fps: 30,
    frameCount: 30,
    width: 16,
    height: 16,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  };
  const video = await inspectProjectVideo({
    rootDir: runtimeRootDir,
    absolutePath: join(directory, "video.mp4"),
    render: {
      width: 16,
      height: 16,
      fps: 30,
      output: { audioChannels: 2 },
    } as Parameters<typeof inspectProjectVideo>[0]["render"],
    frameCount: 30,
  });
  const cover = (name: string, width: number, height: number) =>
    inspectProjectCover({
      rootDir: runtimeRootDir,
      absolutePath: join(directory, name),
      expected: { width, height },
    });
  const publish = buildDeliveryPublish({
    ...identity,
    deliveryBuildId: createDeliveryBuildId(identity),
    publishing: buildDeliveryPublishing({
      storyId: projectId,
      title: "Candidate diagnostic",
      description: "Real local media fixture",
      topics: ["one", "two", "three", "four", "five", "six"],
      collection: "Engineering",
      outputFileName: "video.mp4",
      coverFileNames: { cover4x3: "cover-4x3.png", cover3x4: "cover-3x4.png" },
      fps: 30,
      frameCount: 30,
      plannedDurationSeconds: 1,
      chapters: [
        {
          meaningId: "opening",
          name: "Opening",
          startFrame: 0,
          timecode: "00:00:00",
        },
      ],
    }),
    artifacts: {
      video: { ...(await file("video.mp4")), media: video },
      cover4x3: {
        ...(await file("cover-4x3.png")),
        media: await cover("cover-4x3.png", 1600, 1200),
      },
      cover3x4: {
        ...(await file("cover-3x4.png")),
        media: await cover("cover-3x4.png", 1200, 1600),
      },
    },
  });
  const publishPath = join(directory, "publish.json");
  await writeFile(publishPath, JSON.stringify(publish));
  const before = await readFile(publishPath);
  const input = { rootDir, runtimeRootDir, projectId };
  assert.equal(await readProductionDiagnosticBaseline(input), null);
  assert.deepEqual(await readFile(publishPath), before);
  await writeFile(join(directory, "video.mp4"), "corrupt");
  await assert.rejects(
    readProductionDiagnosticBaseline(input),
    /checksum or size binding is stale/u,
  );
});
