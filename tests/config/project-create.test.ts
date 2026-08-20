import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  NarrationSpecSchema,
  RenderSpecSchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  generateSemanticTiming,
} from "../../src/contracts";
import { ProjectCreateInputSchema } from "../../src/contracts/project-create";
import {
  generateProjectResourceCatalog,
  generateResourceCatalog,
} from "../../scripts/catalog/generate";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { commitStagedProjectCreate } from "../../scripts/projects/adapters/project-create-store";
import {
  createProject,
  projectPendingSceneAuthoring,
} from "../../scripts/projects/application/create-project";
import { runProjectCreateCli } from "../../scripts/projects/create";
import { generateSceneTemplateAudioProjection } from "../../scripts/scene-templates/audio-projection";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
  validProjectCreateProducerConfig,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const snapshotProjectMtimes = async (rootDir: string) => {
  const paths = [
    "src/projects/story-example/brief.json",
    "src/projects/story-example/story.json",
    "src/projects/story-example/narration.json",
    "src/projects/story-example/render.json",
    "src/projects/story-example/production/project-create.json",
    "src/projects/story-example/production/pending-scene-production-brief.json",
    "public/projects/story-example",
    "src/remotion/catalog/resource-catalog.generated.json",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        (await stat(join(rootDir, path))).mtimeMs,
      ]),
    ),
  );
};

const snapshotCreatedRoots = async (rootDir: string) => {
  const paths = [
    "src/projects/story-example",
    "src/projects/story-example/brief.json",
    "src/projects/story-example/production/project-create.json",
    "public/projects/story-example",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        {
          mtimeMs: (await stat(join(rootDir, path))).mtimeMs,
          bytes: (await stat(join(rootDir, path))).isFile()
            ? await readFile(join(rootDir, path), "base64")
            : null,
        },
      ]),
    ),
  );
};

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const configureTemplateAudioWithUnusedAuthority = async (rootDir: string) => {
  const manifestPath = "private/reference-assets/assets.manifest.json";
  const licenseBytes = Buffer.from("verified local reference license");
  const assets = [
    {
      id: "asset.test.intro",
      localPath: "public/assets/library/reference-audio/intro.wav",
      bytes: Buffer.from("intro audio"),
      mediaRole: "sound-effect" as const,
      durationInSeconds: 4,
      codec: "pcm_s16le",
    },
    {
      id: "asset.test.outro",
      localPath: "public/assets/library/reference-audio/outro.mp3",
      bytes: Buffer.from("outro audio"),
      mediaRole: "background-music" as const,
      durationInSeconds: 12,
      codec: "mp3",
    },
    {
      id: "asset.test.unused",
      localPath: "public/assets/library/reference-audio/unused.mp3",
      bytes: Buffer.from("unused audio"),
      mediaRole: "background-music" as const,
      durationInSeconds: 12,
      codec: "mp3",
    },
  ];
  await Promise.all([
    mkdir(join(rootDir, "private/reference-assets"), { recursive: true }),
    mkdir(join(rootDir, "public/assets/library/reference-audio"), {
      recursive: true,
    }),
  ]);
  await Promise.all([
    writeFile(
      join(rootDir, "private/reference-assets/MIXKIT_AUDIO_LICENSE.md"),
      licenseBytes,
    ),
    ...assets.map(({ localPath, bytes }) =>
      writeFile(join(rootDir, localPath), bytes),
    ),
    writeFile(
      join(
        rootDir,
        "private/reference-assets/scene-template-sound-overrides.json",
      ),
      JSON.stringify({
        schemaVersion: 1,
        introResourceId: "asset.test.intro",
        outroResourceId: "asset.test.outro",
      }),
    ),
  ]);
  await writeFile(
    join(rootDir, manifestPath),
    JSON.stringify({
      schemaVersion: 1,
      assets: assets.map(
        ({ id, localPath, bytes, mediaRole, durationInSeconds, codec }) => ({
          schemaVersion: 1,
          id,
          kind: "asset",
          status: "approved",
          title: id,
          description: `${id} test reference audio`,
          useCases: ["Scene template sound"],
          tags: ["audio", "reference"],
          authority: {
            kind: "repository-file",
            repositoryPath: manifestPath,
          },
          allowedUse: "localize-asset",
          assetKind: "audio",
          mediaRole,
          localPath,
          checksum: checksum(bytes),
          license: {
            id: "local-reference-license",
            verificationStatus: "verified",
            sourceUrl: null,
            attributionRequired: false,
            attributionText: null,
            verifiedAt: "2026-08-15T00:00:00.000Z",
            sourceEvidenceFingerprint: checksum(licenseBytes),
          },
          media: {
            durationInSeconds,
            codec,
            sampleRate: 44_100,
          },
        }),
      ),
    }),
  );
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
};

test("project:create atomically creates configured authoring and preserves exact TTS", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));

  const result = await createProject({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });

  assert.equal(result.status, "project-created");
  assert.equal(result.sourceState, "configured-authoring");
  assert.equal(result.nextAction, "prepare-narration");
  const story = JSON.parse(
    await readFile(
      join(fixture.rootDir, "src/projects/story-example/story.json"),
      "utf8",
    ),
  );
  assert.deepEqual(story, validProjectCreateInput.story);
  assert.equal(
    story.beats[0].ttsChunks[0].ttsText,
    "Measured audio is authority.",
  );
  const pending = JSON.parse(
    await readFile(
      join(
        fixture.rootDir,
        "src/projects/story-example/production/pending-scene-production-brief.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(pending.scenes, validProjectCreateInput.scenes);
  for (const forbidden of [
    ".narration-work/story-example",
    ".producer-artifacts/story-example",
    ".producer-work/story-example",
    ".producer-attempts/story-example",
    "deliveries/story-example",
    "out/story-example",
  ]) {
    await assert.rejects(stat(join(fixture.rootDir, forbidden)), {
      code: "ENOENT",
    });
  }
  assert.doesNotMatch(
    JSON.stringify(result),
    /visible-editable-token|127\.0\.0\.1|producer\.config|operator\//iu,
  );
  await generateProjectResourceCatalog({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    mode: "check",
  });
  await generateResourceCatalog({ rootDir: fixture.rootDir, mode: "check" });
});

test("same creation identity is read-only current and different identity fails closed", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const request = {
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  } as const;
  const created = await createProject(request);
  const before = await snapshotProjectMtimes(fixture.rootDir);
  const current = await createProject(request);
  const after = await snapshotProjectMtimes(fixture.rootDir);
  assert.equal(current.status, "project-create-current");
  assert.equal(current.creationIdentity, created.creationIdentity);
  assert.deepEqual(current.writtenLogicalPaths, []);
  assert.deepEqual(after, before);

  const changedPath = join(fixture.rootDir, "inputs/changed.json");
  await writeProjectCreateJson(changedPath, {
    ...validProjectCreateInput,
    story: {
      ...validProjectCreateInput.story,
      beats: [
        {
          ...validProjectCreateInput.story.beats[0],
          ttsChunks: [
            { chunkId: "opening-01", ttsText: "Different authored words." },
          ],
        },
      ],
    },
  });
  await assert.rejects(
    createProject({ ...request, inputPath: changedPath }),
    /identity conflicts/iu,
  );
  assert.deepEqual(await snapshotProjectMtimes(fixture.rootDir), before);
});

test("project-create-current requires the transaction's exact global Catalog without mutation", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const request = {
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  } as const;
  await createProject(request);
  const catalogPath = join(
    fixture.rootDir,
    "src/remotion/catalog/resource-catalog.generated.json",
  );
  const catalogBackup = `${catalogPath}.fixture-backup`;
  const catalogExpected = await readFile(catalogPath);

  await rename(catalogPath, catalogBackup);
  const missingBefore = await snapshotCreatedRoots(fixture.rootDir);
  await assert.rejects(createProject(request), /ResourceCatalog.*missing/iu);
  assert.deepEqual(await snapshotCreatedRoots(fixture.rootDir), missingBefore);
  await assert.rejects(stat(catalogPath), { code: "ENOENT" });
  await rename(catalogBackup, catalogPath);

  await writeFile(
    catalogPath,
    Buffer.concat([catalogExpected, Buffer.from("\n")]),
  );
  const staleBefore = {
    roots: await snapshotCreatedRoots(fixture.rootDir),
    catalog: await readFile(catalogPath),
    catalogMtimeMs: (await stat(catalogPath)).mtimeMs,
  };
  await assert.rejects(createProject(request), /ResourceCatalog.*stale/iu);
  assert.deepEqual(
    await snapshotCreatedRoots(fixture.rootDir),
    staleBefore.roots,
  );
  assert.deepEqual(await readFile(catalogPath), staleBefore.catalog);
  assert.equal((await stat(catalogPath)).mtimeMs, staleBefore.catalogMtimeMs);
});

test("source/public/catalog promotion failure rolls back to pre-create filesystem", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const catalogPath = join(
    fixture.rootDir,
    "src/remotion/catalog/resource-catalog.generated.json",
  );
  const catalogBefore = await readFile(catalogPath);

  await assert.rejects(
    createProject({
      rootDir: fixture.rootDir,
      projectId: "story-example",
      inputPath: fixture.inputPath,
      env: { RSP_PRODUCER_CONFIG: fixture.configPath },
      store: {
        commit: (request) =>
          commitStagedProjectCreate({
            ...request,
            move: async (source, destination) => {
              if (
                source.endsWith("/catalog/resource-catalog.json") &&
                destination.endsWith(
                  "/src/remotion/catalog/resource-catalog.generated.json",
                )
              ) {
                throw new Error("synthetic catalog failure");
              }
              await rename(source, destination);
            },
          }),
      },
    }),
    /synthetic catalog failure/iu,
  );
  await assert.rejects(
    stat(join(fixture.rootDir, "src/projects/story-example")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    stat(join(fixture.rootDir, "public/projects/story-example")),
    { code: "ENOENT" },
  );
  assert.deepEqual(await readFile(catalogPath), catalogBefore);
  assert.deepEqual(
    (await readdirNames(join(fixture.rootDir, "src/projects"))).filter((name) =>
      name.startsWith(".project-create-staging-"),
    ),
    [],
  );
});

test("post-promotion live verification failure rolls back before deleting the Catalog backup", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const catalogPath = join(
    fixture.rootDir,
    "src/remotion/catalog/resource-catalog.generated.json",
  );
  const catalogBefore = await readFile(catalogPath);

  await assert.rejects(
    createProject({
      rootDir: fixture.rootDir,
      projectId: "story-example",
      inputPath: fixture.inputPath,
      env: { RSP_PRODUCER_CONFIG: fixture.configPath },
      store: {
        commit: (request) =>
          commitStagedProjectCreate({
            ...request,
            move: async (source, destination) => {
              await rename(source, destination);
              if (destination.endsWith("/src/projects/story-example")) {
                await writeFile(
                  join(destination, "brief.json"),
                  '{"corrupted":true}\n',
                  "utf8",
                );
              }
            },
          }),
      },
    }),
    /Created Project file checksum drift/iu,
  );
  await assert.rejects(
    stat(join(fixture.rootDir, "src/projects/story-example")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    stat(join(fixture.rootDir, "public/projects/story-example")),
    { code: "ENOENT" },
  );
  assert.deepEqual(await readFile(catalogPath), catalogBefore);
});

const readdirNames = async (path: string) =>
  (await import("node:fs/promises")).readdir(path);

test("project:create CLI accepts only one repository-relative input", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const stdout: string[] = [];
  const result = await runProjectCreateCli(
    ["--project", "story-example", "--input", "inputs/project-create.json"],
    {
      rootDir: fixture.rootDir,
      env: { RSP_PRODUCER_CONFIG: fixture.configPath },
      stdout: (line) => stdout.push(line),
    },
  );
  assert.equal(result.status, "project-created");
  assert.deepEqual(JSON.parse(stdout[0] ?? ""), result);
  assert.throws(() =>
    ProjectCreateInputSchema.parse({
      ...validProjectCreateInput,
      unknownRuntimeField: true,
    }),
  );
});

test("project:create reuses configured template and sound builders inside the transaction", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await mkdir(join(fixture.rootDir, "public/audio"), { recursive: true });
  await writeFile(
    join(fixture.rootDir, "public/audio/create-bgm.mp3"),
    Buffer.from("synthetic project create music"),
  );
  await writeProducerConfig({
    configPath: fixture.configPath,
    value: {
      ...validProjectCreateProducerConfig,
      sceneDefaults: {
        introSceneTemplateId: "axmorf-brand-reveal-v1",
        outroSceneTemplateId: "axmorf-source-follow-v1",
      },
      audioDefaults: {
        globalBgm: {
          sourcePath: "public/audio/create-bgm.mp3",
          volume: 0.2,
        },
      },
    },
  });
  const input = {
    ...validProjectCreateInput,
    sceneTemplates: undefined,
    publishing: {
      ...validProjectCreateInput.publishing,
      chapters: validProjectCreateInput.publishing.chapters,
    },
  };
  await writeProjectCreateJson(fixture.inputPath, input);

  const result = await createProject({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  assert.deepEqual(result.copiedSceneMeaningIds, [
    "configured-intro-scene",
    "configured-outro-scene",
  ]);
  const story = JSON.parse(
    await readFile(
      join(fixture.rootDir, "src/projects/story-example/story.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    story.beats.map(({ meaningId }: { meaningId: string }) => meaningId),
    ["configured-intro-scene", "opening", "configured-outro-scene"],
  );
  assert.deepEqual(
    await readFile(
      join(
        fixture.rootDir,
        "public/projects/story-example/sound/background-music.mp3",
      ),
    ),
    Buffer.from("synthetic project create music"),
  );
  await stat(
    join(
      fixture.rootDir,
      "src/projects/story-example/scenes/configured-intro-scene/Renderer.tsx",
    ),
  );
  await stat(
    join(
      fixture.rootDir,
      "src/projects/story-example/scenes/configured-outro-scene/Renderer.tsx",
    ),
  );
  const current = await createProject({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  assert.equal(current.status, "project-create-current");
  assert.equal(current.creationIdentity, result.creationIdentity);
});

test("project:create stages the complete local audio authority for template validation", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await configureTemplateAudioWithUnusedAuthority(fixture.rootDir);
  await writeProducerConfig({
    configPath: fixture.configPath,
    value: {
      ...validProjectCreateProducerConfig,
      sceneDefaults: {
        introSceneTemplateId: "axmorf-brand-reveal-v1",
        outroSceneTemplateId: "axmorf-source-follow-v1",
      },
    },
  });
  await writeProjectCreateJson(fixture.inputPath, {
    ...validProjectCreateInput,
    sceneTemplates: undefined,
  });

  const result = await createProject({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });

  assert.equal(result.status, "project-created");
});

test("pending Scene authoring projects only after measured semantic timing exists", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await createProject({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  assert.deepEqual(
    await projectPendingSceneAuthoring({
      rootDir: fixture.rootDir,
      projectId: "story-example",
    }),
    {
      projected: false,
      missingLogicalInputs: [
        "src/projects/story-example/generated/semantic-timing.generated.json",
      ],
    },
  );

  const projectRoot = join(fixture.rootDir, "src/projects/story-example");
  const story = StorySpecSchema.parse(
    JSON.parse(await readFile(join(projectRoot, "story.json"), "utf8")),
  );
  const narration = NarrationSpecSchema.parse(
    JSON.parse(await readFile(join(projectRoot, "narration.json"), "utf8")),
  );
  const render = RenderSpecSchema.parse(
    JSON.parse(await readFile(join(projectRoot, "render.json"), "utf8")),
  );
  const pcm = {
    sampleRate: 48_000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const sealInput = {
    schemaVersion: 1,
    storyId: "story-example",
    narrationSpec: narration,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments: [
      {
        kind: "chunk" as const,
        chunkId: "opening-01",
        meaningId: "opening",
        ttsText: "Measured audio is authority.",
        localPath:
          "public/projects/story-example/narration/chunks/opening-01.wav",
        checksum: `sha256:${"a".repeat(64)}`,
        pcm,
        sampleFrameCount: 48_000,
      },
    ],
    completeAudio: {
      localPath: "public/projects/story-example/narration/complete.wav",
      checksum: `sha256:${"b".repeat(64)}`,
      pcm,
      sampleFrameCount: 48_000,
    },
  } as const;
  const sealed = SealedNarrationManifestSchema.parse({
    ...sealInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(sealInput),
  });
  const timing = generateSemanticTiming({
    story,
    narration,
    render,
    sealedNarration: sealed,
  });
  await writeProjectCreateJson(
    join(projectRoot, "generated/semantic-timing.generated.json"),
    timing,
  );

  const projection = await projectPendingSceneAuthoring({
    rootDir: fixture.rootDir,
    projectId: "story-example",
  });
  assert.equal(projection.projected, true);
  assert.equal(projection.written, true);
  const sceneBrief = JSON.parse(
    await readFile(
      join(projectRoot, "production/scene-production-brief.json"),
      "utf8",
    ),
  );
  assert.deepEqual(sceneBrief.scenes, validProjectCreateInput.scenes);
  const currentProjection = await projectPendingSceneAuthoring({
    rootDir: fixture.rootDir,
    projectId: "story-example",
  });
  assert.equal(currentProjection.projected, true);
  if (!currentProjection.projected) assert.fail("projection must be current");
  assert.equal(currentProjection.written, false);
});
