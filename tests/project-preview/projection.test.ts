import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  generateProjectPreview,
  type ProjectPreviewDependencies,
} from "../../scripts/project-preview/generate";
import {
  capturePreviewSnapshot,
  pathState,
} from "../../scripts/project-preview/filesystem";
import { createLiveProjectProductionScope } from "../../scripts/project-production/application/production-scope";
import { createReadyPreviewFixture } from "./ready-fixture";

test("default artifact projection verifies planned source and builds grouped authored frames only in its private view", async (context) => {
  const fixture = await createReadyPreviewFixture();
  context.after(fixture.dispose);
  const scope = createLiveProjectProductionScope({
    rootDir: fixture.rootDir,
    storyId: fixture.storyId,
  });
  const before = await capturePreviewSnapshot(scope);
  const originalProject = join(scope.projectSourceRoot, fixture.storyId);
  assert.equal(await pathState(join(originalProject, "Composition.tsx")), null);
  assert.equal(await pathState(join(originalProject, "scenes")), null);
  assert.equal(
    await pathState(
      join(originalProject, "generated/narration-preparation.generated.json"),
    ),
    null,
  );
  let renderCalls = 0;
  const dependencies: ProjectPreviewDependencies = {
    renderVideo: async (request) => {
      renderCalls++;
      const project = join(
        request.entryPoint,
        "..",
        "projects",
        fixture.storyId,
      );
      const composition = await readFile(
        join(project, "Composition.tsx"),
        "utf8",
      );
      assert.doesNotMatch(
        composition,
        /sealed-narration\.generated|mastered-narration\.generated/u,
      );
      const runtime = await readFile(
        join(project, "production-scene-runtime.generated.ts"),
        "utf8",
      );
      assert.match(runtime, /\.\/scenes\/opening/u);
      assert.doesNotMatch(runtime, /\.\/scenes\/change/u);
      assert.notEqual(
        await pathState(
          join(
            project,
            "scenes/opening/generated/scene-package.generated.json",
          ),
        ),
        null,
      );
      await writeFile(request.outputPath, "artifact-projected fixture video");
    },
    inspectVideo: async (request) => ({
      codec: "h264" as const,
      audioCodec: "aac" as const,
      audioChannels: request.render.output.audioChannels,
      width: request.render.width,
      height: request.render.height,
      fps: request.render.fps,
      frameCount: request.frameCount,
      decodedToEof: true as const,
    }),
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
  assert.equal(renderCalls, 1);
  assert.equal(cached.noOp, true);
  assert.equal(first.profile.frameCount, 12);
  assert.equal(first.profile.width, 320);
  assert.equal(first.profile.height, 180);
  assert.equal(
    (await capturePreviewSnapshot(scope)).fingerprint,
    before.fingerprint,
  );
  assert.equal(await pathState(join(originalProject, "Composition.tsx")), null);
  assert.equal(await pathState(join(originalProject, "scenes")), null);
  assert.equal(await pathState(scope.deliveryRoot), null);
  assert.equal(await pathState(scope.producerAttemptsRoot), null);
});

test("default preview gate rejects duplicate owner source graphs before creating its view", async (context) => {
  const fixture = await createReadyPreviewFixture({ grouped: false });
  context.after(fixture.dispose);
  const scope = createLiveProjectProductionScope({
    rootDir: fixture.rootDir,
    storyId: fixture.storyId,
  });
  const before = await capturePreviewSnapshot(scope);
  await assert.rejects(
    generateProjectPreview({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
    }),
    /exact duplicates/u,
  );
  assert.equal(await pathState(scope.outputRoot), null);
  assert.equal(
    (await capturePreviewSnapshot(scope)).fingerprint,
    before.fingerprint,
  );
});
