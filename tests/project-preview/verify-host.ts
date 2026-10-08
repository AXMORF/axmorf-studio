import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PreviewReceiptSchema } from "../../scripts/project-preview/domain";
import {
  capturePreviewSnapshot,
  pathState,
} from "../../scripts/project-preview/filesystem";
import { generateProjectPreview } from "../../scripts/project-preview/generate";
import { renderProjectPreview } from "../../scripts/project-preview/media";
import { inspectProjectVideo } from "../../scripts/project-production/adapters/media";
import { createLiveProjectProductionScope } from "../../scripts/project-production/application/production-scope";
import { runMediaProcess } from "../../scripts/shared/media-process";
import { createReadyPreviewFixture } from "./ready-fixture";

// Explicit host evidence, excluded from static test discovery: it uses the
// pinned Remotion browser/FFmpeg on synthetic data and removes all output.
export const verifyPreviewHost = async () => {
  const repositoryRoot = join(import.meta.dirname, "../..");
  const fixture = await createReadyPreviewFixture({
    insideRepository: true,
    audioChannels: 1,
  });
  try {
    const sourceConfig = join(fixture.rootDir, "remotion.config.ts");
    assert.equal(
      (await readFile(sourceConfig, "utf8")).includes(
        JSON.stringify(join(repositoryRoot, "packages/studio/src/remotion.ts")),
      ),
      true,
    );
    const scope = createLiveProjectProductionScope({
      rootDir: fixture.rootDir,
      storyId: fixture.storyId,
    });
    const before = await capturePreviewSnapshot(scope);
    const dependencies = {
      renderVideo: (request: Parameters<typeof renderProjectPreview>[0]) =>
        renderProjectPreview({
          ...request,
          rootDir: repositoryRoot,
          runProcess: (command, args, options) =>
            runMediaProcess(
              command,
              args.includes("render")
                ? [...args, `--config=${sourceConfig}`]
                : args,
              options,
            ),
        }),
      inspectVideo: (request: Parameters<typeof inspectProjectVideo>[0]) =>
        inspectProjectVideo({ ...request, rootDir: repositoryRoot }),
    };
    const first = await generateProjectPreview({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
      dependencies,
    });
    const cached = await generateProjectPreview({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
      dependencies,
    });
    const receipt = PreviewReceiptSchema.parse(
      JSON.parse(await readFile(first.receiptPath, "utf8")),
    );
    assert.deepEqual(receipt.video.media, {
      codec: "h264",
      audioCodec: "aac",
      audioChannels: 1,
      width: 320,
      height: 180,
      fps: 30,
      frameCount: 12,
      decodedToEof: true,
    });
    assert.equal(cached.noOp, true);
    assert.equal(
      (await capturePreviewSnapshot(scope)).fingerprint,
      before.fingerprint,
    );
    const originalProject = join(scope.projectSourceRoot, fixture.storyId);
    assert.equal(
      await pathState(join(originalProject, "Composition.tsx")),
      null,
    );
    assert.equal(await pathState(join(originalProject, "scenes")), null);
    assert.equal(await pathState(scope.deliveryRoot), null);
    assert.equal(await pathState(scope.producerAttemptsRoot), null);
    return {
      status: first.status,
      cacheStatus: cached.status,
      currentSourceAliases: true,
      providerCalls: 0,
      profile: receipt.profile,
      media: receipt.video.media,
      assessment: receipt.assessment,
      originalSourceUnmaterialized: true,
      formalDeliveryAbsent: true,
      attemptAbsent: true,
    };
  } finally {
    await fixture.dispose();
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  verifyPreviewHost()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.stack : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
