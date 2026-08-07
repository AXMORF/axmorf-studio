import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";

import type { ProcessRunner } from "../../scripts/baseline/evidence";
import { buildDelivery } from "../../scripts/delivery/application/build";
import { checkDelivery } from "../../scripts/delivery/application/check";
import { createDeliveryProjectFixture } from "../fixtures/delivery";

const createRoot = (context: TestContext) =>
  mkdtemp(join(tmpdir(), "rsp-delivery-build-")).then((rootDir) => {
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    return rootDir;
  });

const execFileAsync = promisify(execFile);

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

const mediaRunner =
  ({
    failCover = false,
    actualDuration = "4.021333",
  }: {
    failCover?: boolean;
    actualDuration?: string;
  } = {}): ProcessRunner =>
  async (command, args) => {
    if (basename(command) === "remotion") {
      if (failCover) return { status: 1, stdout: "", stderr: "cover failed" };
      const output = args[3];
      const compositionId = args[2];
      await writeFile(
        output,
        fakePng(
          String(compositionId).endsWith("Cover4x3") ? 1600 : 1200,
          String(compositionId).endsWith("Cover4x3") ? 1200 : 1600,
        ),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (basename(command) === "ffprobe") {
      const target = String(args.at(-1));
      if (target.endsWith(".mp4")) {
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
                duration: actualDuration,
              },
            ],
            format: { duration: actualDuration },
          }),
          stderr: "",
        };
      }
    }
    if (basename(command) === "ffmpeg") {
      return { status: 0, stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected process: ${command}`);
  };

test("build seals the fixed package atomically and repeated build is an idempotent check", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  const dependencies = {
    verifyFinalProject: async () => fixture.finalReport,
    runProcess: mediaRunner(),
  };
  const first = await buildDelivery({
    rootDir,
    projectId: fixture.storyId,
    dependencies,
  });
  assert.equal(first.noOp, false);
  const releaseDir = join(
    rootDir,
    "deliveries",
    fixture.storyId,
    first.releaseId,
  );
  assert.deepEqual((await readdir(releaseDir)).sort(), [
    "HANDOFF.md",
    "checksums.sha256",
    "cover-3x4.png",
    "cover-4x3.png",
    "delivery-proof.mp4",
    "publishing.json",
    "release-manifest.json",
  ]);
  const before = (await stat(join(releaseDir, "release-manifest.json")))
    .mtimeMs;
  const second = await buildDelivery({
    rootDir,
    projectId: fixture.storyId,
    dependencies,
  });
  assert.equal(second.noOp, true);
  assert.equal(
    (await stat(join(releaseDir, "release-manifest.json"))).mtimeMs,
    before,
  );
  await checkDelivery({
    rootDir,
    projectId: fixture.storyId,
    releaseId: first.releaseId,
    dependencies,
  });
  await execFileAsync("sha256sum", ["-c", "checksums.sha256"], {
    cwd: releaseDir,
  });
});

test("checksum drift and conflicting existing content fail closed without overwrite", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  const dependencies = {
    verifyFinalProject: async () => fixture.finalReport,
    runProcess: mediaRunner(),
  };
  const built = await buildDelivery({
    rootDir,
    projectId: fixture.storyId,
    dependencies,
  });
  const video = join(
    rootDir,
    "deliveries",
    fixture.storyId,
    built.releaseId,
    "delivery-proof.mp4",
  );
  await writeFile(video, "drift");
  await assert.rejects(() =>
    checkDelivery({
      rootDir,
      projectId: fixture.storyId,
      releaseId: built.releaseId,
      dependencies,
    }),
  );
  await assert.rejects(() =>
    buildDelivery({ rootDir, projectId: fixture.storyId, dependencies }),
  );
  assert.equal(await readFile(video, "utf8"), "drift");
});

test("cover render failure leaves neither final directory nor half-finished staging", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  await assert.rejects(() =>
    buildDelivery({
      rootDir,
      projectId: fixture.storyId,
      dependencies: {
        verifyFinalProject: async () => fixture.finalReport,
        runProcess: mediaRunner({ failCover: true }),
      },
    }),
  );
  const deliveriesRoot = join(rootDir, "deliveries");
  const entries = await readdir(deliveriesRoot, { recursive: true }).catch(
    () => [],
  );
  assert.equal(
    entries.some((entry) => String(entry).startsWith("release-")),
    false,
  );
});

test("container duration drift fails before sealing the release", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  await assert.rejects(
    () =>
      buildDelivery({
        rootDir,
        projectId: fixture.storyId,
        dependencies: {
          verifyFinalProject: async () => fixture.finalReport,
          runProcess: mediaRunner({ actualDuration: "4.500000" }),
        },
      }),
    /duration drifted/,
  );
});

test("build and check reject a symbolic-link deliveries parent", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  const dependencies = {
    verifyFinalProject: async () => fixture.finalReport,
    runProcess: mediaRunner(),
  };
  const built = await buildDelivery({
    rootDir,
    projectId: fixture.storyId,
    dependencies,
  });
  const deliveries = join(rootDir, "deliveries");
  const relocated = join(rootDir, "relocated-deliveries");
  await rename(deliveries, relocated);
  await symlink(relocated, deliveries, "dir");
  await assert.rejects(
    () =>
      checkDelivery({
        rootDir,
        projectId: fixture.storyId,
        releaseId: built.releaseId,
        dependencies,
      }),
    /symbolic-link/,
  );
  await assert.rejects(
    () => buildDelivery({ rootDir, projectId: fixture.storyId, dependencies }),
    /symbolic-link/,
  );
});
