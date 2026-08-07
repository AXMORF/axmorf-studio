import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test, { type TestContext } from "node:test";

import type { ProcessRunner } from "../../scripts/baseline/evidence";
import { buildDelivery } from "../../scripts/delivery/application/build";
import { checkDelivery } from "../../scripts/delivery/application/check";
import { runDeliveryCoverFreeze } from "../../scripts/delivery/application/cover-freeze";
import { runDeliveryCoverSubmit } from "../../scripts/delivery/application/cover-submit";
import { createDeliveryProjectFixture } from "../fixtures/delivery";

const fakePng = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

const mediaRunner = (calls: string[]): ProcessRunner => async (command, args) => {
  calls.push(`${basename(command)} ${args.join(" ")}`);
  if (basename(command) === "remotion") {
    const compositionId = String(args[2]);
    await writeFile(
      String(args[3]),
      fakePng(
        compositionId.endsWith("Cover4x3V2") ? 1600 : 1200,
        compositionId.endsWith("Cover4x3V2") ? 1200 : 1600,
      ),
    );
    return { status: 0, stdout: "", stderr: "" };
  }
  if (basename(command) === "ffprobe") {
    return {
      status: 0,
      stdout: JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1080,
            height: 1920,
            avg_frame_rate: "30/1",
            nb_read_frames: "120",
            duration: "4.000000",
          },
          {
            codec_type: "audio",
            codec_name: "aac",
            sample_rate: "48000",
            channel_layout: "stereo",
            duration: "4.021333",
          },
        ],
        format: { duration: "4.021333" },
      }),
      stderr: "",
    };
  }
  if (basename(command) === "ffmpeg") {
    return { status: 0, stdout: "", stderr: "" };
  }
  throw new Error(`Unexpected process: ${command}`);
};

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-delivery-v2-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const createReadyFixture = async (context: TestContext) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  const calls: string[] = [];
  await runDeliveryCoverFreeze({ rootDir, projectId: fixture.storyId });
  await runDeliveryCoverSubmit({
    rootDir,
    projectId: fixture.storyId,
    runProcess: mediaRunner(calls),
  });
  calls.length = 0;
  return { rootDir, fixture, calls };
};

test("delivery v2 is copy-and-archive only and repeated build is byte-stable", async (context) => {
  const { rootDir, fixture, calls } = await createReadyFixture(context);
  const dependencies = {
    verifyFinalProject: async () => fixture.finalReport,
    runProcess: mediaRunner(calls),
  };
  const built = await buildDelivery({
    rootDir,
    projectId: fixture.storyId,
    dependencies,
  });
  assert.equal(built.noOp, false);
  assert.equal(calls.some((call) => call.startsWith("remotion ")), false);
  const releaseDir = join(rootDir, "deliveries", fixture.storyId, built.releaseId);
  assert.deepEqual((await readdir(releaseDir)).sort(), [
    "HANDOFF.md",
    "checksums.sha256",
    "cover-3x4.png",
    "cover-4x3.png",
    "delivery-proof.mp4",
    "publishing.json",
    "release-manifest.json",
  ]);
  assert.deepEqual(
    await readFile(join(releaseDir, "delivery-proof.mp4")),
    Buffer.from(fixture.previewBytes),
  );
  const publishing = JSON.parse(
    await readFile(join(releaseDir, "publishing.json"), "utf8"),
  ) as { title: string; chapters: readonly { timecode: string }[] };
  assert.equal(publishing.title, fixture.story.title);
  assert.deepEqual(publishing.chapters.map(({ timecode }) => timecode), [
    "00:00:00",
    "00:00:02",
  ]);
  const before = (await stat(join(releaseDir, "release-manifest.json"))).mtimeMs;
  const repeated = await buildDelivery({
    rootDir,
    projectId: fixture.storyId,
    dependencies,
  });
  assert.equal(repeated.noOp, true);
  assert.equal((await stat(join(releaseDir, "release-manifest.json"))).mtimeMs, before);
  await checkDelivery({
    rootDir,
    projectId: fixture.storyId,
    releaseId: built.releaseId,
    dependencies,
  });
});

test("PublishingIntent or current Cover result missing or drifted blocks delivery only", async (context) => {
  const { rootDir, fixture, calls } = await createReadyFixture(context);
  const intentPath = join(fixture.projectRoot, "publishing-intent.json");
  const intent = await readFile(intentPath);
  await rm(intentPath);
  await assert.rejects(() =>
    buildDelivery({
      rootDir,
      projectId: fixture.storyId,
      dependencies: {
        verifyFinalProject: async () => fixture.finalReport,
        runProcess: mediaRunner(calls),
      },
    }),
  );
  await writeFile(intentPath, Uint8Array.from(intent));
  await writeFile(intentPath, "{malformed");
  await assert.rejects(() =>
    buildDelivery({
      rootDir,
      projectId: fixture.storyId,
      dependencies: {
        verifyFinalProject: async () => fixture.finalReport,
        runProcess: mediaRunner(calls),
      },
    }),
  );
  const staleIntent = JSON.parse(intent.toString("utf8")) as Record<
    string,
    unknown
  >;
  staleIntent.description = "未更新 fingerprint 的漂移简介";
  await writeFile(intentPath, `${JSON.stringify(staleIntent)}\n`);
  await assert.rejects(() =>
    buildDelivery({
      rootDir,
      projectId: fixture.storyId,
      dependencies: {
        verifyFinalProject: async () => fixture.finalReport,
        runProcess: mediaRunner(calls),
      },
    }),
  );
  await writeFile(intentPath, Uint8Array.from(intent));
  await writeFile(
    join(fixture.projectRoot, "delivery/cover/Cover4x3.tsx"),
    `export default () => <div>源码漂移</div>;\n`,
  );
  await assert.rejects(() =>
    buildDelivery({
      rootDir,
      projectId: fixture.storyId,
      dependencies: {
        verifyFinalProject: async () => fixture.finalReport,
        runProcess: mediaRunner(calls),
      },
    }),
  );
});
