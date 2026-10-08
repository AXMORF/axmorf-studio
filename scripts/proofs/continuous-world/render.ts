import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  getCompositions,
  openBrowser,
  renderMedia,
  renderStill,
} from "@remotion/renderer";
import {
  RenderSpecSchema,
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";
import { inspectProjectVideo } from "../../project-production/adapters/media";
import { validRenderSpec } from "../../../tests/fixtures/narrative";
import { resolveContinuousProofState } from "../../../proofs/continuous-world/motion-state";

const rootDir = process.cwd();
const outputDirectory = join(rootDir, "out/continuous-world-proof");
await mkdir(outputDirectory, { recursive: true });
const status = await ensureBrowser({ logLevel: "info" });
if (!("path" in status)) throw new Error("Proof browser is unavailable.");
const serveUrl = await bundle({
  entryPoint: join(rootDir, "proofs/continuous-world/index.tsx"),
  rootDir,
  outDir: join(outputDirectory, "bundle"),
  enableCaching: false,
  webpackOverride: (configuration) => ({
    ...configuration,
    resolve: {
      ...configuration.resolve,
      alias: {
        ...configuration.resolve?.alias,
        "@axmorf/studio/contracts$": join(
          rootDir,
          "packages/studio/src/contracts/index.ts",
        ),
        "@axmorf/studio/remotion$": join(
          rootDir,
          "packages/studio/src/remotion.ts",
        ),
      },
    },
  }),
});
const browser = await openBrowser("chrome", {
  browserExecutable: status.path,
  logLevel: "error",
});
const videoPath = join(outputDirectory, "video.mp4");
const checkpoints = [0, 79, 80, 81, 149];
try {
  const compositions = await getCompositions(serveUrl, {
    puppeteerInstance: browser,
    logLevel: "error",
  });
  const composition = compositions.find(
    ({ id }) => id === "ContinuousWorldProof",
  );
  assert.ok(composition);
  assert.deepEqual(
    [
      composition.width,
      composition.height,
      composition.fps,
      composition.durationInFrames,
    ],
    [1920, 1080, 30, 150],
  );
  for (const frame of checkpoints)
    await renderStill({
      serveUrl,
      composition,
      output: join(outputDirectory, `frame-${frame}.png`),
      frame,
      imageFormat: "png",
      puppeteerInstance: browser,
      logLevel: "error",
    });
  await renderMedia({
    serveUrl,
    composition,
    outputLocation: videoPath,
    codec: "h264",
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    enforceAudioTrack: true,
    concurrency: 2,
    puppeteerInstance: browser,
    logLevel: "error",
  });
} finally {
  await browser.close({ silent: true });
}
const media = await inspectProjectVideo({
  rootDir,
  absolutePath: videoPath,
  render: RenderSpecSchema.parse({
    ...validRenderSpec,
    compositionId: "ContinuousWorldProof",
    width: 1920,
    height: 1080,
    fps: 30,
    leadInFrames: 0,
    tailFrames: 0,
  }),
  frameCount: 150,
});
const viewport = resolveSceneViewport(
  resolveSceneReadabilityPolicy({ width: 1920, height: 1080 }),
);
const sha = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const evidence = {
  schemaVersion: 1,
  scope: "isolated-current-source-runtime-proof",
  semanticBeatCount: 2,
  sceneOwnerCount: 1,
  media,
  videoChecksum: sha(await readFile(videoPath)),
  fixtureChecksum: sha(
    await readFile(
      join(rootDir, "proofs/continuous-world/fixture.generated.json"),
    ),
  ),
  viewport,
  checkpoints: await Promise.all(
    checkpoints.map(async (frame) => ({
      frame,
      stillChecksum: sha(
        await readFile(join(outputDirectory, `frame-${frame}.png`)),
      ),
      state: resolveContinuousProofState(
        frame,
        viewport.width,
        viewport.height,
      ),
    })),
  ),
  aestheticAssessment: "not-assessed",
};
await writeFile(
  join(outputDirectory, "evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ status: "continuous-world-proof-verified", media, videoPath })}\n`,
);
