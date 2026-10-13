import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import test, { type TestContext } from "node:test";

import {
  PendingSceneAuthoringSchema,
  ProjectAssetManifestSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  buildSilentScenePreset,
} from "@axmorf/studio/contracts";
import { buildRuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { importGeneratedProjectAsset as importGeneratedProjectAssetApplication } from "../../scripts/project-assets/application/import-generated";
import { syncProjectAssetCatalog } from "../../scripts/project-assets/application/catalog-sync";
import { inspectAuthoredSvgBytes } from "../../scripts/project-assets/domain/svg";
import { runProjectAssetImportCli } from "../../scripts/project-assets/cli";
import { resolveMediaToolCommand } from "../../scripts/shared/media-tool-command";
import { loadProjectProductionInputs } from "../../scripts/project-production/application/load-inputs";
import { prepareNarrationInputs } from "../../scripts/project-production/application/prepare-fixed-tasks";
import {
  createProject,
  projectPendingSceneAuthoring,
} from "../../scripts/projects/application/create-project";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
  validProjectCreateProducerConfig,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280"><defs><linearGradient id="light"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#246"/></linearGradient><filter id="shadow"><feGaussianBlur stdDeviation="4"/></filter></defs><g transform="translate(20 40)"><ellipse cx="340" cy="740" rx="210" ry="45" fill="#012" filter="url(#shadow)"/><path d="M100 100H600V700H100Z" fill="url(#light)"/></g></svg>';
const projectId = validProjectCreateInput.storyId;
const importGeneratedProjectAsset = (
  input: Parameters<typeof importGeneratedProjectAssetApplication>[0],
) =>
  importGeneratedProjectAssetApplication({
    ...input,
    resolveMediaTool: (request) =>
      resolveMediaToolCommand({
        ...request,
        rootDir: join(import.meta.dirname, "../.."),
      }),
  });
const provenance = {
  kind: "image-generated",
  creator: "imagegen",
  creationDescription:
    "Original translucent subject with separated depth planes, generated for this film.",
  rights: "original-work",
} as const;
const importInput = (kind: "png" | "svg", sceneMeaningIds = ["opening"]) => ({
  schemaVersion: 1,
  assetId: "depth-subject",
  title: "Depth subject",
  description: "Original visual subject for the Scene.",
  file: `subject.${kind}`,
  sceneMeaningIds,
  provenance: {
    ...provenance,
    ...(kind === "svg"
      ? { kind: "authored-svg", creator: "Scene artist" }
      : {}),
  },
});

const fixtureFor = async (
  context: TestContext,
  mode: "authored" | "grouped" | "narrated" = "authored",
  withMusic = false,
) => {
  const prepared = await prepareProjectCreateFixture();
  const rootDir = await realpath(prepared.rootDir);
  const fixture = {
    ...prepared,
    rootDir,
    inputPath: join(rootDir, relative(prepared.rootDir, prepared.inputPath)),
    configPath: join(rootDir, relative(prepared.rootDir, prepared.configPath)),
  };
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  if (withMusic) {
    const wav = Buffer.alloc(44 + 480 * 4);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(48_000, 24);
    wav.writeUInt32LE(192_000, 28);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    await writeFile(join(fixture.rootDir, "public/music.wav"), wav);
    await writeProducerConfig({
      configPath: fixture.configPath,
      value: {
        ...validProjectCreateProducerConfig,
        audioDefaults: {
          globalBgm: { sourcePath: "public/music.wav", volume: 0.18 },
        },
      },
    });
  }
  const scene = validProjectCreateInput.scenes[0];
  const sceneIds = mode === "grouped" ? ["opening", "conclusion"] : ["opening"];
  const input =
    mode === "narrated"
      ? validProjectCreateInput
      : {
          ...validProjectCreateInput,
          story: {
            ...validProjectCreateInput.story,
            ...(mode === "authored"
              ? { timingSource: "authored-frames" }
              : { visualScenes: [{ meaningIds: sceneIds }] }),
            beats: sceneIds.map((meaningId) =>
              mode === "authored"
                ? {
                    kind: "silent-scene",
                    meaningId,
                    narrativePurpose: "Show one causal action.",
                    preset: buildSilentScenePreset({
                      presetId: meaningId,
                      durationInFrames: 90,
                      visualIntent: scene.visualIntent,
                      soundIntent: scene.soundIntent,
                      resourceIds: [],
                      implementation: { kind: "scene-owner" },
                    }),
                  }
                : {
                    kind: "visual-scene",
                    meaningId,
                    narrativePurpose: "Continue one causal action.",
                    durationInFrames: 90,
                  },
            ),
          },
          scenes: sceneIds.map((meaningId) => ({ ...scene, meaningId })),
          publishing: {
            ...validProjectCreateInput.publishing,
            chapters: sceneIds.map((meaningId, index) => ({
              meaningId,
              name: `画面 ${index + 1}`,
            })),
          },
        };
  await writeProjectCreateJson(fixture.inputPath, input);
  const env = { RSP_PRODUCER_CONFIG: fixture.configPath };
  await createProject({ ...fixture, projectId, env });
  const artworkInputPath = join(fixture.rootDir, "artwork/input.json");
  await mkdir(dirname(artworkInputPath));
  await writeFile(join(dirname(artworkInputPath), "subject.png"), PNG);
  await writeFile(join(dirname(artworkInputPath), "subject.svg"), SVG);
  return { ...fixture, env, artworkInputPath };
};

const readJson = async (rootDir: string, file: string) =>
  JSON.parse(
    await readFile(join(rootDir, `src/projects/${projectId}`, file), "utf8"),
  );
const snapshot = async (rootDir: string) => {
  const files: Record<string, string> = {};
  const visit = async (path: string) => {
    let entries;
    try {
      entries = await readdir(join(rootDir, path), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else if (!entry.isSymbolicLink())
        files[child] = (await readFile(join(rootDir, child))).toString(
          "base64",
        );
    }
  };
  await visit(`src/projects/${projectId}`);
  await visit(`public/projects/${projectId}`);
  files.catalog = (
    await readFile(
      join(rootDir, "src/remotion/catalog/resource-catalog.generated.json"),
    )
  ).toString("base64");
  return files;
};

const loadTasks = async (fixture: Awaited<ReturnType<typeof fixtureFor>>) => {
  await prepareNarrationInputs({
    rootDir: fixture.rootDir,
    projectId,
    env: fixture.env,
  });
  await projectPendingSceneAuthoring({ rootDir: fixture.rootDir, projectId });
  const policyPath = "scripts/project-production/application/load-inputs.ts";
  const runtimePolicyManifest = buildRuntimePolicyManifest({
    packageVersion: "0.1.21",
    files: [
      {
        logicalPath: policyPath,
        bytes: await readFile(join(import.meta.dirname, "../..", policyPath)),
        scopes: ["composition", "delivery", "global-visual", "scene"],
      },
    ],
  });
  for (const [file, contents] of [
    ["package.json", "{}"],
    ["package-lock.json", "{}"],
    ["remotion.config.mjs", "export {};"],
  ])
    await writeFile(join(fixture.rootDir, file), contents);
  return loadProjectProductionInputs({
    rootDir: fixture.rootDir,
    projectId,
    runtimePolicyManifest,
  });
};

for (const kind of ["png", "svg"] as const)
  test(`generated ${kind} import admits measured Project-owned artwork into silent Scene tasks and repeats without writes`, async (context) => {
    const fixture = await fixtureFor(context);
    const poolBefore = StoryResourcePoolSchema.parse(
      await readJson(fixture.rootDir, "production/story-resource-pool.json"),
    );
    await writeProjectCreateJson(fixture.artworkInputPath, importInput(kind));
    const lines: string[] = [];
    const first =
      kind === "svg"
        ? await runProjectAssetImportCli(
            ["--project", projectId, "--input", fixture.artworkInputPath],
            { rootDir: fixture.rootDir, stdout: (line) => lines.push(line) },
          )
        : await importGeneratedProjectAsset({
            rootDir: fixture.rootDir,
            projectId,
            inputPath: fixture.artworkInputPath,
          });
    assert.equal(first.noOp, false);
    assert.equal(lines.length, kind === "svg" ? 1 : 0);
    const manifest = ProjectAssetManifestSchema.parse(
      await readJson(fixture.rootDir, "assets.manifest.json"),
    );
    const resource = manifest.assets.find(({ id }) => id === first.resourceId)!;
    assert.equal(resource.assetKind, kind === "svg" ? "svg" : "image");
    assert.equal(resource.externalSource, undefined);
    assert.equal(
      resource.generatedSource?.kind,
      kind === "svg" ? "authored-svg" : "image-generated",
    );
    assert.equal(resource.media?.width, kind === "svg" ? 720 : 1);
    assert.equal(manifest.externalAssets.length, 0);
    assert.equal(manifest.generatedAssets?.length, 1);
    assert.equal(
      manifest.generatedAssets?.[0]?.creation.file.sha256,
      resource.checksum,
    );
    assert.ok(
      !(
        await readFile(
          join(fixture.rootDir, manifest.generatedAssets![0]!.evidencePath),
          "utf8",
        )
      ).includes(fixture.rootDir),
    );
    const pool = StoryResourcePoolSchema.parse(
      await readJson(fixture.rootDir, "production/story-resource-pool.json"),
    );
    assert.ok(pool.allowedResourceIds.includes(first.resourceId));
    assert.deepEqual(
      pool.optionalCapabilityIds,
      poolBefore.optionalCapabilityIds,
    );
    const pending = PendingSceneAuthoringSchema.parse(
      await readJson(
        fixture.rootDir,
        "production/pending-scene-production-brief.json",
      ),
    );
    assert.ok(
      pending.scenes[0]!.candidateResourceIds.includes(first.resourceId),
    );
    const story = StorySpecSchema.parse(
      await readJson(fixture.rootDir, "story.json"),
    );
    assert.equal(story.beats[0]!.kind, "silent-scene");
    if (story.beats[0]!.kind === "silent-scene")
      assert.deepEqual(story.beats[0]!.preset.resourceIds, [first.resourceId]);
    const beforeNoOp = await snapshot(fixture.rootDir);
    const again = await importGeneratedProjectAsset({
      rootDir: fixture.rootDir,
      projectId,
      inputPath: fixture.artworkInputPath,
    });
    assert.equal(again.noOp, true);
    assert.deepEqual(await snapshot(fixture.rootDir), beforeNoOp);
    const inputs = await loadTasks(fixture);
    const scene = inputs.sceneInputs.find(
      ({ taskInput }) => taskInput.meaningId === "opening",
    )!;
    assert.ok(scene.taskInput.allowedResourceIds.includes(first.resourceId));
    assert.ok(
      scene.availableResources.some(
        ({ selected }) => selected.resourceId === first.resourceId,
      ),
    );
    assert.deepEqual(scene.brief.candidateResourceIds, [first.resourceId]);
  });

test("targeting a covered visual Beat admits the resource to its grouped Scene owner", async (context) => {
  const fixture = await fixtureFor(context, "grouped");
  await writeProjectCreateJson(
    fixture.artworkInputPath,
    importInput("png", ["conclusion"]),
  );
  const imported = await importGeneratedProjectAsset({
    rootDir: fixture.rootDir,
    projectId,
    inputPath: fixture.artworkInputPath,
  });
  const inputs = await loadTasks(fixture);
  assert.equal(inputs.sceneInputs.length, 1);
  assert.equal(inputs.sceneInputs[0]!.taskInput.meaningId, "opening");
  assert.ok(
    inputs.sceneInputs[0]!.taskInput.allowedResourceIds.includes(
      imported.resourceId,
    ),
  );
  assert.ok(
    inputs.sceneInputs[0]!.availableResources.some(
      ({ selected }) => selected.resourceId === imported.resourceId,
    ),
  );
});

test("narrated artwork admission leaves authored Story bytes unchanged and needs no provider", async (context) => {
  const fixture = await fixtureFor(context, "narrated");
  const story = await readFile(
    join(fixture.rootDir, `src/projects/${projectId}/story.json`),
  );
  await writeProjectCreateJson(fixture.artworkInputPath, importInput("png"));
  const imported = await importGeneratedProjectAsset({
    rootDir: fixture.rootDir,
    projectId,
    inputPath: fixture.artworkInputPath,
  });
  assert.deepEqual(
    await readFile(
      join(fixture.rootDir, `src/projects/${projectId}/story.json`),
    ),
    story,
  );
  assert.ok(
    (
      await readJson(
        fixture.rootDir,
        "production/pending-scene-production-brief.json",
      )
    ).scenes[0].candidateResourceIds.includes(imported.resourceId),
  );
  await assert.rejects(readdir(join(fixture.rootDir, ".producer-attempts")));
});

test("new artwork retains the existing score bytes and rebinds its Catalog descriptor before task loading", async (context) => {
  const fixture = await fixtureFor(context, "authored", true);
  const previousSound = await readJson(fixture.rootDir, "sound.json");
  assert.equal(previousSound.contributions.length, 1);
  const musicPath = join(
    fixture.rootDir,
    `public/projects/${projectId}/sound/background-music.wav`,
  );
  const musicBytes = await readFile(musicPath);
  await writeProjectCreateJson(fixture.artworkInputPath, importInput("svg"));
  await importGeneratedProjectAsset({
    rootDir: fixture.rootDir,
    projectId,
    inputPath: fixture.artworkInputPath,
  });
  const currentSound = await readJson(fixture.rootDir, "sound.json");
  assert.notEqual(
    currentSound.contributions[0].descriptorFingerprint,
    previousSound.contributions[0].descriptorFingerprint,
  );
  assert.deepEqual(
    { ...currentSound.contributions[0], descriptorFingerprint: null },
    { ...previousSound.contributions[0], descriptorFingerprint: null },
  );
  assert.deepEqual(await readFile(musicPath), musicBytes);
  await loadTasks(fixture);
});

test("unsafe, unknown, targetless, escaped and symlink artwork fails before source changes", async (context) => {
  const fixture = await fixtureFor(context);
  const before = await snapshot(fixture.rootDir);
  for (const [label, input] of [
    ["unknown field", { ...importInput("png"), unknown: true }],
    ["targetless", { ...importInput("png"), sceneMeaningIds: [] }],
    ["unknown Scene", importInput("png", ["missing"])],
    ["traversal", { ...importInput("png"), file: "../artwork/subject.png" }],
    [
      "absolute",
      {
        ...importInput("png"),
        file: join(fixture.rootDir, "artwork/subject.png"),
      },
    ],
    [
      "unsupported rights",
      {
        ...importInput("png"),
        provenance: { ...provenance, rights: "unknown" },
      },
    ],
    ["mismatched origin", { ...importInput("svg"), provenance }],
  ] as const) {
    await writeProjectCreateJson(fixture.artworkInputPath, input);
    await assert.rejects(
      () =>
        importGeneratedProjectAsset({
          rootDir: fixture.rootDir,
          projectId,
          inputPath: fixture.artworkInputPath,
        }),
      label,
    );
    assert.deepEqual(await snapshot(fixture.rootDir), before, label);
  }
  await writeFile(
    join(fixture.rootDir, "artwork/subject.svg"),
    '<svg viewBox="0 0 100 100"><script>alert(1)</script></svg>',
  );
  await writeProjectCreateJson(fixture.artworkInputPath, importInput("svg"));
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
      }),
    /unsafe SVG element/u,
  );
  await symlink(
    join(fixture.rootDir, "artwork/subject.png"),
    join(fixture.rootDir, "artwork/linked.png"),
  );
  await writeProjectCreateJson(fixture.artworkInputPath, {
    ...importInput("png"),
    file: "linked.png",
  });
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
      }),
    /symbolic link/u,
  );
  assert.deepEqual(await snapshot(fixture.rootDir), before);
});

test("a raster with valid dimensions but corrupt pixels fails before any Project mutation", async (context) => {
  const fixture = await fixtureFor(context);
  const before = await snapshot(fixture.rootDir);
  const corrupt = Buffer.from(PNG);
  corrupt[41] = 0;
  await writeFile(join(fixture.rootDir, "artwork/subject.png"), corrupt);
  await writeProjectCreateJson(fixture.artworkInputPath, importInput("png"));
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
      }),
    /pixel decoding failed/u,
  );
  assert.deepEqual(await snapshot(fixture.rootDir), before);
  await assert.rejects(
    readFile(join(fixture.rootDir, ".project-operation.lock")),
  );
});

test("generated import rejects a symbolic output parent and a revision-candidate root", async (context) => {
  const fixture = await fixtureFor(context);
  await writeProjectCreateJson(fixture.artworkInputPath, importInput("png"));
  const outside = join(fixture.rootDir, "outside");
  await mkdir(outside);
  await symlink(
    outside,
    join(fixture.rootDir, `public/projects/${projectId}/assets`),
    "dir",
  );
  const before = await snapshot(fixture.rootDir);
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
      }),
    /unsafe/u,
  );
  assert.deepEqual(await readdir(outside), []);
  assert.deepEqual(await snapshot(fixture.rootDir), before);
  const revisionRoot = join(
    fixture.rootDir,
    ".producer-revisions",
    projectId,
    "candidate",
    "scope",
  );
  await mkdir(join(revisionRoot, "src/projects", projectId), {
    recursive: true,
  });
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: revisionRoot,
        projectId,
        inputPath: fixture.artworkInputPath,
      }),
    /revision candidate/u,
  );
  assert.deepEqual(
    await readdir(join(revisionRoot, "src/projects", projectId)),
    [],
  );
});

test("failed generated Catalog revalidation rolls back asset, evidence, authoring and both catalogs", async (context) => {
  const fixture = await fixtureFor(context);
  await writeProjectCreateJson(fixture.artworkInputPath, importInput("svg"));
  const before = await snapshot(fixture.rootDir);
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
        syncCatalog: async (request) => {
          await syncProjectAssetCatalog(request);
          throw new Error("Injected catalog verification failure");
        },
      }),
    /Injected catalog/u,
  );
  assert.deepEqual(await snapshot(fixture.rootDir), before);
  await assert.rejects(
    readFile(join(fixture.rootDir, ".project-operation.lock")),
  );
  assert.equal(
    (
      await importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
      })
    ).noOp,
    false,
  );
});

test("post-freeze import and existing generated identity drift fail without overwriting", async (context) => {
  const fixture = await fixtureFor(context);
  await writeProjectCreateJson(fixture.artworkInputPath, importInput("png"));
  await importGeneratedProjectAsset({
    rootDir: fixture.rootDir,
    projectId,
    inputPath: fixture.artworkInputPath,
  });
  const before = await snapshot(fixture.rootDir);
  await writeProjectCreateJson(fixture.artworkInputPath, {
    ...importInput("png"),
    provenance: { ...provenance, creator: "Different creator" },
  });
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
      }),
    /identity conflicts/u,
  );
  assert.deepEqual(await snapshot(fixture.rootDir), before);
  await prepareNarrationInputs({
    rootDir: fixture.rootDir,
    projectId,
    env: fixture.env,
  });
  await projectPendingSceneAuthoring({ rootDir: fixture.rootDir, projectId });
  const frozen = await snapshot(fixture.rootDir);
  await writeProjectCreateJson(fixture.artworkInputPath, {
    ...importInput("png"),
    assetId: "another-subject",
  });
  await assert.rejects(
    () =>
      importGeneratedProjectAsset({
        rootDir: fixture.rootDir,
        projectId,
        inputPath: fixture.artworkInputPath,
      }),
    /freeze/u,
  );
  assert.deepEqual(await snapshot(fixture.rootDir), frozen);
});

test("static SVG subset admits local depth treatments and rejects executable or remote markup", () => {
  assert.deepEqual(inspectAuthoredSvgBytes(Buffer.from(SVG)), {
    mimeType: "image/svg+xml",
    extension: "svg",
    width: 720,
    height: 1280,
  });
  for (const source of [
    '<svg width="100" height="100" onload="alert(1)"/>',
    '<svg width="100" height="100"><foreignObject/></svg>',
    '<svg width="100" height="100"><image href="https://example.com/image.png"/></svg>',
    '<svg width="100" height="100"><style>svg{fill:red}</style></svg>',
    '<svg width="100" height="100"><rect style="fill:red"/></svg>',
    '<svg width="100" height="100"><animate attributeName="x"/></svg>',
    '<svg width="100" height="100"><rect fill="url(https://example.com/x)"/></svg>',
    '<svg width="100" height="100"><rect fill="url(&#x68;ttps://example.com/x)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY test SYSTEM "file:///etc/passwd">]><svg width="100" height="100">&test;</svg>',
    '<svg width="100" height="100"><g></svg>',
    '<svg width="100" height="100"/><svg width="100" height="100"/>',
    '<svg width="100" height="100" xmlns="http://example.com"/>',
    '<svg width="100" height="100"><use href="#x"/></svg>',
    '<svg viewBox="0 0 Infinity 100"/>',
  ])
    assert.throws(() => inspectAuthoredSvgBytes(Buffer.from(source)), source);
});

test("static SVG requires a browser-readable namespace and XML 1.0 text", () => {
  for (const source of [
    '<svg width="100" height="100"/>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text>&#65534;</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text>&#xFFFF;</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text>&#xD800;</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text>&#X20;</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text>invalid ]]></text></svg>',
  ])
    assert.throws(() => inspectAuthoredSvgBytes(Buffer.from(source)), source);
  assert.doesNotThrow(() =>
    inspectAuthoredSvgBytes(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text>Original &amp; valid &#9;&#10;&#13; text &#x1F4A1; ]]&gt;</text></svg>',
      ),
    ),
  );
});
